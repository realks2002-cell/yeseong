'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { DocumentsSection } from '@/components/mobile/document-uploader';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { formatPhone } from '@/lib/auth/phone-email';

type Me = {
  worker: {
    id: string;
    name: string;
    phone: string | null;
    default_trade: string | null;
    skill_grade: string | null;
    bank_name: string | null;
    account_number: string | null;
    account_holder: string | null;
    address: string | null;
  };
  worksite: { id: string; name: string } | null;
  subcontractor: { id: string; name: string } | null;
  team_leader: { id: string; name: string } | null;
};

export default function MePage() {
  const router = useRouter();
  const sb = getBrowserSupabase();

  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      router.replace('/m/signup');
      return;
    }
    const { data, error: rpcErr } = await sb.rpc('yeseong_mobile_get_me');
    if (rpcErr || !data) {
      setError(rpcErr?.message ?? '프로필 로드 실패');
      return;
    }
    setMe(data as unknown as Me);
  }, [sb, router]);

  useEffect(() => { load(); }, [load]);

  if (!me) {
    return (
      <MobileShell showTabs activeTab="profile">
        <div className="flex h-full items-center justify-center text-zinc-400">
          {error ?? '로딩...'}
        </div>
      </MobileShell>
    );
  }

  const w = me.worker;
  return (
    <MobileShell showTabs activeTab="profile">
      <div className="px-7 pt-10 pb-8">
        <h1 className="text-[34px] font-bold text-zinc-900">내 정보</h1>
        <p className="mt-1 text-sm text-zinc-500">수정이 필요하면 관리자에게 문의하세요.</p>
      </div>

      <section className="mx-7 mb-8 rounded-[5px] bg-blue-900 p-6 text-center text-white">
        <p className="text-[26px] font-bold leading-tight">{w.name}</p>
        <p className="mt-1 text-lg font-semibold text-blue-200">
          {w.phone ? formatPhone(w.phone) : '-'}
        </p>
      </section>

      <section className="px-7 space-y-4 pb-8">
        <h2 className="text-lg font-bold text-zinc-900">소속</h2>
        <p className="-mt-2 text-sm text-zinc-500">팀장에 따라 자동으로 정해져요. 변경은 관리자에게 문의하세요.</p>
        <ReadField label="팀장" value={me.team_leader?.name} />
        <ReadField label="현장" value={me.worksite?.name} />
        <ReadField label="소속(전문건설사)" value={me.subcontractor?.name} />
      </section>

      <section className="px-7 space-y-4 pb-10">
        <h2 className="text-lg font-bold text-zinc-900">기본 정보</h2>
        <ReadField label="구분" value={w.skill_grade} />
        <ReadField label="공종" value={w.default_trade} />
        <ReadField label="은행" value={w.bank_name} />
        <ReadField label="계좌번호" value={w.account_number} mono />
        <ReadField label="예금주" value={w.account_holder} />
        <ReadField label="주소" value={w.address} />
      </section>

      <DocumentsSection />
    </MobileShell>
  );
}

function ReadField({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <label className="text-base font-semibold text-zinc-500">{label}</label>
      <div
        className={
          'mt-2 w-full rounded-[5px] bg-zinc-50 px-5 py-4 text-lg font-bold text-zinc-900 ring-1 ring-zinc-200 ' +
          (mono ? 'font-mono' : '')
        }
      >
        {value ?? <span className="text-zinc-400">미지정</span>}
      </div>
    </div>
  );
}
