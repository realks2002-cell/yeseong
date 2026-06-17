import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { resolveSelfWorkerId } from '@/lib/auth/self-worker';

export const runtime = 'nodejs';

const BUCKET = 'worker-documents';
const MAX_CERT = 5;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
const ALLOWED_TYPES = ['id_card', 'bankbook', 'certificate'] as const;

export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const docType = body?.doc_type;
  const mimeType: string = body?.mime_type ?? 'image/jpeg';
  if (!(ALLOWED_TYPES as readonly string[]).includes(docType)) {
    return NextResponse.json({ error: 'invalid doc_type' }, { status: 400 });
  }
  if (!(ALLOWED_MIME as readonly string[]).includes(mimeType)) {
    return NextResponse.json({ error: 'invalid mime_type' }, { status: 400 });
  }

  const admin = getServiceSupabase();
  const workerId = await resolveSelfWorkerId(admin, user.id);
  if (!workerId) return NextResponse.json({ error: '연결된 작업자 정보가 없습니다' }, { status: 400 });

  if (docType === 'certificate') {
    const { count } = await admin
      .from('yeseong_worker_documents')
      .select('id', { count: 'exact', head: true })
      .eq('worker_id', workerId)
      .eq('doc_type', 'certificate');
    if ((count ?? 0) >= MAX_CERT) {
      return NextResponse.json(
        { error: `이수증은 최대 ${MAX_CERT}장까지 등록 가능합니다.` },
        { status: 409 },
      );
    }
  }

  const ext = mimeType.split('/')[1].replace('jpeg', 'jpg');
  const path = `${workerId}/${docType}/${crypto.randomUUID()}.${ext}`;

  // 본인 sb로 발급 → RLS check가 path 첫 세그먼트(worker_id)를 자동 검증
  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'sign failed' }, { status: 500 });
  }

  return NextResponse.json({
    upload_url: data.signedUrl,
    storage_path: data.path,
    token: data.token,
  });
}
