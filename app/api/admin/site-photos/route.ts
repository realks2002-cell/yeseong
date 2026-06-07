import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

export const runtime = 'nodejs';

const BUCKET = 'site-photos';
const SIGNED_TTL_SEC = 600;
const ALLOWED_CATEGORIES = ['tbm', 'materials', 'general', 'expense'] as const;

type Row = {
  id: string;
  worker_id: string;
  worksite_id: string;
  photo_date: string;
  category: 'tbm' | 'materials' | 'general' | 'expense';
  storage_path: string;
  mime_type: string;
  file_size: number;
  memo: string | null;
  uploaded_at: string;
  receipt_store: string | null;
  receipt_amount: number | null;
  receipt_date: string | null;
  ocr_status: 'pending' | 'done' | 'failed' | null;
};

export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get('from'); // YYYY-MM-DD
  const to = url.searchParams.get('to');
  const worksiteId = url.searchParams.get('worksite') || null;
  const workerId = url.searchParams.get('worker') || null;
  const categoryRaw = url.searchParams.get('category');
  const category =
    categoryRaw && (ALLOWED_CATEGORIES as readonly string[]).includes(categoryRaw)
      ? (categoryRaw as 'tbm' | 'materials' | 'general' | 'expense')
      : null;

  const admin = getServiceSupabase();

  let query = admin
    .from('yeseong_site_photos')
    .select(
      'id, worker_id, worksite_id, photo_date, category, storage_path, mime_type, file_size, memo, uploaded_at, receipt_store, receipt_amount, receipt_date, ocr_status',
    )
    .order('photo_date', { ascending: false })
    .order('worksite_id', { ascending: true })
    .order('category', { ascending: true })
    .order('uploaded_at', { ascending: true });

  if (from) query = query.gte('photo_date', from);
  if (to) query = query.lte('photo_date', to);
  if (worksiteId) query = query.eq('worksite_id', worksiteId);
  if (workerId) query = query.eq('worker_id', workerId);
  // 카테고리 미지정 시 expense 제외 — 비용·영수증은 /expenses(비용처리) 전용
  if (category) query = query.eq('category', category);
  else query = query.neq('category', 'expense');

  const { data: rows, error } = await query.returns<Row[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const records = rows ?? [];

  // 작업자·현장 이름 매핑 (별도 쿼리 — 견고하고 단순)
  const workerIds = Array.from(new Set(records.map((r) => r.worker_id)));
  const worksiteIds = Array.from(new Set(records.map((r) => r.worksite_id)));

  const [workersRes, worksitesRes] = await Promise.all([
    workerIds.length
      ? admin.from('yeseong_workers').select('id, name').in('id', workerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    worksiteIds.length
      ? admin.from('yeseong_worksites').select('id, name').in('id', worksiteIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
  ]);
  if (workersRes.error) return NextResponse.json({ error: workersRes.error.message }, { status: 500 });
  if (worksitesRes.error)
    return NextResponse.json({ error: worksitesRes.error.message }, { status: 500 });

  const workerNameMap = new Map((workersRes.data ?? []).map((w) => [w.id, w.name]));
  const worksiteNameMap = new Map((worksitesRes.data ?? []).map((w) => [w.id, w.name]));

  // signed URLs
  const paths = records.map((r) => r.storage_path);
  const signedMap = new Map<string, string>();
  if (paths.length) {
    const { data: signed, error: sErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_TTL_SEC);
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) signedMap.set(s.path, s.signedUrl);
    }
  }

  const photos = records.map((r) => ({
    id: r.id,
    worker_id: r.worker_id,
    worker_name: workerNameMap.get(r.worker_id) ?? '(알수없음)',
    worksite_id: r.worksite_id,
    worksite_name: worksiteNameMap.get(r.worksite_id) ?? '(알수없음)',
    photo_date: r.photo_date,
    category: r.category,
    memo: r.memo,
    uploaded_at: r.uploaded_at,
    signed_url: signedMap.get(r.storage_path) ?? null,
    receipt_store: r.receipt_store,
    receipt_amount: r.receipt_amount === null ? null : Number(r.receipt_amount),
    receipt_date: r.receipt_date,
    ocr_status: r.ocr_status,
  }));

  return NextResponse.json({ photos });
}
