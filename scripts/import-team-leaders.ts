// 팀장 엑셀(_팀장.xlsx) → yeseong_site_managers UPSERT
//   매칭 키: 이름 (rrn 없음). 동명이인 시 phone으로 분리.
//   UPSERT 필드: phone, default_trade
//   INSERT 시: name, phone, default_trade (pin/auth_user_id는 본인 가입 때 채워짐)
//
// 실행: pnpm tsx scripts/import-team-leaders.ts [--apply]

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import ExcelJS from 'exceljs';
import { getServiceSupabase } from '../lib/supabase/server';

const FILE = '/Users/kenny/Desktop/Task/Yeseong/작업자마스터_팀장.xlsx';

type Row = {
  rowIdx: number;
  name: string;
  phone: string | null;
  trade: string | null;
};

function readText(sheet: ExcelJS.Worksheet, r: number, c: number): string | null {
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

async function loadRows(): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const sheet = wb.getWorksheet('작업자 마스터')!;
  const rows: Row[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const name = readText(sheet, r, 2);
    if (!name) continue;
    rows.push({
      rowIdx: r,
      name,
      phone: cleanPhone(readText(sheet, r, 14)),
      trade: readText(sheet, r, 6),
    });
  }
  return rows;
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`📄 ${FILE}`);
  console.log(`🔧 ${apply ? '🚨 APPLY' : '👀 DRY-RUN'}\n`);

  const sb = getServiceSupabase();
  const rows = await loadRows();
  console.log(`✓ 팀장 엑셀 ${rows.length}명\n`);

  const { data: existing, error: eErr } = await sb
    .from('yeseong_site_managers')
    .select('id, name, phone, default_trade, auth_user_id');
  if (eErr) throw eErr;

  // 이름별 인덱싱
  const existingByName = new Map<string, any[]>();
  for (const m of existing ?? []) {
    const arr = existingByName.get(m.name) ?? [];
    arr.push(m);
    existingByName.set(m.name, arr);
  }

  console.log('이름        | 액션      | 적용 phone        | 적용 직종      | 비고');
  console.log('─'.repeat(95));

  let inserted = 0, updated = 0, skipped = 0;

  for (const r of rows) {
    const candidates = existingByName.get(r.name) ?? [];

    // 매칭 우선순위:
    // 1) phone 일치 (가장 정확)
    // 2) 단일 후보면 그 row
    // 3) 동명이인 다수 → INSERT (스킵 위험)
    let target: any = null;
    if (r.phone) {
      target = candidates.find((m) => m.phone === r.phone);
    }
    if (!target && candidates.length === 1) target = candidates[0];

    if (target) {
      const patch: Record<string, unknown> = {};
      if (r.phone && target.phone !== r.phone) patch.phone = r.phone;
      if (r.trade && target.default_trade !== r.trade) patch.default_trade = r.trade;
      if (Object.keys(patch).length === 0) {
        console.log(`${r.name.padEnd(10)} | (변경없음)  | ${(r.phone ?? '-').padEnd(17)} | ${(r.trade ?? '-').padEnd(12)} | id=${target.id.slice(0, 8)}`);
        continue;
      }
      console.log(`${r.name.padEnd(10)} | ↻ UPDATE   | ${(r.phone ?? '-').padEnd(17)} | ${(r.trade ?? '-').padEnd(12)} | ${Object.keys(patch).join(',')}`);
      if (apply) {
        const { error } = await sb.from('yeseong_site_managers').update(patch).eq('id', target.id);
        if (error) { console.error(`    ✗ ${error.message}`); skipped++; continue; }
      }
      updated++;
    } else if (candidates.length > 1) {
      console.log(`${r.name.padEnd(10)} | ⚠️  스킵    | ${(r.phone ?? '-').padEnd(17)} | ${(r.trade ?? '-').padEnd(12)} | 동명이인 ${candidates.length}명 자동매칭 불가`);
      skipped++;
    } else {
      console.log(`${r.name.padEnd(10)} | + INSERT  | ${(r.phone ?? '-').padEnd(17)} | ${(r.trade ?? '-').padEnd(12)} |`);
      if (apply) {
        const { error } = await sb.from('yeseong_site_managers').insert({
          name: r.name,
          phone: r.phone,
          default_trade: r.trade,
        });
        if (error) { console.error(`    ✗ ${error.message}`); skipped++; continue; }
      }
      inserted++;
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`INSERT:  ${inserted}`);
  console.log(`UPDATE:  ${updated}`);
  console.log(`SKIP:    ${skipped}`);
  console.log('═'.repeat(50));
  if (!apply) console.log('\n💡 실제 적용: pnpm tsx scripts/import-team-leaders.ts --apply');
}

main().catch((e) => { console.error(e); process.exit(1); });
