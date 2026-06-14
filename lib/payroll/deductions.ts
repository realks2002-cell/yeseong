// 노임대장 공제 계산 — 엑셀 템플릿 수식을 그대로 서버에서 재현한다.
// (외부 참조 없음. 일반/매사 두 양식의 공제 칸 수식을 1:1 포팅)
// 결과는 엑셀과 대조해 검증한다.

export type DeductionResult = {
  income_tax: number;     // 소득세
  resident_tax: number;   // 주민세 (지방소득세)
  employment_ins: number; // 고용보험
  pension: number;        // 연금보험(국민연금)
  health_ins: number;     // 건강보험
  longterm_care: number;  // 장기요양
};

// Excel ROUNDDOWN(v, digits) — 0 방향 절사. (양수 가정)
function rounddown(v: number, digits: number): number {
  if (digits <= 0) {
    const f = 10 ** -digits;
    return Math.floor(v / f) * f;
  }
  const f = 10 ** digits;
  return Math.floor(v * f) / f;
}

// 일별 소득세 합 — perDayWage = (일당 × 그날 공수) 배열
// 일반: 일별 ROUNDDOWN(...,-1) 후 합, 합>=1000이면 ROUNDDOWN(합,-1) 아니면 0
function incomeTaxGeneral(perDayWage: number[]): number {
  let sum = 0;
  for (const a of perDayWage) {
    if (a >= 150000) sum += rounddown((a - 150000) * 0.027, -1);
  }
  return sum >= 1000 ? rounddown(sum, -1) : 0;
}

// 매사: 일별 ROUNDDOWN((·-15만)*6%*45%, 0) 후 합 → ROUNDDOWN(합,-1), <1000이면 0
function incomeTaxMasonry(perDayWage: number[]): number {
  let sum = 0;
  for (const a of perDayWage) {
    if (a > 150000) sum += rounddown((a - 150000) * 0.06 * 0.45, 0);
  }
  const ao = rounddown(sum, -1);
  return ao < 1000 ? 0 : ao;
}

const residentTax = (incomeTax: number) => rounddown(incomeTax * 0.1, -1);
const longtermCare = (healthIns: number) => rounddown(healthIns * 0.1295, -1);

export type GeneralInput = {
  perDayWage: number[]; // 일당 × 그날 공수 (출역 셀별)
  days: number;         // 출역 일수
  gross: number;        // 임금총액 (AE) — 일급=공수×일당, 월급=월급액
  exemptEmployment: boolean;
  exemptPension: boolean;
};

// 일반 노임대장(일급·월급) 공제
export function computeGeneralDeductions(i: GeneralInput): DeductionResult {
  const income_tax = incomeTaxGeneral(i.perDayWage);
  const resident_tax = residentTax(income_tax);

  const employment_ins = i.exemptEmployment ? 0 : rounddown(i.gross * 0.009, -1);

  let pension = 0;
  if (!i.exemptPension && (i.days >= 8 || i.gross >= 2_200_000)) {
    if (i.gross >= 5_900_000) pension = rounddown(5_900_000 * 0.045, -1);
    else if (i.gross <= 370_000) pension = rounddown(370_000 * 0.045, -1);
    else pension = rounddown(rounddown(i.gross, -3) * 0.045, -1);
  }

  let health_ins = 0;
  if (i.days >= 8) {
    if (i.gross >= 104_536_481) health_ins = rounddown(104_536_481 * 0.03545, -1);
    else if (i.gross <= 279_256) health_ins = rounddown(279_256 * 0.03545, -1);
    else health_ins = rounddown(i.gross * 0.03545, -1);
  }
  const longterm_care = longtermCare(health_ins);

  return { income_tax, resident_tax, employment_ins, pension, health_ins, longterm_care };
}

export type MasonryInput = {
  perDayWage: number[]; // 일당 × 그날 공수
  days: number;
  gross: number;        // 일당 × 총공수 (AA = H×Y)
  age: number | null;   // 만나이 (주민번호 기반)
  isForeign: boolean;
  visa: string | null;  // 체류자격 (F-2/F-5/F-6 이면 고용보험 적용)
};

// 매사 노임대장(월급/일급) 공제
export function computeMasonryDeductions(i: MasonryInput): DeductionResult {
  const income_tax = incomeTaxMasonry(i.perDayWage);
  const resident_tax = residentTax(income_tax);
  const age = i.age ?? 999;

  // 고용보험: 만 65세 미만 & (내국인 또는 비자 F2/F5/F6)
  const visaHead = (i.visa ?? '').replace(/-/g, '').slice(0, 2).toUpperCase();
  const visaOk = ['F2', 'F5', 'F6'].includes(visaHead);
  const employment_ins =
    age < 65 && (!i.isForeign || visaOk) ? rounddown(i.gross * 0.009, -1) : 0;

  // 국민연금: 만 60세 미만 & (일수>=8 또는 임금>=220만), 상한 617만
  let pension = 0;
  if (age < 60) {
    if ((i.days >= 8 || i.gross >= 2_200_000) && i.gross <= 6_170_000) {
      pension = rounddown(rounddown(i.gross, -3) * 0.045, -1);
    } else if (i.days >= 8 && i.gross > 6_170_000) {
      pension = rounddown(6_170_000 * 0.045, -1); // 연금상한공제액 277,650
    }
  }

  const health_ins = i.days >= 8 ? rounddown(i.gross * 0.03545, -1) : 0;
  const longterm_care = longtermCare(health_ins);

  return { income_tax, resident_tax, employment_ins, pension, health_ins, longterm_care };
}

// 주민번호(13자리) → 만나이. 7번째 자리로 1900/2000년대 구분(3478=2000년대).
export function ageFromRrn(rrn: string | null | undefined, today = new Date()): number | null {
  const d = (rrn ?? '').replace(/\D/g, '');
  if (d.length < 7) return null;
  const yy = Number(d.slice(0, 2));
  const mm = Number(d.slice(2, 4));
  const dd = Number(d.slice(4, 6));
  const g = d[6];
  if (!mm || !dd) return null;
  const century = '3478'.includes(g) ? 2000 : 1900;
  const year = century + yy;
  let age = today.getFullYear() - year;
  const m = today.getMonth() + 1;
  if (m < mm || (m === mm && today.getDate() < dd)) age -= 1;
  return age;
}
