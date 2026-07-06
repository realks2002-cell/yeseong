import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { analyzeReceiptPhoto } from '@/lib/receipt-ocr';
import { scoreAdultVenue } from '@/lib/adult-venue';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BATCH_LIMIT = 10; // 함수 시간 한도 내 안전 처리량 (남으면 다시 호출)
const CONCURRENCY = 3;

async function requireAdmin() {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user };
}

// POST — 영수증 OCR 분석 { photo_ids?: string[] }
//   photo_ids 지정 시 해당 사진만(재분석 포함), 미지정 시 미분석분(pending/failed/null) 최대 10건
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return NextResponse.json(
      { error: 'AI 분석 키(GOOGLE_GENERATIVE_AI_API_KEY)가 설정되지 않았습니다' },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  const requested: string[] = Array.isArray(body?.photo_ids)
    ? body.photo_ids.filter((v: unknown) => typeof v === 'string')
    : [];

  const admin = getServiceSupabase();

  let ids: string[];
  let remaining = 0;
  if (requested.length > 0) {
    ids = requested.slice(0, BATCH_LIMIT);
    remaining = Math.max(0, requested.length - ids.length);
  } else {
    const { data, error } = await admin
      .from('yeseong_site_photos')
      .select('id')
      .eq('category', 'expense')
      .or('ocr_status.is.null,ocr_status.in.(pending,failed)')
      .order('uploaded_at', { ascending: false })
      .limit(BATCH_LIMIT + 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const all = (data ?? []).map((r) => r.id as string);
    ids = all.slice(0, BATCH_LIMIT);
    remaining = Math.max(0, all.length - ids.length);
  }

  if (ids.length === 0) {
    return NextResponse.json({ done: 0, failed: 0, remaining: 0 });
  }

  // 제한 동시성으로 순차 처리 (rate limit·함수 시간 한도 보호)
  let done = 0;
  let failed = 0;
  const errors: string[] = [];
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const chunk = ids.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map((id) => analyzeReceiptPhoto(admin, id)));
    for (const r of results) {
      if (r.ok) done += 1;
      else {
        failed += 1;
        if (errors.length < 3) errors.push(r.error);
      }
    }
  }

  return NextResponse.json({ done, failed, remaining, errors });
}

// PATCH — 인식 결과 수동 수정 { photo_id, store?, amount?, date? }
export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const photoId = typeof body?.photo_id === 'string' ? body.photo_id : '';
  if (!photoId) return NextResponse.json({ error: 'photo_id required' }, { status: 400 });

  const update: Record<string, unknown> = { ocr_status: 'done' };

  if ('store' in (body ?? {})) {
    const store = typeof body.store === 'string' ? body.store.trim().slice(0, 100) : '';
    update.receipt_store = store || null;
  }
  if ('amount' in (body ?? {})) {
    if (body.amount === null || body.amount === '') {
      update.receipt_amount = null;
    } else {
      const n = Number(String(body.amount).replace(/[^\d.]/g, ''));
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: '금액이 올바르지 않습니다' }, { status: 400 });
      }
      update.receipt_amount = Math.round(n);
    }
  }
  if ('date' in (body ?? {})) {
    if (body.date === null || body.date === '') {
      update.receipt_date = null;
    } else if (typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      update.receipt_date = body.date;
    } else {
      return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)' }, { status: 400 });
    }
  }

  const admin = getServiceSupabase();
  const { error } = await admin
    .from('yeseong_site_photos')
    .update(update)
    .eq('id', photoId)
    .eq('category', 'expense');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 상호가 편집된 경우(교체·삭제 포함) → 사업자번호 캐시 학습 + 유흥 스코어 재계산.
  //   삭제(null)도 재계산해야 옛 상호로 매긴 점수가 stale로 남지 않는다.
  if ('receipt_store' in update) {
    const storeVal = typeof update.receipt_store === 'string' ? update.receipt_store : null;
    const { data: r } = await admin
      .from('yeseong_site_photos')
      .select('ocr_raw, receipt_items')
      .eq('id', photoId)
      .single();
    const raw = (r?.ocr_raw ?? {}) as {
      business_no?: unknown;
      has_excise_tax?: unknown;
      business_category?: unknown;
      payment_time?: unknown;
    };
    // 캐시 학습은 상호가 확정(비어있지 않음)됐을 때만
    if (storeVal && typeof raw.business_no === 'string' && /\d{3}-\d{2}-\d{5}/.test(raw.business_no)) {
      await admin
        .from('yeseong_receipt_vendors')
        .upsert({ business_no: raw.business_no, store: storeVal, updated_at: new Date().toISOString() });
    }
    const items = Array.isArray(r?.receipt_items) ? (r!.receipt_items as { name: string }[]) : [];
    const adult = scoreAdultVenue({
      store: storeVal,
      businessCategory: typeof raw.business_category === 'string' ? raw.business_category : null,
      hasExciseTax: raw.has_excise_tax === true,
      items,
      paymentTime: typeof raw.payment_time === 'string' ? raw.payment_time : null,
    });
    await admin
      .from('yeseong_site_photos')
      .update({ adult_score: adult.score, adult_signals: adult.signals.length > 0 ? adult.signals : null })
      .eq('id', photoId);
  }

  return NextResponse.json({ ok: true });
}
