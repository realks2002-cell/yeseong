// 팀장 엑셀(_팀장.xlsx) → yeseong_workers UPSERT
//   매칭 키: rrn_prefix + rrn_gender_digit
//   정책: 엑셀이 정답. 엑셀 빈값은 workers 기존값 보존(coalesce).
//   skill_grade = '팀장' (4열 "팀장" 표시 따라 단일화. 5열 "기공/조공"은 보존하지 않음 — 별도 컬럼 없음)
//
// 실행: pnpm tsx scripts/import-team-leaders-to-workers.ts [--apply]

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import ExcelJS from 'exceljs';
import { getServiceSupabase } from '../lib/supabase/server';
import { normalizeRrn, splitRrn, maskFromParts } from '../lib/crypto/rrn';

const FILE = '/Users/kenny/Desktop/Task/Yeseong/작업자마스터_팀장.xlsx';

type Row = {
  rowIdx: number;
  name: string;
  nameEnglish: string | null;
  defaultTrade: string | null;
  rrn: string;
  prefix: string;
  genderDigit: string;
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
function normWageType(s: string | null): string | null {
  if (!s) return null;
  return s.trim().replace(/^(\d)([^.\d])/, '$1.$2');
}

async function loadRows(): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const sheet = wb.getWorksheet('작업자 마스터')!;
  const rows: Row[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const name = readText(sheet, r, 2);
    const rrnRaw = readText(sheet, r, 7);
    if (!name || !rrnRaw) continue;
    let rrn: string;
    try { rrn = normalizeRrn(rrnRaw); } catch { console.error(`R${r}: 잘못된 RRN "${rrnRaw}" — 스킵`); continue; }
    const { prefix, genderDigit } = splitRrn(rrn);
    const nationality = readText(sheet, r, 9);
    const visa = readText(sheet, r, 10);
    const foreignCol = readText(sheet, r, 8);
    rows.push({
      rowIdx: r,
      name,
      nameEnglish: readText(sheet, r, 3),
      defaultTrade: readText(sheet, r, 6),
      rrn,
      prefix,
      genderDigit,
      isForeign: Boolean(foreignCol || nationality || visa),
      nationality: stripMarker(nationality),
      visaStatus: stripMarker(visa),
      bankName: readText(sheet, r, 11),
      accountNumber: readText(sheet, r, 12),
      accountHolder: readText(sheet, r, 13),
      phone: cleanPhone(readText(sheet, r, 14)),
      address: readText(sheet, r, 15),
      defaultWage: readNumber(sheet, r, 16) ?? 0,
      wageType: normWageType(readText(sheet, r, 17)),
    });
  }
  return rows;
}

// 엑셀 값이 있으면 사용, 없으면 기존 DB 값 유지
function pickStr(excel: string | null, db: string | null | undefined): string | null {
  if (excel != null && excel.trim() !== '') return excel.trim();
  return db ?? null;
}
function pickNum(excel: number, db: number | null | undefined): number {
  if (excel > 0) return Math.floor(excel);
  return db ?? 0;
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`📄 ${FILE}`);
  console.log(`🔧 ${apply ? '🚨 APPLY' : '👀 DRY-RUN'}\n`);

  const sb = getServiceSupabase();
  const rows = await loadRows();
  console.log(`✓ 팀장 엑셀 ${rows.length}명\n`);

  let inserted = 0, updated = 0, skipped = 0;

  for (const r of rows) {
    const { data: existing, error: eErr } = await sb
      .from('yeseong_workers')
      .select('id, name, name_english, default_trade, skill_grade, phone, default_wage, wage_type, bank_name, account_number, account_holder, address, nationality, visa_status, is_foreign, is_active')
      .eq('rrn_prefix', r.prefix)
      .eq('rrn_gender_digit', r.genderDigit)
      .maybeSingle();
    if (eErr) { console.error(`✗ ${r.name}: select ${eErr.message}`); skipped++; continue; }

    if (existing) {
      // UPDATE — 엑셀 값 있으면 덮어쓰고, 없으면 기존 보존
      const patch: Record<string, unknown> = {
        name: pickStr(r.name, existing.name) ?? r.name,
        name_english: pickStr(r.nameEnglish, existing.name_english),
        default_trade: pickStr(r.defaultTrade, existing.default_trade),
        skill_grade: '팀장',
        phone: pickStr(r.phone, existing.phone),
        default_wage: pickNum(r.defaultWage, existing.default_wage),
        wage_type: pickStr(r.wageType, existing.wage_type),
        bank_name: pickStr(r.bankName, existing.bank_name),
        account_number: pickStr(r.accountNumber, existing.account_number),
        account_holder: pickStr(r.accountHolder, existing.account_holder),
        address: pickStr(r.address, existing.address),
        nationality: pickStr(r.nationality, existing.nationality),
        visa_status: pickStr(r.visaStatus, existing.visa_status),
        is_foreign: r.isForeign || Boolean(existing.is_foreign),
        is_active: true,
      };

      // 실제 변경된 필드만 추출
      const changed: string[] = [];
      for (const k of Object.keys(patch)) {
        if ((patch as any)[k] !== (existing as any)[k]) changed.push(k);
      }

      if (changed.length === 0) {
        console.log(`  ${r.name.padEnd(8)} (변경없음)`);
        continue;
      }
      console.log(`  ↻ UPDATE ${r.name.padEnd(8)} 변경필드: ${changed.join(', ')}`);
      if (apply) {
        const { error } = await sb.from('yeseong_workers').update(patch).eq('id', existing.id);
        if (error) { console.error(`    ✗ ${error.message}`); skipped++; continue; }
      }
      updated++;
    } else {
      // INSERT — RRN 암호화 필요
      console.log(`  + INSERT ${r.name.padEnd(8)} (${maskFromParts(r.prefix, r.genderDigit)})  직종:${r.defaultTrade}  phone:${r.phone}`);
      if (apply) {
        const { data: enc, error: encErr } = await sb.rpc('yeseong_encrypt_rrn', { plain: r.rrn });
        if (encErr) { console.error(`    ✗ encrypt: ${encErr.message}`); skipped++; continue; }
        const { error: iErr } = await sb.from('yeseong_workers').insert({
          name: r.name,
          name_english: r.nameEnglish,
          default_trade: r.defaultTrade,
          skill_grade: '팀장',
          rrn_plain: r.rrn.replace('-', ''),
          rrn_prefix: r.prefix,
          rrn_gender_digit: r.genderDigit,
          rrn_encrypted: enc as unknown as string,
          phone: r.phone,
          default_wage: Math.floor(r.defaultWage),
          wage_type: r.wageType,
          bank_name: r.bankName,
          account_number: r.accountNumber,
          account_holder: r.accountHolder,
          address: r.address,
          nationality: r.nationality,
          visa_status: r.visaStatus,
          is_foreign: r.isForeign,
          is_active: true,
        });
        if (iErr) { console.error(`    ✗ ${iErr.message}`); skipped++; continue; }
      }
      inserted++;
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`INSERT:  ${inserted}`);
  console.log(`UPDATE:  ${updated}`);
  console.log(`SKIP:    ${skipped}`);
  console.log('═'.repeat(50));
  if (!apply) console.log('\n💡 실제 적용: pnpm tsx scripts/import-team-leaders-to-workers.ts --apply');
}

main().catch((e) => { console.error(e); process.exit(1); });
