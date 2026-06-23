'use client';
import { useCallback, useEffect, useState } from 'react';
import { toUserMessage } from '@/lib/errors/message';
import { useRouter } from 'next/navigation';
import { Check, ChevronRight, FileSignature } from 'lucide-react';
import Link from 'next/link';
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

type TeamLeader = { id: string; name: string };

export default function MePage() {
  const router = useRouter();
  const sb = getBrowserSupabase();

  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [leaders, setLeaders] = useState<TeamLeader[]>([]);
  const [savingLeader, setSavingLeader] = useState(false);
  const [leaderMsg, setLeaderMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      router.replace('/m/signup');
      return;
    }
    const { data, error: rpcErr } = await sb.rpc('yeseong_mobile_get_me');
    if (rpcErr || !data) {
      setError(toUserMessage(rpcErr, '프로필을 불러오지 못했습니다.'));
      return;
    }
    setMe(data as unknown as Me);
  }, [sb, router]);

  useEffect(() => { load(); }, [load]);

  // 팀장 본인이 아니면 선택 가능 — 팀장 목록 로드
  const isLeaderSelf = me?.worker.skill_grade === '팀장';
  useEffect(() => {
    if (me && !isLeaderSelf && leaders.length === 0) {
      sb.rpc('yeseong_list_team_leaders').then(({ data }) => {
        setLeaders((data as unknown as TeamLeader[]) ?? []);
      });
    }
  }, [me, isLeaderSelf, leaders.length, sb]);

  async function changeLeader(id: string) {
    if (savingLeader) return;
    const next = id || null;
    if (next === (me?.team_leader?.id ?? null)) return;
    setSavingLeader(true);
    setLeaderMsg(null);
    const { error } = await sb.rpc('yeseong_mobile_set_my_team_leader', {
      p_team_leader_id: next,
    });
    setSavingLeader(false);
    if (error) {
      setLeaderMsg(error.message);
      return;
    }
    setLeaderMsg('팀장이 변경되었습니다. 현장·전문건설사가 자동 반영됩니다.');
    await load();
  }

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
      <div className="px-7 pt-14 pb-8">
        <h1 className="text-[34px] font-bold text-zinc-900">내 정보</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {isLeaderSelf
            ? '수정이 필요하면 관리자에게 문의하세요.'
            : '팀장은 직접 선택할 수 있어요. 그 외 수정은 관리자에게 문의하세요.'}
        </p>
      </div>

      <section className="mx-7 mb-8 rounded-[5px] bg-navy p-6 text-center text-white">
        <p className="text-[26px] font-bold leading-tight">{w.name}</p>
        <p className="mt-1 text-lg font-semibold text-blue-200">
          {w.phone ? formatPhone(w.phone) : '-'}
        </p>
      </section>

      <section className="px-7 space-y-4 pb-8">
        <h2 className="text-lg font-bold text-zinc-900">소속</h2>
        {isLeaderSelf ? (
          <ReadField label="팀장" value={me.team_leader?.name} />
        ) : (
          <div>
            <label className="text-base font-semibold text-zinc-500">팀장</label>
            <select
              value={me.team_leader?.id ?? ''}
              onChange={(e) => changeLeader(e.target.value)}
              disabled={savingLeader}
              className="mt-2 w-full appearance-none rounded-[5px] bg-zinc-50 px-5 py-4 text-lg font-bold text-zinc-900 ring-1 ring-zinc-200 focus:ring-2 focus:ring-navy outline-none disabled:opacity-60"
            >
              <option value="">미지정</option>
              {/* 현재 팀장이 활성 목록에 없으면 옵션에 살려 유실 방지 */}
              {me.team_leader && !leaders.some((l) => l.id === me.team_leader!.id) && (
                <option value={me.team_leader.id}>{me.team_leader.name}</option>
              )}
              {leaders.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            {leaderMsg && (
              <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-navy">
                <Check className="h-4 w-4" /> {leaderMsg}
              </p>
            )}
          </div>
        )}
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

      <section className="px-7 pb-8">
        <h2 className="mb-4 text-lg font-bold text-zinc-900">근로계약서</h2>
        <Link
          href="/m/contract"
          className="flex items-center gap-3 rounded-[5px] bg-zinc-50 px-5 py-4 ring-1 ring-zinc-200 active:bg-zinc-100"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-navy text-white">
            <FileSignature className="h-5 w-5" />
          </span>
          <span className="flex-1 text-lg font-bold text-zinc-900">근로계약서 확인·서명</span>
          <ChevronRight className="h-5 w-5 text-zinc-400" />
        </Link>
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
