import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

export const runtime = 'nodejs';

const BUCKET = 'worker-documents';

// 팀장 자기 사진 삭제 — phone → worker_id 매핑 후 worker_id 일치 검증
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id: managerId, docId } = await params;
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = getServiceSupabase();

  const { data: mgr, error: mErr } = await admin
    .from('yeseong_site_managers')
    .select('phone')
    .eq('id', managerId)
    .maybeSingle();
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (!mgr?.phone) return NextResponse.json({ error: '팀장 전화번호 없음' }, { status: 400 });

  const { data: worker, error: wErr } = await admin
    .from('yeseong_workers')
    .select('id')
    .eq('phone', mgr.phone)
    .maybeSingle();
  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });
  if (!worker) return NextResponse.json({ error: '매칭되는 작업자 행 없음' }, { status: 404 });

  const { data: doc, error: fErr } = await admin
    .from('yeseong_worker_documents')
    .select('storage_path')
    .eq('id', docId)
    .eq('worker_id', worker.id)
    .maybeSingle();
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
  if (!doc) return NextResponse.json({ error: '문서를 찾을 수 없습니다' }, { status: 404 });

  const { error: rmErr } = await admin.storage.from(BUCKET).remove([doc.storage_path]);
  if (rmErr) console.error('[manager-documents] storage remove failed:', rmErr.message);

  const { error: dErr } = await admin.from('yeseong_worker_documents').delete().eq('id', docId);
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
