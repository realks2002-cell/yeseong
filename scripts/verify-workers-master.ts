// 작업자마스터 엑셀 ↔ DB 1:1 비교
//   - rrn_prefix + gender_digit 기준 매칭
//   - 필드별 차이 리포트 (사번/이름/영문/팀장/구분/직종/외국인/국적/비자/은행/계좌/예금주/연락처/주소/일당/급여형태)
//   - 엑셀에만 있는 / DB에만 있는 사람도 별도 리포트
//
// 실행: pnpm tsx scripts/verify-workers-master.ts

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import ExcelJS from 'exceljs';
import { getServiceSupabase } from '../lib/supabase/server';
import { normalizeRrn, splitRrn, maskFromParts } from '../lib/crypto/rrn';

const FILE = '/Users/kenny/Desktop/Task/Yeseong/2026.05.21.xlsx';
const SHEET_NAME = '작업자 마스터';

type ExcelRow = {
  rowIdx: number;
  employeeCode: string | null;
  name: string;
  nameEnglish: string | null;
  teamLeaderName: string | null;
  skillGrade: string | null;
  defaultTrade: string | null;
  rrnKey: string;       // prefix-gender
  isForeign: boolean;
  nationality: string | null;
  visaStatus: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
  phone: string | null;
  address: string | null;
  defaultWage: number;
  wageType: string | null;
  firstWorkDate: string | null;
};

function readText(sheet: ExcelJS.Worksheet, row: number, col: number): string | null {
  const v = sheet.getRow(row).getCell(col).value;
  if (v == null) return null;
  if (typeof v === 'object' && 'text' in v) {
    return String((v as { text: unknown }).text).trim() || null;
  }
  if (typeof v === 'object' && 'richText' in v) {
    const rt = (v as { richText: { text: string }[] }).richText;
    return rt.map((r) => r.text).join('').trim() || null;
  }
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function readDate(sheet: ExcelJS.Worksheet, row: number, col: number): string | null {
  const v = sheet.getRow(row).getCell(col).value;
  if (v == null) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  // "2026-02-23" 형식 그대로
  const m = s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return s || null;
}

function readNumber(sheet: ExcelJS.Worksheet, row: number, col: number): number | null {
  const v = sheet.getRow(row).getCell(col).value;
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && 'result' in v) {
    const r = (v as { result: unknown }).result;
    return typeof r === 'number' ? r : null;
  }
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function stripMarker(v: string | null): string | null {
  if (!v) return v;
  return v.replace(/\s*\(\*\)\s*$/, '').trim() || null;
}

function cleanPhone(v: string | null): string | null {
  if (!v) return null;
  const digits = v.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits;
}

function norm(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s).trim();
}

function parseExcel(): ExcelRow[] {
  return [];
}

async function loadExcel(): Promise<ExcelRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const sheet = wb.getWorksheet(SHEET_NAME);
  if (!sheet) throw new Error(`Sheet '${SHEET_NAME}' not found`);

  const rows: ExcelRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const name = readText(sheet, r, 2);
    const rrnRaw = readText(sheet, r, 7);
    if (!name || !rrnRaw) continue;
    let rrn: string;
    try {
      rrn = normalizeRrn(rrnRaw);
    } catch {
      console.error(`R${r}: 잘못된 주민번호 "${rrnRaw}"`);
      continue;
    }
    const { prefix, genderDigit } = splitRrn(rrn);
    const nationalityRaw = readText(sheet, r, 9);
    const visaRaw = readText(sheet, r, 10);
    const foreignCol = readText(sheet, r, 8);
    rows.push({
      rowIdx: r,
      employeeCode: readText(sheet, r, 1),
      name,
      nameEnglish: readText(sheet, r, 3),
      teamLeaderName: readText(sheet, r, 4),
      skillGrade: readText(sheet, r, 5),
      defaultTrade: readText(sheet, r, 6),
      rrnKey: `${prefix}-${genderDigit}`,
      isForeign: Boolean(foreignCol || nationalityRaw || visaRaw),
      nationality: stripMarker(nationalityRaw),
      visaStatus: stripMarker(visaRaw),
      bankName: readText(sheet, r, 11),
      accountNumber: readText(sheet, r, 12),
      accountHolder: readText(sheet, r, 13),
      phone: cleanPhone(readText(sheet, r, 14)),
      address: readText(sheet, r, 15),
      defaultWage: readNumber(sheet, r, 16) ?? 0,
      wageType: readText(sheet, r, 17),
      firstWorkDate: readDate(sheet, r, 18),
    });
  }
  return rows;
}

type Diff = { field: string; excel: string; db: string };

function diffOne(e: ExcelRow, d: any, leaderNameById: Map<string, string>): Diff[] {
  const diffs: Diff[] = [];

  const push = (field: string, excel: unknown, db: unknown) => {
    const a = norm(excel as string | null);
    const b = norm(db as string | null);
    if (a !== b) diffs.push({ field, excel: a || '(빈값)', db: b || '(빈값)' });
  };

  push('사번', e.employeeCode, d.employee_code);
  push('성명', e.name, d.name);
  push('영문명', e.nameEnglish, d.name_english);
  push('구분', e.skillGrade, d.skill_grade);
  push('직종', e.defaultTrade, d.default_trade);
  push('국적', e.nationality, d.nationality);
  push('비자', e.visaStatus, d.visa_status);
  push('은행', e.bankName, d.bank_name);
  push('계좌번호', e.accountNumber, d.account_number);
  push('예금주', e.accountHolder, d.account_holder);
  push('연락처', e.phone, d.phone);
  push('주소', e.address, d.address);
  push('급여형태', e.wageType, d.wage_type);
  push('첫근무일', e.firstWorkDate, d.first_work_date);

  // 숫자 비교
  const ew = Math.floor(e.defaultWage || 0);
  const dw = Math.floor(Number(d.default_wage || 0));
  if (ew !== dw) diffs.push({ field: '기본일당', excel: String(ew), db: String(dw) });

  // boolean 비교
  if (Boolean(e.isForeign) !== Boolean(d.is_foreign)) {
    diffs.push({ field: '외국인', excel: String(e.isForeign), db: String(d.is_foreign) });
  }

  // 팀장 — DB는 site_manager_id, 엑셀은 이름. id→name lookup.
  const dbLeaderName = d.team_leader_id ? (leaderNameById.get(d.team_leader_id) ?? '(미존재 id)') : '';
  if (norm(e.teamLeaderName) !== norm(dbLeaderName)) {
    diffs.push({
      field: '팀장',
      excel: e.teamLeaderName || '(없음)',
      db: dbLeaderName || '(없음)',
    });
  }

  return diffs;
}

