// 엑셀 헤더(1행)·샘플(2~4행) 덤프 — verify가 정말 모든 컬럼을 커버하는지 확인
import ExcelJS from 'exceljs';

const FILE = '/Users/kenny/Desktop/Task/Yeseong/2026.05.21.xlsx';

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const sheet = wb.getWorksheet('작업자 마스터');
  if (!sheet) throw new Error('sheet not found');

  console.log(`총 행: ${sheet.rowCount}, 총 열: ${sheet.columnCount}\n`);

  // 헤더
  const header = sheet.getRow(1);
  console.log('=== 헤더 (1행) ===');
  for (let c = 1; c <= sheet.columnCount; c++) {
    const v = header.getCell(c).value;
    if (v != null) console.log(`  Col ${c}: ${JSON.stringify(v)}`);
  }

  // 샘플 행 2~4
  for (let r = 2; r <= Math.min(4, sheet.rowCount); r++) {
    console.log(`\n=== Row ${r} ===`);
    const row = sheet.getRow(r);
    for (let c = 1; c <= sheet.columnCount; c++) {
      const v = row.getCell(c).value;
      if (v != null) console.log(`  Col ${c}: ${JSON.stringify(v)}`);
    }
  }
}
main().catch(console.error);
