// 기존 엑셀에서 26명 작업자를 빌드타임 fixture(lib/mock/workers.fixture.json)로 추출
// 실행: pnpm tsx scripts/extract-workers-fixture.ts
import path from 'node:path';
import fs from 'node:fs';
import ExcelJS from 'exceljs';

const TEMPLATE = path.join(process.cwd(), 'public/templates/payroll-template.xlsx');
const OUT = path.join(process.cwd(), 'lib/mock/workers.fixture.json');

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE);
  const sheet = wb.getWorksheet('노임대장_04월)');
  if (!sheet) throw new Error('sheet not found');

  type Workbook = ExcelJS.Worksheet;
  const read = (sheet: Workbook, addr: string): string | null => {
    const v = sheet.getCell(addr).value;
    if (v == null) return null;
    if (typeof v === 'object' && 'text' in v) return String((v as { text: unknown }).text).trim() || null;
    if (typeof v === 'object' && 'richText' in v) {
      const rt = (v as { richText: { text: string }[] }).richText;
      return rt.map(r => r.text).join('').trim() || null;
    }
    const s = String(v).trim();
    return s.length > 0 ? s : null;
  };
  const num = (sheet: Workbook, addr: string): number | null => {
    const v = sheet.getCell(addr).value;
    if (typeof v === 'number') return v;
    if (typeof v === 'object' && v && 'result' in v) {
      const r = (v as { result: unknown }).result;
      return typeof r === 'number' ? r : null;
    }
    const n = Number(String(v));
    return Number.isFinite(n) ? n : null;
  };

  const workers: Array<{
    id: string;
    slot: number;
    name: string;
    rrn: string;
    address: string | null;
    bankName: string | null;
    accountNumber: string | null;
    accountHolder: string | null;
    phone: string | null;
    defaultWage: number;
    defaultTrade: string | null;
  }> = [];

  for (let row = 9; row <= 59; row += 2) {
    const name = read(sheet, `E${row}`);
    const rrn = read(sheet, `F${row}`);
    if (!name || !rrn) continue;
    const slot = (row - 9) / 2 + 1;
    workers.push({
      id: `w_${slot}`,
      slot,
      name,
      rrn,
      address: read(sheet, `G${row}`),
      bankName: read(sheet, `H${row}`),
      accountNumber: read(sheet, `I${row}`),
      accountHolder: read(sheet, `J${row}`),
      phone: read(sheet, `K${row}`),
      defaultWage: num(sheet, `AD${row}`) ?? 0,
      defaultTrade: read(sheet, `D${row}`),
    });
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(workers, null, 2));
  console.log(`✓ wrote ${OUT} (${workers.length} workers)`);
}

main().catch(e => { console.error(e); process.exit(1); });
