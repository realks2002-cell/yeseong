'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { daysInMonth, formatYearMonth, shiftMonth } from '@/lib/utils/date';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  UserPlus,
  Trash2,
  X,
} from 'lucide-react';
import { MasonryVolumeModal, type MasonryPriceOption, type ExistingVolume } from '@/components/masonry-volume-modal';

type Worker = {
  id: string;
  employee_code: string | null;
  name: string;
  default_trade: string | null;
  default_wage: number;
  wage_type: string | null;
};

type Subcontractor = { id: string; name: string };

type Slot = {
  id: string;
  slot_number: number;
  daily_wage: number;
  trade: string | null;
  worker: Worker;
  subcontractor: Subcontractor | null;
};

type AttendanceRow = {
  payroll_worker_id: string;
  work_date: string;
  hours: number;
};

type Props = {
  siteId: string;
  siteName: string;
  yearMonth: string;
};

// 성과 내역 표기용 — 단위는 DB값 우선, 없으면 분류로 추정
const CATEGORY_UNIT: Record<string, string> = { 조적: '장', 미장: '㎡' };
function volumeItemLabel(v: ExistingVolume): string {
  return [v.type_name, v.size_spec].filter(Boolean).join(' ') || v.category;
}
function volumeUnitLabel(v: ExistingVolume): string {
  return v.unit ?? CATEGORY_UNIT[v.category] ?? '';
}

