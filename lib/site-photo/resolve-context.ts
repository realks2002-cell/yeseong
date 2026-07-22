import type { SupabaseClient } from '@supabase/supabase-js';

// 작업자가 업로드할 현장을 자동 결정. (작업자앱·팀장앱 공용)
//   - yeseong_worker_photo_worksite(worker_id): 오늘 파견 출역이 있으면 그 현장, 없으면 팀장 추종 default
//   - 팀장 본인이면 본인 default_worksite_id (파견 시 파견 현장)
//   - 미배정이면 null → 호출자가 사용자에게 안내
export async function resolveWorksiteForPhoto(
  admin: SupabaseClient,
  workerId: string,
): Promise<{ worksite_id: string; worksite_name: string | null } | null> {
  const { data, error } = await admin
    .rpc('yeseong_worker_photo_worksite', { p_worker_id: workerId })
    .single<{ worksite_id: string | null; worksite_name: string | null }>();

  if (error || !data?.worksite_id) return null;
  return { worksite_id: data.worksite_id, worksite_name: data.worksite_name };
}
