'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, X, RefreshCw } from 'lucide-react';
import { formatPhone } from '@/lib/auth/phone-email';

type Row = {
  id: string;
  work_date: string;
  hours: number;
  source: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  approved_at: string | null;
  created_at: string;
  worker_id: string;
  worker_name: string;
  worker_phone: string | null;
  worksite_id: string;
  worksite_name: string;
  subcontractor_name: string | null;
  approver_name: string | null;
};

type StatusFilter = 'approved' | 'rejected';

const STATUS_LABEL: Record<Row['approval_status'], string> = {
  pending: '대기',
  approved: '승인',
  rejected: '미승인',
};

const STATUS_STYLE: Record<Row['approval_status'], string> = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
};

function fmtDate(d: string): string {
  return d; // already yyyy-mm-dd
}

export default function AttendanceReviewPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('rejected');
  const [days, setDays] = useState<number>(30);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [reasonModal, setReasonModal] = useState<{ ids: string[] } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams({ days: String(days), status: statusFilter });
    const r = await fetch(`/api/admin/attendance-review?${params}`, { cache: 'no-store' });
    if (!r.ok) {
      setError('목록을 불러오지 못했습니다');
      setRows([]);
      return;
    }
    setRows(await r.json());
    setSelected(new Set());
  }, [days, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const allChecked = useMemo(() => {
    if (!rows || rows.length === 0) return false;
    return rows.every((r) => selected.has(r.id));
  }, [rows, selected]);

  const toggleAll = () => {
    if (!rows) return;
    setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
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
    const r = await fetch('/api/admin/attendance-review', {
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

  return (
    <AdminShell>
      <div className="w-full p-6">
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">소장출역 검토</h1>
            <p className="text-sm text-[#6B7280] mt-1">
              작업자 제출 출역의 승인·미승인 내역. 관리자가 직접 처리할 수 있습니다.
            </p>
          </div>
          <Button variant="outline" onClick={load} disabled={busy}>
            <RefreshCw className="h-4 w-4" />
            새로고침
          </Button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <FilterChip active={statusFilter === 'rejected'} onClick={() => setStatusFilter('rejected')}>미승인</FilterChip>
          <FilterChip active={statusFilter === 'approved'} onClick={() => setStatusFilter('approved')}>승인</FilterChip>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <label className="text-[#6B7280]">기간</label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-[5px] border border-[#D7D7D7] bg-white px-2 py-1 text-sm"
            >
              <option value={7}>최근 7일</option>
              <option value={30}>최근 30일</option>
              <option value={90}>최근 90일</option>
              <option value={365}>최근 365일</option>
            </select>
          </div>
        </div>

        {statusFilter === 'rejected' && selected.size > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-[5px] bg-[#F5F5F5] px-3 py-2 text-sm">
            <span className="font-medium">{selected.size}건 선택</span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" onClick={approveSelected} disabled={busy}>
                <Check className="h-3.5 w-3.5" />
                선택 승인
              </Button>
              <Button size="sm" variant="outline" onClick={rejectSelected} disabled={busy}>
                <X className="h-3.5 w-3.5" />
                선택 미승인
              </Button>
            </div>
          </div>
        )}

        {error && <p className="mb-4 rounded-[5px] bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-[#F5F5F5] text-[#6B7280]">
                <tr className="text-left text-[11px]">
                  {statusFilter === 'rejected' && (
                    <th className="px-3 py-2 w-10">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={toggleAll}
                        aria-label="전체 선택"
                      />
                    </th>
                  )}
                  <th className="px-3 py-2 font-medium">날짜</th>
                  <th className="px-3 py-2 font-medium">작업자</th>
                  <th className="px-3 py-2 font-medium">현장</th>
                  <th className="px-3 py-2 font-medium">협력사</th>
                  <th className="px-3 py-2 font-medium text-right">공수</th>
                  <th className="px-3 py-2 font-medium text-center">상태</th>
                  <th className="px-3 py-2 font-medium">승인자(소장)</th>
                  {statusFilter === 'rejected' && (
                    <th className="px-3 py-2 font-medium text-right w-32">처리</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D7D7D7]">
                {rows === null ? (
                  <tr><td colSpan={statusFilter === 'rejected' ? 9 : 7} className="py-10 text-center text-[#9CA3AF]">불러오는 중...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={statusFilter === 'rejected' ? 9 : 7} className="py-10 text-center text-[#9CA3AF]">해당 조건의 출역이 없습니다.</td></tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="hover:bg-[#F5F5F5]">
                      {statusFilter === 'rejected' && (
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => toggleOne(r.id)}
                            aria-label={`${r.worker_name} ${r.work_date} 선택`}
                          />
                        </td>
                      )}
                      <td className="px-3 py-2 tabular-nums">{fmtDate(r.work_date)}</td>
                      <td className="px-3 py-2 font-medium">
                        {r.worker_name}
                        {r.worker_phone && <span className="ml-1 text-[10px] text-[#9CA3AF] font-mono">{formatPhone(r.worker_phone)}</span>}
                      </td>
                      <td className="px-3 py-2 text-[#4B5563]">{r.worksite_name}</td>
                      <td className="px-3 py-2 text-[#4B5563]">{r.subcontractor_name ?? <span className="text-[#D7D7D7]">-</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.hours}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`rounded-[5px] px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[r.approval_status]}`}>
                          {STATUS_LABEL[r.approval_status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[#4B5563]">{r.approver_name ?? <span className="text-[#D7D7D7]">-</span>}</td>
                      {statusFilter === 'rejected' && (
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
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
                              aria-label="미승인"
                              title="미승인"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
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
          <h2 className="text-lg font-semibold">미승인 사유 ({count}건)</h2>
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
          <Button
            onClick={() => { setSubmitting(true); onSubmit(reason); }}
            disabled={submitting}
          >
            미승인 처리
          </Button>
        </div>
      </div>
    </div>
  );
}