export function PayrollGrid({ siteId, siteName, yearMonth }: Props) {
  const router = useRouter();
  const totalDays = daysInMonth(yearMonth);
  const [yy, mm] = yearMonth.split('-').map(Number);
  // 일자 헤더 색: 일요일 빨강 · 토요일 파랑 · 평일 회색
  const dayHeadColor = (d: number): string => {
    const wd = new Date(yy, mm - 1, d).getDay();
    return wd === 0 ? 'text-red-500' : wd === 6 ? 'text-blue-500' : 'text-[#6B7280]';
  };

  const [slots, setSlots] = useState<Slot[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [volumes, setVolumes] = useState<ExistingVolume[]>([]);
  const [prices, setPrices] = useState<MasonryPriceOption[]>([]);
  const [allWorkers, setAllWorkers] = useState<Worker[]>([]);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [volumeSlot, setVolumeSlot] = useState<Slot | null>(null);
  const [view, setView] = useState<'general' | 'masonry'>('general');

  const load = useCallback(async () => {
    setError(null);
    const [r1, r2, r3, r4, r5] = await Promise.all([
      fetch(`/api/payroll/${siteId}/${yearMonth}`, { cache: 'no-store' }),
      fetch(`/api/workers`, { cache: 'no-store' }),
      fetch(`/api/subcontractors`, { cache: 'no-store' }),
      fetch(`/api/payroll/${siteId}/${yearMonth}/volumes`, { cache: 'no-store' }),
      fetch(`/api/masonry-prices?worksiteId=${siteId}`, { cache: 'no-store' }),
    ]);
    if (!r1.ok) {
      setError(`노임대장 로드 실패: ${r1.status}`);
      return;
    }
    if (!r2.ok) {
      setError(`작업자 마스터 로드 실패: ${r2.status}`);
      return;
    }
    if (!r3.ok) {
      setError(`전문건설사 로드 실패: ${r3.status}`);
      return;
    }
    const data = await r1.json();
    const workersAll = await r2.json();
    const subs = await r3.json();
    const vols: ExistingVolume[] = r4.ok ? await r4.json() : [];
    const pricesAll: MasonryPriceOption[] = r5.ok ? await r5.json() : [];
    setSlots(data.slots ?? []);
    setAttendance(data.attendance ?? []);
    setVolumes(vols);
    setPrices(pricesAll);
    setAllWorkers(workersAll ?? []);
    setSubcontractors(subs ?? []);
    setLoaded(true);
  }, [siteId, yearMonth]);

  useEffect(() => { load(); }, [load]);

  const cellMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of attendance) {
      const day = parseInt(a.work_date.split('-')[2], 10);
      m.set(`${a.payroll_worker_id}:${day}`, a.hours);
    }
    return m;
  }, [attendance]);

  const enrolledWorkerIds = useMemo(() => new Set(slots.map((s) => s.worker.id)), [slots]);
  const subMap = useMemo(() => new Map(subcontractors.map((s) => [s.id, s.name])), [subcontractors]);

  // payroll_worker_id → sum(amount)
  const volumeSumMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of volumes) {
      m.set(v.payroll_worker_id, (m.get(v.payroll_worker_id) ?? 0) + v.amount);
    }
    return m;
  }, [volumes]);

  const volumesByWorker = useMemo(() => {
    const m = new Map<string, ExistingVolume[]>();
    for (const v of volumes) {
      const arr = m.get(v.payroll_worker_id) ?? [];
      arr.push(v);
      m.set(v.payroll_worker_id, arr);
    }
    return m;
  }, [volumes]);

  async function setCell(slotId: string, day: number, hours: number | null) {
    const newHours = hours ?? 0;

    setAttendance((prev) => {
      const filtered = prev.filter(
        (a) => !(a.payroll_worker_id === slotId && parseInt(a.work_date.split('-')[2], 10) === day),
      );
      if (newHours > 0) {
        const dd = String(day).padStart(2, '0');
        filtered.push({ payroll_worker_id: slotId, work_date: `${yearMonth}-${dd}`, hours: newHours });
      }
      return filtered;
    });

    const r = await fetch(`/api/payroll/${siteId}/${yearMonth}/attendance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payroll_worker_id: slotId, day, hours: newHours }),
    });
    if (!r.ok) {
      alert(`출역 저장 실패: ${(await r.json().catch(() => ({}))).error ?? r.status}`);
      load();
    }
  }

  async function patchSlot(slotId: string, patch: { subcontractor_id?: string | null }) {
    setSlots((prev) => prev.map((s) => (s.id === slotId
      ? {
          ...s,
          subcontractor: patch.subcontractor_id !== undefined
            ? (patch.subcontractor_id ? { id: patch.subcontractor_id, name: subMap.get(patch.subcontractor_id) ?? '' } : null)
            : s.subcontractor,
        }
      : s)));

    const r = await fetch(`/api/payroll/${siteId}/${yearMonth}/workers/${slotId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!r.ok) {
      alert(`슬롯 수정 실패: ${(await r.json().catch(() => ({}))).error ?? r.status}`);
      load();
    }
  }

  async function enrollWorker(workerId: string) {
    const r = await fetch(`/api/payroll/${siteId}/${yearMonth}/workers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: workerId }),
    });
    if (!r.ok) {
      alert(`작업자 추가 실패: ${(await r.json().catch(() => ({}))).error ?? r.status}`);
      return false;
    }
    return true;
  }

  async function enrollWorkers(ids: string[]) {
    for (const id of ids) {
      const ok = await enrollWorker(id);
      if (!ok) break;
    }
    setShowAddModal(false);
    load();
  }

  async function removeSlot(slotId: string, name: string) {
    if (!confirm(`"${name}" 작업자를 노임대장에서 제외할까요? 출역도 함께 삭제됩니다.`)) return;
    const r = await fetch(`/api/payroll/${siteId}/${yearMonth}/workers/${slotId}`, { method: 'DELETE' });
    if (!r.ok) {
      alert(`제거 실패: ${(await r.json().catch(() => ({}))).error ?? r.status}`);
      return;
    }
    load();
  }

  const [downloadBusy, setDownloadBusy] = useState<'download' | 'masonry-download' | null>(null);

  async function fetchAndSave(endpoint: 'download' | 'masonry-download', fallbackName: string) {
    if (slots.length === 0) {
      alert('작업자를 1명 이상 추가해주세요.');
      return;
    }
    if (downloadBusy) return;
    setDownloadBusy(endpoint);
    try {
      const res = await fetch(`/api/payroll/${siteId}/${yearMonth}/${endpoint}`);
      if (!res.ok) {
        alert(`다운로드 실패: ${res.status} ${await res.text().catch(() => '')}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('content-disposition') ?? '';
      const m = cd.match(/filename\*?=(?:UTF-8'')?([^;]+)/i);
      a.download = m ? decodeURIComponent(m[1].replace(/"/g, '')) : fallbackName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadBusy(null);
    }
  }
  const handleDownload = () => fetchAndSave('download', `노임대장_${yearMonth}.xlsx`);
  const handleMasonryDownload = () => fetchAndSave('masonry-download', `매사노임대장_${yearMonth}.xlsx`);
  const hasMasonry = slots.some((s) => s.worker.wage_type === '월급/일급');

  // 일반 노임대장 = 일급·월급, 매사 노임대장 = 월급/일급(매사). 탭으로 분리.
  const generalCount = slots.filter((s) => s.worker.wage_type !== '월급/일급').length;
  const masonryCount = slots.filter((s) => s.worker.wage_type === '월급/일급').length;
  const showPerf = view === 'masonry';
  const visibleSlots = slots.filter((s) =>
    showPerf ? s.worker.wage_type === '월급/일급' : s.worker.wage_type !== '월급/일급',
  );
  const colCount = (showPerf ? 10 : 8) + totalDays;

  function dayTotalHours(day: number): number {
    return visibleSlots.reduce((sum, s) => sum + (cellMap.get(`${s.id}:${day}`) ?? 0), 0);
  }

  return (
    <main className="w-full min-w-0 bg-white p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/payroll" className="text-sm text-[#6B7280] hover:text-[#091413]">
          ← 현장 목록
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[#6B7280]">{siteName}</p>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => router.push(`/payroll/${siteId}/${shiftMonth(yearMonth, -1)}`)}
              aria-label="이전 달"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">{formatYearMonth(yearMonth)}</h1>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => router.push(`/payroll/${siteId}/${shiftMonth(yearMonth, 1)}`)}
              aria-label="다음 달"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleDownload} disabled={!!downloadBusy}>
            <Download className="h-4 w-4" />
            {downloadBusy === 'download' ? '생성 중...' : '일반 노임대장'}
          </Button>
          {hasMasonry && (
            <Button variant="outline" onClick={handleMasonryDownload} disabled={!!downloadBusy}>
              <Download className="h-4 w-4" />
              {downloadBusy === 'masonry-download' ? '생성 중...' : '매사 노임대장'}
            </Button>
          )}
        </div>
      </div>

      {error && <p className="mb-4 rounded-[5px] bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <div className="mb-3 inline-flex rounded-[5px] border border-[#D7D7D7] bg-white p-0.5 text-sm">
        <button
          onClick={() => setView('general')}
          className={`rounded-[3px] px-3 py-1.5 font-medium transition ${view === 'general' ? 'bg-[#447D9B] text-white' : 'text-[#6B7280] hover:bg-[#F5F5F5]'}`}
        >
          일반 노임대장 ({generalCount})
        </button>
        <button
          onClick={() => setView('masonry')}
          className={`rounded-[3px] px-3 py-1.5 font-medium transition ${view === 'masonry' ? 'bg-[#447D9B] text-white' : 'text-[#6B7280] hover:bg-[#F5F5F5]'}`}
        >
          매사 노임대장 ({masonryCount})
        </button>
      </div>

      <div className="overflow-auto max-h-[calc(100svh-12rem)] rounded-[5px] border border-[#D7D7D7] bg-white shadow-sm">
        <table className="border-collapse text-[12px]">
          <thead>
            <tr className="whitespace-nowrap text-[11px] text-[#6B7280]">
              <th className="sticky left-0 top-0 z-30 w-10 border-b border-[#D7D7D7] bg-[#F5F5F5] px-3 py-2.5 font-medium">#</th>
              <th className="sticky left-10 top-0 z-30 w-[112px] border-b border-l border-b-[#D7D7D7] border-l-[#EAEAEA] bg-[#F5F5F5] px-3 py-2.5 text-center font-medium">성명</th>
              <th className="sticky left-[152px] top-0 z-30 w-[150px] border-b border-l border-r border-b-[#D7D7D7] border-l-[#EAEAEA] border-r-[#D7D7D7] bg-[#F5F5F5] px-3 py-2.5 text-center font-medium">전문건설사</th>
              <th className="sticky top-0 z-20 min-w-[80px] border-b border-l border-b-[#D7D7D7] border-l-[#EAEAEA] bg-[#F5F5F5] px-3 py-2.5 text-center font-medium">공종</th>
              <th className="sticky top-0 z-20 min-w-[100px] border-b border-l border-b-[#D7D7D7] border-l-[#EAEAEA] bg-[#F5F5F5] px-3 py-2.5 text-center font-medium">일당</th>
              {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => (
                <th key={d} className={`sticky top-0 z-20 w-10 border-b border-l border-b-[#D7D7D7] border-l-[#EAEAEA] bg-[#F5F5F5] px-1.5 py-2.5 text-center font-medium tabular-nums ${dayHeadColor(d)}`}>{d}</th>
              ))}
              <th className="sticky top-0 z-20 w-14 border-b border-l border-b-[#D7D7D7] border-l-[#EAEAEA] bg-[#F5F5F5] px-3 py-2.5 text-center font-medium">공수</th>
              <th className="sticky top-0 z-20 w-14 border-b border-l border-b-[#D7D7D7] border-l-[#EAEAEA] bg-[#F5F5F5] px-3 py-2.5 text-center font-medium">일수</th>
              {showPerf && (
                <>
                  <th className="sticky top-0 z-20 min-w-[190px] border-b border-l border-b-[#D7D7D7] border-l-[#EAEAEA] bg-[#F5F5F5] px-3 py-2.5 text-center font-medium">성과 내역</th>
                  <th className="sticky top-0 z-20 w-28 border-b border-l border-b-[#D7D7D7] border-l-[#EAEAEA] bg-[#F5F5F5] px-3 py-2.5 text-center font-medium">성과(원)</th>
                </>
              )}
              <th className="sticky top-0 z-20 w-16 border-b border-l border-b-[#D7D7D7] border-l-[#EAEAEA] bg-[#F5F5F5] py-2.5 pl-2 pr-5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {!loaded ? (
              <tr><td colSpan={colCount} className="py-12 text-center text-[#091413]">불러오는 중...</td></tr>
            ) : slots.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="py-12 text-center text-[#091413]">
                  아직 작업자가 추가되지 않았습니다. 아래 + 버튼으로 추가하세요.
                </td>
              </tr>
            ) : visibleSlots.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="py-12 text-center text-[#9CA3AF]">
                  {showPerf ? '매사 작업자가 없습니다.' : '일반(일급·월급) 작업자가 없습니다.'}
                </td>
              </tr>
            ) : (
              visibleSlots.map((s, idx) => {
                const sum = Array.from({ length: totalDays }, (_, i) => cellMap.get(`${s.id}:${i + 1}`) ?? 0).reduce((a, b) => a + b, 0);
                const days = Array.from({ length: totalDays }, (_, i) => cellMap.get(`${s.id}:${i + 1}`)).filter((v) => v != null && v > 0).length;
                const stickyBg = 'bg-white group-hover:bg-[#F5F5F5]';
                const volumeAmount = volumeSumMap.get(s.id) ?? 0;
                return (
                  <tr key={s.id} className="group border-b border-[#D7D7D7] hover:bg-[#F5F5F5]">
                    <td className={`sticky left-0 z-10 ${stickyBg} px-3 py-2 text-[#091413] tabular-nums`}>{idx + 1}</td>
                    <td className={`sticky left-10 z-10 w-[112px] border-l border-[#EAEAEA] ${stickyBg} px-3 py-2 font-medium text-center`}>{s.worker.name}</td>
                    <td className={`sticky left-[152px] z-10 w-[150px] border-l border-r border-l-[#EAEAEA] border-r-[#D7D7D7] ${stickyBg} px-1.5 py-1 text-center`}>
                      <SubcontractorSelect
                        value={s.subcontractor?.id ?? ''}
                        options={subcontractors}
                        onChange={(id) => patchSlot(s.id, { subcontractor_id: id || null })}
                      />
                    </td>
                    <td className="border-l border-[#EAEAEA] px-3 py-2 text-center text-[#091413]">
                      {s.worker.default_trade ?? <span className="text-[#9CA3AF]">-</span>}
                    </td>
                    <td className="border-l border-[#EAEAEA] px-3 py-2 text-right tabular-nums text-[#091413]">
                      {s.worker.default_wage > 0 ? s.worker.default_wage.toLocaleString() : <span className="text-[#9CA3AF]">-</span>}
                    </td>
                    {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => {
                      const v = cellMap.get(`${s.id}:${d}`);
                      return (
                        <td key={d} className="border-l border-[#EAEAEA] p-0 text-center tabular-nums">
                          <CellInput
                            value={v ?? null}
                            onChange={(n) => setCell(s.id, d, n)}
                          />
                        </td>
                      );
                    })}
                    <td className="border-l border-[#EAEAEA] bg-white px-2 py-2 text-center font-semibold tabular-nums">{sum || ''}</td>
                    <td className="border-l border-[#EAEAEA] bg-white px-2 py-2 text-center tabular-nums text-[#091413]">{days || ''}</td>
                    {showPerf && (
                      <>
                        <td className="border-l border-[#EAEAEA] bg-white px-3 py-2 text-left align-top text-[11px]">
                          {(volumesByWorker.get(s.id) ?? []).length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              {(volumesByWorker.get(s.id) ?? []).map((v) => (
                                <div key={v.id} className="whitespace-nowrap tabular-nums">
                                  <span className="text-[#091413]">{volumeItemLabel(v)}</span>
                                  <span className="text-[#091413]">
                                    {' '}
                                    {v.quantity.toLocaleString()}
                                    {volumeUnitLabel(v)} × {v.unit_price.toLocaleString()}원
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[#9CA3AF]">입력 전</span>
                          )}
                        </td>
                        <td className="border-l border-[#EAEAEA] bg-white px-2 py-2 text-center text-[12px]">
                          <button
                            onClick={() => setVolumeSlot(s)}
                            className="tabular-nums text-[12px] font-medium text-[#091413] hover:text-[#447D9B] hover:underline"
                          >
                            {volumeAmount > 0 ? volumeAmount.toLocaleString() : <span className="font-normal text-[#9CA3AF]">입력</span>}
                          </button>
                        </td>
                      </>
                    )}
                    <td className="border-l border-[#EAEAEA] py-2 pl-1 pr-5 text-center">
                      <button
                        className="rounded p-1 text-[#9CA3AF] hover:bg-red-50 hover:text-red-600"
                        onClick={() => removeSlot(s.id, s.worker.name)}
                        aria-label="작업자 제거"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
            {visibleSlots.length > 0 && (
              <tr className="border-t-2 border-[#D7D7D7] bg-[#F5F5F5] font-semibold text-[#091413]">
                <td colSpan={5} className="sticky left-0 z-10 bg-[#F5F5F5] px-3 py-2">일자별 합계</td>
                {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => (
                  <td key={d} className="border-l border-[#EAEAEA] px-1.5 py-2 text-center tabular-nums">{dayTotalHours(d) || ''}</td>
                ))}
                <td className="border-l border-[#EAEAEA] bg-[#F5F5F5] px-2 py-2 text-center tabular-nums">
                  {visibleSlots.reduce((s, sl) => s + Array.from({ length: totalDays }, (_, i) => cellMap.get(`${sl.id}:${i + 1}`) ?? 0).reduce((a, b) => a + b, 0), 0)}
                </td>
                <td className="border-l border-[#EAEAEA] bg-[#F5F5F5]"></td>
                {showPerf && (
                  <>
                    <td className="border-l border-[#EAEAEA] bg-[#F5F5F5]"></td>
                    <td className="border-l border-[#EAEAEA] bg-[#F5F5F5] px-2 py-2 text-center tabular-nums text-[12px]">
                      {(() => {
                        const total = visibleSlots.reduce((sum, sl) => sum + (volumeSumMap.get(sl.id) ?? 0), 0);
                        return total > 0 ? total.toLocaleString() : '';
                      })()}
                    </td>
                  </>
                )}
                <td className="border-l border-[#EAEAEA] pr-5"></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Button variant="outline" onClick={() => setShowAddModal(true)} disabled={slots.length >= 26}>
          <UserPlus className="h-4 w-4" />
          작업자 추가 ({slots.length}/26)
        </Button>
      </div>

      {showAddModal && (
        <AddWorkerModal
          available={allWorkers.filter((w) => !enrolledWorkerIds.has(w.id))}
          onClose={() => setShowAddModal(false)}
          onAdd={enrollWorkers}
          remainingSlots={26 - slots.length}
        />
      )}
      {volumeSlot && (
        <MasonryVolumeModal
          workerName={volumeSlot.worker.name}
          payrollWorkerId={volumeSlot.id}
          siteId={siteId}
          yearMonth={yearMonth}
          existing={volumesByWorker.get(volumeSlot.id) ?? []}
          prices={prices}
          onClose={() => setVolumeSlot(null)}
          onSaved={() => {
            setVolumeSlot(null);
            load();
          }}
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
        if (!Number.isFinite(n) || n < 0 || n > 3.0) { setText(value?.toString() ?? ''); return; }
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

function SubcontractorSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Subcontractor[];
  onChange: (id: string) => void;
}) {
  return (
    <select
      className="w-full bg-transparent px-2 py-1.5 text-center text-[12px] text-[#091413] outline-none focus:bg-blue-50 focus:ring-1 focus:ring-blue-300 rounded"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">미배정</option>
      {options.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );
}

function AddWorkerModal({
  available,
  onClose,
  onAdd,
  remainingSlots,
}: {
  available: Worker[];
  onClose: () => void;
  onAdd: (ids: string[]) => void;
  remainingSlots: number;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else if (next.size < remainingSlots) next.add(id);
    setSelected(next);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available;
    return available.filter((w) => w.name.toLowerCase().includes(q) || w.employee_code?.toLowerCase().includes(q));
  }, [available, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-[5px] bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#D7D7D7] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">작업자 추가</h2>
            <p className="text-xs text-[#6B7280] mt-0.5">최대 {remainingSlots}명까지 선택 가능</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-[#6B7280] hover:bg-[#F5F5F5]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-b border-[#D7D7D7] px-6 py-3">
          <input
            className="w-full rounded-[5px] border border-[#D7D7D7] px-3 py-1.5 text-sm"
            placeholder="이름·사번 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-[#6B7280]">
              {available.length === 0 ? '추가 가능한 작업자가 없습니다.' : '검색 결과가 없습니다.'}
            </p>
          ) : (
            filtered.map((w) => {
              const isSelected = selected.has(w.id);
              return (
                <label
                  key={w.id}
                  className={`flex items-center gap-3 rounded-[5px] p-3 cursor-pointer transition ${
                    isSelected ? 'bg-blue-50' : 'hover:bg-[#F5F5F5]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(w.id)}
                    className="h-4 w-4 rounded border-[#D7D7D7]"
                  />
                  <div className="flex-1">
                    <p className="font-medium">
                      {w.name}
                      {w.employee_code && <span className="ml-2 text-xs text-[#9CA3AF] font-mono">[{w.employee_code}]</span>}
                    </p>
                    <p className="text-xs text-[#6B7280]">
                      {w.default_trade ?? '공종 미정'} · 일당 {w.default_wage.toLocaleString()}원
                    </p>
                  </div>
                </label>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[#D7D7D7] px-6 py-4">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button disabled={selected.size === 0} onClick={() => onAdd(Array.from(selected))}>
            {selected.size}명 추가
          </Button>
        </div>
      </div>
    </div>
  );
}
