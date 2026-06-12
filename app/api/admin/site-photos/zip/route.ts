import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

export const runtime = 'nodejs';

const BUCKET = 'site-photos';
const ALLOWED_CATEGORIES = ['tbm', 'materials', 'general', 'expense'] as const;
const MAX_PHOTOS = 300;

const CATEGORY_LABEL: Record<string, string> = {
  tbm: 'TBM',
  materials: '자재송장',
  general: '일반',
  expense: '비용영수증',
};

function safeName(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, '_').trim() || '_';
}

export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const worksiteId = url.searchParams.get('worksite') || null;
  const workerId = url.searchParams.get('worker') || null;
  const categoryRaw = url.searchParams.get('category');
  const category =
    categoryRaw && (ALLOWED_CATEGORIES as readonly string[]).includes(categoryRaw)
      ? categoryRaw
      : null;

  const admin = getServiceSupabase();

  let query = admin
    .from('yeseong_site_photos')
    .select('id, worker_id, worksite_id, photo_date, category, storage_path, uploaded_at')
    .order('photo_date', { ascending: true })
    .order('uploaded_at', { ascending: true })
    .limit(MAX_PHOTOS + 1);

  if (from) query = query.gte('photo_date', from);
  if (to) query = query.lte('photo_date', to);
  if (worksiteId) query = query.eq('worksite_id', worksiteId);
  if (workerId) query = query.eq('worker_id', workerId);
  if (category) query = query.eq('category', category);
  else query = query.neq('category', 'expense');

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const records = rows ?? [];
  if (records.length === 0) {
    return NextResponse.json({ error: '조건에 맞는 사진이 없습니다' }, { status: 404 });
  }
  if (records.length > MAX_PHOTOS) {
    return NextResponse.json(
      { error: `사진이 ${MAX_PHOTOS}장을 넘습니다. 기간이나 필터를 좁혀주세요.` },
      { status: 400 },
    );
  }

  const workerIds = Array.from(new Set(records.map((r) => r.worker_id)));
  const worksiteIds = Array.from(new Set(records.map((r) => r.worksite_id)));
  const [workersRes, worksitesRes] = await Promise.all([
    admin.from('yeseong_workers').select('id, name').in('id', workerIds),
    admin.from('yeseong_worksites').select('id, name').in('id', worksiteIds),
  ]);
  const workerNameMap = new Map((workersRes.data ?? []).map((w) => [w.id, w.name]));
  const worksiteNameMap = new Map((worksitesRes.data ?? []).map((w) => [w.id, w.name]));

  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const r of records) {
    const { data: file, error: dlErr } = await admin.storage.from(BUCKET).download(r.storage_path);
    if (dlErr || !file) continue;

    const ext = r.storage_path.includes('.')
      ? r.storage_path.slice(r.storage_path.lastIndexOf('.'))
      : '.jpg';
    const dir = `${r.photo_date}/${safeName(worksiteNameMap.get(r.worksite_id) ?? '알수없음')}/${CATEGORY_LABEL[r.category] ?? r.category}`;
    const base = `${safeName(workerNameMap.get(r.worker_id) ?? '알수없음')}_${r.uploaded_at.slice(11, 19).replace(/:/g, '')}`;
    let name = `${dir}/${base}${ext}`;
    for (let i = 2; usedNames.has(name); i++) name = `${dir}/${base}_${i}${ext}`;
    usedNames.add(name);

    zip.file(name, await file.arrayBuffer());
  }

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
  const filename = `현장증빙_${from ?? ''}_${to ?? ''}.zip`;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="photos.zip"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
