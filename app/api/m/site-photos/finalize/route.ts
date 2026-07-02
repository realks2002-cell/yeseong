import { NextResponse, after } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { resolveSelfWorkerId } from '@/lib/auth/self-worker';
import { resolveWorksiteForPhoto } from '@/lib/site-photo/resolve-context';
import { analyzeReceiptPhoto } from '@/lib/receipt-ocr';

export const runtime = 'nodejs';

const BUCKET = 'site-photos';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_CATEGORIES = ['tbm', 'materials', 'expense'] as const;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_MEMO_LEN = 500;

export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const category = body?.category;
  const storagePath: string | undefined = body?.storage_path;
  const mimeType: string = body?.mime_type ?? 'image/jpeg';
  const fileSize = Number(body?.file_size);
  const rawMemo = typeof body?.memo === 'string' ? body.memo.trim() : '';
  const memo = rawMemo === '' ? null : rawMemo.slice(0, MAX_MEMO_LEN);

  if (!(ALLOWED_CATEGORIES as readonly string[]).includes(category)) {
    return NextResponse.json({ error: 'invalid category' }, { status: 400 });
  }
  if (!storagePath) {
    return NextResponse.json({ error: 'storage_path required' }, { status: 400 });
  }
  if (!(ALLOWED_MIME as readonly string[]).includes(mimeType)) {
    return NextResponse.json({ error: 'invalid mime_type' }, { status: 400 });
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_BYTES) {
    return NextResponse.json({ error: 'invalid file_size' }, { status: 400 });
  }

  const admin = getServiceSupabase();
  const workerId = await resolveSelfWorkerId(admin, user.id);
  if (!workerId) {
    return NextResponse.json({ error: '연결된 작업자 정보가 없습니다' }, { status: 400 });
  }

  // path injection 방지 — 첫 세그먼트가 본인 worker_id
  if (!storagePath.startsWith(`${workerId}/`)) {
    return NextResponse.json({ error: 'path mismatch' }, { status: 403 });
  }

  // 현장은 서버가 재계산 (클라 값 신뢰 안 함)
  const ctx = await resolveWorksiteForPhoto(admin, workerId);
  if (!ctx) {
    // 업로드된 객체 정리
    await admin.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json(
      { error: '배정된 현장이 없습니다. 관리자에게 문의하세요.' },
      { status: 409 },
    );
  }

  const { data: inserted, error } = await admin
    .from('yeseong_site_photos')
    .insert({
      worker_id: workerId,
      worksite_id: ctx.worksite_id,
      category,
      storage_path: storagePath,
      mime_type: mimeType,
      file_size: Math.floor(fileSize),
      memo,
      // 영수증은 OCR 분석 대기 상태로 시작
      ocr_status: category === 'expense' ? 'pending' : null,
      // photo_date는 컬럼 default (KST today)로 결정
    })
    .select('id')
    .single();
  if (error || !inserted) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 });
  }

  // 영수증이면 응답 후 백그라운드로 OCR 분석 (실패해도 제출은 성공 — 관리자가 재분석 가능)
  if (category === 'expense') {
    after(async () => {
      await analyzeReceiptPhoto(admin, inserted.id);
    });
  }

  return NextResponse.json({ ok: true });
}
