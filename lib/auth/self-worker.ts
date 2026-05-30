// 본인 worker_id 해석 — 작업자(auth_user_id 매칭) 또는 팀장(phone 매칭으로 worker 행)
// 팀장=작업자(메모리 [[yeseong_manager_is_worker]]) — 팀장의 phone과 동일한 worker 행 사용

import type { SupabaseClient } from '@supabase/supabase-js';

export async function resolveSelfWorkerId(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: worker } = await admin
    .from('yeseong_workers')
    .select('id')
    .eq('auth_user_id', userId)
    .maybeSingle();
  if (worker) return worker.id;

  const { data: mgr } = await admin
    .from('yeseong_site_managers')
    .select('phone')
    .eq('auth_user_id', userId)
    .maybeSingle();
  if (!mgr?.phone) return null;

  const { data: workerByPhone } = await admin
    .from('yeseong_workers')
    .select('id')
    .eq('phone', mgr.phone)
    .maybeSingle();
  return workerByPhone?.id ?? null;
}
