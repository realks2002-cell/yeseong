'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MockWorker, PayrollState } from '@/lib/mock/store';
import { emptyPayrollState } from '@/lib/mock/store';
import { loadPayroll, savePayroll } from '@/lib/mock/storage';
import { useWorkers } from '@/lib/mock/use-workers';
import { daysInMonth, formatYearMonth, shiftMonth } from '@/lib/utils/date';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  Camera,
  Download,
  UserPlus,
  Trash2,
  X,
} from 'lucide-react';

type Props = {
  siteId: string;
  siteName: string;
  yearMonth: string;
};

export function PayrollGrid({ siteId, siteName, yearMonth }: Props) {
  const router = useRouter();
  const totalDays = daysInMonth(yearMonth);
  const { workers: allWorkers } = useWorkers();

  const [state, setState] = useState<PayrollState>(() => emptyPayrollState(siteId, yearMonth));
  const [hydrated, setHydrated] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    setState(loadPayroll(siteId, yearMonth));
    setHydrated(true);
  }, [siteId, yearMonth]);

  useEffect(() => {
    if (hydrated) savePayroll(state);
  }, [state, hydrated]);

  const enrolled = useMemo(
    () => state.enrolledWorkerIds
      .map(id => allWorkers.find(w => w.id === id))
      .filter((x): x is MockWorker => !!x),
    [state.enrolledWorkerIds, allWorkers]
  );

  const availableWorkers = useMemo(
    () => allWorkers.filter(w => !state.enrolledWorkerIds.includes(w.id)),
    [state.enrolledWorkerIds, allWorkers]
  );

  const cellMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of state.attendance) m.set(`${a.workerId}:${a.day}`, a.hours);
    return m;
  }, [state.attendance]);

  function setCell(workerId: string, day: number, hours: number | null) {
    setState(s => {
      const next = s.attendance.filter(a => !(a.workerId === workerId && a.day === day));
      if (hours !== null && hours > 0) next.push({ workerId, day, hours });
      return { ...s, attendance: next };
    });
  }

  function enrollWorkers(ids: string[]) {
    setState(s => ({
      ...s,
      enrolledWorkerIds: [...s.enrolledWorkerIds, ...ids].slice(0, 26),
    }));
    setShowAddModal(false);
  }

  function removeWorker(workerId: string) {
    if (!confirm('이 작업자를 노임대장에서 제외할까요? 출역 데이터도 삭제됩니다.')) return;
    setState(s => ({
      ...s,
      enrolledWorkerIds: s.enrolledWorkerIds.filter(id => id !== workerId),
      attendance: s.attendance.filter(a => a.workerId !== workerId),
    }));
  }

  async function handleDownload() {
    if (enrolled.length === 0) {
      alert('작업자를 1명 이상 추가해주세요.');
      return;
    }
    // 다운로드 API에 현재 작업자 마스터(편집된 상태) + 노임대장 상태를 함께 전송
    const res = await fetch(`/api/payroll/${siteId}/${yearMonth}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, workers: allWorkers }),
    });
    if (!res.ok) {
      alert(`다운로드 실패: ${res.status}`);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cd = res.headers.get('content-disposition') ?? '';
    const m = cd.match(/filename\*?=(?:UTF-8'')?([^;]+)/i);
    a.download = m ? decodeURIComponent(m[1].replace(/"/g, '')) : `노임대장_${yearMonth}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function dayTotalHours(day: number): number {
    return enrolled.reduce((sum, w) => sum + (cellMap.get(`${w.id}:${day}`) ?? 0), 0);
  }

  return (
    <main className="mx-auto max-w-[1600px] p-4 sm:p-6">
      {/* 헤더 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← 현장 목록
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-500">{siteName}</p>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => router.push(`/payroll/${siteId}/${shiftMonth(yearMonth, -1)}`)}
              aria-label="이전 달"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight tabular-nums">
              {formatYearMonth(yearMonth)} 노임대장
            </h1>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => router.push(`/payroll/${siteId}/${shiftMonth(yearMonth, 1)}`)}
              aria-label="다음 달"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            작업자 {enrolled.length}명 · 셀 클릭으로 공수 입력 (0.5 / 1 / 1.5 / 2 등)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/payroll/${siteId}/${yearMonth}/upload`}>
            <Button variant="outline">
              <Camera className="h-4 w-4" />
              출역부 사진 업로드
            </Button>
          </Link>
          <Button onClick={handleDownload}>
            <Download className="h-4 w-4" />
            엑셀 다운로드
          </Button>
        </div>
      </div>

      {/* 그리드 */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="sticky left-0 z-10 bg-zinc-50 px-3 py-2 font-medium w-10 text-zinc-600">#</th>
              <th className="sticky left-10 z-10 bg-zinc-50 px-3 py-2 font-medium text-left text-zinc-600 min-w-[100px]">성명</th>
              <th className="sticky left-[152px] z-10 bg-zinc-50 px-3 py-2 font-medium text-left text-zinc-600 min-w-[64px]">공종</th>
              {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => (
                <th key={d} className="border-l border-zinc-200 px-1.5 py-2 font-medium text-zinc-600 w-10 text-center tabular-nums">{d}</th>
              ))}
              <th className="border-l border-zinc-200 bg-zinc-100 px-3 py-2 font-medium text-zinc-700 w-14 text-center">공수</th>
              <th className="border-l border-zinc-200 bg-zinc-100 px-3 py-2 font-medium text-zinc-700 w-14 text-center">일수</th>
              <th className="border-l border-zinc-200 px-2 py-2 font-medium text-zinc-600 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {enrolled.length === 0 && (
              <tr>
                <td colSpan={4 + totalDays} className="py-12 text-center text-zinc-400">
                  아직 작업자가 추가되지 않았습니다. 아래 + 버튼으로 추가하세요.
                </td>
              </tr>
            )}
            {enrolled.map((w, idx) => {
              const sum = enrolled.length === 0 ? 0 : Array.from({ length: totalDays }, (_, i) => cellMap.get(`${w.id}:${i + 1}`) ?? 0).reduce((a, b) => a + b, 0);
              const days = Array.from({ length: totalDays }, (_, i) => cellMap.get(`${w.id}:${i + 1}`)).filter(v => v != null && v > 0).length;
              return (
                <tr key={w.id} className="border-b border-zinc-100 hover:bg-zinc-50/50">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 text-zinc-500 tabular-nums">{idx + 1}</td>
                  <td className="sticky left-10 z-10 bg-white px-3 py-2 font-medium">{w.name}</td>
                  <td className="sticky left-[152px] z-10 bg-white px-3 py-2 text-zinc-600 text-xs">{w.defaultTrade ?? '-'}</td>
                  {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => {
                    const v = cellMap.get(`${w.id}:${d}`);
                    return (
                      <td key={d} className="border-l border-zinc-100 p-0 text-center tabular-nums">
                        <CellInput
                          value={v ?? null}
                          onChange={(n) => setCell(w.id, d, n)}
                        />
                      </td>
                    );
                  })}
                  <td className="border-l border-zinc-200 bg-zinc-50 px-2 py-2 text-center font-semibold tabular-nums">{sum || ''}</td>
                  <td className="border-l border-zinc-200 bg-zinc-50 px-2 py-2 text-center tabular-nums text-zinc-600">{days || ''}</td>
                  <td className="border-l border-zinc-100 px-1 py-2 text-center">
                    <button
                      className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                      onClick={() => removeWorker(w.id)}
                      aria-label="작업자 제거"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {/* 일자별 합계 */}
            {enrolled.length > 0 && (
              <tr className="border-t-2 border-zinc-300 bg-zinc-50 font-semibold text-zinc-700">
                <td colSpan={3} className="sticky left-0 z-10 bg-zinc-50 px-3 py-2">일자별 합계</td>
                {Array.from({ length: totalDays }, (_, i) => i + 1).map(d => (
                  <td key={d} className="border-l border-zinc-200 px-1.5 py-2 text-center tabular-nums">{dayTotalHours(d) || ''}</td>
                ))}
                <td className="border-l border-zinc-200 bg-zinc-100 px-2 py-2 text-center tabular-nums">
                  {enrolled.reduce((s, w) => s + Array.from({ length: totalDays }, (_, i) => cellMap.get(`${w.id}:${i + 1}`) ?? 0).reduce((a, b) => a + b, 0), 0)}
                </td>
                <td className="border-l border-zinc-200 bg-zinc-100"></td>
                <td className="border-l border-zinc-200"></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Button variant="outline" onClick={() => setShowAddModal(true)} disabled={enrolled.length >= 26}>
          <UserPlus className="h-4 w-4" />
          작업자 추가 ({enrolled.length}/26)
        </Button>

        <p className="text-xs text-zinc-500">
          데이터는 브라우저 localStorage에 임시 저장됩니다 (Mock 모드)
        </p>
      </div>

      {showAddModal && (
        <AddWorkerModal
          available={availableWorkers}
          onClose={() => setShowAddModal(false)}
          onAdd={enrollWorkers}
          remainingSlots={26 - enrolled.length}
        />
      )}
    </main>
  );
}

function CellInput({ value, onChange }: { value: number | null; onChange: (n: number | null) => void }) {
  const [text, setText] = useState(value?.toString() ?? '');
  useEffect(() => setText(value?.toString() ?? ''), [value]);

  return (
    <input
      className="cell-input"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const t = text.trim();
        if (t === '') { onChange(null); return; }
        const n = Number(t);
        if (!Number.isFinite(n) || n < 0) { setText(value?.toString() ?? ''); return; }
        onChange(n);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setText(value?.toString() ?? ''); (e.target as HTMLInputElement).blur(); }
      }}
      inputMode="decimal"
    />
  );
}

function AddWorkerModal({
  available,
  onClose,
  onAdd,
  remainingSlots,
}: {
  available: MockWorker[];
  onClose: () => void;
  onAdd: (ids: string[]) => void;
  remainingSlots: number;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else if (next.size < remainingSlots) next.add(id);
    setSelected(next);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">작업자 추가</h2>
            <p className="text-xs text-zinc-500 mt-0.5">최대 {remainingSlots}명까지 선택 가능</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {available.length === 0 ? (
            <p className="p-8 text-center text-sm text-zinc-500">추가 가능한 작업자가 없습니다.</p>
          ) : (
            available.map(w => {
              const isSelected = selected.has(w.id);
              return (
                <label
                  key={w.id}
                  className={`flex items-center gap-3 rounded-lg p-3 cursor-pointer transition ${
                    isSelected ? 'bg-blue-50' : 'hover:bg-zinc-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(w.id)}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  <div className="flex-1">
                    <p className="font-medium">{w.name}</p>
                    <p className="text-xs text-zinc-500">{w.defaultTrade ?? '공종 미정'} · 일당 {w.defaultWage.toLocaleString()}원</p>
                  </div>
                </label>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-6 py-4">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button disabled={selected.size === 0} onClick={() => onAdd(Array.from(selected))}>
            {selected.size}명 추가
          </Button>
        </div>
      </div>
    </div>
  );
}
