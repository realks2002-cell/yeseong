'use client';
import { useState } from 'react';

type DispatchHours = 0.5 | 1;

const OPTIONS: { value: DispatchHours; label: string }[] = [
  { value: 0.5, label: '0.5 일' },
  { value: 1, label: '1 일' },
];

// 파견: 다른 현장 선택 + 근무(0.5/1) 입력 → 그 현장으로 출역 등록
export function DispatchDialog({
  worksites,
  busy,
  onCancel,
  onSubmit,
}: {
  worksites: { id: string; name: string }[] | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (h: DispatchHours, worksiteId: string) => void;
}) {
  const [siteId, setSiteId] = useState('');
  const [hours, setHours] = useState<DispatchHours | null>(null);
  const ready = siteId !== '' && hours !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 sm:items-center">
      <div className="w-full sm:max-w-[400px] rounded-t-[5px] sm:rounded-[5px] bg-white p-7">
        <p className="text-center text-xl font-bold text-zinc-900">파견 근무 등록</p>
        <p className="mt-1 text-center text-sm text-zinc-500">오늘 일한 다른 현장을 선택하세요</p>

        <label className="mt-6 block text-sm font-semibold text-zinc-600">현장</label>
        <select
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          disabled={busy || worksites === null}
          className="mt-1.5 h-14 w-full rounded-[5px] border-2 border-zinc-200 bg-white px-3 text-lg text-zinc-900 outline-none focus:border-navy"
        >
          <option value="">{worksites === null ? '불러오는 중...' : '현장 선택'}</option>
          {(worksites ?? []).map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>

        <label className="mt-5 block text-sm font-semibold text-zinc-600">근무</label>
        <div className="mt-1.5 grid grid-cols-2 gap-3">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setHours(o.value)}
              disabled={busy}
              className={
                'flex h-[64px] items-center justify-center rounded-[5px] text-xl font-bold ring-2 transition active:scale-[0.99] ' +
                (hours === o.value ? 'bg-navy text-white ring-navy' : 'bg-white text-zinc-700 ring-zinc-200')
              }
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="mt-7 grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="h-[64px] rounded-[5px] bg-zinc-100 text-xl font-bold text-zinc-700 disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={() => ready && hours !== null && onSubmit(hours, siteId)}
            disabled={!ready || busy}
            className="h-[64px] rounded-[5px] bg-navy text-xl font-bold text-white disabled:opacity-40"
          >
            {busy ? '등록 중...' : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
}
