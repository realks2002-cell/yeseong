import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { getServiceSupabase } from '../lib/supabase/server';

async function main() {
  const sb = getServiceSupabase();
  const { data } = await sb
    .from('yeseong_site_managers')
    .select('name, phone, default_trade')
    .order('name');
  console.log('이름        | phone           | 직종');
  console.log('─'.repeat(55));
  for (const m of data ?? []) {
    console.log(`${m.name.padEnd(10)} | ${(m.phone ?? '∅').padEnd(15)} | ${m.default_trade ?? '∅'}`);
  }
  console.log(`\n총 ${data?.length ?? 0}명, 직종 채워짐 ${(data ?? []).filter((m) => m.default_trade).length}명`);
}
main().catch(console.error);
