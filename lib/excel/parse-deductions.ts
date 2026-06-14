import ExcelJS from 'exceljs';
import {
  FIRST_WORKER_ROW as GEN_FIRST,
  MAX_SLOTS as GEN_MAX,
} from './template-meta';
import {
  FIRST_WORKER_ROW as MAS_FIRST,
  MAX_SLOTS as MAS_MAX,
} from './template-meta-masonry';

export type ParsedDeduction = {
  rrn: string; // 13자리 숫자
  name: string | null;
  income_tax: number;
  resident_tax: number;
  employment_ins: number;
  pension: number;
  health_ins: number;
  longterm_care: number;
};

export type ParseResult = {
  type: 'general' | 'masonry';
  rows: ParsedDeduction[];
  // 수식 결과 캐시가 없는 셀이 있으면 true (= 엑셀에서 열어 저장하지 않은 파일)
  uncomputed: boolean;
};

// 셀의 표시 텍스트 (richText/formula 결과 포함)
function cellText(cell: ExcelJS.Cell): string {
  let v: unknown = cell.value;
  if (v && typeof v === 'object') {
    if ('richText' in (v as object)) {
      return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join('');
    }
    if ('result' in (v as object)) v = (v as { result: unknown }).result;
    else if ('text' in (v as object)) v = (v as { text: unknown }).text;
  }
  return v == null ? '' : String(v);
}

function digits(cell: ExcelJS.Cell): string {
  return cellText(cell).replace(/\D/g, '');
}

// 공제 숫자 셀 — 수식이면 캐시 결과 사용. 결과 없으면 uncomputed=true.
function numCell(cell: ExcelJS.Cell): { value: number; uncomputed: boolean } {
  const v = cell.value as unknown;
  if (v && typeof v === 'object' && 'formula' in (v as object)) {
    const has = 'result' in (v as object) && (v as { result: unknown }).result != null;
    if (!has) return { value: 0, uncomputed: true };
    const r = (v as { result: unknown }).result;
    const n = typeof r === 'number' ? r : Number(String(r).replace(/[^0-9.-]/g, ''));
    return { value: Number.isFinite(n) ? Math.round(n) : 0, uncomputed: false };
  }
  if (typeof v === 'number') return { value: Math.round(v), uncomputed: false };
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.-]/g, ''));
    return { value: Number.isFinite(n) ? Math.round(n) : 0, uncomputed: false };
  }
  return { value: 0, uncomputed: false };
}

export async function parseDeductions(buf: ArrayBuffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('빈 파일입니다.');

  // 양식 판별: 일반=AF6 '소득세', 매사=AB6 '소득세'
  const isGeneral = cellText(ws.getCell('AF6')).includes('소득세');
  const isMasonry = cellText(ws.getCell('AB6')).includes('소득세');

  const rows: ParsedDeduction[] = [];
  let uncomputed = false;

  const push = (rrn: string, name: string, cells: { value: number; uncomputed: boolean }[]) => {
    if (rrn.length < 13) return; // 미입력/숨김 슬롯
    if (cells.some((c) => c.uncomputed)) uncomputed = true;
    const [it, rt, ei, pn, hi, lc] = cells.map((c) => c.value);
    rows.push({
      rrn: rrn.slice(0, 13),
      name: name.trim() || null,
      income_tax: it, resident_tax: rt, employment_ins: ei,
      pension: pn, health_ins: hi, longterm_care: lc,
    });
  };

  if (isGeneral) {
    // 슬롯 head행: 9,11,…  공제: AF소득세 AG주민세 AH고용 AI연금 AJ건강 AK장기요양
    for (let slot = 1; slot <= GEN_MAX; slot++) {
      const r = GEN_FIRST + (slot - 1) * 2;
      push(digits(ws.getCell(`F${r}`)), cellText(ws.getCell(`E${r}`)), [
        numCell(ws.getCell(`AF${r}`)), numCell(ws.getCell(`AG${r}`)),
        numCell(ws.getCell(`AH${r}`)), numCell(ws.getCell(`AI${r}`)),
        numCell(ws.getCell(`AJ${r}`)), numCell(ws.getCell(`AK${r}`)),
      ]);
    }
    return { type: 'general', rows, uncomputed };
  }

  if (isMasonry) {
    // 슬롯 head행: 8,10,…  공제(좌측, 2행):
    //   AB head=소득세, AB+1=주민세 / AC head=고용, AC+1=국민연금 / AD head=건강, AD+1=장기요양
    for (let slot = 1; slot <= MAS_MAX; slot++) {
      const r = MAS_FIRST + (slot - 1) * 2;
      push(digits(ws.getCell(`D${r}`)), cellText(ws.getCell(`C${r}`)), [
        numCell(ws.getCell(`AB${r}`)), numCell(ws.getCell(`AB${r + 1}`)),
        numCell(ws.getCell(`AC${r}`)), numCell(ws.getCell(`AC${r + 1}`)),
        numCell(ws.getCell(`AD${r}`)), numCell(ws.getCell(`AD${r + 1}`)),
      ]);
    }
    return { type: 'masonry', rows, uncomputed };
  }

  throw new Error('노임대장 양식을 인식할 수 없습니다. 다운로드한 파일을 그대로 사용해 주세요.');
}
