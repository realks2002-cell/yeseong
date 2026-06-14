'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toUserMessage } from '@/lib/errors/message';
import { Plus, Trash2, Check, X, ClipboardCheck, Pencil, Send, AlertCircle } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { categoryTypes } from '@/lib/constants/masonry';

type Price = {
  id: string;
  category: string;
  type_name: string | null;
  size_spec: string | null;
  unit: string;
  unit_price: number;
};

type Item = {
  id: string;
  category: string;
  type_name: string | null;
  size_spec: string | null;
  unit: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
};

type PendingGroup = {
  payroll_worker_id: string;
  worker_id: string;
  worker_name: string;
  worker_phone: string | null;
  year_month: string;
  worksite_id: string;
  worksite_name: string;
  category: string;
  total_amount: number;
  items: Item[];
  prices: Price[];
};

type Row = { masonry_price_id: string; quantity: number };

function priceLabel(p: Price): string {
  if (p.category === '조적') {
    return `${p.type_name ?? ''}${p.size_spec ? ` (${p.size_spec})` : ''}`;
  }
  if (categoryTypes(p.category)) {
    return `${p.type_name ?? ''} · ${p.unit}`;
  }
  return p.unit;
}

function matchPriceId(it: Item, prices: Price[]): string | null {
  const m = prices.find((p) =>
    p.category === it.category &&
    (p.type_name ?? '') === (it.type_name ?? '') &&
    (p.size_spec ?? '') === (it.size_spec ?? '') &&
    (it.unit == null || p.unit === it.unit),
  );
  return m?.id ?? null;
}

export function ManagerVolumesReview({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const sb = getBrowserSupabase();
  const [groups, setGroups] = useState<PendingGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<PendingGroup | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: e } = await sb.rpc('yeseong_manager_list_pending_volumes');
    if (e) {
      setError(toUserMessage(e));
      setGroups([]);
      return;
    }
    const list = (data as unknown as PendingGroup[]) ?? [];
    setGroups(list);
    onCountChange?.(list.length);
  }, [sb, onCountChange]);

  useEffect(() => { load(); }, [load]);

  async function decide(ids: string[], approve: boolean, reason?: string) {
    if (busy || ids.length === 0) return;
    setBusy(true);
    setError(null);
    const { error: e } = await sb.rpc('yeseong_manager_decide_volumes', {
      p_payroll_worker_ids: ids,
      p_approve: approve,
      p_reason: reason ?? null,
    });
    setBusy(false);
    setRejectTarget(null);
    if (e) {
      setError(toUserMessage(e));
      return;
    }
    // 반려 시 작업자에게 푸시 (보조 채널 — 실패 무시)
    if (!approve) {
      fetch('/api/push/volume-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payrollWorkerIds: ids }),
      }).catch(() => {});
    }
    await load();
  }

  // 검토 대기(pending_leader) 전체에서 매사 종류별 팀 합계 집계
  const teamTotals = useMemo(() => {
    const map = new Map<string, { label: string; quantity: number; amount: number; unit: string | null }>();
    for (const g of groups ?? []) {
      for (const it of g.items) {
        const key = `${it.category}|${it.type_name ?? ''}|${it.size_spec ?? ''}|${it.unit ?? ''}`;
        const label =
          it.category === '조적'
            ? `${it.type_name ?? ''}${it.size_spec ? ` (${it.size_spec})` : ''}`
            : `${it.category} ${it.type_name ?? ''}`.trim();
        const cur = map.get(key) ?? { label, quantity: 0, amount: 0, unit: it.unit };
        cur.quantity += Number(it.quantity);
        cur.amount += it.amount;
        map.set(key, cur);
      }
    }
    const rows = Array.from(map.values()).sort((a, b) => b.amount - a.amount);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return { rows, total };
  }, [groups]);

  if (groups === null) {
    return <p className="py-10 text-center text-zinc-400">불러오는 중...</p>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-[10px] bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {teamTotals.rows.length > 0 && (
        <div className="rounded-[12px] border border-blue-200 bg-blue-50/60 p-4">
          <p className="mb-2 text-sm font-bold text-navy">종류별 팀 합계 (검토 대기)</p>
          <ul className="space-y-1">
            {teamTotals.rows.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-zinc-700">
                  {r.label} · <span className="tabular-nums">{r.quantity.toLocaleString()}{r.unit ?? ''}</span>
                </span>
                <span className="shrink-0 tabular-nums font-semibold text-zinc-900">{r.amount.toLocaleString()}원</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-blue-200 pt-2">
            <span className="text-sm font-bold text-navy">합계</span>
            <span className="text-base font-bold tabular-nums text-navy">{teamTotals.total.toLocaleString()}원</span>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-[10px] bg-zinc-50 px-6 py-14 text-center">
          <ClipboardCheck className="h-10 w-10 text-zinc-300" />
          <p className="mt-3 text-base font-semibold text-zinc-500">검토할 팀원 성과가 없어요</p>
        </div>
      ) : (
        <>
          {groups.map((g) => (
            <GroupCard
              key={g.payroll_worker_id}
              group={g}
              busy={busy}
              onApprove={() => decide([g.payroll_worker_id], true)}
              onReject={() => setRejectTarget(g)}
              onSaved={load}
            />
          ))}

          <button
            type="button"
            onClick={() => decide(groups.map((g) => g.payroll_worker_id), true)}
            disabled={busy}
            className="flex h-[60px] w-full items-center justify-center gap-2 rounded-[10px] bg-navy text-lg font-bold text-white active:scale-[0.99] disabled:opacity-60"
          >
            <Send className="h-5 w-5" />
            {busy ? '처리 중...' : `모두 관리자 제출 (${groups.length}건)`}
          </button>
        </>
      )}

      {rejectTarget && (
        <RejectDialog
          group={rejectTarget}
          busy={busy}
          onCancel={() => setRejectTarget(null)}
          onConfirm={(reason) => decide([rejectTarget.payroll_worker_id], false, reason)}
        />
      )}
    </div>
  );
}

