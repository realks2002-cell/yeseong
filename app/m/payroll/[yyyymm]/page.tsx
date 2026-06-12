'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Wallet } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { fmtMonthLabel, fmtWon, type PayrollMonth } from '@/lib/payroll/mobile';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: '검토 중', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: '승인', cls: 'bg-blue-100 text-blue-800' },
  rejected: { label: '반려', cls: 'bg-red-100 text-red-700' },
};

function fmtDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()} (${dow})`;
}

export default function PayrollDetailPage({
  params,
}: {
  params: Promise<{ yyyymm: string }>;
}) {
  const router = useRouter();
  const { yyyymm } = use(params);
  const [month, setMonth] = useState<PayrollMonth | null | undefined>(undefined);

  useEffect(() => {
    const sb = getBrowserSupabase();
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.replace('/m/signup');
        return;
      }
      const { data } = await sb.rpc('yeseong_mobile_get_payroll');
      const months = (data as unknown as PayrollMonth[]) ?? [];
      setMonth(months.find((m) => m.year_month === yyyymm) ?? null);
    });
  }, [router, yyyymm]);

  return (
    <MobileShell>
      <header className="flex items-center gap-2 px-5 pt-6">
        <Link
          href="/m/payroll"
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
        <>
          {/* 월 요약 */}
          <section className="mx-7 mt-5 rounded-[5px] bg-blue-900 px-7 py-7 text-white">
            <p className="text-base font-semibold text-blue-200">승인 공수</p>
            <p className="mt-1 text-[44px] font-bold leading-none">{month.approved_hours}일</p>
            <div className="mt-5 flex items-end justify-between">
              <p className="text-base text-blue-200">
                {month.total_amount != null
                  ? month.wage_type === '월급/일급'
                    ? '성과 금액'
                    : '예상 금액'
                  : '정산 방식'}
              </p>
              {month.total_amount != null ? (
                <p className="text-2xl font-bold">{fmtWon(month.total_amount)}</p>
              ) : month.wage_type === '월급/일급' ? (
                <p className="text-base font-semibold text-blue-100">월말 성과 입력 후 표시돼요</p>
              ) : (
                <p className="text-2xl font-bold">-</p>
              )}
            </div>
            {month.volumes_pending && (
              <p className="mt-3 text-sm text-blue-200">
                검토 중인 성과가 포함돼 있어요 — 승인되면 확정돼요
              </p>
            )}
            {month.pending_hours > 0 && (
              <p className="mt-3 text-sm text-blue-200">
                검토 중 {month.pending_hours}일은 승인되면 반영돼요
              </p>
            )}
          </section>

          {/* 일별 내역 */}
          <section className="mt-7 px-7 pb-10">
            <h2 className="text-xl font-bold text-zinc-900">일별 내역</h2>
            {month.entries.length === 0 ? (
              <p className="mt-4 text-base text-zinc-400">출역 기록이 없습니다.</p>
            ) : (
              <ul className="mt-4 divide-y divide-zinc-100 rounded-[5px] bg-white ring-1 ring-zinc-200">
                {month.entries.map((e, i) => {
                  const badge = STATUS_BADGE[e.status];
                  return (
                    <li key={`${e.work_date}-${i}`} className="flex items-center justify-between px-5 py-4">
                      <div>
                        <p className="text-lg font-semibold text-zinc-800">{fmtDay(e.work_date)}</p>
                        {e.worksite_name && (
                          <p className="mt-0.5 text-sm text-zinc-400">{e.worksite_name}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5">
                        {badge && (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>
                            {badge.label}
                          </span>
                        )}
                        <span
                          className={
                            'text-xl font-bold ' +
                            (e.status === 'rejected' ? 'text-red-400 line-through' : 'text-blue-900')
                          }
                        >
                          {e.hours}일
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">
              실제 지급액은 회사 정산 기준에 따라 달라질 수 있어요. 자세한 내용은 관리자에게 문의해주세요.
            </p>
          </section>
        </>
      )}
    </MobileShell>
  );
}
