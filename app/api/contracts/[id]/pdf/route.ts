import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { uploadContractPdf, contractPdfSignedUrl } from '@/lib/contract/contract-pdf-storage';

export const runtime = 'nodejs';
export const maxDuration = 30;

async function guard() {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  return user && isAdminEmail(user.email) ? user : null;
}

// 파일명: {전화번호}_{이름}_{날짜}.pdf (서버에서도 동일 규칙)
function fileName(snapshot: Record<string, unknown> | null, signDate: string | null, contractDate: string | null): string {
  const phone = String((snapshot?.phone as string) ?? '').replace(/\D/g, '');
  const name = String((snapshot?.worker_name as string) ?? '').replace(/[\\/:*?"<>|]/g, '').trim();
  const date = String(signDate ?? contractDate ?? '').slice(0, 10);
  return `${[phone, name, date].filter(Boolean).join('_')}.pdf`;
}

// 보관된 PDF 다운로드용 서명 URL
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const admin = getServiceSupabase();

  const { data } = await admin
    .from('yeseong_worker_contracts')
    .select('pdf_path, snapshot, sign_date, contract_date')
    .eq('id', id)
    .maybeSingle();
  if (!data?.pdf_path) return NextResponse.json({ error: '보관된 PDF가 없습니다' }, { status: 404 });

  const url = await contractPdfSignedUrl(admin, data.pdf_path, fileName(data.snapshot, data.sign_date, data.contract_date));
  if (!url) return NextResponse.json({ error: 'URL 생성 실패' }, { status: 500 });
  return NextResponse.json({ url });
}

// 관리자 수동 보관 (구 계약서 백필/재보관) — 클라이언트가 생성한 PDF 업로드
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const pdfBase64: string | undefined = body?.pdf_base64;
  if (!pdfBase64) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });

  const admin = getServiceSupabase();
  const { data: contract } = await admin
    .from('yeseong_worker_contracts')
    .select('id, worker_id, status')
    .eq('id', id)
    .maybeSingle();
  if (!contract) return NextResponse.json({ error: '계약서를 찾을 수 없습니다' }, { status: 404 });
  if (contract.status !== 'signed') {
    return NextResponse.json({ error: '서명 완료 계약서만 보관합니다' }, { status: 409 });
  }

  const base64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length < 1000) return NextResponse.json({ error: 'PDF 데이터가 올바르지 않습니다' }, { status: 400 });

  const uploaded = await uploadContractPdf(admin, contract.worker_id, id, buffer);
  if ('error' in uploaded) return NextResponse.json({ error: uploaded.error }, { status: 500 });

  const { error: updErr } = await admin
    .from('yeseong_worker_contracts')
    .update({ pdf_path: uploaded.path })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
