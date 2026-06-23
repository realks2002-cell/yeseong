// 근로계약서 배포 푸시 — 계약서가 배포된 작업자에게 FCM 알림.
//   푸시는 보조 채널이라 실패해도 배포 자체는 완료된 것으로 둔다.
import { getServiceSupabase } from '@/lib/supabase/server';
import { sendMulticast } from '@/lib/firebase/admin';

export async function pushContractIssued(workerIds: string[]) {
  if (workerIds.length === 0) return;
  try {
    const admin = getServiceSupabase();
    const { data: tokens } = await admin
      .from('yeseong_fcm_tokens')
      .select('token')
      .in('worker_id', workerIds)
      .eq('app_type', 'worker')
      .eq('is_active', true);
    const list = (tokens ?? []).map((t) => t.token);
    if (list.length === 0) return;

    await sendMulticast(
      list,
      '근로계약서 도착',
      '근로계약서가 도착했습니다. 앱에서 내용을 확인하고 서명해주세요.',
    );
  } catch {
    // 푸시 실패 무시 — 배포는 이미 완료됨
  }
}
