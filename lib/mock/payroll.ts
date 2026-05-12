export type PayrollDetail = {
  yyyymm: string;
  label: string;
  days: number;
  dailyWage: number;
  gross: number;
  incomeTax: number;
  residentTax: number;
  employmentIns: number;
  pension: number;
  health: number;
  longTermCare: number;
  deductionTotal: number;
  netPay: number;
  status: 'paid' | 'pending';
};

const DETAILS: PayrollDetail[] = [
  {
    yyyymm: '2026-05',
    label: '2026년 5월',
    days: 5.5,
    dailyWage: 170_000,
    gross: 935_000,
    incomeTax: 0,
    residentTax: 0,
    employmentIns: 0,
    pension: 0,
    health: 0,
    longTermCare: 0,
    deductionTotal: 0,
    netPay: 0,
    status: 'pending',
  },
  {
    yyyymm: '2026-04',
    label: '2026년 4월',
    days: 26,
    dailyWage: 170_000,
    gross: 4_420_000,
    incomeTax: 14_040,
    residentTax: 1_400,
    employmentIns: 39_780,
    pension: 198_900,
    health: 156_680,
    longTermCare: 20_290,
    deductionTotal: 431_090,
    netPay: 3_988_910,
    status: 'paid',
  },
  {
    yyyymm: '2026-03',
    label: '2026년 3월',
    days: 24,
    dailyWage: 170_000,
    gross: 4_080_000,
    incomeTax: 12_960,
    residentTax: 1_290,
    employmentIns: 36_720,
    pension: 183_600,
    health: 144_640,
    longTermCare: 18_730,
    deductionTotal: 397_940,
    netPay: 3_682_060,
    status: 'paid',
  },
  {
    yyyymm: '2026-02',
    label: '2026년 2월',
    days: 18,
    dailyWage: 170_000,
    gross: 3_060_000,
    incomeTax: 9_720,
    residentTax: 970,
    employmentIns: 27_540,
    pension: 137_700,
    health: 108_480,
    longTermCare: 14_050,
    deductionTotal: 298_460,
    netPay: 2_761_540,
    status: 'paid',
  },
  {
    yyyymm: '2026-01',
    label: '2026년 1월',
    days: 20,
    dailyWage: 170_000,
    gross: 3_400_000,
    incomeTax: 10_800,
    residentTax: 1_080,
    employmentIns: 30_600,
    pension: 153_000,
    health: 120_530,
    longTermCare: 15_610,
    deductionTotal: 331_620,
    netPay: 3_068_380,
    status: 'paid',
  },
  {
    yyyymm: '2025-12',
    label: '2025년 12월',
    days: 21,
    dailyWage: 170_000,
    gross: 3_570_000,
    incomeTax: 11_340,
    residentTax: 1_130,
    employmentIns: 32_130,
    pension: 160_650,
    health: 126_560,
    longTermCare: 16_390,
    deductionTotal: 348_200,
    netPay: 3_221_800,
    status: 'paid',
  },
];

export function listPayroll(): PayrollDetail[] {
  return DETAILS;
}

export function getPayroll(yyyymm: string): PayrollDetail | undefined {
  return DETAILS.find((d) => d.yyyymm === yyyymm);
}

export function formatKRW(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}
