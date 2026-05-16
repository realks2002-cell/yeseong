// 노임대장 양식 셀/행/열 매핑 상수
// 시트: '노임대장' (74행 × 60열)
// 작업자 1명 = 2행 (예: 9~10, 11~12, ..., 71~72), 총 32명 슬롯

export const TEMPLATE_SHEET_NAME = '노임대장';

export const HEADER_CELLS = {
  TITLE: 'A1',           // '일용노무비지급명세서\n    (YYYY.MM 월분)'
  PERIOD: 'O1',          // '2026년 05월 01일 부터\n2026년 05월 31일 까지'
  COMPANY: 'AA1',        // '㈜이루건설'
  WORKSITE: 'AA2',       // '보은현장'
} as const;

// 작업자 row pair: (slot 1) 9-10, (slot 2) 11-12, ..., (slot 32) 71-72
export const FIRST_WORKER_ROW = 9;
export const LAST_WORKER_ROW = 72;
export const TOTALS_ROW = 73;
export const MAX_SLOTS = 32;

export function slotToHeadRow(slot: number): number {
  if (slot < 1 || slot > MAX_SLOTS) {
    throw new Error(`slot must be 1..${MAX_SLOTS}, got ${slot}`);
  }
  return FIRST_WORKER_ROW + (slot - 1) * 2;
}

// 작업자 인적사항 컬럼 (head row에만 작성)
export const WORKER_COLS = {
  NUMBER: 'A',
  TRADE: 'D',
  NAME: 'E',
  RRN: 'F',
  ADDRESS: 'G',
  BANK_NAME: 'H',
  ACCOUNT: 'I',
  HOLDER: 'J',
  PHONE: 'K',
  DAILY_WAGE: 'AD',
} as const;

// 출역 그리드:
//   상단행 (head row N)     = 1~15일  → cols L..Z (15칸)
//   하단행 (head row N+1)   = 16~31일 → cols L..AA (16칸)
// L = 12 (1-indexed)
const COL_L = 12;

export function dayToCell(day: number, headRow: number): { row: number; col: number } {
  if (day < 1 || day > 31) throw new Error(`day must be 1..31, got ${day}`);
  if (day <= 15) {
    return { row: headRow, col: COL_L + (day - 1) };       // L..Z
  }
  return { row: headRow + 1, col: COL_L + (day - 16) };    // L..AA
}

// 채울 때 모두 비워야 하는 데이터 영역
// 수식이 있는 컬럼(B, C, AB, AC, AE~AN, AP~BE, BF~BH)은 절대 건드리지 않음
export const CLEAR_HEAD_COLS = ['A', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'AD'] as const;

export function attendanceCols(headRow: number, isFirstRow: boolean): { row: number; col: number }[] {
  // 상단행: L..Z (12..26, 15칸)
  // 하단행: L..AA (12..27, 16칸)
  const row = isFirstRow ? headRow : headRow + 1;
  const lastCol = isFirstRow ? 26 : 27;
  const cells: { row: number; col: number }[] = [];
  for (let c = COL_L; c <= lastCol; c++) cells.push({ row, col: c });
  return cells;
}

export function formatPeriodText(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, '0')}월 ${String(d.getDate()).padStart(2, '0')}일`;
  return `${fmt(start)} 부터\n${fmt(end)} 까지`;
}

export function formatTitle(yearMonth: string): string {
  // 'YYYY-MM' → '일용노무비지급명세서\n    (YYYY.MM 월분)'
  const [y, m] = yearMonth.split('-');
  return `일용노무비지급명세서\n    (${y}.${m} 월분)`;
}

export function targetSheetName(yearMonth: string): string {
  // '2026-05' → '노임대장_05월'
  const m = yearMonth.split('-')[1];
  return `노임대장_${m}월`;
}
