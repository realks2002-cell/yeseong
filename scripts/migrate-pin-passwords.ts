// 일회성: 기존 auth.users의 password를 PIN+'00'으로 재설정.
// pinToPassword('1234') = '123400' 정책에 맞춤.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !serviceKey) {
  throw new Error('SUPABASE_URL or SERVICE_ROLE_KEY missing');
}

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

async function main() {
  const targets: Array<{ table: string; id: string; auth_user_id: string; pin: string; name: string | null }> = [];

  for (const table of ['yeseong_workers', 'yeseong_site_managers']) {
    const { data, error } = await sb
      .from(table)
      .select('id, name, auth_user_id, pin')
      .not('auth_user_id', 'is', null)
      .not('pin', 'is', null);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ id: string; name: string | null; auth_user_id: string; pin: string }>) {
      if (!/^\d{4}$/.test(row.pin)) continue;
      targets.push({ table, ...row });
    }
  }

  console.log(`[migrate] target=${targets.length}`);
  let ok = 0;
  let fail = 0;
  for (const t of targets) {
    const newPassword = `${t.pin}00`;
    const { error } = await sb.auth.admin.updateUserById(t.auth_user_id, { password: newPassword });
    if (error) {
      console.error(`[fail] ${t.table} ${t.name ?? '?'} (${t.auth_user_id}): ${error.message}`);
      fail++;
    } else {
      ok++;
    }
  }
  console.log(`[migrate] done: ok=${ok}, fail=${fail}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
