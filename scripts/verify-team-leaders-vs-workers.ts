// 팀장 엑셀(_팀장.xlsx) 20명 vs yeseong_workers 1:1 필드별 비교
//   매칭 키: rrn_prefix + rrn_gender_digit
//   비교 필드: 성명/영문명/구분(skill_grade)/직종/외국인/국적/비자/은행/계좌/예금주/연락처/주소/기본일당/급여형태
//
// 실행: pnpm tsx scripts/verify-team-leaders-vs-workers.ts

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import ExcelJS from 'exceljs';
import { getServiceSupabase } from '../lib/supabase/server';
import { normalizeRrn, splitRrn, maskFromParts } from '../lib/crypto/rrn';

const FILE = '/Users/kenny/Desktop/Task/Yeseong/작업자마스터_팀장.xlsx';

type ExcelRow = {
  rowIdx: number;
  name: string;
  nameEnglish: string | null;
  skillGrade: string | null;
  defaultTrade: string | null;
  rrnKey: string;
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
};

function readText(sheet: ExcelJS.Worksheet, r: number, c: number): string | null {
  const v = sheet.getRow(r).getCell(c).value;
  if (v == null) return null;
  if (typeof v === 'object' && 'text' in v) return String((v as any).text).trim() || null;
  if (typeof v === 'object' && 'richText' in v) return (v as any).richText.map((x: any) => x.text).join('').trim() || null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}
function readNumber(sheet: ExcelJS.Worksheet, r: number, c: number): number | null {
  const v = sheet.getRow(r).getCell(c).value;
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && 'result' in v) {
    const r2 = (v as any).result;
    return typeof r2 === 'number' ? r2 : null;
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
  const d = v.replace(/\D/g, '');
  return d.length < 10 ? null : d;
}
function norm(s: string | null | undefined): string {
  return s == null ? '' : String(s).trim();
}
// 급여형태 표기 정규화 (예: "2일급" → "2.일급")
function normWageType(s: string | null): string {
  if (!s) return '';
  return s.trim().replace(/^(\d)([^.\d])/, '$1.$2');
}

async function loadExcel(): Promise<ExcelRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const sheet = wb.getWorksheet('작업자 마스터')!;
  const rows: ExcelRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const name = readText(sheet, r, 2);
    const rrnRaw = readText(sheet, r, 7);
    if (!name || !rrnRaw) continue;
    let rrn: string;
    try { rrn = normalizeRrn(rrnRaw); } catch { continue; }
    const { prefix, genderDigit } = splitRrn(rrn);
    const nationality = readText(sheet, r, 9);
    const visa = readText(sheet, r, 10);
    const foreignCol = readText(sheet, r, 8);
    rows.push({
      rowIdx: r,
      name,
      nameEnglish: readText(sheet, r, 3),
      skillGrade: readText(sheet, r, 5),
      defaultTrade: readText(sheet, r, 6),
      rrnKey: `${prefix}-${genderDigit}`,
      isForeign: Boolean(foreignCol || nationality || visa),
      nationality: stripMarker(nationality),
      visaStatus: stripMarker(visa),
      bankName: readText(sheet, r, 11),
      accountNumber: readText(sheet, r, 12),
      accountHolder: readText(sheet, r, 13),
      phone: cleanPhone(readText(sheet, r, 14)),
      address: readText(sheet, r, 15),
      defaultWage: readNumber(sheet, r, 16) ?? 0,
      wageType: readText(sheet, r, 17),
    });
  }
  return rows;
}

type Diff = { field: string; excel: string; db: string };

