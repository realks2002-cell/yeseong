import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

export const runtime = 'nodejs';

const BUCKET = 'worker-documents';
const SIGNED_TTL_SEC = 600; // 관리자 조회용 10분

type Row = {
  id: string;
  doc_type: 'id_card' | 'bankbook' | 'certificate';
  storage_path: string;
  mime_type: string;
  file_size: number;
  uploaded_by: 'self' | 'admin';
  created_at: string;
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = getServiceSupabase();
  const { data: rows, error } = await admin
    .from('yeseong_worker_documents')
    .select('id, doc_type, storage_path, mime_type, file_size, uploaded_by, created_at')
    .eq('worker_id', id)
    .order('doc_type', { ascending: true })
    .order('created_at', { ascending: true })
    .returns<Row[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const paths = (rows ?? []).map((r) => r.storage_path);
  const signedMap = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed, error: sErr } = await admin.storage.from(BUCKET).createSignedUrls(paths, SIGNED_TTL_SEC);
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) signedMap.set(s.path, s.signedUrl);
    }
  }

  const documents = (rows ?? []).map((r) => ({
    id: r.id,
    doc_type: r.doc_type,
    mime_type: r.mime_type,
    file_size: r.file_size,
    uploaded_by: r.uploaded_by,
    created_at: r.created_at,
    signed_url: signedMap.get(r.storage_path) ?? null,
  }));

  return NextResponse.json({ documents });
}
