import crypto from 'crypto';
import { E2E, getServiceClient, writeState, type E2EState } from './helpers/e2e-env';
import { cleanup } from './global-teardown';

// 시드: E2E 전문건설사/현장/팀장/작업자 + auth 계정 생성.
// 이전 실행 잔여물이 있으면 먼저 정리한다.
export default async function globalSetup() {
  const sb = getServiceClient();
  await cleanup(sb).catch(() => {});

  const fail = (step: string, error: { message: string } | null) => {
    throw new Error(`E2E seed 실패 [${step}]: ${error?.message}`);
  };

  const { data: sub, error: e1 } = await sb
    .from('yeseong_subcontractors')
    .insert({ name: E2E.SUBCONTRACTOR })
    .select('id')
    .single();
  if (e1 || !sub) return fail('subcontractor', e1);

  const { data: site, error: e2 } = await sb
    .from('yeseong_worksites')
    .insert({ name: E2E.WORKSITE, subcontractor_id: sub.id })
    .select('id')
    .single();
  if (e2 || !site) return fail('worksite', e2);

  // auth 계정 3개 (작업자/팀장/관리자)
  const adminPassword = crypto.randomBytes(12).toString('base64url');
  const mkUser = async (email: string, password: string) => {
    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`auth 생성 실패 (${email}): ${error?.message}`);
    return data.user.id;
  };
  const workerAuth = await mkUser(`${E2E.WORKER_PHONE}@yeseong.mobile`, E2E.PIN_PASSWORD);
  const managerAuth = await mkUser(`${E2E.MANAGER_PHONE}@yeseong.manager`, E2E.PIN_PASSWORD);
  const adminAuth = await mkUser(E2E.ADMIN_EMAIL, adminPassword);

  const { data: mgr, error: e3 } = await sb
    .from('yeseong_site_managers')
    .insert({ name: E2E.MANAGER_NAME, phone: E2E.MANAGER_PHONE, auth_user_id: managerAuth })
    .select('id')
    .single();
  if (e3 || !mgr) return fail('site_manager', e3);

  const { error: e4 } = await sb
    .from('yeseong_site_manager_assignments')
    .insert({ site_manager_id: mgr.id, worksite_id: site.id });
  if (e4) return fail('assignment', e4);

  // 팀장 = 작업자 (phone 연결, 현장 보유)
  const { data: mgrWorker, error: e5 } = await sb
    .from('yeseong_workers')
    .insert({
      name: E2E.MANAGER_NAME,
      phone: E2E.MANAGER_PHONE,
      skill_grade: '팀장',
      default_trade: '조적공',
      wage_type: '일급',
      default_wage: 200000,
      default_worksite_id: site.id,
    })
    .select('id')
    .single();
  if (e5 || !mgrWorker) return fail('manager worker row', e5);

  // 작업자 — 팀장 추종, 매사(월급/일급) 대상자
  const { data: worker, error: e6 } = await sb
    .from('yeseong_workers')
    .insert({
      name: E2E.WORKER_NAME,
      phone: E2E.WORKER_PHONE,
      default_trade: '조적공',
      wage_type: '월급/일급',
      default_wage: 180000,
      team_leader_id: mgr.id,
      auth_user_id: workerAuth,
      pin: E2E.PIN,
    })
    .select('id')
    .single();
  if (e6 || !worker) return fail('worker row', e6);

  // 매사 단가 (성과 입력 테스트용)
  const { error: e7 } = await sb.from('yeseong_masonry_prices').insert({
    worksite_id: site.id,
    category: '조적',
    type_name: E2E.PRICE_NAME,
    size_spec: '1.0B',
    unit: '㎡',
    unit_price: 10000,
  });
  if (e7) return fail('masonry price', e7);

  // 발주 품목 (전 공종 공통)
  const { error: e8 } = await sb.from('yeseong_items').insert({
    name: E2E.ITEM_NAME,
    spec: '40kg',
    unit: '포',
  });
  if (e8) return fail('item', e8);

  const state: E2EState = {
    adminPassword,
    subcontractorId: sub.id,
    worksiteId: site.id,
    managerId: mgr.id,
    managerWorkerId: mgrWorker.id,
    workerId: worker.id,
    authUserIds: [workerAuth, managerAuth, adminAuth],
  };
  writeState(state);
  console.log('[e2e] seed 완료 — 현장:', site.id);
}
