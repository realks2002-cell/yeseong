import ExcelJS from 'exceljs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { formatRrnPlain } from '@/lib/crypto/rrn';
import { formatPhone } from '@/lib/auth/phone-email';
import { formatAttendanceCell } from '@/lib/payroll/calc';
import {
  TEMPLATE_SHEET_NAME,
  HEADER_CELLS,
  MAX_SLOTS,
  WORKER_COLS,
  MASONRY_COLS,
  MASONRY_DIVISION,
  CLEAR_HEAD_COLS,
  CLEAR_SECOND_ROW_COLS,
  slotToHeadRow,
  dayToCell,
  attendanceCols,
  targetSheetName,
} from './template-meta-masonry';

export type MasonryVolume = {
  category: string;
  type_name: string | null;
  size_spec: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
};

export type FillMasonryWorker = {
  slot: number;                  // 1~MAX_SLOTS
  trade: string | null;          // 직종 (E)
  team: string | null;           // 팀명칭 (F)
  name: string;
  rrn: string;                   // 평문 (서버 라우트에서만 복호화)
  address: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
  phone: string | null;
  dailyWage: number;
  attendance: Array<{ day: number; hours: number }>;  // day=1..31
  volumes: MasonryVolume[];
};

export type FillMasonryInput = {
  yearMonth: string;             // 'YYYY-MM'
  companyName: string;
  worksiteName: string;
  workers: FillMasonryWorker[];
};

const TEMPLATE_PATH = path.join(process.cwd(), 'public/templates/payroll-template-masonry.xlsx');

// 모듈 레벨 buffer 캐시 — Vercel 워밍 인스턴스 동안 디스크 I/O 1회로 줄임
let templateBufferPromise: Promise<Buffer> | null = null;
function getTemplateBuffer(): Promise<Buffer> {
  if (!templateBufferPromise) templateBufferPromise = fs.readFile(TEMPLATE_PATH);
  return templateBufferPromise;
}

export async function fillMasonryPayrollWorkbook(input: FillMasonryInput): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const buf = await getTemplateBuffer();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);

  const sheet = wb.getWorksheet(TEMPLATE_SHEET_NAME);
  if (!sheet) throw new Error(`Template sheet '${TEMPLATE_SHEET_NAME}' not found`);

  // 1. 헤더 (연/월은 병합 top-left만 set → DATE 수식이 $I$1·$O$1 참조하여 전체 갱신)
  const [y, m] = input.yearMonth.split('-');
  sheet.getCell(HEADER_CELLS.COMPANY).value = input.companyName;
  sheet.getCell(HEADER_CELLS.WORKSITE).value = input.worksiteName;
  sheet.getCell(HEADER_CELLS.YEAR).value = Number(y);
  sheet.getCell(HEADER_CELLS.MONTH).value = Number(m);

  // 2. 슬롯 데이터 영역 초기화 (수식 컬럼 제외, 잔재 예제값 강제 제거)
  for (let s = 1; s <= MAX_SLOTS; s++) clearSlot(sheet, s);

  // 3. 작업자 채움
  const filled = new Set<number>();
  for (const w of input.workers) {
    if (filled.has(w.slot)) throw new Error(`Duplicate slot ${w.slot} in input`);
    filled.add(w.slot);
    fillWorker(sheet, w);
  }

  // 4. 빈 슬롯 두 행 숨김
  for (let s = 1; s <= MAX_SLOTS; s++) {
    if (filled.has(s)) continue;
    const h = slotToHeadRow(s);
    sheet.getRow(h).hidden = true;
    sheet.getRow(h + 1).hidden = true;
  }

  // 5. 시트명 월별 변경
  sheet.name = targetSheetName(input.yearMonth);

  // 6. dead한 외부 명명 범위 제거 (fill-payroll.ts와 동일 — 엑셀 복구 경고 방지)
  (wb.definedNames as unknown as { matrixMap: Record<string, unknown> }).matrixMap = {};

  const written = (await wb.xlsx.writeBuffer()) as ArrayBuffer | Uint8Array;
  return written instanceof Uint8Array ? written : new Uint8Array(written);
}

function clearSlot(sheet: ExcelJS.Worksheet, slot: number): void {
  const headRow = slotToHeadRow(slot);
  for (const col of CLEAR_HEAD_COLS) sheet.getCell(`${col}${headRow}`).value = null;
  for (const col of CLEAR_SECOND_ROW_COLS) sheet.getCell(`${col}${headRow + 1}`).value = null;
  for (const c of [...attendanceCols(headRow, true), ...attendanceCols(headRow, false)]) {
    sheet.getCell(c.row, c.col).value = null;
  }
}

