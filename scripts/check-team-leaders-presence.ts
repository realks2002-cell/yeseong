// 팀장 엑셀 19명 vs DB(workers, site_managers) 현황 비교
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import ExcelJS from 'exceljs';
import { getServiceSupabase } from '../lib/supabase/server';
import { normalizeRrn, splitRrn } from '../lib/crypto/rrn';

const FILE = '/Users/kenny/Desktop/Task/Yeseong/작업자마스터_팀장.xlsx';

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

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const sheet = wb.getWorksheet('작업자 마스터')!;
  const sb = getServiceSupabase();

  const rows: { name: string; phone: string | null; rrnKey: string }[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const name = read(sheet, r, 2);
    const rrnRaw = read(sheet, r, 7);
    if (!name || !rrnRaw) continue;
    const rrn = normalizeRrn(rrnRaw);
    const { prefix, genderDigit } = splitRrn(rrn);
    rows.push({ name, phone: cleanPhone(read(sheet, r, 14)), rrnKey: `${prefix}-${genderDigit}` });
  }
  console.log(`엑셀 팀장 ${rows.length}명\n`);

  const { data: workers } = await sb
    .from('yeseong_workers')
    .select('id, name, phone, rrn_prefix, rrn_gender_digit, is_active');
  const { data: managers } = await sb
    .from('yeseong_site_managers')
    .select('id, name, phone, auth_user_id');

  const workerByKey = new Map<string, any>();
  for (const w of workers ?? []) workerByKey.set(`${w.rrn_prefix}-${w.rrn_gender_digit}`, w);
  const managerByName = new Map<string, any[]>();
  for (const m of managers ?? []) {
    const arr = managerByName.get(m.name) ?? [];
    arr.push(m);
    managerByName.set(m.name, arr);
  }

  console.log('이름           | workers              | site_managers');
  console.log('─'.repeat(90));
  for (const e of rows) {
    const w = workerByKey.get(e.rrnKey);
    const wStatus = w ? `✓ ${w.is_active ? 'active' : 'archived'} (${w.phone ?? '전번X'})` : '✗ 없음';
    const mList = managerByName.get(e.name) ?? [];
    const mStatus = mList.length === 0
      ? '✗ 없음'
      : mList.map((m) => `${m.phone ?? '전번X'}${m.auth_user_id ? '/auth' : ''}`).join(', ');
    console.log(`${e.name.padEnd(12)} | ${wStatus.padEnd(20)} | ${mStatus}`);
  }
}
main().catch(console.error);
