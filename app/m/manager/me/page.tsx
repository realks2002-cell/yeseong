'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pencil, Save, X, ChevronRight, ChevronDown, ChevronUp, MapPin, Users } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { DocumentsSection } from '@/components/mobile/document-uploader';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { getMirrorId, mirrorFetch, withMirror } from '@/lib/manager/mirror';
import { formatPhone } from '@/lib/auth/phone-email';
import { KOREAN_BANKS } from '@/lib/constants/banks';

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
  const [form, setForm] = useState({
    name: '',
    default_trade: '',
    bank_name: '',
    account_number: '',
    account_holder: '',
    address: '',
  });
  const [editing, setEditing] = useState(false);
  const [bankCustom, setBankCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | undefined>();
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
        setError(rpcErr.message);
        return;
      }
      meData = data as unknown as Me | null;
      const { data: td } = await sb.rpc('yeseong_manager_list_team_members');
      teamData = td as unknown as TeamMember[] | null;
    }
    if (!meData?.manager) {
      if (mirror) setError('팀장 정보를 찾을 수 없어요');
      else router.replace('/m/manager/signup');
      return;
    }
    setMe(meData);
    if (meData.worker) {
      const bn = meData.worker.bank_name ?? '';
      setForm({
        name: meData.worker.name ?? '',
        default_trade: meData.worker.default_trade ?? '',
        bank_name: bn,
        account_number: meData.worker.account_number ?? '',
        account_holder: meData.worker.account_holder ?? '',
        address: meData.worker.address ?? '',
      });
      setBankCustom(bn !== '' && !(KOREAN_BANKS as readonly string[]).includes(bn));
    }
    setTeam(teamData ?? []);
  }, [sb, router]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (readOnly || busy) return;
    if (!form.name.trim()) {
      setError('이름을 입력해주세요');
      return;
    }
    setBusy(true);
    setError(undefined);
    setMsg(undefined);
    const { error: rpcErr } = await sb.rpc('yeseong_manager_update_my_worker_info', {
      p_name: form.name,
      p_default_trade: form.default_trade,
      p_bank_name: form.bank_name,
      p_account_number: form.account_number,
      p_account_holder: form.account_holder,
      p_address: form.address,
    });
    setBusy(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setMsg('저장되었어요');
    setEditing(false);
    await load();
  };

  const setDefaultWorksite = async (worksiteId: string) => {
    if (readOnly) return;
    setError(undefined);
    setMsg(undefined);
    const { error: rpcErr } = await sb.rpc('yeseong_manager_set_default_worksite', {
      p_worksite_id: worksiteId || null,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setMsg('기본 현장이 저장되었어요');
    await load();
  };

  const cancel = () => {
    if (!me?.worker) return;
    const bn = me.worker.bank_name ?? '';
    setForm({
      name: me.worker.name ?? '',
      default_trade: me.worker.default_trade ?? '',
      bank_name: bn,
      account_number: me.worker.account_number ?? '',
      account_holder: me.worker.account_holder ?? '',
      address: me.worker.address ?? '',
    });
    setBankCustom(bn !== '' && !(KOREAN_BANKS as readonly string[]).includes(bn));
    setEditing(false);
    setError(undefined);
    setMsg(undefined);
  };

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
      <div className="px-7 pt-10 pb-8">
        <h1 className="text-[34px] font-bold text-zinc-900">내 정보</h1>
      </div>

      <div className="mx-7 mb-8">
        <section className="rounded-[5px] bg-blue-900 p-6 text-white">
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
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              disabled={!editing}
              className="w-full rounded-[5px] bg-white px-5 py-4 text-lg font-bold text-zinc-900 ring-2 ring-zinc-200 focus:ring-blue-900 outline-none disabled:bg-zinc-50 disabled:ring-zinc-100 disabled:text-zinc-600"
            />
          </Field>

          <Field label="공종">
            <input
              value={form.default_trade}
              onChange={(e) => setForm((f) => ({ ...f, default_trade: e.target.value }))}
              disabled={!editing}
              placeholder="예: 미장공, 줄눈공"
              className="w-full rounded-[5px] bg-white px-5 py-4 text-lg font-bold text-zinc-900 ring-2 ring-zinc-200 focus:ring-blue-900 outline-none disabled:bg-zinc-50 disabled:ring-zinc-100 disabled:text-zinc-600"
            />
          </Field>

          <Field label="은행">
            {bankCustom ? (
              <div className="flex gap-2">
                <input
                  value={form.bank_name}
                  onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
                  disabled={!editing}
                  placeholder="은행명 직접 입력"
                  className="flex-1 rounded-[5px] bg-white px-5 py-4 text-lg font-bold text-zinc-900 ring-2 ring-zinc-200 focus:ring-blue-900 outline-none disabled:bg-zinc-50 disabled:ring-zinc-100 disabled:text-zinc-600"
                />
                {editing && (
                  <button
                    type="button"
                    onClick={() => { setBankCustom(false); setForm((f) => ({ ...f, bank_name: '' })); }}
                    className="px-4 text-sm font-semibold text-zinc-500 underline"
                  >
                    목록
                  </button>
                )}
              </div>
            ) : (
              <select
                value={form.bank_name}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setBankCustom(true);
                    setForm((f) => ({ ...f, bank_name: '' }));
                  } else {
                    setForm((f) => ({ ...f, bank_name: e.target.value }));
                  }
                }}
                disabled={!editing}
                className="w-full rounded-[5px] bg-white px-5 py-4 text-lg font-bold text-zinc-900 ring-2 ring-zinc-200 focus:ring-blue-900 outline-none disabled:bg-zinc-50 disabled:ring-zinc-100 disabled:text-zinc-600"
              >
                <option value="">선택하세요</option>
                {KOREAN_BANKS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
                <option value="__custom__">직접 입력...</option>
              </select>
            )}
          </Field>

          <Field label="계좌번호">
            <input
              value={form.account_number}
              onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
              disabled={!editing}
              inputMode="numeric"
              className="w-full rounded-[5px] bg-white px-5 py-4 text-lg font-bold text-zinc-900 ring-2 ring-zinc-200 focus:ring-blue-900 outline-none font-mono disabled:bg-zinc-50 disabled:ring-zinc-100 disabled:text-zinc-600"
            />
          </Field>

          <Field label="예금주">
            <input
              value={form.account_holder}
              onChange={(e) => setForm((f) => ({ ...f, account_holder: e.target.value }))}
              disabled={!editing}
              className="w-full rounded-[5px] bg-white px-5 py-4 text-lg font-bold text-zinc-900 ring-2 ring-zinc-200 focus:ring-blue-900 outline-none disabled:bg-zinc-50 disabled:ring-zinc-100 disabled:text-zinc-600"
            />
          </Field>

          <Field label="주소">
            <input
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              disabled={!editing}
              className="w-full rounded-[5px] bg-white px-5 py-4 text-lg font-bold text-zinc-900 ring-2 ring-zinc-200 focus:ring-blue-900 outline-none disabled:bg-zinc-50 disabled:ring-zinc-100 disabled:text-zinc-600"
            />
          </Field>

          {editing ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={cancel}
                disabled={busy}
                className="flex h-[68px] items-center justify-center gap-2 rounded-[5px] bg-zinc-100 text-lg font-bold text-zinc-700 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
                취소
              </button>
              <button
                onClick={save}
                disabled={busy || !form.name.trim()}
                className="flex h-[68px] items-center justify-center gap-2 rounded-[5px] bg-blue-900 text-lg font-bold text-white disabled:bg-zinc-200 disabled:text-zinc-400"
              >
                <Save className="h-5 w-5" />
                {busy ? '저장 중...' : '저장'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => { if (readOnly) return; setMsg(undefined); setError(undefined); setEditing(true); }}
              disabled={readOnly}
              className="flex h-[68px] w-full items-center justify-center gap-2 rounded-[5px] bg-blue-900 text-lg font-bold text-white disabled:bg-zinc-200 disabled:text-zinc-400"
            >
              <Pencil className="h-5 w-5" />
              수정
            </button>
          )}

          {msg && <p className="text-base font-semibold text-blue-900">{msg}</p>}
          {error && <p className="text-base font-semibold text-red-800">{error}</p>}
        </section>
      ) : (
        <section className="mx-7 flex flex-col items-center justify-center rounded-[5px] bg-amber-50 ring-1 ring-amber-200 px-6 py-12 text-center">
          <p className="text-base font-bold text-amber-900">작업자 마스터에 정보가 없어요</p>
          <p className="mt-2 text-sm text-amber-700">
            관리자에게 작업자 등록을 요청하면<br />여기에 본인 정보가 표시됩니다
          </p>
        </section>
      )}

      {me.worker && (
        <section className="px-7 pb-8">
          <h2 className="text-lg font-bold text-zinc-900">성과 입력 기본 현장</h2>
          <p className="mt-1 text-sm text-zinc-500">매사 성과를 입력할 현장이에요</p>
          {me.worksites.length === 0 ? (
            <p className="mt-3 rounded-[5px] bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
              담당 현장이 없어요. 아래에서 담당 현장을 먼저 추가하세요.
            </p>
          ) : (
            <select
              value={me.worker.default_worksite_id ?? ''}
              onChange={(e) => setDefaultWorksite(e.target.value)}
              disabled={readOnly}
              className="mt-3 w-full rounded-[5px] bg-white px-5 py-4 text-lg font-bold text-zinc-900 ring-2 ring-zinc-200 focus:ring-blue-900 outline-none disabled:bg-zinc-50 disabled:text-zinc-500"
            >
              <option value="">선택 안 함</option>
              {me.worksites.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          )}
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
          href={withMirror('/m/manager/assignments', mirrorId)}
          className="mt-3 flex h-[60px] w-full items-center justify-between rounded-[5px] bg-zinc-50 px-5 text-base font-bold text-zinc-700 ring-1 ring-zinc-200 active:scale-[0.99]"
        >
          담당 현장 변경
          <ChevronRight className="h-5 w-5 text-zinc-400" />
        </Link>

        <Link
          href={withMirror('/m/manager/site-gps', mirrorId)}
          className="mt-2 flex h-[60px] w-full items-center justify-between rounded-[5px] bg-emerald-50 px-5 text-base font-bold text-emerald-800 ring-1 ring-emerald-200 active:scale-[0.99]"
        >
          <span className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            현장 위치 등록
          </span>
          <ChevronRight className="h-5 w-5 text-emerald-400" />
        </Link>
      </section>

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
