import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { resolveSelfWorkerId } from '@/lib/auth/self-worker';

export const runtime = 'nodejs';

const BUCKET = 'worker-documents';
const MAX_CERT = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['id_card', 'bankbook', 'certificate'] as const;

export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const docType = body?.doc_type;
  const storagePath: string | undefined = body?.storage_path;
  const mimeType: string = body?.mime_type ?? 'image/jpeg';
  const fileSize = Number(body?.file_size);

  if (!(ALLOWED_TYPES as readonly string[]).includes(docType)) {
    return NextResponse.json({ error: 'invalid doc_type' }, { status: 400 });
  }
  if (!storagePath) {
    return NextResponse.json({ error: 'storage_path required' }, { status: 400 });
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_BYTES) {
    return NextResponse.json({ error: 'invalid file_size' }, { status: 400 });
  }

  const admin = getServiceSupabase();
  const workerId = await resolveSelfWorkerId(admin, user.id);
  if (!workerId) return NextResponse.json({ error: '연결된 작업자 정보가 없습니다' }, { status: 400 });

  // path 첫 세그먼트가 본인 worker_id + 정확한 doc_type인지 검증 (path injection 방지)
  if (!storagePath.startsWith(`${workerId}/${docType}/`)) {
    return NextResponse.json({ error: 'path mismatch' }, { status: 403 });
  }

  // 신분증·통장사본: 기존 행 조회 → 있으면 UPDATE, 없으면 INSERT (partial unique index 우회)
  let previousPath: string | null = null;
  let existingId: string | null = null;
  if (docType !== 'certificate') {
    const { data: existing } = await admin
      .from('yeseong_worker_documents')
      .select('id, storage_path')
      .eq('worker_id', workerId)
      .eq('doc_type', docType)
      .maybeSingle();
    if (existing) {
      existingId = existing.id;
      previousPath = existing.storage_path;
    }
  } else {
    // 자격증 5장 한도 재검증 (race condition 방지)
    const { count } = await admin
      .from('yeseong_worker_documents')
      .select('id', { count: 'exact', head: true })
      .eq('worker_id', workerId)
      .eq('doc_type', 'certificate');
    if ((count ?? 0) >= MAX_CERT) {
      await admin.storage.from(BUCKET).remove([storagePath]);
      return NextResponse.json(
        { error: `자격증은 최대 ${MAX_CERT}장까지 등록 가능합니다.` },
        { status: 409 },
      );
    }
  }

  const row = {
    worker_id: workerId,
    doc_type: docType,
    storage_path: storagePath,
    mime_type: mimeType,
    file_size: Math.floor(fileSize),
    uploaded_by: 'self' as const,
  };

  if (existingId) {
    const { error } = await admin
      .from('yeseong_worker_documents')
      .update(row)
      .eq('id', existingId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await admin.from('yeseong_worker_documents').insert(row);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (previousPath && previousPath !== storagePath) {
    await admin.storage.from(BUCKET).remove([previousPath]);
  }

  return NextResponse.json({ ok: true });
}
