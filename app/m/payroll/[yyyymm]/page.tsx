'use client';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { PayrollDetail } from '@/components/mobile/payroll-detail';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { currentYM, type PayrollMonth } from '@/lib/payroll/mobile';

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
      // 진행 중인 달은 다음 달 전까지 비공개
      if (yyyymm >= currentYM()) {
        setMonth(null);
        return;
      }
      const { data } = await sb.rpc('yeseong_mobile_get_payroll');
      const months = (data as unknown as PayrollMonth[]) ?? [];
      setMonth(months.find((m) => m.year_month === yyyymm) ?? null);
    });
  }, [router, yyyymm]);

  return (
    <MobileShell>
      <PayrollDetail month={month} yyyymm={yyyymm} backHref="/m/payroll" />
    </MobileShell>
  );
}
