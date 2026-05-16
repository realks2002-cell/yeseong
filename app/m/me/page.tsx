'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Save, X } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { formatPhone } from '@/lib/auth/phone-email';

const KOREAN_BANKS = [
  'KB국민은행', '신한은행', '우리은행', '하나은행', 'NH농협은행', 'IBK기업은행',
  'SC제일은행', '한국씨티은행', '카카오뱅크', '케이뱅크', '토스뱅크',
  '부산은행', '대구은행', '광주은행', '전북은행', '경남은행', '제주은행',
  '수협은행', '산업은행', '새마을금고', '신협', '우체국',
];

type Me = {
  worker: {
    id: string;
    name: string;
    phone: string | null;
    default_trade: string | null;
    bank_name: string | null;
    account_number: string | null;
    account_holder: string | null;
    address: string | null;
  };
};

export default function MePage() {
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
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | undefined>();
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
    const meData = data as unknown as Me;
    setMe(meData);
    setForm({
      name: meData.worker.name ?? '',
      default_trade: meData.worker.default_trade ?? '',
      bank_name: meData.worker.bank_name ?? '',
      account_number: meData.worker.account_number ?? '',
      account_holder: meData.worker.account_holder ?? '',
      address: meData.worker.address ?? '',
    });
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
    const { error: rpcErr } = await sb.rpc('yeseong_mobile_update_profile', {
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
    if (!me) return;
    setForm({
      name: me.worker.name ?? '',
      default_trade: me.worker.default_trade ?? '',
      bank_name: me.worker.bank_name ?? '',
      account_number: me.worker.account_number ?? '',
      account_holder: me.worker.account_holder ?? '',
      address: me.worker.address ?? '',
    });
    setEditing(false);
    setError(undefined);
    setMsg(undefined);
  };

  if (!me) {
    return (
      <MobileShell showTabs activeTab="profile">
        <div className="flex h-full items-center justify-center text-zinc-400">
          {error ?? '로딩...'}
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell showTabs activeTab="profile">
      <div className="px-7 pt-10 pb-8">
        <h1 className="text-[34px] font-bold text-zinc-900">내 정보</h1>
      </div>

      <section className="mx-7 mb-8 rounded-[5px] bg-blue-900 p-6 text-center text-white">
        <p className="text-[26px] font-bold leading-tight">{me.worker.name}</p>
        <p className="mt-1 text-lg font-semibold text-blue-200">
          {me.worker.phone ? formatPhone(me.worker.phone) : '-'}
        </p>
      </section>

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
          <input
            list="me-bank-list"
            value={form.bank_name}
            onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
            disabled={!editing}
            placeholder="은행 선택 또는 입력"
            className="w-full rounded-[5px] bg-white px-5 py-4 text-lg font-bold text-zinc-900 ring-2 ring-zinc-200 focus:ring-blue-900 outline-none disabled:bg-zinc-50 disabled:ring-zinc-100 disabled:text-zinc-600"
          />
          <datalist id="me-bank-list">
            {KOREAN_BANKS.map((b) => <option key={b} value={b} />)}
          </datalist>
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
