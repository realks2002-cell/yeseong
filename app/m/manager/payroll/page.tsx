'use client';
import Link from 'next/link';
import { toUserMessage } from '@/lib/errors/message';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, ChevronRight } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { currentYM, fmtMonthLabel, fmtWon, type PayrollMonth } from '@/lib/payroll/mobile';

export default function ManagerPayrollPage() {
  const router = useRouter();
  const [months, setMonths] = useState<PayrollMonth[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = getBrowserSupabase();
    sb.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/m/manager/signup');
        return;
      }
      // 팀장도 작업자 — resolve_worker_id가 전화번호로 본인 작업자 행을 찾아 동일하게 동작
      const { data, error: rpcErr } = await sb.rpc('yeseong_mobile_get_payroll');
      if (rpcErr) {
        setError(toUserMessage(rpcErr));
        setMonths([]);
        return;
      }
      // 진행 중인 달은 다음 달 전까지 숨김 — 지난 달만 표시
      const cur = currentYM();
      setMonths(((data as unknown as PayrollMonth[]) ?? []).filter((m) => m.year_month < cur));
    });
  }, [router]);

  return (
    <MobileShell showTabs activeTab="payroll" variant="manager">
      <div className="px-7 pt-14">
        <h1 className="text-[34px] font-bold text-zinc-900">급여 내역</h1>
      </div>

      {error && <p className="mx-7 mt-6 text-base font-semibold text-red-800">{error}</p>}

      {months === null ? (
        <p className="mt-16 text-center text-zinc-400">불러오는 중...</p>
      ) : months.length === 0 ? (
        <div className="mx-7 mt-12 flex flex-col items-center gap-3 rounded-[5px] bg-zinc-50 p-10 text-center">
          <Wallet className="h-12 w-12 text-zinc-300" />
          <p className="text-lg font-semibold text-zinc-700">아직 정산 내역이 없어요</p>
          <p className="text-sm text-zinc-500">출역이 등록되면 이곳에 표시됩니다.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3 px-7 pb-10">
          {months.map((m) => (
            <li key={m.year_month}>
              <Link
                href={`/m/manager/payroll/${m.year_month}`}
                className="flex items-center justify-between rounded-[5px] bg-white px-6 py-5 ring-1 ring-zinc-200 active:bg-zinc-50"
              >
                <div>
                  <p className="text-xl font-bold text-zinc-900">{fmtMonthLabel(m.year_month)}</p>
                  <p className="mt-1 text-base font-semibold text-zinc-500">
                    공수 {m.approved_hours}일
                    {m.pending_hours > 0 && (
                      <span className="ml-2 text-amber-700">검토 중 {m.pending_hours}일</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {m.total_amount != null ? (
                    <div className="text-right">
                      <span className="text-xl font-bold text-navy">{fmtWon(m.total_amount)}</span>
                      {m.volumes_pending && (
                        <p className="text-xs font-semibold text-amber-700">검토 중 성과 포함</p>
                      )}
                    </div>
                  ) : m.wage_type === '월급/일급' ? (
                    <span className="max-w-[110px] text-right text-sm font-semibold leading-snug text-zinc-400">
                      월말 성과 입력 후 표시
                    </span>
                  ) : (
                    <span className="text-xl font-bold text-navy">-</span>
                  )}
                  <ChevronRight className="h-6 w-6 text-zinc-300" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </MobileShell>
  );
}
