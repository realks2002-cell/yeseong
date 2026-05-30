import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

export const runtime = 'nodejs';

const BUCKET = 'site-photos';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: photoId } = await params;
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = getServiceSupabase();
  const { data: photo, error: fErr } = await admin
    .from('yeseong_site_photos')
    .select('storage_path')
    .eq('id', photoId)
    .maybeSingle();
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
  if (!photo) return NextResponse.json({ error: '사진을 찾을 수 없습니다' }, { status: 404 });

  const { error: rmErr } = await admin.storage.from(BUCKET).remove([photo.storage_path]);
  if (rmErr) console.error('[admin/site-photos] storage remove failed:', rmErr.message);

  const { error: dErr } = await admin.from('yeseong_site_photos').delete().eq('id', photoId);
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
