// 작업자마스터 엑셀 → DB Upsert (주민번호 prefix+gender_digit 기준)
//   - 매칭되면 UPDATE, 없으면 INSERT
//   - 엑셀에 없는 active worker는 is_active=false (archive)
//   - team_leader는 이름 기반 self-FK라 2-pass 처리
//
// 실행: pnpm tsx scripts/import-workers-master.ts [--file=...] [--apply]
//   기본은 dry-run, --apply 플래그를 줘야 실제 DB 변경.

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import ExcelJS from 'exceljs';
import { getServiceSupabase } from '../lib/supabase/server';
import { normalizeRrn, splitRrn, maskFromParts } from '../lib/crypto/rrn';

const DEFAULT_FILE = '/Users/kenny/Desktop/Task/Yeseong/2026.05.21.xlsx';
const SHEET_NAME = '작업자 마스터';

type RawRow = {
  rowIdx: number;
  employeeCode: string | null;
  name: string;
  nameEnglish: string | null;
  teamLeaderName: string | null;
  skillGrade: string | null;        // 구분 (기공/조공)
  defaultTrade: string | null;      // 직종
  rrn: string;
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

function parseArgs() {
  const file = process.argv.find((a) => a.startsWith('--file='))?.split('=')[1] ?? DEFAULT_FILE;
  const apply = process.argv.includes('--apply');
  return { file, apply };
}

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

// "중국(*)" → "중국" / "F-5-1.장기체류(*)" → "F-5-1.장기체류"
function stripMarker(v: string | null): string | null {
  if (!v) return v;
  return v.replace(/\s*\(\*\)\s*$/, '').trim() || null;
}

// "01021351337" → "01021351337" (10~11자리 숫자만)
function cleanPhone(v: string | null): string | null {
  if (!v) return null;
  const digits = v.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits;
}

function parseRow(sheet: ExcelJS.Worksheet, rowIdx: number): RawRow | null {
  // Columns (1-based): 1=사번 2=성명 3=영문명 4=팀장 5=구분 6=직종 7=주민번호
  //                    8=외국인 9=국적 10=비자 11=은행 12=계좌번호 13=예금주
  //                    14=연락처 15=주소 16=기본일당 17=급여형태 18=첫근무일
  //                    19=앱가입 20=PIN
  const name = readText(sheet, rowIdx, 2);
  const rrnRaw = readText(sheet, rowIdx, 7);
  if (!name || !rrnRaw) return null;

  let rrn: string;
  try {
    rrn = normalizeRrn(rrnRaw);
  } catch {
    console.error(`R${rowIdx}: 잘못된 주민번호 형식 "${rrnRaw}" — 스킵`);
    return null;
  }

  const nationalityRaw = readText(sheet, rowIdx, 9);
  const visaRaw = readText(sheet, rowIdx, 10);
  // 외국인 컬럼은 비어있을 때 많지만 국적/비자가 있으면 외국인으로 간주
  const foreignCol = readText(sheet, rowIdx, 8);
  const isForeign = Boolean(foreignCol || nationalityRaw || visaRaw);

  return {
    rowIdx,
    employeeCode: readText(sheet, rowIdx, 1),
    name,
    nameEnglish: readText(sheet, rowIdx, 3),
    teamLeaderName: readText(sheet, rowIdx, 4),
    skillGrade: readText(sheet, rowIdx, 5),
    defaultTrade: readText(sheet, rowIdx, 6),
    rrn,
    isForeign,
    nationality: stripMarker(nationalityRaw),
    visaStatus: stripMarker(visaRaw),
    bankName: readText(sheet, rowIdx, 11),
    accountNumber: readText(sheet, rowIdx, 12),
    accountHolder: readText(sheet, rowIdx, 13),
    phone: cleanPhone(readText(sheet, rowIdx, 14)),
    address: readText(sheet, rowIdx, 15),
    defaultWage: readNumber(sheet, rowIdx, 16) ?? 0,
    wageType: readText(sheet, rowIdx, 17),
  };
}

async function main() {
  const { file, apply } = parseArgs();
  console.log(`📄 파일: ${file}`);
  console.log(`🔧 모드: ${apply ? '🚨 APPLY (실제 DB 변경)' : '👀 DRY-RUN (변경 없음)'}\n`);

  const sb = getServiceSupabase();

  // 1. (단일 테넌트 — company_id 없음)

  // 2. 엑셀 로드
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheet = wb.getWorksheet(SHEET_NAME);
  if (!sheet) {
    throw new Error(`Sheet '${SHEET_NAME}' not found. Available: ${wb.worksheets.map((s) => s.name).join(', ')}`);
  }

  // 3. 행 파싱 (R2~)
  const rows: RawRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const parsed = parseRow(sheet, r);
    if (parsed) rows.push(parsed);
  }
  console.log(`✓ 엑셀에서 ${rows.length}명 파싱\n`);

  // 4. 기존 active worker 조회 (archive 대상 판별용)
  const { data: existingActive, error: aErr } = await sb
    .from('yeseong_workers')
    .select('id, name, rrn_prefix, rrn_gender_digit')
    .eq('is_active', true);
  if (aErr) throw aErr;
  const existingKeys = new Set(
    (existingActive ?? []).map((w) => `${w.rrn_prefix}-${w.rrn_gender_digit}`),
  );
  const excelKeys = new Set<string>();

  // 5. PASS 1: 작업자 upsert (team_leader_id 제외)
  const nameToId = new Map<string, string>();   // name → worker_id (PASS 2용)
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const w of rows) {
    const { prefix, genderDigit } = splitRrn(w.rrn);
    excelKeys.add(`${prefix}-${genderDigit}`);

    // 매칭 (자연키: rrn_prefix + rrn_gender_digit)
    const { data: existing, error: eErr } = await sb
      .from('yeseong_workers')
      .select('id')
      .eq('rrn_prefix', prefix)
      .eq('rrn_gender_digit', genderDigit)
      .maybeSingle();
    if (eErr) {
      console.error(`✗ ${w.name}: select 실패 — ${eErr.message}`);
      skipped++;
      continue;
    }

    const payloadBase = {
      name: w.name,
      name_english: w.nameEnglish,
      skill_grade: w.skillGrade,
      default_trade: w.defaultTrade,
      rrn_plain: w.rrn.replace('-', ''),
      rrn_prefix: prefix,
      rrn_gender_digit: genderDigit,
      is_foreign: w.isForeign,
      nationality: w.nationality,
      visa_status: w.visaStatus,
      bank_name: w.bankName,
      account_number: w.accountNumber,
      account_holder: w.accountHolder,
      phone: w.phone,
      address: w.address,
      default_wage: w.defaultWage,
      wage_type: w.wageType,
      is_active: true,
    };

    if (existing?.id) {
      console.log(`  ↻ UPDATE ${w.name} (${maskFromParts(prefix, genderDigit)})`);
      if (apply) {
        // rrn_encrypted는 NOT NULL이므로 신규 INSERT 때만 신경. 기존엔 그대로.
        const { error: uErr } = await sb
          .from('yeseong_workers')
          .update(payloadBase)
          .eq('id', existing.id);
        if (uErr) {
          console.error(`    ✗ ${uErr.message}`);
          skipped++;
          continue;
        }
      }
      nameToId.set(w.name, existing.id);
      updated++;
    } else {
      console.log(`  + INSERT ${w.name} (${maskFromParts(prefix, genderDigit)})`);
      if (apply) {
        // 신규는 rrn_encrypted도 필요
        const { data: enc, error: encErr } = await sb.rpc('yeseong_encrypt_rrn', {
          plain: w.rrn,
        });
        if (encErr) {
          console.error(`    ✗ encrypt: ${encErr.message}`);
          skipped++;
          continue;
        }
        const { data: ins, error: iErr } = await sb
          .from('yeseong_workers')
          .insert({ ...payloadBase, rrn_encrypted: enc as unknown as string })
          .select('id')
          .single();
        if (iErr || !ins) {
          console.error(`    ✗ ${iErr?.message ?? 'no id'}`);
          skipped++;
          continue;
        }
        nameToId.set(w.name, ins.id);
      }
      inserted++;
    }
  }

  // 6. PASS 2: team_leader_id 매핑 (yeseong_site_managers 참조)
  if (apply) {
    console.log('\n🔗 PASS 2: team_leader_id → site_managers 매핑');
    const { data: managers, error: lErr } = await sb
      .from('yeseong_site_managers')
      .select('id, name');
    if (lErr) throw lErr;
    const nameMap = new Map<string, string[]>();
    for (const m of managers ?? []) {
      const arr = nameMap.get(m.name) ?? [];
      arr.push(m.id);
      nameMap.set(m.name, arr);
    }

    let leaderSet = 0;
    let leaderMissing = 0;
    let leaderAmbiguous = 0;
    for (const w of rows) {
      if (!w.teamLeaderName) continue;
      const workerId = nameToId.get(w.name);
      if (!workerId) continue;
      const candidates = nameMap.get(w.teamLeaderName);
      if (!candidates || candidates.length === 0) {
        console.warn(`  ⚠️  ${w.name} 의 팀장 "${w.teamLeaderName}" 을 찾을 수 없음`);
        leaderMissing++;
        continue;
      }
      if (candidates.length > 1) {
        console.warn(`  ⚠️  ${w.name} 의 팀장 "${w.teamLeaderName}" 동명이인 ${candidates.length}명 — 스킵`);
        leaderAmbiguous++;
        continue;
      }
      const { error: tErr } = await sb
        .from('yeseong_workers')
        .update({ team_leader_id: candidates[0] })
        .eq('id', workerId);
      if (tErr) {
        console.error(`  ✗ ${w.name}: ${tErr.message}`);
        continue;
      }
      leaderSet++;
    }
    console.log(`  → 설정 ${leaderSet}, 누락 ${leaderMissing}, 모호 ${leaderAmbiguous}`);
  } else {
    const withLeader = rows.filter((r) => r.teamLeaderName).length;
    console.log(`\n🔗 PASS 2 (예상): team_leader 가진 작업자 ${withLeader}명`);
  }

  // 7. 엑셀에 없는 active worker → is_active=false
  const toArchive = (existingActive ?? []).filter(
    (w) => !excelKeys.has(`${w.rrn_prefix}-${w.rrn_gender_digit}`),
  );
  if (toArchive.length > 0) {
    console.log(`\n📦 Archive 대상 ${toArchive.length}명:`);
    for (const w of toArchive) console.log(`  - ${w.name} (${maskFromParts(w.rrn_prefix, w.rrn_gender_digit)})`);
    if (apply) {
      const { error: arErr } = await sb
        .from('yeseong_workers')
        .update({ is_active: false })
        .in('id', toArchive.map((w) => w.id));
      if (arErr) console.error(`✗ archive 실패: ${arErr.message}`);
      else console.log(`  ✓ ${toArchive.length}명 archived`);
    }
  }

  // 8. 요약
  console.log('\n' + '='.repeat(50));
  console.log(`엑셀 행:    ${rows.length}`);
  console.log(`INSERT:     ${inserted}`);
  console.log(`UPDATE:     ${updated}`);
  console.log(`SKIP:       ${skipped}`);
  console.log(`ARCHIVE:    ${toArchive.length}`);
  console.log('='.repeat(50));
  if (!apply) {
    console.log('\n💡 실제 적용하려면: pnpm tsx scripts/import-workers-master.ts --apply');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
