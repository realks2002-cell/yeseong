import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { resolveSelfWorkerId } from '@/lib/auth/self-worker';
import { resolveWorksiteForPhoto } from '@/lib/site-photo/resolve-context';

export const runtime = 'nodejs';

const BUCKET = 'site-photos';
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
const ALLOWED_CATEGORIES = ['tbm', 'materials', 'general', 'expense'] as const;

export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const category = body?.category;
  const mimeType: string = body?.mime_type ?? 'image/jpeg';

  if (!(ALLOWED_CATEGORIES as readonly string[]).includes(category)) {
    return NextResponse.json({ error: 'invalid category' }, { status: 400 });
  }
  if (!(ALLOWED_MIME as readonly string[]).includes(mimeType)) {
    return NextResponse.json({ error: 'invalid mime_type' }, { status: 400 });
  }

  const admin = getServiceSupabase();
  const workerId = await resolveSelfWorkerId(admin, user.id);
  if (!workerId) {
    return NextResponse.json({ error: '연결된 작업자 정보가 없습니다' }, { status: 400 });
  }

  const ctx = await resolveWorksiteForPhoto(admin, workerId);
  if (!ctx) {
    return NextResponse.json(
      { error: '배정된 현장이 없습니다. 관리자에게 문의하세요.' },
      { status: 409 },
    );
  }

  const ext = mimeType.split('/')[1].replace('jpeg', 'jpg');
  const path = `${workerId}/${crypto.randomUUID()}.${ext}`;

  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'sign failed' }, { status: 500 });
  }

  return NextResponse.json({
    upload_url: data.signedUrl,
    storage_path: data.path,
    token: data.token,
    worksite_id: ctx.worksite_id,
    worksite_name: ctx.worksite_name,
  });
}
