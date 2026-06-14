'use client';
import { useCallback, useEffect, useState } from 'react';
import { toUserMessage } from '@/lib/errors/message';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, MapPin } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { formatPhone } from '@/lib/auth/phone-email';

type Me = {
  manager: { id: string; name: string; phone: string };
  worksites: Array<{ id: string; name: string }>;
};

export default function ManagerProfilePage() {
  const router = useRouter();
  const sb = getBrowserSupabase();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      router.replace('/m/manager/signup');
      return;
    }
    const { data, error: rpcErr } = await sb.rpc('yeseong_manager_get_me');
    if (rpcErr || !data) {
      setError(toUserMessage(rpcErr, '프로필을 불러오지 못했습니다.'));
      return;
    }
    setMe(data as unknown as Me);
  }, [sb, router]);

  useEffect(() => { load(); }, [load]);

  if (!me) {
    return (
      <MobileShell showTabs activeTab="affiliation" variant="manager">
        <div className="flex h-full items-center justify-center text-zinc-400">
          {error ?? '로딩...'}
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell showTabs activeTab="affiliation" variant="manager">
      <div className="px-7 pt-14 pb-8">
        <h1 className="text-[34px] font-bold text-zinc-900">소속</h1>
      </div>

      <section className="mx-7 mb-8 rounded-[5px] bg-navy p-6 text-center text-white">
        <p className="text-[26px] font-bold leading-tight">{me.manager.name}</p>
        <p className="mt-1 text-lg font-semibold text-blue-200">
          {formatPhone(me.manager.phone)}
        </p>
        <p className="mt-1 text-xs font-semibold text-blue-200">현장 팀장</p>
      </section>

      <section className="px-7">
        <h2 className="text-lg font-bold text-zinc-900">담당 현장</h2>
        <ul className="mt-3 rounded-[5px] bg-white ring-1 ring-zinc-200 divide-y divide-zinc-100">
          {me.worksites.map((w) => (
            <li key={w.id} className="px-5 py-4 text-base font-semibold text-zinc-800">
              {w.name}
            </li>
          ))}
          {me.worksites.length === 0 && (
            <li className="px-5 py-6 text-center text-sm text-zinc-400">
              담당 현장이 없어요
            </li>
          )}
        </ul>

        <Link
          href="/m/manager/assignments"
          className="mt-3 flex h-[60px] w-full items-center justify-between rounded-[5px] bg-zinc-50 px-5 text-base font-bold text-zinc-700 ring-1 ring-zinc-200 active:scale-[0.99]"
        >
          담당 현장 변경
          <ChevronRight className="h-5 w-5 text-zinc-400" />
        </Link>

        <Link
          href="/m/manager/site-gps"
          className="mt-2 flex h-[60px] w-full items-center justify-between rounded-[5px] bg-emerald-50 px-5 text-base font-bold text-emerald-800 ring-1 ring-emerald-200 active:scale-[0.99]"
        >
          <span className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            현장 위치 등록
          </span>
          <ChevronRight className="h-5 w-5 text-emerald-400" />
        </Link>
      </section>

    </MobileShell>
  );
}
