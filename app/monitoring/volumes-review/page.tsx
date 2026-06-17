'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, X, RefreshCw, Search, Pencil, Plus } from 'lucide-react';
import { formatPhone } from '@/lib/auth/phone-email';
import { categoryTypes } from '@/lib/constants/masonry';
import {
  MasonryVolumeModal,
  type MasonryPriceOption,
  type ExistingVolume,
} from '@/components/masonry-volume-modal';

type Row = {
  id: string;
  payroll_worker_id: string;
  category: string;
  type_name: string | null;
  size_spec: string | null;
  unit: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  approval_status: 'pending_admin' | 'approved' | 'rejected_admin';
  rejection_reason: string | null;
  approved_at: string | null;
  created_at: string;
  year_month: string;
  worker_id: string;
  worker_name: string;
  worker_phone: string | null;
  worksite_id: string;
  worksite_name: string;
  subcontractor_name: string | null;
};

type StatusFilter = 'pending_admin' | 'approved' | 'rejected_admin';

const STATUS_LABEL: Record<StatusFilter, string> = {
  pending_admin: '검토 대기',
  approved: '승인',
  rejected_admin: '반려',
};

const STATUS_STYLE: Record<StatusFilter, string> = {
  pending_admin: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected_admin: 'bg-red-50 text-red-700',
};

function itemLabel(r: Row): string {
  if (r.category === '조적') {
    return `조적 · ${r.type_name ?? ''}${r.size_spec ? ` (${r.size_spec})` : ''}`;
  }
  if (categoryTypes(r.category)) {
    return `${r.category} ${r.type_name ?? ''}${r.unit ? ` · ${r.unit}` : ''}`;
  }
  return `${r.category}${r.unit ? ` · ${r.unit}` : ''}`;
}

