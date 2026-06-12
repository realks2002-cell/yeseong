import fs from 'fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { E2E, getServiceClient, STATE_FILE } from './helpers/e2e-env';

// E2E 데이터 전체 삭제 — 이름/전화번호 기준이라 state 파일 없이도 동작 (잔여물 정리 겸용)
export async function cleanup(sb: SupabaseClient) {
  const { data: site } = await sb
    .from('yeseong_worksites')
    .select('id')
    .eq('name', E2E.WORKSITE)
    .maybeSingle();

  if (site) {
    // 발주 (order_items는 FK cascade가 아니면 먼저 삭제)
    const { data: orders } = await sb.from('yeseong_orders').select('id').eq('worksite_id', site.id);
    const orderIds = (orders ?? []).map((o) => o.id);
    if (orderIds.length) {
      await sb.from('yeseong_order_items').delete().in('order_id', orderIds);
      await sb.from('yeseong_orders').delete().in('id', orderIds);
    }

    // 현장증빙 (Storage 파일 포함)
    const { data: photos } = await sb.from('yeseong_site_photos').select('id, storage_path').eq('worksite_id', site.id);
    if (photos?.length) {
      await sb.storage.from('site-photos').remove(photos.map((p) => p.storage_path));
      await sb.from('yeseong_site_photos').delete().in('id', photos.map((p) => p.id));
    }

    const { data: periods } = await sb
      .from('yeseong_payroll_periods')
      .select('id')
      .eq('worksite_id', site.id);
    const periodIds = (periods ?? []).map((p) => p.id);
    if (periodIds.length) {
      const { data: slots } = await sb
        .from('yeseong_payroll_workers')
        .select('id')
        .in('period_id', periodIds);
      const slotIds = (slots ?? []).map((s) => s.id);
      if (slotIds.length) {
        await sb.from('yeseong_masonry_volumes').delete().in('payroll_worker_id', slotIds);
        await sb.from('yeseong_attendance').delete().in('payroll_worker_id', slotIds);
      }
      await sb.from('yeseong_payroll_workers').delete().in('period_id', periodIds);
      await sb.from('yeseong_payroll_periods').delete().in('id', periodIds);
    }
    await sb.from('yeseong_masonry_prices').delete().eq('worksite_id', site.id);
  }

  // 작업자/팀장 행
  const phones = [E2E.WORKER_PHONE, E2E.MANAGER_PHONE];
  const { data: workers } = await sb.from('yeseong_workers').select('id, auth_user_id').in('phone', phones);
  const workerIds = (workers ?? []).map((w) => w.id);
  if (workerIds.length) {
    await sb.from('yeseong_fcm_tokens').delete().in('worker_id', workerIds);
    await sb.from('yeseong_workers').delete().in('id', workerIds);
  }

  const { data: mgrs } = await sb.from('yeseong_site_managers').select('id').eq('phone', E2E.MANAGER_PHONE);
  for (const m of mgrs ?? []) {
    await sb.from('yeseong_site_manager_assignments').delete().eq('site_manager_id', m.id);
    await sb.from('yeseong_site_managers').delete().eq('id', m.id);
  }

  if (site) await sb.from('yeseong_worksites').delete().eq('id', site.id);
  await sb.from('yeseong_subcontractors').delete().eq('name', E2E.SUBCONTRACTOR);
  await sb.from('yeseong_items').delete().eq('name', E2E.ITEM_NAME);

  // auth 계정 (이메일 기준 조회 후 삭제)
  const emails = [
    `${E2E.WORKER_PHONE}@yeseong.mobile`,
    `${E2E.MANAGER_PHONE}@yeseong.manager`,
    E2E.ADMIN_EMAIL,
  ];
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  for (const u of list?.users ?? []) {
    if (u.email && emails.includes(u.email)) {
      await sb.auth.admin.deleteUser(u.id);
    }
  }
}

export default async function globalTeardown() {
  const sb = getServiceClient();
  await cleanup(sb);
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
  console.log('[e2e] teardown 완료 — E2E 데이터 정리됨');
}