function fillWorker(sheet: ExcelJS.Worksheet, w: FillMasonryWorker): void {
  const headRow = slotToHeadRow(w.slot);

  // 좌측 인적사항 (head row에만)
  sheet.getCell(`${WORKER_COLS.NUMBER}${headRow}`).value = w.slot;
  sheet.getCell(`${WORKER_COLS.NAME}${headRow}`).value = w.name;
  sheet.getCell(`${WORKER_COLS.RRN}${headRow}`).value = formatRrnPlain(w.rrn);
  if (w.trade !== null) sheet.getCell(`${WORKER_COLS.TRADE}${headRow}`).value = w.trade;
  if (w.team !== null) sheet.getCell(`${WORKER_COLS.TEAM}${headRow}`).value = w.team;
  if (w.address !== null) sheet.getCell(`${WORKER_COLS.ADDRESS}${headRow}`).value = w.address;
  sheet.getCell(`${WORKER_COLS.DAILY_WAGE}${headRow}`).value = w.dailyWage;
  if (w.phone !== null) sheet.getCell(`${WORKER_COLS.PHONE}${headRow}`).value = formatPhone(w.phone);
  if (w.bankName !== null) sheet.getCell(`${WORKER_COLS.BANK_NAME}${headRow}`).value = w.bankName;
  if (w.accountNumber !== null) sheet.getCell(`${WORKER_COLS.ACCOUNT}${headRow}`).value = w.accountNumber;
  if (w.accountHolder !== null) sheet.getCell(`${WORKER_COLS.HOLDER}${headRow}`).value = w.accountHolder;

  // 출역 — 공수(0.5/1 등) 그대로. 좌측 보수총액(AA=H×Y)은 신고용.
  for (const a of w.attendance) {
    const { row, col } = dayToCell(a.day, headRow);
    const display = formatAttendanceCell(a.hours);
    if (display === '') continue;
    const numeric = Number(display);
    sheet.getCell(row, col).value = Number.isFinite(numeric) ? numeric : display;
  }

  // 우측 매사 작업 내역서 — 외주1(BK/BL)·외주2(BN/BO). BM/BP/BU/BV는 수식.
  const items = compressVolumes(w.volumes);
  sheet.getCell(`${MASONRY_COLS.DIVISION}${headRow}`).value = MASONRY_DIVISION;
  if (items.length > 0) {
    const v0 = items[0];
    sheet.getCell(`${MASONRY_COLS.CATEGORY}${headRow}`).value = v0.category;
    const part = workPart(v0);
    if (part) sheet.getCell(`${MASONRY_COLS.WORK_PART}${headRow}`).value = part;
    sheet.getCell(`${MASONRY_COLS.QTY1}${headRow}`).value = v0.quantity;
    sheet.getCell(`${MASONRY_COLS.PRICE1}${headRow}`).value = v0.unit_price;
  }
  if (items.length > 1) {
    const v1 = items[1];
    sheet.getCell(`${MASONRY_COLS.QTY2}${headRow}`).value = v1.quantity;
    sheet.getCell(`${MASONRY_COLS.PRICE2}${headRow}`).value = v1.unit_price;
  }
  // 3종 이상: 외주칸은 2개뿐 → 상위 2종만 채우고 나머지는 비고에 경고.
  // (행 동적 삽입은 좌측 노임대장 2행 고정 구조와 충돌 + 4대보험 신고 행 중복 위험 → 후속 과제)
  if (items.length > 2) {
    const rest = items.slice(2);
    const extra = rest.reduce((s, v) => s + v.amount, 0);
    sheet.getCell(`${MASONRY_COLS.NOTE}${headRow}`).value =
      `외 ${rest.length}종 ${extra.toLocaleString()}원 별도 정산 필요`;
  }
}

// 동일 (공종·작업부위·규격·단가) 항목은 수량 합산 → 금액 내림차순.
function compressVolumes(volumes: MasonryVolume[]): MasonryVolume[] {
  const map = new Map<string, MasonryVolume>();
  for (const v of volumes) {
    const key = `${v.category}|${v.type_name ?? ''}|${v.size_spec ?? ''}|${v.unit_price}`;
    const cur = map.get(key);
    if (cur) {
      cur.quantity += v.quantity;
      cur.amount += v.amount;
    } else {
      map.set(key, { ...v });
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

function workPart(v: MasonryVolume): string {
  return [v.type_name, v.size_spec].filter(Boolean).join(' ');
}

export function buildMasonryDownloadFilename(worksiteName: string, yearMonth: string): string {
  return `매사노임대장_${worksiteName}_${yearMonth}.xlsx`;
}