async function main() {
  console.log(`📄 파일: ${FILE}\n`);

  const sb = getServiceSupabase();

  // 1. 엑셀 로드
  const excelRows = await loadExcel();
  console.log(`✓ 엑셀 ${excelRows.length}명 파싱`);

  // 2. DB workers (active)
  const { data: dbWorkers, error: wErr } = await sb
    .from('yeseong_workers')
    .select(`
      id, employee_code, name, name_english,
      rrn_prefix, rrn_gender_digit, skill_grade, default_trade,
      is_foreign, nationality, visa_status,
      bank_name, account_number, account_holder, phone, address,
      default_wage, wage_type, first_work_date, is_active, team_leader_id
    `)
    .eq('is_active', true);
  if (wErr) throw wErr;
  console.log(`✓ DB ${dbWorkers?.length ?? 0}명 (is_active=true)\n`);

  // 3. site_managers id → name
  const { data: managers, error: mErr } = await sb
    .from('yeseong_site_managers')
    .select('id, name');
  if (mErr) throw mErr;
  const leaderNameById = new Map<string, string>();
  for (const m of managers ?? []) leaderNameById.set(m.id, m.name);

  // 4. 인덱싱
  const excelByKey = new Map<string, ExcelRow>();
  for (const e of excelRows) excelByKey.set(e.rrnKey, e);
  const dbByKey = new Map<string, any>();
  for (const d of dbWorkers ?? []) dbByKey.set(`${d.rrn_prefix}-${d.rrn_gender_digit}`, d);

  // 5. 비교
  const onlyInExcel: ExcelRow[] = [];
  const onlyInDB: any[] = [];
  const fieldDiffs: { name: string; key: string; diffs: Diff[] }[] = [];

  for (const e of excelRows) {
    const d = dbByKey.get(e.rrnKey);
    if (!d) {
      onlyInExcel.push(e);
      continue;
    }
    const diffs = diffOne(e, d, leaderNameById);
    if (diffs.length > 0) fieldDiffs.push({ name: e.name, key: e.rrnKey, diffs });
  }

  for (const d of dbWorkers ?? []) {
    const key = `${d.rrn_prefix}-${d.rrn_gender_digit}`;
    if (!excelByKey.has(key)) onlyInDB.push(d);
  }

  // 6. 리포트
  console.log('═'.repeat(60));
  console.log('📊 비교 결과');
  console.log('═'.repeat(60));

  console.log(`\n엑셀:  ${excelRows.length}명`);
  console.log(`DB:    ${dbWorkers?.length ?? 0}명`);
  console.log(`완전 일치:    ${excelRows.length - onlyInExcel.length - fieldDiffs.length}명`);
  console.log(`필드 불일치:  ${fieldDiffs.length}명`);
  console.log(`엑셀에만:     ${onlyInExcel.length}명`);
  console.log(`DB에만:       ${onlyInDB.length}명`);

  if (onlyInExcel.length > 0) {
    console.log('\n' + '─'.repeat(60));
    console.log('🚨 엑셀에만 있고 DB에 없음:');
    console.log('─'.repeat(60));
    for (const e of onlyInExcel) {
      console.log(`  - ${e.name} (R${e.rowIdx}, ${maskFromParts(e.rrnKey.split('-')[0], e.rrnKey.split('-')[1])})`);
    }
  }

  if (onlyInDB.length > 0) {
    console.log('\n' + '─'.repeat(60));
    console.log('🚨 DB에만 있고 엑셀에 없음:');
    console.log('─'.repeat(60));
    for (const d of onlyInDB) {
      console.log(`  - ${d.name} (${maskFromParts(d.rrn_prefix, d.rrn_gender_digit)})`);
    }
  }

  if (fieldDiffs.length > 0) {
    console.log('\n' + '─'.repeat(60));
    console.log('⚠️  필드 불일치 상세:');
    console.log('─'.repeat(60));
    for (const fd of fieldDiffs) {
      console.log(`\n● ${fd.name} (${fd.key})`);
      for (const d of fd.diffs) {
        console.log(`   [${d.field}]`);
        console.log(`     엑셀: ${d.excel}`);
        console.log(`     DB:   ${d.db}`);
      }
    }

    // 필드별 통계
    console.log('\n' + '─'.repeat(60));
    console.log('📈 필드별 불일치 카운트:');
    console.log('─'.repeat(60));
    const fieldCount = new Map<string, number>();
    for (const fd of fieldDiffs) {
      for (const d of fd.diffs) {
        fieldCount.set(d.field, (fieldCount.get(d.field) ?? 0) + 1);
      }
    }
    const sorted = [...fieldCount.entries()].sort((a, b) => b[1] - a[1]);
    for (const [field, count] of sorted) {
      console.log(`  ${field.padEnd(10)} ${count}건`);
    }
  } else {
    console.log('\n✅ 모든 필드 일치!');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
