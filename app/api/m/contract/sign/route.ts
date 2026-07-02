import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { resolveSelfWorkerId } from '@/lib/auth/self-worker';
import { uploadSignature } from '@/lib/contract/signature-storage';

export const runtime = 'nodejs';

// 작업자 본인 서명 — 배포된(issued) 계약서에 서명 추가 → signed로 전환
export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const contractId: string | undefined = body?.contract_id;
  const dataUrl: string | undefined = body?.signature_data_url;
  if (!contractId) return NextResponse.json({ error: '계약서 정보가 없습니다' }, { status: 400 });
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return NextResponse.json({ error: '서명이 필요합니다' }, { status: 400 });
  }

  const admin = getServiceSupabase();
  const workerId = await resolveSelfWorkerId(admin, user.id);
  if (!workerId) return NextResponse.json({ error: '연결된 작업자 정보가 없습니다' }, { status: 400 });

  // 본인의 배포된(미서명) 계약서인지 확인
  const { data: contract } = await admin
    .from('yeseong_worker_contracts')
    .select('id, worker_id, status')
    .eq('id', contractId)
    .maybeSingle();
  if (!contract || contract.worker_id !== workerId) {
    return NextResponse.json({ error: '계약서를 찾을 수 없습니다' }, { status: 404 });
  }
  if (contract.status !== 'issued') {
    return NextResponse.json({ error: '이미 서명된 계약서입니다' }, { status: 409 });
  }

  const uploaded = await uploadSignature(admin, workerId, dataUrl);
  if ('error' in uploaded) return NextResponse.json({ error: uploaded.error }, { status: 500 });

  const now = new Date();
  // 서명일(서명란 날짜)을 서명하는 순간의 날짜(KST)로 초기 저장. 이후 관리자가 수정 가능.
  //   계약기간(contract_date~contract_end_date)과는 별개 컬럼.
  const signDateKst = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { error: updErr } = await admin
    .from('yeseong_worker_contracts')
    .update({
      status: 'signed',
      signature_path: uploaded.path,
      signed_at: now.toISOString(),
      sign_date: signDateKst,
    })
    .eq('id', contractId)
    .eq('status', 'issued'); // 동시 서명 방지
  if (updErr) {
    await admin.storage.from('signatures').remove([uploaded.path]);
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
