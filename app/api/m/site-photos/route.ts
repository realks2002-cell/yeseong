import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { resolveSelfWorkerId } from '@/lib/auth/self-worker';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const BUCKET = 'site-photos';
const SIGNED_TTL_SEC = 300;
const ALLOWED_CATEGORIES = ['tbm', 'materials', 'expense'] as const;

// 팀장 미러(보기 전용): 관리자가 선택한 팀장의 worker 사진 조회.
//   팀장=작업자([[yeseong_manager_is_worker]]) — 팀장 phone과 동일한 worker 행 사용.
async function resolveManagerWorkerId(admin: SupabaseClient, managerId: string): Promise<string | null> {
  const { data: mgr } = await admin
    .from('yeseong_site_managers')
    .select('phone')
    .eq('id', managerId)
    .maybeSingle();
  if (!mgr?.phone) return null;
  const { data: worker } = await admin
    .from('yeseong_workers')
    .select('id')
    .eq('phone', mgr.phone)
    .maybeSingle();
  return worker?.id ?? null;
}

type Row = {
  id: string;
  worksite_id: string;
  photo_date: string;
  category: 'tbm' | 'materials' | 'expense';
  storage_path: string;
  mime_type: string;
  file_size: number;
  memo: string | null;
  uploaded_at: string;
};

export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const managerId = url.searchParams.get('managerId');

  const admin = getServiceSupabase();
  // 미러 모드: 관리자만 선택한 팀장의 worker 사진 조회 가능
  let workerId: string | null;
  if (managerId) {
    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    workerId = await resolveManagerWorkerId(admin, managerId);
  } else {
    workerId = await resolveSelfWorkerId(admin, user.id);
  }
  if (!workerId) {
    return NextResponse.json({ error: '연결된 작업자 정보가 없습니다' }, { status: 400 });
  }
  const date = url.searchParams.get('date'); // YYYY-MM-DD; 미지정 = 전체
  const categoryRaw = url.searchParams.get('category');
  const category =
    categoryRaw && (ALLOWED_CATEGORIES as readonly string[]).includes(categoryRaw)
      ? (categoryRaw as 'tbm' | 'materials' | 'expense')
      : null;

  let query = admin
    .from('yeseong_site_photos')
    .select('id, worksite_id, photo_date, category, storage_path, mime_type, file_size, memo, uploaded_at')
    .eq('worker_id', workerId)
    .order('photo_date', { ascending: false })
    .order('uploaded_at', { ascending: false });

  if (date) query = query.eq('photo_date', date);
  if (category) query = query.eq('category', category);

  const { data: rows, error } = await query.returns<Row[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const paths = (rows ?? []).map((r) => r.storage_path);
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

  const photos = (rows ?? []).map((r) => ({
    id: r.id,
    worksite_id: r.worksite_id,
    photo_date: r.photo_date,
    category: r.category,
    memo: r.memo,
    uploaded_at: r.uploaded_at,
    signed_url: signedMap.get(r.storage_path) ?? null,
  }));

  return NextResponse.json({ photos });
}