export default function VolumesReviewPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending_admin');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [reasonModal, setReasonModal] = useState<{ ids: string[] } | null>(null);
  const [editLoadingId, setEditLoadingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<
    { row: Row; prices: MasonryPriceOption[]; existing: ExistingVolume[] } | null
  >(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addTarget, setAddTarget] = useState<
    { worker: { id: string; name: string }; siteId: string; yearMonth: string; prices: MasonryPriceOption[] } | null
  >(null);

  const load = useCallback(async () => {
    setError(null);
    const r = await fetch('/api/admin/volumes-review', { cache: 'no-store' });
    if (!r.ok) {
      setError('목록을 불러오지 못했습니다');
      setRows([]);
      return;
    }
    setRows(await r.json());
    setSelected(new Set());
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    if (!rows) return null;
    const raw = query.trim().toLowerCase();
    const digits = raw.replace(/\D/g, '');
    return rows.filter((r) => {
      if (r.approval_status !== statusFilter) return false;
      if (!raw) return true;
      if (r.worker_name?.toLowerCase().includes(raw)) return true;
      if (r.worksite_name?.toLowerCase().includes(raw)) return true;
      if (r.subcontractor_name?.toLowerCase().includes(raw)) return true;
      if (r.category?.toLowerCase().includes(raw)) return true;
      if (digits && (r.worker_phone ?? '').replace(/\D/g, '').includes(digits)) return true;
      return false;
    });
  }, [rows, query, statusFilter]);

  const allChecked = useMemo(() => {
    if (!visible || visible.length === 0) return false;
    return visible.every((r) => selected.has(r.id));
  }, [visible, selected]);

  const toggleAll = () => {
    if (!visible) return;
    setSelected(allChecked ? new Set() : new Set(visible.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  async function bulk(approve: boolean, ids: string[], reason?: string) {
    if (busy || ids.length === 0) return;
    setBusy(true);
    setError(null);
    const r = await fetch('/api/admin/volumes-review', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, approve, reason: reason ?? null }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? '처리 실패');
      return;
    }
    await load();
  }

  const approveSelected = () => bulk(true, Array.from(selected));
  const rejectSelected = () => setReasonModal({ ids: Array.from(selected) });
  const approveOne = (id: string) => bulk(true, [id]);
  const rejectOne = (id: string) => setReasonModal({ ids: [id] });

  async function openEdit(row: Row) {
    if (editLoadingId) return;
    setEditLoadingId(row.id);
    setError(null);
    try {
      const [pr, vr] = await Promise.all([
        fetch(`/api/masonry-prices?worksiteId=${row.worksite_id}`, { cache: 'no-store' }),
        fetch(`/api/payroll/${row.worksite_id}/${row.year_month}/volumes`, { cache: 'no-store' }),
      ]);
      if (!pr.ok || !vr.ok) throw new Error('단가/성과를 불러오지 못했습니다');
      const prices: MasonryPriceOption[] = await pr.json();
      const allVolumes: ExistingVolume[] = await vr.json();
      const existing = allVolumes.filter((v) => v.payroll_worker_id === row.payroll_worker_id);
      setEditTarget({ row, prices, existing });
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setEditLoadingId(null);
    }
  }

  // 추가 picker 확정 → 현장 단가 로드 후 입력 모달 열기
  async function startAdd(worker: { id: string; name: string }, siteId: string, yearMonth: string) {
    const pr = await fetch(`/api/masonry-prices?worksiteId=${siteId}`, { cache: 'no-store' });
    if (!pr.ok) { setError('단가를 불러오지 못했습니다'); return; }
    const prices: MasonryPriceOption[] = await pr.json();
    setAddOpen(false);
    setAddTarget({ worker, siteId, yearMonth, prices });
  }

  const isPending = statusFilter === 'pending_admin';
  const colCount = (isPending ? 1 : 0) + 7 + 1;

  return (
    <AdminShell>
      <div className="w-full p-6">
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">매사 성과 검토</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setAddOpen(true)} disabled={busy}>
              <Plus className="h-4 w-4" />
              성과 추가
            </Button>
            <Button variant="outline" onClick={load} disabled={busy}>
              <RefreshCw className="h-4 w-4" />
              새로고침
            </Button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(['pending_admin', 'approved', 'rejected_admin'] as StatusFilter[]).map((s) => (
            <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {STATUS_LABEL[s]}
            </FilterChip>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 · 전화번호 · 현장 · 카테고리 검색"
              className="w-full rounded-[5px] border border-[#D7D7D7] bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-[#447D9B] focus:ring-2 focus:ring-[#447D9B]/30"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#9CA3AF] hover:bg-[#F5F5F5] hover:text-[#091413]"
                aria-label="검색어 지우기"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <span className="ml-auto text-sm text-[#6B7280]">{visible?.length ?? '...'}건</span>
        </div>

        {isPending && selected.size > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-[5px] bg-[#F5F5F5] px-3 py-2 text-sm">
            <span className="font-medium">{selected.size}건 선택</span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" onClick={approveSelected} disabled={busy}>
                <Check className="h-3.5 w-3.5" />
                선택 승인
              </Button>
              <Button size="sm" variant="outline" onClick={rejectSelected} disabled={busy}>
                <X className="h-3.5 w-3.5" />
                선택 반려
              </Button>
            </div>
          </div>
        )}

        {error && <p className="mb-4 rounded-[5px] bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] whitespace-nowrap [&_th]:border-r [&_th]:border-r-[#EAEAEA] [&_td]:border-r [&_td]:border-r-[#EAEAEA] [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
              <thead className="bg-[#F5F5F5] text-[#6B7280]">
                <tr className="text-center text-[11px]">
                  {isPending && (
                    <th className="px-3 py-2 w-10">
                      <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="전체 선택" />
                    </th>
                  )}
                  <th className="px-3 py-2 font-medium">월</th>
                  <th className="px-3 py-2 font-medium">작업자</th>
                  <th className="px-3 py-2 font-medium">현장</th>
                  <th className="px-3 py-2 font-medium">항목</th>
                  <th className="px-3 py-2 font-medium text-center">수량</th>
                  <th className="px-3 py-2 font-medium text-center">금액</th>
                  <th className="px-3 py-2 font-medium text-center">상태</th>
                  <th className="px-3 py-2 font-medium text-center w-32">처리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D7D7D7]">
                {visible === null ? (
                  <tr><td colSpan={colCount} className="py-10 text-center text-[#9CA3AF]">불러오는 중...</td></tr>
                ) : visible.length === 0 ? (
                  <tr><td colSpan={colCount} className="py-10 text-center text-[#9CA3AF]">
                    {query ? '검색 결과가 없습니다.' : '해당 상태의 성과가 없습니다.'}
                  </td></tr>
                ) : (
                  visible.map((r) => (
                    <tr key={r.id} className="hover:bg-[#F5F5F5]">
                      {isPending && (
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => toggleOne(r.id)}
                            aria-label={`${r.worker_name} 선택`}
                          />
                        </td>
                      )}
                      <td className="px-3 py-2 tabular-nums">{r.year_month}</td>
                      <td className="px-3 py-2 font-medium">
                        {r.worker_name}
                        {r.worker_phone && <span className="ml-1 text-[10px] text-[#9CA3AF] font-mono">{formatPhone(r.worker_phone)}</span>}
                      </td>
                      <td className="px-3 py-2 text-[#4B5563]">{r.worksite_name}</td>
                      <td className="px-3 py-2">{itemLabel(r)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.quantity}{r.unit ?? ''}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{r.amount.toLocaleString()}원</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`rounded-[5px] px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[r.approval_status]}`}>
                          {STATUS_LABEL[r.approval_status]}
                        </span>
                        {r.approval_status === 'rejected_admin' && r.rejection_reason && (
                          <span className="ml-1 text-[10px] text-[#9CA3AF]">{r.rejection_reason}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openEdit(r)}
                            disabled={busy || editLoadingId !== null}
                            className="rounded p-1 text-[#447D9B] hover:bg-[#447D9B]/10 disabled:opacity-40"
                            aria-label="수정"
                            title="수정"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {isPending && (
                            <>
                              <button
                                onClick={() => approveOne(r.id)}
                                disabled={busy}
                                className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
                                aria-label="승인"
                                title="승인"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => rejectOne(r.id)}
                                disabled={busy}
                                className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-40"
                                aria-label="반려"
                                title="반려"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {reasonModal && (
        <ReasonModal
          count={reasonModal.ids.length}
          onCancel={() => setReasonModal(null)}
          onSubmit={async (reason) => {
            const ids = reasonModal.ids;
            setReasonModal(null);
            await bulk(false, ids, reason);
          }}
        />
      )}

      {editTarget && (
        <MasonryVolumeModal
          workerName={editTarget.row.worker_name}
          payrollWorkerId={editTarget.row.payroll_worker_id}
          siteId={editTarget.row.worksite_id}
          yearMonth={editTarget.row.year_month}
          existing={editTarget.existing}
          prices={editTarget.prices}
          title={`성과 수정 (${STATUS_LABEL[editTarget.row.approval_status]})`}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load(); }}
          submit={async (items) => {
            const r = await fetch('/api/admin/volumes-review', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ payroll_worker_id: editTarget.row.payroll_worker_id, items }),
            });
            if (!r.ok) {
              const j = await r.json().catch(() => ({}));
              throw new Error(j.error ?? '저장 실패');
            }
          }}
        />
      )}

      {addOpen && (
        <AddVolumePicker
          onCancel={() => setAddOpen(false)}
          onConfirm={startAdd}
        />
      )}

      {addTarget && (
        <MasonryVolumeModal
          workerName={addTarget.worker.name}
          payrollWorkerId=""
          siteId={addTarget.siteId}
          yearMonth={addTarget.yearMonth}
          existing={[]}
          prices={addTarget.prices}
          title={`성과 추가 입력 · ${addTarget.yearMonth} (즉시 승인)`}
          onClose={() => setAddTarget(null)}
          onSaved={() => { setAddTarget(null); load(); }}
          submit={async (items) => {
            const r = await fetch('/api/admin/volumes-review', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                worker_id: addTarget.worker.id,
                worksite_id: addTarget.siteId,
                year_month: addTarget.yearMonth,
                items,
              }),
            });
            if (!r.ok) {
              const j = await r.json().catch(() => ({}));
              throw new Error(j.error ?? '저장 실패');
            }
          }}
        />
      )}
    </AdminShell>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-[5px] px-3 py-1 text-xs font-semibold transition ' +
        (active ? 'bg-[#273F4F] text-white' : 'bg-white text-[#4B5563] border border-[#D7D7D7] hover:bg-[#F5F5F5]')
      }
    >
      {children}
    </button>
  );
}

