import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

export const runtime = 'nodejs';

const BUCKET = 'worker-documents';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id, docId } = await params;
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = getServiceSupabase();

  const { data: doc, error: fErr } = await admin
    .from('yeseong_worker_documents')
    .select('storage_path')
    .eq('id', docId)
    .eq('worker_id', id)
    .maybeSingle();
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
  if (!doc) return NextResponse.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 });

  // Storage 객체 먼저 삭제 (실패해도 DB 행 삭제는 진행 — orphan 방지)
  const { error: rmErr } = await admin.storage.from(BUCKET).remove([doc.storage_path]);
  if (rmErr) {
    console.error('[worker-documents] storage remove failed:', rmErr.message);
  }

  const { error: dErr } = await admin.from('yeseong_worker_documents').delete().eq('id', docId);
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
