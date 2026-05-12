// Smoke test: 더미 데이터로 노임대장 채워보고 수식 보존 검증
// 실행: pnpm tsx scripts/test-fill.ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { fillPayrollWorkbook, buildDownloadFilename } from '../lib/excel/fill-payroll';
import { TEMPLATE_SHEET_NAME, targetSheetName } from '../lib/excel/template-meta';

async function main() {
  const buf = await fillPayrollWorkbook({
    yearMonth: '2026-05',
    periodStart: new Date('2026-05-01'),
    periodEnd: new Date('2026-05-31'),
    companyName: '㈜이루건설',
    worksiteName: '보은현장',
    workers: [
      {
        slot: 1,
        trade: '관리',
        name: '오철학',
        rrn: '660621-1468716',
        address: '서울시 중랑구 동일로 652-14',
        bankName: '기업은행',
        accountNumber: '010-074214-02-010',
        accountHolder: '오철학',
        phone: '010-6666-2088',
        dailyWage: 170000,
        attendance: [
          { day: 2, hours: 1 }, { day: 3, hours: 1 }, { day: 4, hours: 1 },
          { day: 5, hours: 1 }, { day: 6, hours: 1 }, { day: 9, hours: 1 },
          { day: 10, hours: 1 }, { day: 11, hours: 1 }, { day: 12, hours: 1 },
          { day: 13, hours: 1 }, { day: 16, hours: 1 }, { day: 17, hours: 1 },
          { day: 18, hours: 1 }, { day: 19, hours: 1 }, { day: 20, hours: 1 },
          { day: 23, hours: 1 }, { day: 24, hours: 1 }, { day: 25, hours: 0.5 },
        ],
      },
      {
        slot: 2,
        trade: '조적',
        name: '장진우',
        rrn: '870604-1490820',
        address: '오산시 부산중앙로42 309-503',
        bankName: '기업은행',
        accountNumber: '010-6652-3147',
        accountHolder: '장진우',
        phone: '010-6652-3147',
        dailyWage: 300000,
        attendance: [
          { day: 1, hours: 1 }, { day: 2, hours: 1 }, { day: 3, hours: 1 },
          { day: 8, hours: 1 }, { day: 15, hours: 1 }, { day: 22, hours: 1 },
          { day: 29, hours: 1 },
        ],
      },
    ],
  });

  const outPath = path.join('/tmp', buildDownloadFilename('보은현장', '2026-05'));
  await fs.writeFile(outPath, buf);
  console.log(`✓ wrote ${outPath} (${buf.length} bytes)`);

  // 검증: 다시 읽어서 수식이 보존됐는지 확인
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(outPath);

  console.log('\nSheets:', wb.worksheets.map(s => s.name));

  const newName = targetSheetName('2026-05');
  const sheet = wb.getWorksheet(newName);
  if (!sheet) throw new Error(`Expected sheet '${newName}' to exist`);

  const checks = [
    { addr: 'O1',  expect: 'value', label: '기간' },
    { addr: 'AA1', expect: 'value', label: '상호' },
    { addr: 'AA2', expect: 'value', label: '현장명' },
    { addr: 'A9',  expect: 'value', label: '슬롯1 번호' },
    { addr: 'E9',  expect: 'value', label: '슬롯1 성명' },
    { addr: 'F9',  expect: 'value', label: '슬롯1 주민번호' },
    { addr: 'AD9', expect: 'value', label: '슬롯1 일당' },
    { addr: 'M9',  expect: 'value', label: '슬롯1 5월 2일 출역' },
    { addr: 'B9',   expect: 'formula', label: '검증 수식' },
    { addr: 'C9',   expect: 'formula', label: '제외대상 수식' },
    { addr: 'AB9',  expect: 'formula', label: '공수 SUM' },
    { addr: 'AC9',  expect: 'formula', label: '일수 COUNT' },
    { addr: 'AE9',  expect: 'formula', label: '임금총액' },
    { addr: 'AF9',  expect: 'formula', label: '소득세' },
    { addr: 'AH9',  expect: 'formula', label: '고용보험' },
    { addr: 'AI9',  expect: 'formula', label: '연금' },
    { addr: 'AL9',  expect: 'formula', label: '공제합계' },
    { addr: 'AN9',  expect: 'formula', label: '잔여금액' },
    { addr: 'BF9',  expect: 'formula', label: '외국인 판정' },
    { addr: 'BG9',  expect: 'formula', label: '주민번호 검증' },
    { addr: 'BH9',  expect: 'formula', label: '나이' },
    { addr: 'AB61', expect: 'formula', label: '합계 SUM' },
    { addr: 'AP9',  expect: 'formula', label: '퇴직공제 day1' },
  ];

  let failed = 0;
  for (const c of checks) {
    const cell = sheet.getCell(c.addr);
    const hasFormula = !!cell.formula;
    const v = cell.value;
    if (c.expect === 'formula') {
      if (!hasFormula) {
        console.error(`✗ ${c.addr} (${c.label}): 수식이 사라짐. value=${JSON.stringify(v)}`);
        failed++;
      } else {
        console.log(`✓ ${c.addr} (${c.label}): formula 보존`);
      }
    } else {
      if (v == null) {
        console.error(`✗ ${c.addr} (${c.label}): 비어있음`);
        failed++;
      } else {
        console.log(`✓ ${c.addr} (${c.label}): ${typeof v === 'object' ? JSON.stringify(v) : v}`);
      }
    }
  }

  // 머지셀 보존 확인
  const mergedCount = sheet.model.merges?.length ?? 0;
  console.log(`\nMerged ranges: ${mergedCount}`);
  if (mergedCount < 100) {
    console.error(`✗ 머지셀 개수가 너무 적음 (예상 400+, 실제 ${mergedCount})`);
    failed++;
  }

  if (failed > 0) {
    console.error(`\n${failed} checks FAILED`);
    process.exit(1);
  }
  console.log('\n✓ All checks passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
