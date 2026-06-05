import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const patch: Record<string, unknown> = {};
  if (typeof body?.name === 'string') {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: '현장명은 비울 수 없습니다' }, { status: 400 });
    patch.name = name;
  }
  if ('address' in (body ?? {})) {
    patch.address = typeof body.address === 'string' && body.address.trim() ? body.address.trim() : null;
  }
  if ('client_id' in (body ?? {})) {
    patch.client_id = typeof body.client_id === 'string' && body.client_id ? body.client_id : null;
  }
  if ('subcontractor_id' in (body ?? {})) {
    patch.subcontractor_id = typeof body.subcontractor_id === 'string' && body.subcontractor_id ? body.subcontractor_id : null;
  }
  if (typeof body?.is_active === 'boolean') {
    patch.is_active = body.is_active;
  }
  if (typeof body?.latitude === 'number') {
    patch.latitude = body.latitude;
  }
  if (typeof body?.longitude === 'number') {
    patch.longitude = body.longitude;
  }
  if (typeof body?.geofence_radius === 'number') {
    patch.geofence_radius = body.geofence_radius;
  }
  if ('latitude' in (body ?? {}) && body.latitude === null) {
    patch.latitude = null;
    patch.longitude = null;
    patch.gps_registered_at = null;
    patch.gps_registered_by = null;
  }
  if (typeof body?.latitude === 'number' && typeof body?.longitude === 'number') {
    patch.gps_registered_at = new Date().toISOString();
    patch.gps_registered_by = user.id;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 필드가 없습니다' }, { status: 400 });
  }

  const { data, error } = await sb
    .from('yeseong_worksites')
    .update(patch)
    .eq('id', id)
    .select('id, name, address, client_id, subcontractor_id, is_active, latitude, longitude, geofence_radius, gps_registered_at, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 같은 이름의 현장이 있습니다' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 현장 전문건설사(1:1) 변경 시 → 이 현장 소속 작업자의 캐시값 전파 동기화
  if ('subcontractor_id' in (body ?? {})) {
    await sb
      .from('yeseong_workers')
      .update({ default_subcontractor_id: patch.subcontractor_id ?? null })
      .eq('default_worksite_id', id);
  }

  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await sb
    .from('yeseong_worksites')
    .update({ is_active: false })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
