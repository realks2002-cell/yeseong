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
    if (!targetValue) return [];
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
