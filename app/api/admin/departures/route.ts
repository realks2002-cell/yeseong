import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

// GET /api/admin/departures
//   geofence 이탈 GPS 로그 조회 (is_within_geofence = false)
//   필터: date (YYYY-MM-DD, 기본 오늘), worker_id
//   페이지네이션: page (default 1), pageSize (default 50, max 200)
//   응답: { items, total, summary: { totalEvents, workerCount } }
export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const workerId = url.searchParams.get('worker_id');
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '50', 10) || 50));

  let q = sb
    .from('yeseong_gps_logs')
    .select(
      'id, worker_id, latitude, longitude, distance_from_site_m, created_at, worker:yeseong_workers(name, phone, default_worksite_id)',
      { count: 'exact' },
    )
    .eq('is_within_geofence', false)
    .gte('created_at', `${date}T00:00:00+09:00`)
    .lte('created_at', `${date}T23:59:59+09:00`)
    .order('created_at', { ascending: false });

  if (workerId) q = q.eq('worker_id', workerId);

  const offset = (page - 1) * pageSize;
  q = q.range(offset, offset + pageSize - 1);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 현장명 매핑
  const worksiteIds = Array.from(new Set(
    (data ?? [])
      .map((r) => (r.worker as unknown as { default_worksite_id: string | null } | null)?.default_worksite_id)
      .filter((v): v is string => !!v),
  ));
  const worksiteMap: Record<string, string> = {};
  if (worksiteIds.length > 0) {
    const { data: sites } = await sb
      .from('yeseong_worksites')
      .select('id, name')
      .in('id', worksiteIds);
    for (const s of sites ?? []) worksiteMap[s.id] = s.name;
  }

  // 이탈 인원 수 (해당 날짜 distinct worker)
  const { data: distinctWorkers } = await sb
    .from('yeseong_gps_logs')
    .select('worker_id')
    .eq('is_within_geofence', false)
    .gte('created_at', `${date}T00:00:00+09:00`)
    .lte('created_at', `${date}T23:59:59+09:00`);
  const workerCount = new Set((distinctWorkers ?? []).map((r) => r.worker_id)).size;

  return NextResponse.json({
    items: (data ?? []).map((r) => {
      const w = r.worker as unknown as { name: string; phone: string | null; default_worksite_id: string | null } | null;
      return {
        id: r.id,
        worker_id: r.worker_id,
        worker_name: w?.name ?? '-',
        worker_phone: w?.phone ?? null,
        worksite_name: w?.default_worksite_id ? worksiteMap[w.default_worksite_id] ?? '-' : '-',
        latitude: r.latitude,
        longitude: r.longitude,
        distance_m: r.distance_from_site_m,
        created_at: r.created_at,
      };
    }),
    total: count ?? 0,
    page,
    pageSize,
    summary: { totalEvents: count ?? 0, workerCount },
  });
}
