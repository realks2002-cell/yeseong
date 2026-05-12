'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { isLoggedIn } from '@/lib/mock/session';
import { listPayroll, formatKRW } from '@/lib/mock/payroll';

export default function PayrollPage() {
  const router = useRouter();
  const periods = listPayroll();
  const ytd = periods
    .filter((p) => p.status === 'paid' && p.yyyymm.startsWith('2026'))
    .reduce((s, p) => s + p.netPay, 0);

  useEffect(() => {
    if (!isLoggedIn()) router.replace('/m/signup');
  }, [router]);

  return (
    <MobileShell showTabs activeTab="payroll">
      <div className="px-7 pt-10 pb-6">
        <h1 className="text-[34px] font-bold text-zinc-900">급여 내역</h1>
      </div>

      <section className="mx-7 mb-8 rounded-3xl bg-blue-900 p-6 text-white">
        <p className="text-base font-semibold text-blue-200">올해 받은 금액</p>
        <p className="mt-2 text-[44px] font-bold leading-none">{formatKRW(ytd)}</p>
        <p className="mt-3 text-sm text-blue-200">실수령 합계 (2026년)</p>
      </section>

      <ul className="mx-7 space-y-3 pb-10">
        {periods.map((p) => (
          <li key={p.yyyymm}>
            <Link
              href={`/m/payroll/${p.yyyymm}`}
              className="flex w-full items-center justify-between rounded-2xl bg-white px-6 py-5 text-left ring-1 ring-zinc-200 transition hover:ring-blue-900"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-zinc-900">{p.label}</span>
                  {p.status === 'pending' && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-800">
                      집계 중
                    </span>
                  )}
                </div>
                <div className="mt-1 text-base font-semibold text-zinc-500">
                  출역 {p.days}일
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={
                    'text-2xl font-bold ' +
                    (p.status === 'paid' ? 'text-blue-900' : 'text-zinc-400')
                  }
                >
                  {p.status === 'paid' ? formatKRW(p.netPay) : '집계 중'}
                </span>
                <ChevronRight className="h-5 w-5 text-zinc-300" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </MobileShell>
  );
}
