import ExcelJS from 'exceljs';
import path from 'node:path';

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(process.cwd(), 'public/templates/payroll-template.xlsx'));
  const dn = wb.definedNames as unknown as Record<string, unknown>;
  const mm = dn.matrixMap as Record<string, unknown> | null;
  console.log('matrixMap type:', mm === null ? 'null' : Array.isArray(mm) ? 'array' : typeof mm);
  if (mm && typeof mm === 'object') {
    const keys = Object.keys(mm);
    console.log('matrixMap keys count:', keys.length);
    console.log('matrixMap first 3 keys:', keys.slice(0, 3));
    console.log('matrixMap first value sample:', JSON.stringify(mm[keys[0]]).slice(0, 200));
    console.log('matrixMap proto:', Object.getOwnPropertyNames(Object.getPrototypeOf(mm)));
  }
}
main();
