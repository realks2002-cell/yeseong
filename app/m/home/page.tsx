'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { getBrowserSupabase } from '@/lib/supabase/client';

type Hours = 0.5 | 1 | 1.5 | 2;

const OPTIONS: { value: Hours; title: string; sub: string; cls: string }[] = [
  { value: 0.5, title: '0.5 일', sub: '반나절', cls: 'bg-white text-blue-900 ring-blue-200' },
  { value: 1,   title: '1 일',   sub: '정상',   cls: 'bg-blue-900 text-white ring-blue-900' },
  { value: 1.5, title: '1.5 일', sub: '연장',   cls: 'bg-white text-red-800 ring-red-200' },
  { value: 2,   title: '2 일',   sub: '특근',   cls: 'bg-red-800 text-white ring-red-800' },
];

type Me = {
  worker: { id: string; name: string; phone: string | null; default_worksite_id: string | null; default_subcontractor_id: string | null };
  worksite: { id: string; name: string } | null;
  subcontractor: { id: string; name: string } | null;
  recent: Array<{ work_date: string; hours: number }>;
};

const TODAY_ISO = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

const TODAY_LABEL = (() => {
  const d = new Date();
  const dow = ['일','월','화','수','목','금','토'][d.getDay()];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${dow})`;
})();

export default function HomePage() {
  const router = useRouter();
  const sb = getBrowserSupabase();

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<Hours | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      router.replace('/m/signup');
      return;
    }
    const { data, error: rpcErr } = await sb.rpc('yeseong_mobile_get_me');
    if (rpcErr || !data) {
      setError(rpcErr?.message ?? '프로필 로드 실패');
      setLoading(false);
      return;
    }
    setMe(data as unknown as Me);
    setLoading(false);
  }, [sb, router]);

  useEffect(() => { load(); }, [load]);

  const todayHours = me?.recent.find((r) => r.work_date === TODAY_ISO)?.hours ?? null;

  const submit = async (h: Hours) => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    const { error: rpcErr } = await sb.rpc('yeseong_mobile_register_attendance', {
      p_work_date: TODAY_ISO,
      p_hours: h,
    });
    setBusy(false);
    setConfirm(null);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    await load();
  };

  if (loading) {
    return (
      <MobileShell showTabs activeTab="home">
        <div className="flex h-full items-center justify-center text-zinc-400">로딩...</div>
      </MobileShell>
    );
  }

  if (!me?.worksite || !me?.subcontractor) {
    return (
      <MobileShell showTabs activeTab="home">
        <div className="px-7 pt-10">
          <h1 className="text-2xl font-bold text-zinc-900">현장과 소속을 먼저 설정해주세요</h1>
          <p className="mt-3 text-base text-zinc-500">내 정보 화면에서 변경할 수 있어요.</p>
          <button
            onClick={() => router.push('/m/profile')}
            className="mt-8 h-[68px] w-full rounded-2xl bg-blue-900 text-xl font-bold text-white"
          >
            내 정보로 이동
          </button>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell showTabs activeTab="home">
      <div className="px-7 pt-10 pb-4">
        <p className="text-[24px] font-bold text-zinc-700">{TODAY_LABEL}</p>
        <h1 className="mt-1 text-[26px] font-bold leading-tight text-zinc-900">
          안녕하세요 {me.worker.name}님
        </h1>
        <p className="mt-2 text-base font-semibold text-zinc-500">
          {me.worksite.name} · {me.subcontractor.name}
        </p>
      </div>

      {todayHours === null ? (
        <RegisterView onPick={setConfirm} />
      ) : (
        <LockedView hours={todayHours as Hours} />
      )}

      {error && <p className="mx-7 mt-4 text-base font-semibold text-red-800">{error}</p>}

      <HistorySection recent={me.recent} />

      {confirm !== null && (
        <ConfirmDialog
          hours={confirm}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => submit(confirm)}
        />
      )}
    </MobileShell>
  );
}

function RegisterView({ onPick }: { onPick: (h: Hours) => void }) {
  return (
    <section className="px-7">
      <h2 className="text-2xl font-bold text-zinc-900">오늘 근무를 등록해주세요</h2>
      <ul className="mt-5 space-y-3">
        {OPTIONS.map((o) => (
          <li key={o.value}>
            <button
              onClick={() => onPick(o.value)}
              className={
                'flex h-[88px] w-full items-center justify-between rounded-2xl px-7 ring-2 transition active:scale-[0.99] ' +
                o.cls
              }
            >
              <span className="text-[34px] font-bold">{o.title}</span>
              <span className="text-xl font-semibold opacity-90">{o.sub}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LockedView({ hours }: { hours: Hours }) {
  return (
    <section className="mx-7 rounded-3xl bg-blue-900 px-8 py-10 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold text-blue-200">오늘 등록 완료</p>
          <p className="mt-2 text-[56px] font-bold leading-none">{hours}일</p>
        </div>
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-white text-blue-900">
          <Check className="h-9 w-9" />
        </span>
      </div>
      <p className="mt-8 text-base text-blue-200">
        수정이 필요하시면 소장님께 말씀해주세요
      </p>
    </section>
  );
}

function HistorySection({ recent }: { recent: Array<{ work_date: string; hours: number }> }) {
  const days: Array<{ date: string; label: string; hours: number }> = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dow = ['일','월','화','수','목','금','토'][d.getDay()];
    const r = recent.find((x) => x.work_date === iso);
    days.push({ date: iso, label: `${d.getMonth() + 1}/${d.getDate()} ${dow}`, hours: r?.hours ?? 0 });
  }
  const total = days.reduce((s, d) => s + d.hours, 0);
  return (
    <section className="mt-10 px-7 pb-10">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-zinc-900">최근 7일</h2>
        <span className="text-base font-semibold text-zinc-400">합계 {total}일</span>
      </div>
      <ul className="mt-4 divide-y divide-zinc-100 rounded-2xl bg-white ring-1 ring-zinc-200">
        {days.map((h) => (
          <li key={h.date} className="flex items-center justify-between px-5 py-4">
            <span className="text-lg font-semibold text-zinc-700">{h.label}</span>
            <span className={'text-xl font-bold ' + (h.hours === 0 ? 'text-zinc-400' : 'text-blue-900')}>
              {h.hours === 0 ? '─' : `${h.hours}일`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ConfirmDialog({
  hours,
  busy,
  onCancel,
  onConfirm,
}: {
  hours: Hours;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-blue-950/50 sm:items-center">
      <div className="w-full sm:max-w-[400px] rounded-t-3xl sm:rounded-3xl bg-white p-7">
        <p className="text-center text-xl text-zinc-500">오늘 근무를</p>
        <p className="mt-2 text-center text-[44px] font-bold text-zinc-900">{hours}일로 등록할까요?</p>
        <p className="mt-3 text-center text-base text-zinc-500">등록 후 수정은 소장님만 가능해요</p>
        <div className="mt-7 grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="h-[68px] rounded-2xl bg-zinc-100 text-xl font-bold text-zinc-700 disabled:opacity-50"
          >
            아니오
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="h-[68px] rounded-2xl bg-blue-900 text-xl font-bold text-white disabled:opacity-60"
          >
            {busy ? '등록 중...' : '네, 등록할게요'}
          </button>
        </div>
      </div>
    </div>
  );
}
