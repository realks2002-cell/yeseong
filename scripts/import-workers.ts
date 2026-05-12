// 기존 엑셀의 '노임대장_04월)' 시트에서 작업자 26명 마스터 임포트
// 실행: pnpm tsx scripts/import-workers.ts [--sheet=노임대장_04월)]
import 'dotenv/config';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { getServiceSupabase } from '../lib/supabase/server';
import { normalizeRrn, splitRrn } from '../lib/crypto/rrn';

const TEMPLATE_PATH = path.join(process.cwd(), 'public/templates/payroll-template.xlsx');
const DEFAULT_SHEET = '노임대장_04월)';

function parseArgs(): { sheet: string } {
  const sheetArg = process.argv.find(a => a.startsWith('--sheet='));
  return { sheet: sheetArg ? sheetArg.split('=')[1] : DEFAULT_SHEET };
}

async function main() {
  const { sheet: sheetName } = parseArgs();

  const sb = getServiceSupabase();

  // 1. 회사 id 조회 (시드 후에 1개 존재)
  const { data: companies, error: cErr } = await sb
    .from('yeseong_companies')
    .select('id, name')
    .limit(2);
  if (cErr) throw cErr;
  if (!companies || companies.length === 0) {
    throw new Error('yeseong_companies 비어있음. 먼저 pnpm tsx scripts/seed.ts 실행.');
  }
  if (companies.length > 1) {
    console.warn(`경고: 회사가 ${companies.length}개. 첫 번째(${companies[0].name}) 사용.`);
  }
  const companyId = companies[0].id;

  // 2. 엑셀 로드
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);
  const sheet = wb.getWorksheet(sheetName);
  if (!sheet) {
    throw new Error(`Sheet '${sheetName}' not found. Available: ${wb.worksheets.map(s => s.name).join(', ')}`);
  }
  console.log(`✓ loaded sheet '${sheetName}'`);

  // 3. 행 9, 11, 13, ..., 59 순회 → 작업자 추출
  type ExtractedWorker = {
    name: string;
    rrn: string;
    address: string | null;
    bankName: string | null;
    accountNumber: string | null;
    accountHolder: string | null;
    phone: string | null;
    defaultWage: number;
    defaultTrade: string | null;
  };

  const extracted: ExtractedWorker[] = [];
  for (let row = 9; row <= 59; row += 2) {
    const name = readText(sheet, `E${row}`);
    const rrnRaw = readText(sheet, `F${row}`);
    if (!name || !rrnRaw) continue;     // 빈 슬롯 건너뜀

    const rrn = normalizeRrn(rrnRaw);
    extracted.push({
      name,
      rrn,
      address: readText(sheet, `G${row}`),
      bankName: readText(sheet, `H${row}`),
      accountNumber: readText(sheet, `I${row}`),
      accountHolder: readText(sheet, `J${row}`),
      phone: readText(sheet, `K${row}`),
      defaultWage: readNumber(sheet, `AD${row}`) ?? 0,
      defaultTrade: readText(sheet, `D${row}`),
    });
  }

  console.log(`✓ extracted ${extracted.length} workers`);

  // 4. RRN 암호화 + upsert (한 명씩 — pgp_sym_encrypt RPC가 한 행에 하나)
  let inserted = 0, updated = 0, skipped = 0;
  for (const w of extracted) {
    const { prefix, genderDigit } = splitRrn(w.rrn);

    // 암호화
    const { data: enc, error: encErr } = await sb.rpc('yeseong_encrypt_rrn', { plain: w.rrn });
    if (encErr) {
      console.error(`✗ encrypt failed for ${w.name}: ${encErr.message}`);
      skipped++;
      continue;
    }

    // 기존 동일인 조회
    const { data: existing, error: eErr } = await sb
      .from('yeseong_workers')
      .select('id')
      .eq('company_id', companyId)
      .eq('name', w.name)
      .eq('rrn_prefix', prefix)
      .eq('rrn_gender_digit', genderDigit)
      .maybeSingle();
    if (eErr) {
      console.error(`✗ select failed for ${w.name}: ${eErr.message}`);
      skipped++;
      continue;
    }

    const payload = {
      company_id: companyId,
      name: w.name,
      rrn_encrypted: enc as unknown as string,   // bytea는 base64 문자열로 직렬화됨
      rrn_prefix: prefix,
      rrn_gender_digit: genderDigit,
      address: w.address,
      bank_name: w.bankName,
      account_number: w.accountNumber,
      account_holder: w.accountHolder,
      phone: w.phone,
      default_wage: w.defaultWage,
      default_trade: w.defaultTrade,
    };

    if (existing?.id) {
      const { error: uErr } = await sb.from('yeseong_workers').update(payload).eq('id', existing.id);
      if (uErr) {
        console.error(`✗ update failed for ${w.name}: ${uErr.message}`);
        skipped++;
      } else {
        updated++;
        console.log(`  ↻ ${w.name}`);
      }
    } else {
      const { error: iErr } = await sb.from('yeseong_workers').insert(payload);
      if (iErr) {
        console.error(`✗ insert failed for ${w.name}: ${iErr.message}`);
        skipped++;
      } else {
        inserted++;
        console.log(`  + ${w.name}`);
      }
    }
  }

  console.log(`\n임포트 완료: 신규 ${inserted}, 갱신 ${updated}, 스킵 ${skipped}`);
}

function readText(sheet: ExcelJS.Worksheet, addr: string): string | null {
  const v = sheet.getCell(addr).value;
  if (v == null) return null;
  if (typeof v === 'object' && 'text' in v) return String((v as { text: unknown }).text).trim() || null;
  if (typeof v === 'object' && 'richText' in v) {
    const rt = (v as { richText: { text: string }[] }).richText;
    return rt.map(r => r.text).join('').trim() || null;
  }
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function readNumber(sheet: ExcelJS.Worksheet, addr: string): number | null {
  const v = sheet.getCell(addr).value;
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && 'result' in v) {
    const r = (v as { result: unknown }).result;
    return typeof r === 'number' ? r : null;
  }
  const n = Number(String(v));
  return Number.isFinite(n) ? n : null;
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
