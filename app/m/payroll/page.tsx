'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { getBrowserSupabase } from '@/lib/supabase/client';

export default function PayrollPage() {
  const router = useRouter();

  useEffect(() => {
    const sb = getBrowserSupabase();
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace('/m/signup');
    });
  }, [router]);

  return (
    <MobileShell showTabs activeTab="payroll">
      <div className="px-7 pt-10">
        <h1 className="text-[34px] font-bold text-zinc-900">급여 내역</h1>
      </div>
      <div className="mx-7 mt-12 flex flex-col items-center gap-3 rounded-3xl bg-zinc-50 p-10 text-center">
        <Wallet className="h-12 w-12 text-zinc-300" />
        <p className="text-lg font-semibold text-zinc-700">정산 내역은 준비 중입니다</p>
        <p className="text-sm text-zinc-500">관리자 정산이 완료되면 이곳에 표시됩니다.</p>
      </div>
    </MobileShell>
  );
}
