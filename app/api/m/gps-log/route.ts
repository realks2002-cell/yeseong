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

  // 작업자 조회
  const { data: worker } = await sb
    .from('yeseong_workers')
    .select('id, default_worksite_id')
    .eq('auth_user_id', user.id)
    .single();
  if (!worker) return NextResponse.json({ error: 'worker not found' }, { status: 404 });

  // 현장 좌표와 거리 계산
  let distanceM: number | null = null;
  let withinGeofence: boolean | null = null;

  if (worker.default_worksite_id) {
    const { data: site } = await sb
      .from('yeseong_worksites')
      .select('latitude, longitude, geofence_radius')
      .eq('id', worker.default_worksite_id)
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
      worker_id: worker.id,
      latitude: lat,
      longitude: lng,
      distance_from_site_m: distanceM,
      is_within_geofence: withinGeofence,
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, distance: distanceM, within: withinGeofence });
}
