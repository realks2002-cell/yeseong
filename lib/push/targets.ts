// 푸시 대상 토큰 조회 — 알림 발송·인앱 공지 푸시가 공유하는 타겟팅 로직
// targetType 의미는 yeseong_announcements / yeseong_notifications와 동일

import type { SupabaseClient } from '@supabase/supabase-js';

export type PushTargetType = 'all' | 'leaders' | 'team' | 'phone';

export async function resolveTargetTokens(
  sb: SupabaseClient,
  targetType: PushTargetType,
  targetValue?: string | null,
  phones?: string[],
): Promise<string[]> {
  let tokens: string[] = [];

  if (targetType === 'all') {
    const { data } = await sb
      .from('yeseong_fcm_tokens')
      .select('token')
      .eq('is_active', true);
    tokens = (data ?? []).map((r) => r.token);

  } else if (targetType === 'leaders') {
    // 팀장 명단의 진실 원천 = site_managers (worker.skill_grade 아님)
    // ① 팀장앱 세션 토큰(auth_user_id) ② 팀장 worker 행 토큰(phone 매칭)
    const { data: managers } = await sb
      .from('yeseong_site_managers')
      .select('auth_user_id, phone');
    const authIds = (managers ?? []).map((m) => m.auth_user_id).filter(Boolean) as string[];
    const phones = (managers ?? []).map((m) => m.phone).filter(Boolean) as string[];
    let leaderWorkerIds: string[] = [];
    if (phones.length > 0) {
      const { data: lw } = await sb
        .from('yeseong_workers')
        .select('id')
        .in('phone', phones)
        .eq('is_active', true);
      leaderWorkerIds = (lw ?? []).map((w) => w.id);
    }
    const ors: string[] = [];
    if (authIds.length > 0) ors.push(`auth_user_id.in.(${authIds.join(',')})`);
    if (leaderWorkerIds.length > 0) ors.push(`worker_id.in.(${leaderWorkerIds.join(',')})`);
    if (ors.length > 0) {
      const { data } = await sb
        .from('yeseong_fcm_tokens')
        .select('token')
        .eq('is_active', true)
        .or(ors.join(','));
      tokens = (data ?? []).map((r) => r.token);
    }

  } else if (targetType === 'team') {
    if (!targetValue) return [];
    // targetValue = site_manager id — 팀원(worker.team_leader_id) + 팀장 본인(phone·auth)
    const { data: leader } = await sb
      .from('yeseong_site_managers')
      .select('auth_user_id, phone')
      .eq('id', targetValue)
      .maybeSingle();
    const { data: members } = await sb
      .from('yeseong_workers')
      .select('id')
      .eq('is_active', true)
      .eq('team_leader_id', targetValue);
    const memberIds = (members ?? []).map((m) => m.id);
    if (leader?.phone) {
      const { data: lw } = await sb
        .from('yeseong_workers')
        .select('id')
        .eq('phone', leader.phone)
        .eq('is_active', true)
        .limit(1);
      memberIds.push(...(lw ?? []).map((w) => w.id));
    }
    const ors: string[] = [];
    if (memberIds.length > 0) ors.push(`worker_id.in.(${memberIds.join(',')})`);
    if (leader?.auth_user_id) ors.push(`auth_user_id.eq.${leader.auth_user_id}`);
    if (ors.length > 0) {
      const { data } = await sb
        .from('yeseong_fcm_tokens')
        .select('token')
        .eq('is_active', true)
        .or(ors.join(','));
      tokens = (data ?? []).map((r) => r.token);
    }

  } else if (targetType === 'phone') {
    const phoneList = (phones ?? (targetValue ? targetValue.split(/[,\s]+/) : []))
      .map((p) => p.replace(/\D/g, ''))
      .filter((p) => p.length >= 10);
    if (phoneList.length === 0) return [];
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

  return [...new Set(tokens)];
}
