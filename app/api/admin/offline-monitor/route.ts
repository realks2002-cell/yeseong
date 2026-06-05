import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { sendMulticast } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

// POST /api/admin/offline-monitor
//   body: { worker_ids: string[] }
//   GPS 신호가 끊긴 작업자들에게 "앱 실행" 푸시 발송
export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const workerIds: string[] = Array.isArray(body?.worker_ids)
    ? body.worker_ids.filter((v: unknown) => typeof v === 'string')
    : [];
  if (workerIds.length === 0) {
    return NextResponse.json({ error: 'worker_ids required' }, { status: 400 });
  }

  const admin = getServiceSupabase();
  const { data: tokens } = await admin
    .from('yeseong_fcm_tokens')
    .select('token, worker_id')
    .in('worker_id', workerIds)
    .eq('app_type', 'worker')
    .eq('is_active', true);

  const list = (tokens ?? []).map((t) => t.token);
  if (list.length === 0) {
    return NextResponse.json({ sent: 0, no_token: workerIds.length });
  }

  const title = '위치 확인 안내';
  const msg = '앱이 종료되어 위치가 확인되지 않습니다. 앱을 한 번 열어주세요.';
  const { successCount, failureCount } = await sendMulticast(list, title, msg);

  // 발송 이력 기록 (실패해도 응답은 정상)
  await admin.from('yeseong_notifications').insert({
    title,
    body: msg,
    target_type: 'offline',
    target_value: `${workerIds.length}명`,
    sent_count: successCount,
    fail_count: failureCount,
    sent_by: user.id,
  }).then(() => {}, () => {});

  // 토큰이 하나도 없는 작업자 수 (앱 미설치/로그인 안 함)
  const hasToken = new Set((tokens ?? []).map((t) => t.worker_id));
  const noToken = workerIds.filter((id) => !hasToken.has(id)).length;

  return NextResponse.json({ sent: successCount, failed: failureCount, no_token: noToken });
}
