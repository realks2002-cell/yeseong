import ExcelJS from 'exceljs';

const PATH = '/Users/kenny/Desktop/Task/Yeseong/노임대장_근로내용확인.xlsx';

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(PATH);
  const ws = wb.getWorksheet('근로내용확인신고서');
  if (!ws) throw new Error('sheet not found');

  console.log(`rowCount=${ws.rowCount} columnCount=${ws.columnCount}`);
  console.log(`actualRowCount=${ws.actualRowCount} actualColumnCount=${ws.actualColumnCount}`);

  const merges: string[] = ((ws as unknown as { model: { merges?: string[] } }).model.merges) || [];
  console.log(`\n--- MERGED RANGES (${merges.length}) ---`);
  console.log(merges.join(' | '));

  console.log('\n--- ALL NON-EMPTY CELLS ---');
  for (let r = 1; r <= ws.actualRowCount; r++) {
    const row = ws.getRow(r);
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      let text: string;
      if (v === null || v === undefined) text = '';
      else if (typeof v === 'object' && 'richText' in v) {
        text = (v as { richText: { text: string }[] }).richText.map(t => t.text).join('');
      } else if (typeof v === 'object' && 'formula' in v) {
        text = `=${(v as { formula: string }).formula}`;
      } else text = String(v);
      const trimmed = text.replace(/\s+/g, ' ').trim();
      if (trimmed) console.log(`${cell.address}: ${trimmed.slice(0, 100)}`);
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
