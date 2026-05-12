import ExcelJS from 'exceljs';
import path from 'node:path';
import {
  TEMPLATE_SHEET_NAME,
  HEADER_CELLS,
  FIRST_WORKER_ROW,
  LAST_WORKER_ROW,
  MAX_SLOTS,
  WORKER_COLS,
  CLEAR_HEAD_COLS,
  slotToHeadRow,
  dayToCell,
  attendanceCols,
  formatPeriodText,
  formatTitle,
  targetSheetName,
} from './template-meta';

export type FillWorker = {
  slot: number;                  // 1~26
  trade: string | null;
  name: string;
  rrn: string;                   // 평문 (서버 라우트에서만 복호화)
  address: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
  phone: string | null;
  dailyWage: number;
  attendance: Array<{ day: number; hours: number }>;  // day=1..31
};

export type FillInput = {
  yearMonth: string;             // 'YYYY-MM'
  periodStart: Date;
  periodEnd: Date;
  companyName: string;           // '㈜이루건설'
  worksiteName: string;          // '보은현장'
  workers: FillWorker[];
};

const TEMPLATE_PATH = path.join(process.cwd(), 'public/templates/payroll-template.xlsx');

export async function fillPayrollWorkbook(input: FillInput): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);

  const sheet = wb.getWorksheet(TEMPLATE_SHEET_NAME);
  if (!sheet) {
    throw new Error(`Template sheet '${TEMPLATE_SHEET_NAME}' not found`);
  }

  // 1. 헤더 영역 채움
  sheet.getCell(HEADER_CELLS.TITLE).value = formatTitle(input.yearMonth);
  sheet.getCell(HEADER_CELLS.PERIOD).value = formatPeriodText(input.periodStart, input.periodEnd);
  sheet.getCell(HEADER_CELLS.COMPANY).value = input.companyName;
  sheet.getCell(HEADER_CELLS.WORKSITE).value = input.worksiteName;

  // 2. 모든 슬롯 데이터 영역 초기화 (수식 컬럼은 건드리지 않음)
  for (let slot = 1; slot <= MAX_SLOTS; slot++) {
    clearSlot(sheet, slot);
  }

  // 3. 작업자별로 채움
  const seenSlots = new Set<number>();
  for (const w of input.workers) {
    if (seenSlots.has(w.slot)) {
      throw new Error(`Duplicate slot ${w.slot} in input`);
    }
    seenSlots.add(w.slot);
    fillWorker(sheet, w);
  }

  // 4. 시트명을 월별로 변경 (예: 노임대장_05월)
  sheet.name = targetSheetName(input.yearMonth);

  // 6. 원본에 dead한 외부 명명 범위(예: '[1]노임단가!$D$136')가 1,800+개 누적.
  //    ExcelJS가 그 중 일부를 재직렬화하다 한 개가 깨진 채 나가 엑셀이 "명명된 범위
  //    한 개 제거" 복구 경고를 띄움. 우리는 명명된 범위를 전혀 사용하지 않으므로
  //    matrixMap을 비워서 출력에서 모두 빠지게 함.
  //    (removeAllNames()는 외부 시트 참조에서 crash나서 사용 불가)
  (wb.definedNames as unknown as { matrixMap: Record<string, unknown> }).matrixMap = {};

  const written = (await wb.xlsx.writeBuffer()) as ArrayBuffer | Uint8Array;
  return written instanceof Uint8Array ? written : new Uint8Array(written);
}

function clearSlot(sheet: ExcelJS.Worksheet, slot: number): void {
  const headRow = slotToHeadRow(slot);

  // 인적사항 컬럼 비움
  for (const col of CLEAR_HEAD_COLS) {
    const cell = sheet.getCell(`${col}${headRow}`);
    if (cell.formula) continue;       // 안전장치: 수식이면 건드리지 않음
    cell.value = null;
  }

  // 출역 셀 비움 (head row + head+1 row)
  for (const c of [...attendanceCols(headRow, true), ...attendanceCols(headRow, false)]) {
    const cell = sheet.getCell(c.row, c.col);
    if (cell.formula) continue;
    cell.value = null;
  }
}

function fillWorker(sheet: ExcelJS.Worksheet, w: FillWorker): void {
  const headRow = slotToHeadRow(w.slot);

  // 인적사항
  sheet.getCell(`${WORKER_COLS.NUMBER}${headRow}`).value = w.slot;
  if (w.trade !== null) sheet.getCell(`${WORKER_COLS.TRADE}${headRow}`).value = w.trade;
  sheet.getCell(`${WORKER_COLS.NAME}${headRow}`).value = w.name;
  sheet.getCell(`${WORKER_COLS.RRN}${headRow}`).value = w.rrn;
  if (w.address !== null) sheet.getCell(`${WORKER_COLS.ADDRESS}${headRow}`).value = w.address;
  if (w.bankName !== null) sheet.getCell(`${WORKER_COLS.BANK_NAME}${headRow}`).value = w.bankName;
  if (w.accountNumber !== null) sheet.getCell(`${WORKER_COLS.ACCOUNT}${headRow}`).value = w.accountNumber;
  if (w.accountHolder !== null) sheet.getCell(`${WORKER_COLS.HOLDER}${headRow}`).value = w.accountHolder;
  if (w.phone !== null) sheet.getCell(`${WORKER_COLS.PHONE}${headRow}`).value = w.phone;
  sheet.getCell(`${WORKER_COLS.DAILY_WAGE}${headRow}`).value = w.dailyWage;

  // 출역
  for (const a of w.attendance) {
    const { row, col } = dayToCell(a.day, headRow);
    sheet.getCell(row, col).value = a.hours;
  }
}

export function buildDownloadFilename(worksiteName: string, yearMonth: string): string {
  // 한글 파일명. 다운로드 라우트에서 attachment header로 인코딩
  return `노임대장_${worksiteName}_${yearMonth}.xlsx`;
}
