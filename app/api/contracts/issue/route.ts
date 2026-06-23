import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { resolveContractContext, snapshotToFrozenVars } from '@/lib/contract/context';
import { freezeConditions } from '@/lib/contract/variables';
import { pushContractIssued } from '@/lib/push/contract';

export const runtime = 'nodejs';

// 계약서 배포 — 선택한 작업자들에게 현장 양식으로 issued 계약서 생성 (본문·정보·날짜 동결) + 푸시
export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  // worksite_id 있으면(현장 모드) 그 현장으로 강제, 없으면(전화 모드) 작업자별 자기 현장 사용
  const worksiteId: string | null = body?.worksite_id ?? null;
  const contractDate: string = body?.contract_date ?? '';
  const contractEndDate: string | null =
    typeof body?.contract_end_date === 'string' && body.contract_end_date ? body.contract_end_date : null;
  const workerIds: string[] = Array.isArray(body?.worker_ids)
    ? body.worker_ids.filter((x: unknown): x is string => typeof x === 'string')
    : [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(contractDate)) {
    return NextResponse.json({ error: '계약일(YYYY-MM-DD)이 필요합니다' }, { status: 400 });
  }
  if (contractEndDate && !/^\d{4}-\d{2}-\d{2}$/.test(contractEndDate)) {
    return NextResponse.json({ error: '계약종료일 형식이 올바르지 않습니다 (YYYY-MM-DD)' }, { status: 400 });
  }
  if (contractEndDate && contractEndDate < contractDate) {
    return NextResponse.json({ error: '계약종료일은 시작일 이후여야 합니다' }, { status: 400 });
  }
  if (workerIds.length === 0) {
    return NextResponse.json({ error: '대상 작업자를 선택하세요' }, { status: 400 });
  }

  const admin = getServiceSupabase();
  const issuedWorkerIds: string[] = [];
  const skipped: { worker_id: string; reason: string }[] = [];

  for (const workerId of workerIds) {
    const ctx = await resolveContractContext(admin, workerId);
    if (!ctx || !ctx.worksite_id) {
      skipped.push({ worker_id: workerId, reason: '배정된 현장 없음' });
      continue;
    }
    if (worksiteId && ctx.worksite_id !== worksiteId) {
      skipped.push({ worker_id: workerId, reason: '현장 불일치' });
      continue;
    }
    if (!ctx.template_id || ctx.template_body == null) {
      skipped.push({ worker_id: workerId, reason: '현장에 양식 미지정' });
      continue;
    }

    // 미서명(issued) 계약서가 이미 있으면 차단. 서명완료만 있으면 재계약 허용.
    const { data: dup } = await admin
      .from('yeseong_worker_contracts')
      .select('id')
      .eq('worker_id', workerId)
      .eq('worksite_id', ctx.worksite_id)
      .eq('status', 'issued')
      .is('attendance_id', null)
      .maybeSingle();
    if (dup) {
      skipped.push({ worker_id: workerId, reason: '미서명 계약서가 이미 있음' });
      continue;
    }

    const renderedBody = freezeConditions(ctx.template_body, snapshotToFrozenVars(ctx.snapshot));
    const { error: insErr } = await admin.from('yeseong_worker_contracts').insert({
      worker_id: workerId,
      worksite_id: ctx.worksite_id,
      template_id: ctx.template_id,
      status: 'issued',
      rendered_body: renderedBody,
      snapshot: ctx.snapshot,
      contract_date: contractDate,
      contract_end_date: contractEndDate,
      issued_by: user.id,
    });
    if (insErr) {
      skipped.push({ worker_id: workerId, reason: insErr.code === '23505' ? '이미 배포됨' : insErr.message });
      continue;
    }
    issuedWorkerIds.push(workerId);
  }

  if (issuedWorkerIds.length) await pushContractIssued(issuedWorkerIds);

  return NextResponse.json({ issued: issuedWorkerIds.length, skipped });
}
