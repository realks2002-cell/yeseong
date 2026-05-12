'use client';
import Link from 'next/link';
import { useEffect, use } from 'react';
import { useRouter, notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { isLoggedIn } from '@/lib/mock/session';
import { getPayroll, formatKRW } from '@/lib/mock/payroll';

export default function PayrollDetailPage({
  params,
}: {
  params: Promise<{ yyyymm: string }>;
}) {
  const router = useRouter();
  const { yyyymm } = use(params);
  const detail = getPayroll(yyyymm);

  useEffect(() => {
    if (!isLoggedIn()) router.replace('/m/signup');
  }, [router]);

  if (!detail) notFound();

  const isPending = detail.status === 'pending';

  return (
    <MobileShell>
      <div className="flex h-full min-h-svh sm:min-h-[860px] flex-col">
        <header className="flex items-center gap-2 px-5 pt-6">
          <Link
            href="/m/payroll"
            className="-ml-2 inline-flex h-12 w-12 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100"
          >
            <ChevronLeft className="h-7 w-7" />
          </Link>
          <span className="text-xl font-bold text-zinc-900">{detail.label}</span>
        </header>

        <section className="mx-7 mt-4 rounded-3xl bg-blue-900 p-6 text-white">
          <p className="text-base font-semibold text-blue-200">실지급액</p>
          {isPending ? (
            <>
              <p className="mt-3 text-[28px] font-bold">집계 중</p>
              <p className="mt-2 text-sm text-blue-200">월말 마감 후 확정됩니다</p>
            </>
          ) : (
            <>
              <p className="mt-2 text-[44px] font-bold leading-none">{formatKRW(detail.netPay)}</p>
              <p className="mt-3 text-sm text-blue-200">
                임금총액 {formatKRW(detail.gross)} − 공제 {formatKRW(detail.deductionTotal)}
              </p>
            </>
          )}
        </section>

        <section className="mx-7 mt-6 rounded-2xl bg-white p-6 ring-1 ring-zinc-200">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">출역</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="공수" value={`${detail.days}일`} />
            <Stat label="일당" value={formatKRW(detail.dailyWage)} small />
            <Stat label="임금총액" value={formatKRW(detail.gross)} small />
          </div>
        </section>

        {!isPending && (
          <section className="mx-7 mt-4 mb-10 rounded-2xl bg-white p-6 ring-1 ring-zinc-200">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">공제 내역</h2>
            <ul className="mt-4 divide-y divide-zinc-100">
              <Row label="소득세" value={detail.incomeTax} />
              <Row label="주민세" value={detail.residentTax} />
              <Row label="고용보험" value={detail.employmentIns} />
              <Row label="연금보험" value={detail.pension} />
              <Row label="건강보험" value={detail.health} />
              <Row label="장기요양" value={detail.longTermCare} />
            </ul>
            <div className="mt-4 flex items-center justify-between border-t-[3px] border-zinc-900 pt-4">
              <span className="text-lg font-bold text-zinc-900">공제 합계</span>
              <span className="text-2xl font-bold text-red-800">
                − {formatKRW(detail.deductionTotal)}
              </span>
            </div>
          </section>
        )}
      </div>
    </MobileShell>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <p className="text-sm font-semibold text-zinc-500">{label}</p>
      <p className={'mt-1 font-bold text-zinc-900 ' + (small ? 'text-base' : 'text-2xl')}>
        {value}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-center justify-between py-3">
      <span className="text-base font-semibold text-zinc-700">{label}</span>
      <span className="text-lg font-bold text-zinc-900">{formatKRW(value)}</span>
    </li>
  );
}
