// 회사 + 현장 + 관리자 멤버십 시드
// 실행: pnpm tsx scripts/seed.ts
import 'dotenv/config';
import { getServiceSupabase } from '../lib/supabase/server';

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@iru.test';
  const companyName = process.env.SEED_COMPANY_NAME ?? '㈜이루건설';
  const worksiteName = process.env.SEED_WORKSITE_NAME ?? '보은현장';

  const sb = getServiceSupabase();

  // 1. 관리자 사용자 찾기 (Dashboard에서 미리 생성된 상태)
  const { data: users, error: usersErr } = await sb.auth.admin.listUsers();
  if (usersErr) throw usersErr;
  const admin = users.users.find(u => u.email === adminEmail);
  if (!admin) {
    throw new Error(
      `사용자 ${adminEmail}가 없습니다. 먼저 Supabase Dashboard → Authentication → Users에서 생성하세요.`
    );
  }
  console.log(`✓ admin user: ${admin.id}`);

  // 2. 회사 upsert
  const { data: company, error: cErr } = await sb
    .from('yeseong_companies')
    .upsert({ name: companyName }, { onConflict: 'name', ignoreDuplicates: false })
    .select()
    .single();
  if (cErr) throw cErr;
  console.log(`✓ company: ${company.id} (${company.name})`);

  // 3. 멤버십 upsert
  const { error: mErr } = await sb
    .from('yeseong_company_members')
    .upsert({ user_id: admin.id, company_id: company.id, role: 'admin' });
  if (mErr) throw mErr;
  console.log(`✓ membership: ${admin.email} → ${company.name}`);

  // 4. 현장 upsert
  const { data: ws, error: wErr } = await sb
    .from('yeseong_worksites')
    .upsert(
      { company_id: company.id, name: worksiteName },
      { onConflict: 'company_id,name', ignoreDuplicates: false }
    )
    .select()
    .single();
  if (wErr) throw wErr;
  console.log(`✓ worksite: ${ws.id} (${ws.name})`);

  console.log('\n시드 완료.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