function GroupCard({
  group, busy, onApprove, onReject, onSaved,
}: {
  group: PendingGroup;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onSaved: () => void;
}) {
  const sb = getBrowserSupabase();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [saveBusy, setSaveBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const priceMap = useMemo(() => new Map(group.prices.map((p) => [p.id, p])), [group.prices]);

  const startEdit = () => {
    const init: Row[] = [];
    for (const it of group.items) {
      const pid = matchPriceId(it, group.prices);
      if (!pid) continue;
      init.push({ masonry_price_id: pid, quantity: Number(it.quantity) });
    }
    setRows(init);
    setErr(null);
    setEditing(true);
  };

  const total = editing
    ? rows.reduce((s, r) => {
        const p = priceMap.get(r.masonry_price_id);
        return p ? s + Math.round(r.quantity * p.unit_price) : s;
      }, 0)
    : group.total_amount;

  async function save() {
    if (saveBusy) return;
    setSaveBusy(true);
    setErr(null);
    const { error } = await sb.rpc('yeseong_manager_replace_team_volumes', {
      p_payroll_worker_id: group.payroll_worker_id,
      p_items: rows
        .filter((r) => r.quantity > 0)
        .map((r) => ({ masonry_price_id: r.masonry_price_id, quantity: r.quantity })),
    });
    setSaveBusy(false);
    if (error) {
      setErr(toUserMessage(error));
      return;
    }
    setEditing(false);
    onSaved();
  }

  return (
    <div className="overflow-hidden rounded-[12px] border border-zinc-200 bg-white">
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-zinc-900">{group.worker_name}</p>
          <p className="truncate text-xs text-zinc-500">
            {group.worksite_name} · {group.year_month} · {group.category}
          </p>
        </div>
        <span className="shrink-0 text-base font-bold tabular-nums text-navy">
          {total.toLocaleString()}원
        </span>
      </div>

      <div className="p-4">
        {!editing ? (
          <ul className="space-y-1.5">
            {group.items.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-zinc-700">
                  {it.category === '조적'
                    ? `${it.type_name ?? ''}${it.size_spec ? ` (${it.size_spec})` : ''}`
                    : `${it.type_name ?? it.category}`}{' '}
                  × {it.quantity}{it.unit ?? ''}
                </span>
                <span className="tabular-nums font-semibold">{it.amount.toLocaleString()}원</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-2.5">
            {rows.map((r, i) => {
              const p = priceMap.get(r.masonry_price_id);
              return (
                <div key={i} className="rounded-[10px] border border-zinc-200 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={r.masonry_price_id}
                      onChange={(e) => setRows((prev) => prev.map((x, idx) => (idx === i ? { ...x, masonry_price_id: e.target.value } : x)))}
                      disabled={saveBusy}
                      className="min-w-0 flex-1 h-10 rounded-[8px] border border-zinc-300 bg-white px-2.5 text-sm"
                    >
                      {group.prices.map((opt) => (
                        <option key={opt.id} value={opt.id}>{priceLabel(opt)}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                      disabled={saveBusy}
                      className="shrink-0 rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={r.quantity || ''}
                      onChange={(e) => setRows((prev) => prev.map((x, idx) => (idx === i ? { ...x, quantity: e.target.value === '' ? 0 : Number(e.target.value) } : x)))}
                      placeholder="0"
                      min={0}
                      step={p?.unit === '㎡' ? '0.01' : '1'}
                      disabled={saveBusy}
                      inputMode="decimal"
                      className="min-w-0 flex-1 h-11 rounded-[8px] border border-zinc-300 bg-white px-3 text-right text-base font-semibold tabular-nums"
                    />
                    <span className="w-8 shrink-0 text-center text-sm text-zinc-500">{p?.unit ?? ''}</span>
                    <span className="w-20 shrink-0 text-right text-sm tabular-nums text-zinc-700">
                      {p ? `${Math.round(r.quantity * p.unit_price).toLocaleString()}원` : '-'}
                    </span>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => group.prices.length > 0 && setRows((prev) => [...prev, { masonry_price_id: group.prices[0].id, quantity: 0 }])}
              disabled={saveBusy}
              className="flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-zinc-300 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
            >
              <Plus className="h-4 w-4" /> 항목 추가
            </button>
          </div>
        )}

        {err && (
          <div className="mt-3 flex items-start gap-2 rounded-[10px] bg-red-50 p-2.5 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{err}</span>
          </div>
        )}

        {/* 액션 */}
        {!editing ? (
          <div className="mt-3 flex gap-2">
            <button
              onClick={startEdit}
              disabled={busy}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-zinc-300 bg-white text-sm font-semibold text-zinc-700 active:scale-[0.99] disabled:opacity-50"
            >
              <Pencil className="h-4 w-4" /> 수정
            </button>
            <button
              onClick={onReject}
              disabled={busy}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] border-2 border-red-200 bg-white text-sm font-semibold text-red-700 active:scale-[0.99] disabled:opacity-50"
            >
              <X className="h-4 w-4" /> 반려
            </button>
            <button
              onClick={onApprove}
              disabled={busy}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-navy text-sm font-bold text-white active:scale-[0.99] disabled:opacity-60"
            >
              <Check className="h-4 w-4" /> 제출
            </button>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setEditing(false)}
              disabled={saveBusy}
              className="h-11 flex-1 rounded-[10px] bg-zinc-100 text-sm font-bold text-zinc-700 disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={save}
              disabled={saveBusy}
              className="h-11 flex-[2] rounded-[10px] bg-navy text-sm font-bold text-white disabled:opacity-60"
            >
              {saveBusy ? '저장 중...' : '수정 저장'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RejectDialog({
  group, busy, onCancel, onConfirm,
}: {
  group: PendingGroup;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 sm:items-center">
      <div className="w-full sm:max-w-[400px] rounded-t-[5px] sm:rounded-[5px] bg-white p-7">
        <p className="text-center text-base text-zinc-500">반려 사유</p>
        <p className="mt-2 text-center text-[22px] font-bold text-zinc-900">
          {group.worker_name} · {group.worksite_name}
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="사유를 입력해주세요 (선택)"
          rows={3}
          autoFocus
          className="mt-5 w-full resize-none rounded-[5px] bg-zinc-50 p-4 text-base text-zinc-900 ring-2 ring-zinc-200 focus:ring-navy outline-none"
        />
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="h-[56px] rounded-[5px] bg-zinc-100 text-lg font-bold text-zinc-700 disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={busy}
            className="h-[56px] rounded-[5px] bg-red-800 text-lg font-bold text-white disabled:opacity-60"
          >
            {busy ? '처리 중...' : '반려'}
          </button>
        </div>
      </div>
    </div>
  );
}