function diff(e: ExcelRow, d: any): Diff[] {
  const out: Diff[] = [];
  const push = (field: string, ex: unknown, db: unknown) => {
    const a = norm(ex as string | null);
    const b = norm(db as string | null);
    if (a !== b) out.push({ field, excel: a || '(빈값)', db: b || '(빈값)' });
  };
  push('성명', e.name, d.name);
  push('영문명', e.nameEnglish, d.name_english);
  push('직종', e.defaultTrade, d.default_trade);
  push('국적', e.nationality, d.nationality);
  push('비자', e.visaStatus, d.visa_status);
  push('은행', e.bankName, d.bank_name);
  push('계좌번호', e.accountNumber, d.account_number);
  push('예금주', e.accountHolder, d.account_holder);
  push('연락처', e.phone, d.phone);
  push('주소', e.address, d.address);

  // 팀장 엑셀의 "구분"열: 기공/조공/팀장 — 작업자마스터.xlsx의 5열과 동일 의미
  // 팀장 엑셀에서는 모두 "기공" 또는 "조공"이라 4열의 "팀장" 표시와 별개
  // workers.skill_grade와 직접 비교
  push('구분(skill_grade)', e.skillGrade, d.skill_grade);

  // 급여형태 정규화 비교
  if (normWageType(e.wageType) !== normWageType(d.wage_type)) {
    out.push({ field: '급여형태', excel: e.wageType ?? '(빈값)', db: d.wage_type ?? '(빈값)' });
  }

  const ew = Math.floor(e.defaultWage || 0);
  const dw = Math.floor(Number(d.default_wage || 0));
  if (ew !== dw) out.push({ field: '기본일당', excel: String(ew), db: String(dw) });

  if (Boolean(e.isForeign) !== Boolean(d.is_foreign)) {
    out.push({ field: '외국인', excel: String(e.isForeign), db: String(d.is_foreign) });
  }
  return out;
}

async function main() {
  const sb = getServiceSupabase();
  const excelRows = await loadExcel();
  console.log(`📄 팀장 엑셀: ${excelRows.length}명\n`);

  const { data: workers, error } = await sb
    .from('yeseong_workers')
    .select(`
      id, name, name_english, rrn_prefix, rrn_gender_digit,
      skill_grade, default_trade,
      is_foreign, nationality, visa_status,
      bank_name, account_number, account_holder, phone, address,
      default_wage, wage_type, is_active
    `);
  if (error) throw error;
  console.log(`📦 workers DB: ${workers?.length ?? 0}명 (전체)\n`);

  const dbByKey = new Map<string, any>();
  for (const w of workers ?? []) dbByKey.set(`${w.rrn_prefix}-${w.rrn_gender_digit}`, w);

  const notInDB: ExcelRow[] = [];
  const fieldDiffs: { name: string; key: string; rowIdx: number; diffs: Diff[] }[] = [];

  for (const e of excelRows) {
    const d = dbByKey.get(e.rrnKey);
    if (!d) { notInDB.push(e); continue; }
    const ds = diff(e, d);
    if (ds.length > 0) fieldDiffs.push({ name: e.name, key: e.rrnKey, rowIdx: e.rowIdx, diffs: ds });
  }

  console.log('═'.repeat(70));
  console.log('📊 결과 요약');
  console.log('═'.repeat(70));
  console.log(`팀장 엑셀:           ${excelRows.length}명`);
  console.log(`workers에 없음:      ${notInDB.length}명`);
  console.log(`workers에 있고 일치: ${excelRows.length - notInDB.length - fieldDiffs.length}명`);
  console.log(`workers에 있고 불일치: ${fieldDiffs.length}명`);

  if (notInDB.length > 0) {
    console.log('\n' + '─'.repeat(70));
    console.log('🚨 workers DB에 없음 (팀장 엑셀에만 있음):');
    console.log('─'.repeat(70));
    for (const e of notInDB) {
      const [p, g] = e.rrnKey.split('-');
      console.log(`  R${e.rowIdx} ${e.name.padEnd(8)} (${maskFromParts(p, g)})  직종:${e.defaultTrade ?? '-'}  phone:${e.phone ?? '-'}`);
    }
  }

  if (fieldDiffs.length > 0) {
    console.log('\n' + '─'.repeat(70));
    console.log('⚠️  필드 불일치 상세 (팀장 엑셀 ← 비교 → workers DB):');
    console.log('─'.repeat(70));
    for (const fd of fieldDiffs) {
      console.log(`\n● R${fd.rowIdx} ${fd.name} (${fd.key})`);
      for (const d of fd.diffs) {
        console.log(`   [${d.field}]`);
        console.log(`     팀장엑셀: ${d.excel}`);
        console.log(`     workers:  ${d.db}`);
      }
    }

    const fc = new Map<string, number>();
    for (const fd of fieldDiffs) for (const d of fd.diffs) fc.set(d.field, (fc.get(d.field) ?? 0) + 1);
    console.log('\n' + '─'.repeat(70));
    console.log('📈 필드별 불일치 카운트:');
    for (const [k, v] of [...fc.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k.padEnd(18)} ${v}건`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
