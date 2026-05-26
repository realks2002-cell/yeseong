// 팀장 마스터(yeseong_site_managers) phone 채우기
//   - phone is null + auth_user_id is null인 placeholder row만 대상
//   - 소스 우선순위: 팀장 엑셀 > yeseong_workers(이름 매칭)
//   - 동명이인 발생 시 스킵
//
// 실행: pnpm tsx scripts/fill-site-manager-phones.ts [--apply]

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import ExcelJS from 'exceljs';
import { getServiceSupabase } from '../lib/supabase/server';

const TEAM_LEADER_XLSX = '/Users/kenny/Desktop/Task/Yeseong/작업자마스터_팀장.xlsx';

function read(sheet: ExcelJS.Worksheet, r: number, c: number): string | null {
  const v = sheet.getRow(r).getCell(c).value;
  if (v == null) return null;
  if (typeof v === 'object' && 'text' in v) return String((v as any).text).trim() || null;
  if (typeof v === 'object' && 'richText' in v) return (v as any).richText.map((x: any) => x.text).join('').trim() || null;
  return String(v).trim() || null;
}

function cleanPhone(v: string | null): string | null {
  if (!v) return null;
  const d = v.replace(/\D/g, '');
  return d.length >= 10 ? d : null;
}

async function loadExcelPhones(): Promise<Map<string, string>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEAM_LEADER_XLSX);
  const sheet = wb.getWorksheet('작업자 마스터')!;
  const map = new Map<string, string>(); // name → phone (동명이인 시 첫 번째만)
  const dups = new Set<string>();
  for (let r = 2; r <= sheet.rowCount; r++) {
    const name = read(sheet, r, 2);
    const phone = cleanPhone(read(sheet, r, 14));
    if (!name || !phone) continue;
    if (map.has(name)) { dups.add(name); continue; }
    map.set(name, phone);
  }
  if (dups.size > 0) console.warn(`팀장 엑셀 동명이인: ${[...dups].join(', ')}`);
  return map;
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`🔧 모드: ${apply ? '🚨 APPLY' : '👀 DRY-RUN'}\n`);

  const sb = getServiceSupabase();

  // 1. placeholder 조회
  const { data: managers, error: mErr } = await sb
    .from('yeseong_site_managers')
    .select('id, name, phone, auth_user_id')
    .is('phone', null)
    .is('auth_user_id', null);
  if (mErr) throw mErr;
  console.log(`✓ phone 비어있는 placeholder: ${managers?.length ?? 0}명`);

  if (!managers || managers.length === 0) {
    console.log('처리할 row 없음. 종료.');
    return;
  }

  // 2. 팀장 엑셀 phone map
  const excelPhones = await loadExcelPhones();
  console.log(`✓ 팀장 엑셀 phone 매핑 ${excelPhones.size}건`);

  // 3. workers phone (이름 매칭 fallback)
  const names = managers.map((m) => m.name);
  const { data: workers, error: wErr } = await sb
    .from('yeseong_workers')
    .select('name, phone')
    .in('name', names)
    .not('phone', 'is', null);
  if (wErr) throw wErr;
  const workerPhoneByName = new Map<string, string[]>();
  for (const w of workers ?? []) {
    if (!w.phone) continue;
    const arr = workerPhoneByName.get(w.name) ?? [];
    arr.push(w.phone);
    workerPhoneByName.set(w.name, arr);
  }
  console.log(`✓ workers에서 phone 매칭 가능: ${[...workerPhoneByName.entries()].filter(([_, v]) => v.length === 1).length}건 (단일)\n`);

  // 4. 결정·적용
  console.log('이름        | 결정 phone        | 출처      | 액션');
  console.log('─'.repeat(70));

  let filledExcel = 0, filledWorker = 0, skipped = 0;
  for (const m of managers) {
    let phone: string | null = null;
    let src = '';
    const excelP = excelPhones.get(m.name);
    if (excelP) { phone = excelP; src = '팀장엑셀'; }
    else {
      const wPhones = workerPhoneByName.get(m.name);
      if (wPhones && wPhones.length === 1) { phone = wPhones[0]; src = 'workers'; }
      else if (wPhones && wPhones.length > 1) src = `workers 동명이인 ${wPhones.length}명`;
    }

    if (!phone) {
      console.log(`${m.name.padEnd(10)} | ${'(없음)'.padEnd(17)} | ${src.padEnd(9)} | ⏭️  스킵`);
      skipped++;
      continue;
    }

    console.log(`${m.name.padEnd(10)} | ${phone.padEnd(17)} | ${src.padEnd(9)} | ${apply ? '✓ UPDATE' : '(dry)'}`);
    if (apply) {
      const { error: uErr } = await sb
        .from('yeseong_site_managers')
        .update({ phone })
        .eq('id', m.id);
      if (uErr) { console.error(`    ✗ ${uErr.message}`); skipped++; continue; }
    }
    if (src === '팀장엑셀') filledExcel++;
    else filledWorker++;
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`팀장엑셀:  ${filledExcel}`);
  console.log(`workers:   ${filledWorker}`);
  console.log(`스킵:      ${skipped}`);
  console.log('═'.repeat(50));
  if (!apply) console.log('\n💡 실제 적용: pnpm tsx scripts/fill-site-manager-phones.ts --apply');
}

main().catch((e) => { console.error(e); process.exit(1); });
