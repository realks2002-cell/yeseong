// payroll-template.xlsx 클린업
//   1) 모든 수식 셀의 stale cached result 제거 → Excel이 열 때 강제 재계산
//   2) workbook.calcProperties.fullCalcOnLoad = true (안전망)
// 백업은 public/templates/payroll-template.backup-*.xlsx로 보관

import ExcelJS from 'exceljs';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const TEMPLATE_PATH = path.join(process.cwd(), 'public/templates/payroll-template.xlsx');

async function main() {
  const backupPath = TEMPLATE_PATH.replace(/\.xlsx$/, `.pre-clean-${Date.now()}.xlsx`);
  await fs.copyFile(TEMPLATE_PATH, backupPath);
  console.log(`✓ 백업: ${path.basename(backupPath)}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);

  let cleaned = 0;
  wb.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value as ExcelJS.CellValue & { formula?: string; result?: unknown };
        if (v && typeof v === 'object' && 'formula' in v && (v as { formula?: string }).formula) {
          // result 캐시 제거: formula만 남김 (shared/array 형태도 동일하게 처리)
          const { formula, sharedFormula, ref, shareType } = v as {
            formula?: string;
            sharedFormula?: string;
            ref?: string;
            shareType?: string;
          };
          if (sharedFormula) {
            cell.value = { sharedFormula, ref } as unknown as ExcelJS.CellValue;
          } else if (formula) {
            cell.value = shareType
              ? ({ formula, ref, shareType } as unknown as ExcelJS.CellValue)
              : ({ formula } as unknown as ExcelJS.CellValue);
          }
          cleaned++;
        }
      });
    });
  });

  wb.calcProperties.fullCalcOnLoad = true;

  await wb.xlsx.writeFile(TEMPLATE_PATH);
  console.log(`✓ 수식 셀 캐시 제거: ${cleaned}개`);
  console.log(`✓ fullCalcOnLoad = true`);
  console.log(`✓ 저장: ${path.basename(TEMPLATE_PATH)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
