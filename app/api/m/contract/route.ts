import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { resolveSelfWorkerId } from '@/lib/auth/self-worker';
import { signatureToDataUrl } from '@/lib/contract/signature-storage';

export const runtime = 'nodejs';

// 작업자 본인에게 배포된 근로계약서 (미서명 우선, 없으면 최근 서명본)
export async function GET() {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = getServiceSupabase();
  const workerId = await resolveSelfWorkerId(admin, user.id);
  if (!workerId) return NextResponse.json({ error: '연결된 작업자 정보가 없습니다' }, { status: 400 });

  const { data: rows, error } = await admin
    .from('yeseong_worker_contracts')
    .select('id, status, rendered_body, snapshot, contract_date, contract_end_date, signed_at, signature_path')
    .eq('worker_id', workerId)
    .is('attendance_id', null)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = rows ?? [];
  const target = list.find((r) => r.status === 'issued') ?? list[0];
  if (!target) return NextResponse.json({ state: 'none', doc: null });

  if (target.status === 'issued') {
    return NextResponse.json({
      state: 'issued',
      doc: {
        id: target.id,
        snapshot: target.snapshot,
        contract_date: target.contract_date,
        contract_end_date: target.contract_end_date,
        rendered_body: target.rendered_body,
        signature_data_url: null,
      },
    });
  }

  const signatureUrl = target.signature_path
    ? await signatureToDataUrl(admin, target.signature_path)
    : null;
  return NextResponse.json({
    state: 'signed',
    doc: {
      id: target.id,
      snapshot: target.snapshot,
      contract_date: target.contract_date,
      contract_end_date: target.contract_end_date,
      rendered_body: target.rendered_body,
      signature_data_url: signatureUrl,
      signed_at: target.signed_at,
    },
  });
}
