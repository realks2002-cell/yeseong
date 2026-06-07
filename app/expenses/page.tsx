'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { PhotoViewer, type Photo } from '@/components/photo-viewer';
import {
  Receipt, ChevronLeft, ChevronRight, Download, Loader2,
  List, LayoutGrid, ScanLine, Pencil, X,
} from 'lucide-react';
import { downloadFile } from '@/lib/utils/download';

// 비용처리 — 팀장앱 증빙의 '비용·영수증'(expense) 사진을 AI(OCR)로 분석해
//   날짜(요일)/상점/금액/현장/팀장 리스트로 보여준다. 업로드는 팀장앱 전용.

type ApiPhoto = {
  id: string;
  worker_id: string;
  worker_name: string;
  worksite_id: string;
  worksite_name: string;
  photo_date: string;
  memo: string | null;
  uploaded_at: string;
  signed_url: string | null;
  receipt_store: string | null;
  receipt_amount: number | null;
  receipt_date: string | null;
  ocr_status: 'pending' | 'done' | 'failed' | null;
};

type Option = { id: string; name: string };

function currentYm(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60_000);
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, '0')}`;
}

function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
}

function fmtDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${dow})`;
}

function fmtWon(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`;
}

export default function ExpensesPage() {
  const [ym, setYm] = useState(currentYm());
  const [siteId, setSiteId] = useState('');
  const [sites, setSites] = useState<Option[]>([]);
  const [photos, setPhotos] = useState<ApiPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrMsg, setOcrMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<ApiPhoto | null>(null);

  useEffect(() => {
    fetch('/api/worksites?includeArchived=true', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Array<{ id: string; name: string }>) => setSites(list.map((w) => ({ id: w.id, name: w.name }))))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const { from, to } = monthRange(ym);
    const qs = new URLSearchParams({ category: 'expense', from, to });
    if (siteId) qs.set('worksite', siteId);
    const r = await fetch(`/api/admin/site-photos?${qs.toString()}`, { cache: 'no-store' });
    if (!r.ok) {
      setError('목록을 불러오지 못했습니다');
      setPhotos([]);
      return;
    }
    const json = await r.json();
    setPhotos((json.photos ?? []) as ApiPhoto[]);
  }, [ym, siteId]);

  useEffect(() => { load(); }, [load]);

  // 리스트 행 — 영수증 날짜(없으면 제출일) 최신순
  const rows = useMemo(() => {
    return (photos ?? [])
      .map((p) => ({ ...p, eff_date: p.receipt_date ?? p.photo_date }))
      .sort((a, b) => b.eff_date.localeCompare(a.eff_date) || b.uploaded_at.localeCompare(a.uploaded_at));
  }, [photos]);

  const unanalyzed = useMemo(
    () => (photos ?? []).filter((p) => p.ocr_status !== 'done'),
    [photos],
  );

  const totals = useMemo(() => {
    const withAmount = (photos ?? []).filter((p) => p.receipt_amount !== null);
    const sum = withAmount.reduce((acc, p) => acc + (p.receipt_amount ?? 0), 0);
    // 현장별 합계
    const bySite = new Map<string, number>();
    for (const p of withAmount) {
      bySite.set(p.worksite_name, (bySite.get(p.worksite_name) ?? 0) + (p.receipt_amount ?? 0));
    }
    return { sum, counted: withAmount.length, bySite: Array.from(bySite.entries()).sort((a, b) => b[1] - a[1]) };
  }, [photos]);

  // 사진 보기 — 날짜별 그룹 (기존 모아보기)
  const groups = useMemo(() => {
    const map = new Map<string, ApiPhoto[]>();
    for (const p of photos ?? []) {
      if (!map.has(p.photo_date)) map.set(p.photo_date, []);
      map.get(p.photo_date)!.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [photos]);

  const runOcr = async () => {
    if (ocrBusy || unanalyzed.length === 0) return;
    setOcrBusy(true);
    setOcrMsg(null);
    try {
      let done = 0;
      let failed = 0;
      // 남은 건이 없을 때까지 반복 호출 (1회 최대 10건 처리)
      for (let i = 0; i < 20; i++) {
        const r = await fetch('/api/admin/receipt-ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || '분석 실패');
        done += json.done ?? 0;
        failed += json.failed ?? 0;
        setOcrMsg(`분석 중... 완료 ${done}건${failed ? ` · 실패 ${failed}건` : ''}`);
        if (!json.remaining) break;
      }
      setOcrMsg(`분석 완료 ${done}건${failed ? ` · 실패 ${failed}건 (사진 화질 확인 후 재분석 또는 직접 수정)` : ''}`);
      await load();
    } catch (e) {
      setOcrMsg((e as Error).message);
    } finally {
      setOcrBusy(false);
    }
  };

  const reanalyzeOne = async (id: string) => {
    if (ocrBusy) return;
    setOcrBusy(true);
    setOcrMsg(null);
    try {
      const r = await fetch('/api/admin/receipt-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_ids: [id] }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || '분석 실패');
      if (json.failed) setOcrMsg(`인식 실패: ${(json.errors ?? []).join(', ') || '사진을 읽지 못했습니다'}`);
      await load();
    } catch (e) {
      setOcrMsg((e as Error).message);
    } finally {
      setOcrBusy(false);
    }
  };

  const handleDownload = async (p: ApiPhoto) => {
    if (!p.signed_url || downloadingId) return;
    setDownloadingId(p.id);
    try {
      await downloadFile(p.signed_url, `영수증_${p.photo_date}_${p.worker_name}`);
    } catch {
      alert('다운로드에 실패했습니다.');
    } finally {
      setDownloadingId(null);
    }
  };

  const openViewer = (p: ApiPhoto) => {
    if (!p.signed_url) return;
    setViewing({
      url: p.signed_url,
      label: `영수증 · ${p.worker_name} · ${p.worksite_name}`,
      uploadedAt: p.uploaded_at,
      memo: p.memo ?? undefined,
    });
  };

  return (
    <AdminShell>
      <div className="max-w-6xl p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-[#447D9B]" />
            비용처리
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            팀장이 앱(현장증빙 → 비용·영수증)으로 올린 영수증을 AI가 읽어 상점·금액·날짜를 정리합니다.
          </p>
        </div>

        {/* 필터 + 보기 전환 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-[5px] border border-[#D7D7D7] bg-white px-1 py-1">
            <button onClick={() => setYm(shiftYm(ym, -1))} className="rounded p-1 hover:bg-[#F5F5F5]">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-sm font-bold tabular-nums">
              {ym.replace('-', '년 ')}월
            </span>
            <button onClick={() => setYm(shiftYm(ym, 1))} className="rounded p-1 hover:bg-[#F5F5F5]">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="h-9 rounded-[5px] border border-[#D7D7D7] bg-white px-2 text-sm"
          >
            <option value="">전체 현장</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {photos !== null && (
            <>
              <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                {photos.length}건
              </span>
              {totals.counted > 0 && (
                <span className="rounded-full bg-[#273F4F] px-3 py-1 text-xs font-bold text-white tabular-nums">
                  합계 {fmtWon(totals.sum)}
                </span>
              )}
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-[5px] border border-[#D7D7D7] bg-white p-0.5">
              <button
                onClick={() => setView('list')}
                className={`flex items-center gap-1 rounded-[4px] px-2.5 py-1 text-xs font-semibold ${
                  view === 'list' ? 'bg-[#273F4F] text-white' : 'text-[#4B5563] hover:bg-[#F5F5F5]'
                }`}
              >
                <List className="h-3.5 w-3.5" /> 리스트
              </button>
              <button
                onClick={() => setView('grid')}
                className={`flex items-center gap-1 rounded-[4px] px-2.5 py-1 text-xs font-semibold ${
                  view === 'grid' ? 'bg-[#273F4F] text-white' : 'text-[#4B5563] hover:bg-[#F5F5F5]'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> 사진
              </button>
            </div>
            {unanalyzed.length > 0 && (
              <button
                onClick={runOcr}
                disabled={ocrBusy}
                className="flex items-center gap-1.5 rounded-[5px] bg-[#447D9B] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#366379] disabled:opacity-50"
              >
                {ocrBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
                미분석 {unanalyzed.length}건 분석
              </button>
            )}
          </div>
        </div>

        {error && <p className="rounded-[5px] bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        {ocrMsg && <p className="rounded-[5px] bg-blue-50 p-3 text-sm font-semibold text-blue-800">{ocrMsg}</p>}

        {photos === null ? (
          <p className="py-10 text-center text-sm text-[#9CA3AF]">불러오는 중...</p>
        ) : photos.length === 0 ? (
          <Card className="py-12 text-center text-sm text-[#9CA3AF]">
            이 달에 등록된 영수증이 없습니다. 팀장앱 현장증빙에서 비용·영수증으로 올리면 표시됩니다.
          </Card>
        ) : view === 'list' ? (
          <>
            {/* 리스트 보기 */}
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] whitespace-nowrap [&_th]:border-r [&_th]:border-r-[#EAEAEA] [&_td]:border-r [&_td]:border-r-[#EAEAEA] [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
                  <thead className="bg-[#F5F5F5] text-[#4B5563]">
                    <tr className="text-center">
                      <th className="px-3 py-2 font-medium w-10">#</th>
                      <th className="px-3 py-2 font-medium">날짜 (요일)</th>
                      <th className="px-3 py-2 font-medium">상점</th>
                      <th className="px-3 py-2 font-medium">금액</th>
                      <th className="px-3 py-2 font-medium">현장</th>
                      <th className="px-3 py-2 font-medium">팀장</th>
                      <th className="px-3 py-2 font-medium">상태</th>
                      <th className="px-3 py-2 font-medium w-16">사진</th>
                      <th className="px-3 py-2 font-medium w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EAEAEA]">
                    {rows.map((p, i) => (
                      <tr key={p.id} className="hover:bg-[#F9FAFB]">
                        <td className="px-3 py-2 text-center text-[#9CA3AF] tabular-nums">{i + 1}</td>
                        <td className="px-3 py-2 text-center tabular-nums">
                          {fmtDay(p.eff_date)}
                          {!p.receipt_date && (
                            <span className="ml-1 text-[9px] text-[#9CA3AF]">(제출일)</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium">
                          {p.receipt_store ?? <span className="text-[#9CA3AF]">-</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums">
                          {p.receipt_amount !== null ? fmtWon(p.receipt_amount) : <span className="font-normal text-[#9CA3AF]">-</span>}
                        </td>
                        <td className="px-3 py-2 text-[#4B5563]">{p.worksite_name}</td>
                        <td className="px-3 py-2 text-[#4B5563]">{p.worker_name}</td>
                        <td className="px-3 py-2 text-center">
                          {p.ocr_status === 'done' && (
                            <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">인식완료</span>
                          )}
                          {p.ocr_status === 'failed' && (
                            <button
                              onClick={() => reanalyzeOne(p.id)}
                              disabled={ocrBusy}
                              title="다시 분석"
                              className="rounded bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              실패 · 재분석
                            </button>
                          )}
                          {p.ocr_status === 'pending' && (
                            <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">대기</span>
                          )}
                          {p.ocr_status === null && (
                            <span className="rounded bg-[#F5F5F5] px-2 py-0.5 text-[10px] font-bold text-[#6B7280]">미분석</span>
                          )}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {p.signed_url ? (
                            <button
                              type="button"
                              onClick={() => openViewer(p)}
                              className="inline-block h-10 w-14 overflow-hidden rounded border border-[#EAEAEA] bg-[#F5F5F5]"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.signed_url} alt="영수증" className="h-full w-full object-cover" loading="lazy" />
                            </button>
                          ) : (
                            <span className="text-[#9CA3AF]">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setEditing(p)}
                              title="직접 수정"
                              className="rounded p-1.5 text-[#447D9B] hover:bg-[#F5F5F5]"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDownload(p)}
                              disabled={!p.signed_url || downloadingId === p.id}
                              title="다운로드"
                              className="rounded p-1.5 text-[#447D9B] hover:bg-[#F5F5F5] disabled:opacity-40"
                            >
                              {downloadingId === p.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {totals.counted > 0 && (
                    <tfoot className="border-t-2 border-[#D7D7D7] bg-[#F5F5F5] font-bold">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-right">합계 ({totals.counted}건 인식)</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtWon(totals.sum)}</td>
                        <td colSpan={5} className="px-3 py-2 text-[10px] font-normal text-[#6B7280]">
                          금액 미인식 {photos.length - totals.counted}건 제외
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </Card>

            {/* 현장별 합계 — 전체 현장 보기에서만 */}
            {!siteId && totals.bySite.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {totals.bySite.map(([name, sum]) => (
                  <span key={name} className="rounded-full border border-[#D7D7D7] bg-white px-3 py-1 text-xs font-semibold text-[#4B5563] tabular-nums">
                    {name} · {fmtWon(sum)}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          /* 사진 보기 — 날짜별 그룹 */
          <div className="space-y-5">
            {groups.map(([date, list]) => (
              <div key={date}>
                <h2 className="mb-2 text-sm font-bold text-[#091413]">
                  {fmtDay(date)}
                  <span className="ml-2 text-xs font-semibold text-[#9CA3AF]">{list.length}건</span>
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {list.map((p) => (
                    <Card key={p.id} className="overflow-hidden p-0">
                      <button
                        type="button"
                        onClick={() => openViewer(p)}
                        className="block aspect-[4/3] w-full bg-[#F5F5F5]"
                      >
                        {p.signed_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.signed_url} alt="영수증" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <span className="flex h-full items-center justify-center text-xs text-[#9CA3AF]">미리보기 불가</span>
                        )}
                      </button>
                      <div className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-[#091413]">
                            {p.receipt_store ?? `${p.worker_name} 팀장`}
                            {p.receipt_amount !== null && (
                              <span className="ml-1.5 text-[#447D9B] tabular-nums">{fmtWon(p.receipt_amount)}</span>
                            )}
                          </p>
                          <p className="truncate text-[11px] text-[#6B7280]">{p.worksite_name} · {p.worker_name}</p>
                          {p.memo && <p className="truncate text-[11px] text-[#4B5563]">{p.memo}</p>}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownload(p)}
                          disabled={!p.signed_url || downloadingId === p.id}
                          className="shrink-0 rounded p-1.5 text-[#447D9B] hover:bg-[#F5F5F5] disabled:opacity-40"
                          title="다운로드"
                        >
                          {downloadingId === p.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <EditModal
          photo={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
    </AdminShell>
  );
}

// 인식 결과 직접 수정 모달
function EditModal({
  photo,
  onClose,
  onSaved,
}: {
  photo: ApiPhoto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [store, setStore] = useState(photo.receipt_store ?? '');
  const [amount, setAmount] = useState(photo.receipt_amount !== null ? String(photo.receipt_amount) : '');
  const [date, setDate] = useState(photo.receipt_date ?? photo.photo_date);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch('/api/admin/receipt-ocr', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photo_id: photo.id,
          store: store.trim(),
          amount: amount.trim() === '' ? null : amount.trim(),
          date: date || null,
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || '저장 실패');
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-[5px] bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#091413]">영수증 정보 수정</h3>
          <button onClick={onClose} className="rounded p-1 text-[#6B7280] hover:bg-[#F5F5F5]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {photo.signed_url && (
          <div className="mb-4 max-h-40 overflow-hidden rounded border border-[#EAEAEA] bg-[#F5F5F5]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.signed_url} alt="영수증" className="w-full object-contain" />
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#4B5563]">상점</label>
            <input
              value={store}
              onChange={(e) => setStore(e.target.value)}
              placeholder="예: GS25 ○○점"
              className="h-9 w-full rounded-[5px] border border-[#D7D7D7] px-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#4B5563]">금액 (원)</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
              placeholder="예: 12500"
              className="h-9 w-full rounded-[5px] border border-[#D7D7D7] px-2 text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#4B5563]">날짜</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 w-full rounded-[5px] border border-[#D7D7D7] px-2 text-sm"
            />
          </div>
        </div>

        {err && <p className="mt-3 rounded-[5px] bg-red-50 p-2 text-xs text-red-600">{err}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-[5px] border border-[#D7D7D7] bg-white px-4 py-2 text-xs font-semibold text-[#4B5563] hover:bg-[#F5F5F5]"
          >
            취소
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-[5px] bg-[#273F4F] px-4 py-2 text-xs font-bold text-white hover:bg-[#1d303d] disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
