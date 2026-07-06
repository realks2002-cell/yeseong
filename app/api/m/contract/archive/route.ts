import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { resolveSelfWorkerId } from '@/lib/auth/self-worker';
import { uploadContractPdf } from '@/lib/contract/contract-pdf-storage';

export const runtime = 'nodejs';
export const maxDuration = 30;

// 작업자 본인 — 서명 완료 계약서 PDF를 서버에 영구 보관
export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const contractId: string | undefined = body?.contract_id;
  const pdfBase64: string | undefined = body?.pdf_base64;
  if (!contractId || !pdfBase64) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const admin = getServiceSupabase();
  const workerId = await resolveSelfWorkerId(admin, user.id);
  if (!workerId) return NextResponse.json({ error: '연결된 작업자 정보가 없습니다' }, { status: 400 });

  // 본인의 서명 완료 계약서인지 확인
  const { data: contract } = await admin
    .from('yeseong_worker_contracts')
    .select('id, worker_id, status, pdf_path')
    .eq('id', contractId)
    .maybeSingle();
  if (!contract || contract.worker_id !== workerId) {
    return NextResponse.json({ error: '계약서를 찾을 수 없습니다' }, { status: 404 });
  }
  if (contract.status !== 'signed') {
    return NextResponse.json({ error: '서명 완료 계약서만 보관합니다' }, { status: 409 });
  }
  if (contract.pdf_path) {
    return NextResponse.json({ ok: true, already: true }); // 이미 보관됨 — 멱등
  }

  const base64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length < 1000) {
    return NextResponse.json({ error: 'PDF 데이터가 올바르지 않습니다' }, { status: 400 });
  }

  const uploaded = await uploadContractPdf(admin, workerId, contractId, buffer);
  if ('error' in uploaded) return NextResponse.json({ error: uploaded.error }, { status: 500 });

  const { error: updErr } = await admin
    .from('yeseong_worker_contracts')
    .update({ pdf_path: uploaded.path })
    .eq('id', contractId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
