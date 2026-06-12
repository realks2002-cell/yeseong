import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const lat = body?.latitude;
  const lng = body?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'latitude/longitude required' }, { status: 400 });
  }

  // 작업자 해석 — auth 직접 매칭 외에 팀장 phone·이메일 폴백까지 통일
  const { data: workerId } = await sb.rpc('yeseong_resolve_worker_id', { p_uid: user.id });
  if (!workerId) return NextResponse.json({ error: 'worker not found' }, { status: 404 });

  // 현장 결정 — 팀원은 팀장 추종 (default_worksite_id가 아닌 team_context가 진실)
  const { data: ctx } = await sb.rpc('yeseong_worker_team_context', { p_worker_id: workerId });
  const worksiteId: string | null = ctx?.[0]?.worksite_id ?? null;

  // 현장 좌표와 거리 계산
  let distanceM: number | null = null;
  let withinGeofence: boolean | null = null;

  if (worksiteId) {
    const { data: site } = await sb
      .from('yeseong_worksites')
      .select('latitude, longitude, geofence_radius')
      .eq('id', worksiteId)
      .single();

    if (site?.latitude && site?.longitude) {
      const { data: dist } = await sb.rpc('yeseong_haversine', {
        lat1: lat, lon1: lng,
        lat2: site.latitude, lon2: site.longitude,
      });
      distanceM = dist as number;
      withinGeofence = distanceM !== null && distanceM <= site.geofence_radius;
    }
  }

  const { error } = await sb
    .from('yeseong_gps_logs')
    .insert({
      worker_id: workerId,
      latitude: lat,
      longitude: lng,
      distance_from_site_m: distanceM,
      is_within_geofence: withinGeofence,
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, distance: distanceM, within: withinGeofence });
}