function ReasonModal({ count, onCancel, onSubmit }: { count: number; onCancel: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-[5px] bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-[#D7D7D7] px-6 py-4">
          <h2 className="text-lg font-semibold">반려 사유 ({count}건)</h2>
        </div>
        <div className="p-6">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="사유를 입력하세요 (선택)"
            rows={4}
            className="w-full rounded-[5px] border border-[#D7D7D7] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#447D9B]"
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-[#D7D7D7] px-6 py-4">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>취소</Button>
          <Button onClick={() => { setSubmitting(true); onSubmit(reason); }} disabled={submitting}>
            반려 처리
          </Button>
        </div>
      </div>
    </div>
  );
}

type PickWorker = { id: string; name: string; phone: string | null; wage_type: string | null };
type PickSite = { id: string; name: string };

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 성과 추가 picker — 월급/일급 작업자 · 현장 · 월 선택 후 입력 모달로
function AddVolumePicker({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (worker: { id: string; name: string }, siteId: string, yearMonth: string) => void | Promise<void>;
}) {
  const [workers, setWorkers] = useState<PickWorker[] | null>(null);
  const [sites, setSites] = useState<PickSite[] | null>(null);
  const [workerId, setWorkerId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [yearMonth, setYearMonth] = useState(currentMonth());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [wr, sr] = await Promise.all([
        fetch('/api/workers', { cache: 'no-store' }),
        fetch('/api/worksites', { cache: 'no-store' }),
      ]);
      const allWorkers: PickWorker[] = wr.ok ? await wr.json() : [];
      const allSites: PickSite[] = sr.ok ? await sr.json() : [];
      // 매사 성과 대상 = 월급/일급 작업자만
      setWorkers(allWorkers.filter((w) => w.wage_type === '월급/일급'));
      setSites(allSites);
    })();
  }, []);

  const ready = workerId && siteId && /^\d{4}-\d{2}$/.test(yearMonth);

  async function next() {
    if (!ready || busy) return;
    const w = workers?.find((x) => x.id === workerId);
    if (!w) return;
    setBusy(true);
    setErr(null);
    try {
      await onConfirm({ id: w.id, name: w.name }, siteId, yearMonth);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '오류');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-[5px] bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#D7D7D7] px-6 py-4">
          <h2 className="text-lg font-semibold">성과 추가 입력</h2>
          <button onClick={onCancel} className="rounded p-1 text-[#9CA3AF] hover:bg-[#F5F5F5]" aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-6">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#4B5563]">작업자 (월급/일급)</span>
            <select
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              disabled={!workers || busy}
              className="h-10 w-full rounded-[5px] border border-[#D7D7D7] bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#447D9B]"
            >
              <option value="">{workers ? '작업자 선택' : '불러오는 중...'}</option>
              {(workers ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}{w.phone ? ` (${formatPhone(w.phone)})` : ''}
                </option>
              ))}
            </select>
            {workers && workers.length === 0 && (
              <span className="mt-1 block text-xs text-amber-700">월급/일급 작업자가 없습니다.</span>
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#4B5563]">현장</span>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              disabled={!sites || busy}
              className="h-10 w-full rounded-[5px] border border-[#D7D7D7] bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#447D9B]"
            >
              <option value="">{sites ? '현장 선택' : '불러오는 중...'}</option>
              {(sites ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#4B5563]">월</span>
            <input
              type="month"
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
              disabled={busy}
              className="h-10 w-full rounded-[5px] border border-[#D7D7D7] bg-white px-3 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#447D9B]"
            />
          </label>

          {err && <p className="rounded-[5px] bg-red-50 p-2.5 text-sm text-red-600">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#D7D7D7] px-6 py-4">
          <Button variant="outline" onClick={onCancel} disabled={busy}>취소</Button>
          <Button onClick={next} disabled={!ready || busy}>
            {busy ? '여는 중...' : '항목 입력'}
          </Button>
        </div>
      </div>
    </div>
  );
}
