import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { pickTemplate, type TemplateLite } from '@/lib/contract/template-match';

export const runtime = 'nodejs';

// 특정 현장의 작업자 + 각자 계약 상태 — 배포 대상 선택용.
//   작업자 급여형태(wage_type)에 맞는 양식이 없으면 'no_template'.
export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const worksiteId = new URL(req.url).searchParams.get('worksite');
  if (!worksiteId) return NextResponse.json({ error: '현장을 지정하세요' }, { status: 400 });

  const admin = getServiceSupabase();

  const { data: ws } = await admin
    .from('yeseong_worksites')
    .select('id, name')
    .eq('id', worksiteId)
    .maybeSingle();
  if (!ws) return NextResponse.json({ error: '현장을 찾을 수 없습니다' }, { status: 404 });

  // 양식은 작업자 급여형태로만 매칭 — 전체 활성 양식 사용 (현장 지정 불필요)
  const { data: tplRows } = await admin
    .from('yeseong_contract_templates')
    .select('id, title, body, wage_type, is_active')
    .eq('is_active', true);
  const tpls = (tplRows ?? []) as TemplateLite[];

  const { data: rpcWorkers, error } = await admin.rpc('yeseong_workers_at_worksite', {
    p_worksite_id: worksiteId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const workers = (rpcWorkers ?? []) as { id: string; name: string }[];
  const ids = workers.map((w) => w.id);

  // 작업자 급여형태 + 기존 계약 상태
  const wageMap = new Map<string, string | null>();
  const pending = new Set<string>();
  const signed = new Set<string>();
  if (ids.length) {
    const { data: wrows } = await admin
      .from('yeseong_workers')
      .select('id, wage_type')
      .in('id', ids);
    for (const w of wrows ?? []) wageMap.set(w.id, w.wage_type ?? null);

    const { data: contracts } = await admin
      .from('yeseong_worker_contracts')
      .select('worker_id, status')
      .eq('worksite_id', worksiteId)
      .is('attendance_id', null)
      .in('worker_id', ids);
    for (const c of contracts ?? []) {
      if (c.status === 'issued') pending.add(c.worker_id);
      else signed.add(c.worker_id);
    }
  }

  return NextResponse.json({
    worksite: { id: ws.id, name: ws.name },
    has_template: tpls.length > 0,
    workers: workers.map((w) => {
      const matched = pickTemplate(wageMap.get(w.id) ?? null, tpls);
      const status = !matched
        ? 'no_template'
        : pending.has(w.id)
          ? 'issued'
          : signed.has(w.id)
            ? 'signed'
            : 'none';
      return { id: w.id, name: w.name, wage_type: wageMap.get(w.id) ?? null, status };
    }),
  });
}
