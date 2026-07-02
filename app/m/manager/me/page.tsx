'use client';
import { useCallback, useEffect, useState } from 'react';
import { toUserMessage } from '@/lib/errors/message';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, ChevronDown, ChevronUp, MapPin, Users, FileSignature } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { DocumentsSection } from '@/components/mobile/document-uploader';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { getMirrorId, mirrorFetch, withMirror } from '@/lib/manager/mirror';
import { formatPhone } from '@/lib/auth/phone-email';

type Me = {
  manager: { id: string; name: string; phone: string };
  worker: {
    id: string;
    name: string;
    phone: string | null;
    default_trade: string | null;
    default_wage: number;
    default_worksite_id: string | null;
    bank_name: string | null;
    account_number: string | null;
    account_holder: string | null;
    address: string | null;
  } | null;
  worksites: Array<{ id: string; name: string }>;
};

type TeamMember = { id: string; name: string; phone: string | null; default_trade: string | null };

export default function ManagerMePage() {
  const router = useRouter();
  const sb = getBrowserSupabase();

  const [me, setMe] = useState<Me | null>(null);
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [teamOpen, setTeamOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [readOnly, setReadOnly] = useState(false);
  const [mirrorId, setMirrorId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const mirror = getMirrorId();
    let meData: Me | null;
    let teamData: TeamMember[] | null;
    if (mirror) {
      setReadOnly(true);
      setMirrorId(mirror);
      try {
        meData = await mirrorFetch<Me | null>('me', mirror);
        teamData = await mirrorFetch<TeamMember[]>('team', mirror);
      } catch (e) {
        setError((e as Error).message);
        return;
      }
    } else {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) {
        router.replace('/m/manager/signup');
        return;
      }
      const { data, error: rpcErr } = await sb.rpc('yeseong_manager_get_me');
      if (rpcErr) {
        setError(toUserMessage(rpcErr));
        return;
      }
      meData = data as unknown as Me | null;
      const { data: td } = await sb.rpc('yeseong_manager_list_team_members');
      teamData = td as unknown as TeamMember[] | null;
    }
    if (!meData?.manager) {
      if (mirror) setError('팀장 정보를 찾을 수 없습니다.');
      else router.replace('/m/manager/signup');
      return;
    }
    setMe(meData);
    setTeam(teamData ?? []);
  }, [sb, router]);

  useEffect(() => { load(); }, [load]);

  if (!me) {
    return (
      <MobileShell showTabs activeTab="profile" variant="manager">
        <div className="flex h-full items-center justify-center text-zinc-400">
          {error ?? '로딩...'}
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell showTabs activeTab="profile" variant="manager">
      <div className="px-7 pt-14 pb-8">
        <h1 className="text-[34px] font-bold text-zinc-900">내 정보</h1>
      </div>

      <div className="mx-7 mb-8">
        <section className="rounded-[5px] bg-navy p-6 text-white">
          <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
            <p className="text-[24px] font-bold leading-tight">{me.worker?.name ?? me.manager.name}</p>
            <p className="text-lg font-semibold text-blue-200 tabular-nums">{formatPhone(me.manager.phone)}</p>
          </div>
          <button
            onClick={() => setTeamOpen((v) => !v)}
            aria-expanded={teamOpen}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-[5px] bg-white/15 py-3 text-base font-bold text-white ring-1 ring-white/25 active:scale-[0.99]"
          >
            <Users className="h-5 w-5" />
            내 팀원 보기{team ? ` (${team.length})` : ''}
            {teamOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </section>

        {teamOpen && (
          team && team.length > 0 ? (
            <ul className="mt-2 divide-y divide-zinc-100 rounded-[5px] bg-white ring-1 ring-zinc-200">
              {team.map((t) => (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-base font-bold text-zinc-900">{t.name}</p>
                    <p className="text-sm font-semibold text-zinc-500 tabular-nums">
                      {t.phone ? formatPhone(t.phone) : '-'}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-zinc-400">{t.default_trade ?? '직종 미지정'}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 rounded-[5px] bg-zinc-50 py-6 text-center text-sm text-zinc-400 ring-1 ring-zinc-200">
              등록된 팀원이 없어요
            </p>
          )
        )}
      </div>

      {me.worker ? (
        <section className="px-7 space-y-5 pb-10">
          <Field label="이름">
            <ReadOnlyValue value={me.worker.name} />
          </Field>

          <Field label="공종">
            <ReadOnlyValue value={me.worker.default_trade} />
          </Field>

          <Field label="은행">
            <ReadOnlyValue value={me.worker.bank_name} />
          </Field>

          <Field label="계좌번호">
            <ReadOnlyValue value={me.worker.account_number} mono />
          </Field>

          <Field label="예금주">
            <ReadOnlyValue value={me.worker.account_holder} />
          </Field>

          <Field label="주소">
            <ReadOnlyValue value={me.worker.address} />
          </Field>

          <p className="text-sm text-zinc-400">정보 수정은 관리자에게 요청하세요</p>
        </section>
      ) : (
        <section className="mx-7 flex flex-col items-center justify-center rounded-[5px] bg-amber-50 ring-1 ring-amber-200 px-6 py-12 text-center">
          <p className="text-base font-bold text-amber-900">작업자 마스터에 정보가 없어요</p>
          <p className="mt-2 text-sm text-amber-700">
            관리자에게 작업자 등록을 요청하면<br />여기에 본인 정보가 표시됩니다
          </p>
        </section>
      )}

      <section className="px-7 pb-10">
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
          href={withMirror('/m/manager/site-gps', mirrorId)}
          className="mt-3 flex h-[60px] w-full items-center justify-between rounded-[5px] bg-emerald-50 px-5 text-base font-bold text-emerald-800 ring-1 ring-emerald-200 active:scale-[0.99]"
        >
          <span className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            현장 위치 등록
          </span>
          <ChevronRight className="h-5 w-5 text-emerald-400" />
        </Link>
      </section>

      {me.worker && !readOnly && (
        <section className="px-7 pb-10">
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
      )}

      {me.worker && <DocumentsSection readOnly={readOnly} />}
    </MobileShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-base font-semibold text-zinc-500">{label}</label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function ReadOnlyValue({ value, mono = false }: { value: string | null; mono?: boolean }) {
  return (
    <p className={`w-full rounded-[5px] bg-zinc-50 px-5 py-4 text-lg font-bold text-zinc-600 ring-2 ring-zinc-100${mono ? ' font-mono' : ''}`}>
      {value || '-'}
    </p>
  );
}
