// 출역 반려 푸시 — 반려된 출역의 작업자에게 FCM 알림 발송
// 푸시는 보조 채널이므로 실패해도 호출측 흐름을 막지 않는다.

import { getServiceSupabase } from '@/lib/supabase/server';
import { sendMulticast } from '@/lib/firebase/admin';

type RejectedRow = {
  id: string;
  work_date: string;
  hours: number;
  rejection_reason: string | null;
  approval_status: string;
  payroll_worker: { worker_id: string | null } | null;
};

/** 반려 처리된 출역 id 목록을 받아 해당 작업자들에게 푸시 발송 */
export async function pushAttendanceRejected(attendanceIds: string[]) {
  if (attendanceIds.length === 0) return;
  try {
    const admin = getServiceSupabase();

    const { data } = await admin
      .from('yeseong_attendance')
      .select('id, work_date, hours, rejection_reason, approval_status, payroll_worker:yeseong_payroll_workers(worker_id)')
      .in('id', attendanceIds)
      .eq('approval_status', 'rejected');
    const rows = (data ?? []) as unknown as RejectedRow[];

    for (const row of rows) {
      const workerId = row.payroll_worker?.worker_id;
      if (!workerId) continue;

      const { data: tokens } = await admin
        .from('yeseong_fcm_tokens')
        .select('token')
        .eq('worker_id', workerId)
        .eq('app_type', 'worker')
        .eq('is_active', true);
      const list = (tokens ?? []).map((t) => t.token);
      if (list.length === 0) continue;

      const [, m, d] = row.work_date.split('-');
      await sendMulticast(
        list,
        '출역 반려 안내',
        `${Number(m)}/${Number(d)} 출역(${row.hours}일)이 반려되었습니다.` +
          (row.rejection_reason ? ` 사유: ${row.rejection_reason}` : '') +
          ' 앱에서 다시 등록해주세요.',
      );
    }
  } catch {
    // 푸시 실패는 무시 — 출역 상태 변경 자체는 이미 완료됨
  }
}
