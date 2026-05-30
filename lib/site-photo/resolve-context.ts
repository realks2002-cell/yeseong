import type { SupabaseClient } from '@supabase/supabase-js';

// 작업자가 업로드할 현장을 자동 결정.
//   - 기존 yeseong_worker_team_context(worker_id) 재사용 — 팀장 추종 로직 단일 출처
//   - 팀장 본인이면 본인 default_worksite_id
//   - 미배정이면 null → 호출자가 사용자에게 안내
export async function resolveWorksiteForPhoto(
  admin: SupabaseClient,
  workerId: string,
): Promise<{ worksite_id: string; worksite_name: string | null } | null> {
  const { data, error } = await admin
    .rpc('yeseong_worker_team_context', { p_worker_id: workerId })
    .single<{ worksite_id: string | null; worksite_name: string | null }>();

  if (error || !data?.worksite_id) return null;
  return { worksite_id: data.worksite_id, worksite_name: data.worksite_name };
}
