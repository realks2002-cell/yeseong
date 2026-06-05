import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { sendMulticast } from '@/lib/firebase/admin';

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

  // 대상 토큰 조회
  let tokens: string[] = [];

  if (targetType === 'all') {
    // 전체: 활성 토큰 모두
    const { data } = await sb
      .from('yeseong_fcm_tokens')
      .select('token')
      .eq('is_active', true);
    tokens = (data ?? []).map((r) => r.token);

  } else if (targetType === 'leaders') {
    // 팀장만: skill_grade='팀장'인 작업자의 토큰
    const { data: leaders } = await sb
      .from('yeseong_workers')
      .select('id')
      .eq('skill_grade', '팀장')
      .eq('is_active', true);
    const leaderIds = (leaders ?? []).map((l) => l.id);
    if (leaderIds.length > 0) {
      const { data } = await sb
        .from('yeseong_fcm_tokens')
        .select('token')
        .in('worker_id', leaderIds)
        .eq('is_active', true);
      tokens = (data ?? []).map((r) => r.token);
    }

  } else if (targetType === 'team') {
    // 특정 팀: team_leader_id가 targetValue인 작업자들 + 팀장 본인
    if (!targetValue) {
      return NextResponse.json({ error: '팀장을 선택해주세요.' }, { status: 400 });
    }
    const { data: members } = await sb
      .from('yeseong_workers')
      .select('id')
      .eq('is_active', true)
      .or(`id.eq.${targetValue},team_leader_id.eq.${targetValue}`);
    const memberIds = (members ?? []).map((m) => m.id);
    if (memberIds.length > 0) {
      const { data } = await sb
        .from('yeseong_fcm_tokens')
        .select('token')
        .in('worker_id', memberIds)
        .eq('is_active', true);
      tokens = (data ?? []).map((r) => r.token);
    }

  } else if (targetType === 'phone') {
    // 전화번호 목록으로: 복수 전화번호 지원
    const phoneList = (phones ?? (targetValue ? [targetValue] : []))
      .map((p) => p.replace(/\D/g, ''))
      .filter((p) => p.length >= 10);
    if (phoneList.length === 0) {
      return NextResponse.json({ error: '유효한 전화번호를 입력해주세요.' }, { status: 400 });
    }
    // Supabase .in()은 최대값이 있으므로 100개씩 분할 조회
    const allWorkerIds: string[] = [];
    for (let i = 0; i < phoneList.length; i += 100) {
      const batch = phoneList.slice(i, i + 100);
      const { data: workers } = await sb
        .from('yeseong_workers')
        .select('id')
        .in('phone', batch)
        .eq('is_active', true);
      allWorkerIds.push(...(workers ?? []).map((w) => w.id));
    }
    if (allWorkerIds.length > 0) {
      for (let i = 0; i < allWorkerIds.length; i += 100) {
        const batch = allWorkerIds.slice(i, i + 100);
        const { data } = await sb
          .from('yeseong_fcm_tokens')
          .select('token')
          .in('worker_id', batch)
          .eq('is_active', true);
        tokens.push(...(data ?? []).map((r) => r.token));
      }
    }
  }

  // 중복 제거
  tokens = [...new Set(tokens)];

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
