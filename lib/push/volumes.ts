// 매사 성과 반려 푸시 — 보조 채널이므로 실패해도 호출측 흐름을 막지 않는다.
//   1) 팀장이 작업자에게 반려(rejected_leader) → 작업자(worker 앱)에게
//   2) 관리자가 팀장에게 반려(rejected_admin)   → 팀장(manager 앱)에게

import { getServiceSupabase } from '@/lib/supabase/server';
import { sendMulticast } from '@/lib/firebase/admin';

type Row = {
  payroll_worker_id: string;
  year_month: string;
  worksite_name: string;
  worker_id: string;
  team_leader_id: string | null;
};

async function fetchRejected(
  admin: ReturnType<typeof getServiceSupabase>,
  status: 'rejected_leader' | 'rejected_admin',
  filter: { payrollWorkerIds?: string[]; ids?: string[] },
): Promise<Row[]> {
  let q = admin
    .from('yeseong_masonry_volumes')
    .select(
      'payroll_worker_id, payroll_worker:yeseong_payroll_workers(worker:yeseong_workers(id, team_leader_id), period:yeseong_payroll_periods(year_month, worksite:yeseong_worksites(name)))',
    )
    .eq('approval_status', status);
  if (filter.payrollWorkerIds) q = q.in('payroll_worker_id', filter.payrollWorkerIds);
  if (filter.ids) q = q.in('id', filter.ids);

  const { data } = await q;
  type Raw = {
    payroll_worker_id: string;
    payroll_worker: {
      worker: { id: string; team_leader_id: string | null } | null;
      period: { year_month: string; worksite: { name: string } | null } | null;
    } | null;
  };
  const rows = (data ?? []) as unknown as Raw[];
  // payroll_worker_id 단위로 중복 제거
  const map = new Map<string, Row>();
  for (const r of rows) {
    const w = r.payroll_worker?.worker;
    const p = r.payroll_worker?.period;
    if (!w || !p) continue;
    map.set(r.payroll_worker_id, {
      payroll_worker_id: r.payroll_worker_id,
      year_month: p.year_month,
      worksite_name: p.worksite?.name ?? '',
      worker_id: w.id,
      team_leader_id: w.team_leader_id,
    });
  }
  return Array.from(map.values());
}

/** 팀장이 반려한 팀원 성과(rejected_leader) → 작업자에게 푸시 */
export async function pushVolumeRejectedToWorker(payrollWorkerIds: string[]) {
  if (payrollWorkerIds.length === 0) return;
  try {
    const admin = getServiceSupabase();
    const rows = await fetchRejected(admin, 'rejected_leader', { payrollWorkerIds });

    for (const row of rows) {
      const { data: tokens } = await admin
        .from('yeseong_fcm_tokens')
        .select('token')
        .eq('worker_id', row.worker_id)
        .eq('app_type', 'worker')
        .eq('is_active', true);
      const list = (tokens ?? []).map((t) => t.token);
      if (list.length === 0) continue;

      await sendMulticast(
        list,
        '매사 성과 반려 안내',
        `${row.worksite_name} ${row.year_month} 매사 성과가 팀장에게 반려되었습니다. 앱에서 다시 입력해주세요.`,
      );
    }
  } catch {
    // 푸시 실패 무시 — 상태 변경 자체는 이미 완료
  }
}

/** 관리자가 반려한 성과(rejected_admin) → 담당 팀장에게 푸시 */
export async function pushVolumeRejectedToManager(volumeIds: string[]) {
  if (volumeIds.length === 0) return;
  try {
    const admin = getServiceSupabase();
    const rows = await fetchRejected(admin, 'rejected_admin', { ids: volumeIds });

    for (const row of rows) {
      if (!row.team_leader_id) continue;
      // 팀장(site_manager)의 auth_user_id → manager 앱 토큰
      const { data: mgr } = await admin
        .from('yeseong_site_managers')
        .select('auth_user_id')
        .eq('id', row.team_leader_id)
        .single<{ auth_user_id: string | null }>();
      if (!mgr?.auth_user_id) continue;

      const { data: tokens } = await admin
        .from('yeseong_fcm_tokens')
        .select('token')
        .eq('auth_user_id', mgr.auth_user_id)
        .eq('app_type', 'manager')
        .eq('is_active', true);
      const list = (tokens ?? []).map((t) => t.token);
      if (list.length === 0) continue;

      await sendMulticast(
        list,
        '매사 성과 반려 안내',
        `${row.worksite_name} ${row.year_month} 팀원 매사 성과가 관리자에게 반려되었습니다. 앱에서 확인해주세요.`,
      );
    }
  } catch {
    // 푸시 실패 무시
  }
}
