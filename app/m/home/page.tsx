'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, RotateCcw } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { isLoggedIn } from '@/lib/mock/session';

type Hours = 0.5 | 1 | 1.5 | 2;

const OPTIONS: { value: Hours; title: string; sub: string; cls: string }[] = [
  { value: 0.5, title: '0.5 일', sub: '반나절', cls: 'bg-white text-blue-900 ring-blue-200' },
  { value: 1,   title: '1 일',   sub: '정상',   cls: 'bg-blue-900 text-white ring-blue-900' },
  { value: 1.5, title: '1.5 일', sub: '연장',   cls: 'bg-white text-red-800 ring-red-200' },
  { value: 2,   title: '2 일',   sub: '특근',   cls: 'bg-red-800 text-white ring-red-800' },
];

const HISTORY = [
  { date: '5/10 토', hours: 1 },
  { date: '5/9 금',  hours: 1 },
  { date: '5/8 목',  hours: 0.5 },
  { date: '5/7 수',  hours: 1.5 },
  { date: '5/6 화',  hours: 1 },
  { date: '5/5 월',  hours: 0 },
  { date: '5/4 일',  hours: 1 },
];

export default function HomePage() {
  const router = useRouter();
  const [confirm, setConfirm] = useState<Hours | null>(null);
  const [registered, setRegistered] = useState<Hours | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) router.replace('/m/signup');
  }, [router]);

  return (
    <MobileShell showTabs activeTab="home">
      <div className="px-7 pt-10 pb-8">
        <p className="text-[28px] font-bold text-zinc-700">2026년 5월 11일 (월)</p>
        <h1 className="mt-1 text-[27px] font-bold leading-tight text-zinc-900">
          안녕하세요 김명봉님
        </h1>
      </div>

      {registered === null ? (
        <RegisterView onPick={setConfirm} />
      ) : (
        <LockedView hours={registered} onReset={() => setRegistered(null)} />
      )}

      <HistorySection />

      {confirm !== null && (
        <ConfirmDialog
          hours={confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setRegistered(confirm);
            setConfirm(null);
          }}
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

function LockedView({ hours, onReset }: { hours: Hours; onReset: () => void }) {
  return (
    <section className="mx-7 rounded-3xl bg-blue-900 px-8 py-10 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold text-blue-200">5월 11일 등록 완료</p>
          <p className="mt-2 text-[56px] font-bold leading-none">{hours}일</p>
        </div>
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-white text-blue-900">
          <Check className="h-9 w-9" />
        </span>
      </div>
      <p className="mt-8 text-base text-blue-200">
        수정이 필요하시면 소장님께 말씀해주세요
      </p>
      <button
        onClick={onReset}
        className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-300 underline"
      >
        <RotateCcw className="h-4 w-4" /> 목업 리셋
      </button>
    </section>
  );
}

function HistorySection() {
  return (
    <section className="mt-10 px-7 pb-10">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-zinc-900">최근 7일</h2>
        <span className="text-base font-semibold text-zinc-400">합계 5.5일</span>
      </div>
      <ul className="mt-4 divide-y divide-zinc-100 rounded-2xl bg-white ring-1 ring-zinc-200">
        {HISTORY.map((h) => (
          <li key={h.date} className="flex items-center justify-between px-5 py-4">
            <span className="text-lg font-semibold text-zinc-700">{h.date}</span>
            <span
              className={
                'text-xl font-bold ' +
                (h.hours === 0 ? 'text-zinc-400' : 'text-blue-900')
              }
            >
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
  onCancel,
  onConfirm,
}: {
  hours: Hours;
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
            className="h-[68px] rounded-2xl bg-zinc-100 text-xl font-bold text-zinc-700"
          >
            아니오
          </button>
          <button
            onClick={onConfirm}
            className="h-[68px] rounded-2xl bg-blue-900 text-xl font-bold text-white"
          >
            네, 등록할게요
          </button>
        </div>
      </div>
    </div>
  );
}
