'use client';
import Link from 'next/link';
import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Wallet } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { getBrowserSupabase } from '@/lib/supabase/client';

export default function PayrollDetailPage({
  params,
}: {
  params: Promise<{ yyyymm: string }>;
}) {
  const router = useRouter();
  const { yyyymm } = use(params);

  useEffect(() => {
    const sb = getBrowserSupabase();
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace('/m/signup');
    });
  }, [router]);

  return (
    <MobileShell>
      <header className="flex items-center gap-2 px-5 pt-6">
        <Link
          href="/m/payroll"
          className="-ml-2 inline-flex h-12 w-12 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100"
        >
          <ChevronLeft className="h-7 w-7" />
        </Link>
        <span className="text-xl font-bold text-zinc-900">{yyyymm}</span>
      </header>
      <div className="mx-7 mt-12 flex flex-col items-center gap-3 rounded-3xl bg-zinc-50 p-10 text-center">
        <Wallet className="h-12 w-12 text-zinc-300" />
        <p className="text-lg font-semibold text-zinc-700">정산 내역은 준비 중입니다</p>
      </div>
    </MobileShell>
  );
}
