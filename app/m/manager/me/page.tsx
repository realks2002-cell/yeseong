'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Save, X } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { getBrowserSupabase } from '@/lib/supabase/client';
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
    bank_name: string | null;
    account_number: string | null;
    account_holder: string | null;
    address: string | null;
  } | null;
};

export default function ManagerMePage() {
  const router = useRouter();
  const sb = getBrowserSupabase();

  const [me, setMe] = useState<Me | null>(null);
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

  const load = useCallback(async () => {
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
    const meData = data as unknown as Me | null;
    if (!meData?.manager) {
      router.replace('/m/manager/signup');
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
  }, [sb, router]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (busy) return;
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

      <section className="mx-7 mb-8 rounded-[5px] bg-blue-900 p-6 text-center text-white">
        <p className="text-[26px] font-bold leading-tight">{me.worker?.name ?? me.manager.name}</p>
        <p className="mt-1 text-lg font-semibold text-blue-200">
          {formatPhone(me.manager.phone)}
        </p>
        <p className="mt-1 text-xs font-semibold text-blue-200">현장 소장</p>
      </section>

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
              onClick={() => { setMsg(undefined); setError(undefined); setEditing(true); }}
              className="flex h-[68px] w-full items-center justify-center gap-2 rounded-[5px] bg-blue-900 text-lg font-bold text-white"
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
