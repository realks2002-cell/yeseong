// 팀장 마스터 직종 매칭 진단
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { getServiceSupabase } from '../lib/supabase/server';

async function main() {
  const sb = getServiceSupabase();
  const { data: managers } = await sb
    .from('yeseong_site_managers')
    .select('id, name, phone');
  const { data: workers } = await sb
    .from('yeseong_workers')
    .select('id, name, phone, default_trade')
    .eq('is_active', true);

  const wByPhone = new Map<string, any>();
  const wByName = new Map<string, any[]>();
  for (const w of workers ?? []) {
    if (w.phone) wByPhone.set(w.phone, w);
    const arr = wByName.get(w.name) ?? [];
    arr.push(w);
    wByName.set(w.name, arr);
  }

  console.log('이름        | sm.phone        | 같은phone w | 같은이름 w (phone/직종)');
  console.log('─'.repeat(100));
  for (const m of managers ?? []) {
    const byPhone = m.phone ? wByPhone.get(m.phone) : null;
    const byName = wByName.get(m.name) ?? [];
    const nameInfo = byName.map((w) => `${w.phone ?? '∅'}/${w.default_trade ?? '∅'}`).join(' | ');
    console.log(
      `${m.name.padEnd(10)} | ${(m.phone ?? '∅').padEnd(15)} | ${byPhone ? `✓ ${byPhone.default_trade ?? '∅'}` : '✗'.padEnd(11)} | ${nameInfo}`,
    );
  }
}
main().catch(console.error);
