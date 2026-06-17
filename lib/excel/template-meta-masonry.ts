// 매사(성과급) 노임대장 양식 셀/행/열 매핑 상수
// 시트: 'sheet'. 작업자 1명 = 2행 (R8~9, R10~11, ...).
// 좌측 = 표준 노임대장(공수×일당), 우측 BG~BV = 매사 작업 내역서(외주1/외주2 수량·단가).
// 우측 매사 합계 BV4=SUM(BV8:BV33) → 13슬롯 한도.

export const TEMPLATE_SHEET_NAME = 'sheet';

export const HEADER_CELLS = {
  COMPANY: 'E1',   // 회사명 (E1:G1 병합)
  WORKSITE: 'E2',  // 현장명 (E2:G2 병합)
  YEAR: 'I1',      // 연도 (I1:L2 병합) — DATE 수식이 $I$1 참조
  MONTH: 'O1',     // 월 (O1:P2 병합) — DATE 수식이 $O$1 참조
} as const;

export const FIRST_WORKER_ROW = 8;
export const MAX_SLOTS = 13;            // 우측 합계 BV4=SUM(BV8:BV33) 범위 한도
export const TOTALS_RANGE_LAST_ROW = 33;

export function slotToHeadRow(slot: number): number {
  if (slot < 1 || slot > MAX_SLOTS) {
    throw new Error(`slot must be 1..${MAX_SLOTS}, got ${slot}`);
  }
  return FIRST_WORKER_ROW + (slot - 1) * 2;
}

// 좌측 인적사항 (head row에만 작성)
export const WORKER_COLS = {
  NUMBER: 'A',
  NAME: 'C',          // 우측 BG가 =C{row}로 참조
  RRN: 'D',
  TRADE: 'E',         // 직종
  TEAM: 'F',          // 팀명칭
  ADDRESS: 'G',
  DAILY_WAGE: 'H',
  PHONE: 'AG',
  BANK_NAME: 'AH',
  ACCOUNT: 'AI',
  HOLDER: 'AJ',
} as const;

// 우측 매사 작업 내역서 (head row에만 작성)
// BG(이름)·BM·BP·BU·BV는 수식 → 절대 건드리지 않음
export const MASONRY_COLS = {
  CATEGORY: 'BH',     // 공종
  DIVISION: 'BI',     // 구분 = '매사'
  WORK_PART: 'BJ',    // 작업부위
  QTY1: 'BK', PRICE1: 'BL',   // 외주1 수량·단가
  QTY2: 'BN', PRICE2: 'BO',   // 외주2 수량·단가
  ETC: 'BT',          // 공제내역 '기타' (BT8:BT9 병합 → 공제계 BU=SUM(BR:BT)에 합산)
  NOTE: 'BW',         // 비고
} as const;

export const MASONRY_DIVISION = '매사';

// 출역 그리드: 상단행 I~W = 1~15일 (col 9~23), 하단행 I~X = 16~31일 (col 9~24). I = col 9.
const COL_I = 9;

export function dayToCell(day: number, headRow: number): { row: number; col: number } {
  if (day < 1 || day > 31) throw new Error(`day must be 1..31, got ${day}`);
  if (day <= 15) return { row: headRow, col: COL_I + (day - 1) };      // I..W
  return { row: headRow + 1, col: COL_I + (day - 16) };                // I..X
}

export function attendanceCols(headRow: number, isFirstRow: boolean): { row: number; col: number }[] {
  const row = isFirstRow ? headRow : headRow + 1;
  const lastCol = isFirstRow ? 23 : 24;   // 상단 I..W(9..23), 하단 I..X(9..24)
  const cells: { row: number; col: number }[] = [];
  for (let c = COL_I; c <= lastCol; c++) cells.push({ row, col: c });
  return cells;
}

// 슬롯 채우기 전 비울 입력 셀.
// 템플릿에 남은 예제 잔재(출역 1, BT=AA4 수식 등)를 제거해야 하므로 수식 여부와 무관하게 강제로 비운다.
// 수식 셀(B·Y·Z·AA~AF·AN·AO·AP~BE·BG·BM·BP·BU·BV)은 목록에서 제외해 보존.
export const CLEAR_HEAD_COLS = [
  'A', 'C', 'D', 'E', 'F', 'G', 'H',           // 좌측 인적/일당
  'AG', 'AH', 'AI', 'AJ', 'AK', 'AL', 'AM',    // 계좌/외국인
  'BH', 'BI', 'BJ', 'BK', 'BL', 'BN', 'BO',    // 우측 매사 입력
  'BQ', 'BR', 'BS', 'BT', 'BW',                // 우측 공제(다음 단계)·비고
] as const;

// 둘째 행(head+1)에도 잔재가 남는 우측 입력 셀 (예: BT9=AA4). 좌측 인적셀은 병합 보존 위해 제외.
export const CLEAR_SECOND_ROW_COLS = [
  'BH', 'BI', 'BJ', 'BK', 'BL', 'BN', 'BO',
  'BQ', 'BR', 'BS', 'BT', 'BW',
] as const;

export function targetSheetName(yearMonth: string): string {
  // '2026-05' → '매사노임대장_05월'
  const m = yearMonth.split('-')[1];
  return `매사노임대장_${m}월`;
}
