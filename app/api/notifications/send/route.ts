import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { sendMulticast } from '@/lib/firebase/admin';
import { resolveTargetTokens } from '@/lib/push/targets';

export const runtime = 'nodejs';

type SendBody = {
  title: string;
  body: string;
  targetType: 'all' | 'leaders' | 'team' | 'phone';
  targetValue?: string; // team_leader_id (for team)
  phones?: string[];    // 전화번호 목록 (phone 모드)
};

export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { title, body, targetType, targetValue, phones } = (await req.json()) as SendBody;
  if (!title || !body || !targetType) {
    return NextResponse.json({ error: '제목, 내용, 발송대상은 필수입니다.' }, { status: 400 });
  }

  // 대상 토큰 조회 (공용 타겟팅 로직)
  if (targetType === 'team' && !targetValue) {
    return NextResponse.json({ error: '팀장을 선택해주세요.' }, { status: 400 });
  }
  if (targetType === 'phone') {
    const valid = (phones ?? (targetValue ? [targetValue] : []))
      .map((p) => p.replace(/\D/g, ''))
      .filter((p) => p.length >= 10);
    if (valid.length === 0) {
      return NextResponse.json({ error: '유효한 전화번호를 입력해주세요.' }, { status: 400 });
    }
  }
  const tokens = await resolveTargetTokens(sb, targetType, targetValue ?? null, phones);

  const logTargetValue = targetType === 'phone'
    ? `${(phones ?? []).length}개 번호`
    : (targetValue ?? null);

  if (tokens.length === 0) {
    // 이력은 남기되 발송 0건
    await sb.from('yeseong_notifications').insert({
      title,
      body,
      target_type: targetType,
      target_value: logTargetValue,
      sent_count: 0,
      fail_count: 0,
      sent_by: user.id,
    });
    return NextResponse.json({ sent: 0, failed: 0, message: '발송 대상이 없습니다.' });
  }

  // FCM 발송
  const { successCount, failureCount } = await sendMulticast(tokens, title, body);

  // 이력 저장
  await sb.from('yeseong_notifications').insert({
    title,
    body,
    target_type: targetType,
    target_value: logTargetValue,
    sent_count: successCount,
    fail_count: failureCount,
    sent_by: user.id,
  });

  return NextResponse.json({ sent: successCount, failed: failureCount });
}
