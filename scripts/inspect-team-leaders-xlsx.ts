import ExcelJS from 'exceljs';

const FILE = process.argv[2] || '/Users/kenny/Downloads/작업자마스터_팀장.xlsx';

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  console.log('시트:', wb.worksheets.map((s) => s.name).join(', '));
  for (const sheet of wb.worksheets) {
    console.log(`\n=== ${sheet.name} (rows: ${sheet.rowCount}, cols: ${sheet.columnCount}) ===`);
    for (let r = 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const vals: string[] = [];
      for (let c = 1; c <= sheet.columnCount; c++) {
        const v = row.getCell(c).value;
        vals.push(v == null ? '∅' : JSON.stringify(v));
      }
      console.log(`R${r}: ${vals.join(' | ')}`);
    }
  }
}
main().catch(console.error);
