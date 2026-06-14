import Link from 'next/link';
import { ChevronLeft, Wallet } from 'lucide-react';
import { fmtMonthLabel, fmtWon, type PayrollDeductions, type PayrollMonth } from '@/lib/payroll/mobile';

const DEDUCTION_ROWS: Array<[string, keyof PayrollDeductions]> = [
  ['소득세', 'income_tax'],
  ['주민세', 'resident_tax'],
  ['고용보험', 'employment_ins'],
  ['연금보험', 'pension'],
  ['건강보험', 'health_ins'],
  ['장기요양', 'longterm_care'],
];

export function PayrollDetail({
  month,
  yyyymm,
  backHref,
}: {
  month: PayrollMonth | null | undefined;
  yyyymm: string;
  backHref: string;
}) {
  return (
    <>
      <header className="flex items-center gap-2 px-5 pt-6">
        <Link
          href={backHref}
          className="-ml-2 inline-flex h-12 w-12 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100"
        >
          <ChevronLeft className="h-7 w-7" />
        </Link>
        <span className="text-xl font-bold text-zinc-900">{fmtMonthLabel(yyyymm)}</span>
      </header>

      {month === undefined ? (
        <p className="mt-16 text-center text-zinc-400">불러오는 중...</p>
      ) : month === null ? (
        <div className="mx-7 mt-12 flex flex-col items-center gap-3 rounded-[5px] bg-zinc-50 p-10 text-center">
          <Wallet className="h-12 w-12 text-zinc-300" />
          <p className="text-lg font-semibold text-zinc-700">이 달의 내역이 없어요</p>
        </div>
      ) : (
        <DetailBody month={month} />
      )}
    </>
  );
}

function DetailBody({ month }: { month: PayrollMonth }) {
  const dailyWage = month.entries.find((e) => e.daily_wage > 0)?.daily_wage ?? null;
  const gross = month.total_amount;
  const d = month.deductions ?? null;
  const totalDeduction = d
    ? d.income_tax + d.resident_tax + d.employment_ins + d.pension + d.health_ins + d.longterm_care
    : null;
  const net = gross != null && totalDeduction != null ? gross - totalDeduction : null;

  return (
    <div className="space-y-4 px-5 pb-12 pt-3">
      {/* 출역 — 공수 / 일당 / 임금총액 */}
      <section className="rounded-[14px] bg-white px-6 py-6 ring-1 ring-zinc-200">
        <p className="text-sm font-semibold text-zinc-400">출역</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div>
            <p className="text-sm font-semibold text-zinc-500">공수</p>
            <p className="mt-1 text-[28px] font-bold leading-none text-zinc-900 tabular-nums">{month.approved_hours}일</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-500">일당</p>
            <p className="mt-1 break-keep text-lg font-bold text-zinc-900 tabular-nums">{dailyWage != null ? fmtWon(dailyWage) : '-'}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-500">임금총액</p>
            <p className="mt-1 break-keep text-lg font-bold text-zinc-900 tabular-nums">{gross != null ? fmtWon(gross) : '-'}</p>
          </div>
        </div>
      </section>

      {/* 공제 내역 */}
      <section className="rounded-[14px] bg-white px-6 py-6 ring-1 ring-zinc-200">
        <p className="text-sm font-semibold text-zinc-400">공제 내역</p>
        {!d && (
          <p className="mt-3 rounded-[5px] bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-400">
            급여 정산 완료 후 표시됩니다.
          </p>
        )}
        <ul className="mt-3 divide-y divide-zinc-100">
          {DEDUCTION_ROWS.map(([label, key]) => (
            <li key={key} className="flex items-center justify-between py-3.5">
              <span className="text-base font-bold text-zinc-800">{label}</span>
              <span className="text-base font-bold text-zinc-900 tabular-nums">{d ? fmtWon(d[key]) : '—'}</span>
            </li>
          ))}
        </ul>
        <div className="mt-1 flex items-center justify-between border-t-2 border-zinc-900 pt-4">
          <span className="text-lg font-bold text-zinc-900">공제 합계</span>
          <span className="text-xl font-bold tabular-nums text-[#8B0000]">
            {totalDeduction != null ? `− ${fmtWon(totalDeduction)}` : '—'}
          </span>
        </div>
      </section>

      {/* 실수령액 */}
      <section className="flex items-center justify-between rounded-[14px] bg-navy px-6 py-6 text-white">
        <span className="text-base font-semibold text-white/80">실수령액</span>
        <span className="text-2xl font-bold tabular-nums">{net != null ? fmtWon(net) : '—'}</span>
      </section>

      <p className="px-1 text-xs leading-relaxed text-zinc-400">
        실제 지급액은 회사 정산 기준에 따라 달라질 수 있어요. 자세한 내용은 관리자에게 문의해주세요.
      </p>
    </div>
  );
}
