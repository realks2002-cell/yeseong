'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { History, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  TABLE_LABELS,
  TABLES,
  fieldLabel,
  formatFieldValue,
  getRecordName,
  summarizeChange,
} from '@/lib/audit/format';

type AuditRow = {
  id: string;
  table_name: string;
  record_id: string | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  actor_user_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  changed_fields: string[] | null;
  created_at: string;
};

type ActorInfo = { display_name: string; kind: 'admin' | 'worker' | 'manager' | 'unknown' };

type ApiResponse = {
  items: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  actors: Record<string, ActorInfo>;
};

const ACTIONS = ['INSERT', 'UPDATE', 'DELETE'] as const;
const ACTION_BADGE: Record<string, string> = {
  INSERT: 'bg-emerald-50 text-emerald-700',
  UPDATE: 'bg-amber-50 text-amber-700',
  DELETE: 'bg-red-50 text-red-700',
};
const ACTION_LABEL: Record<string, string> = {
  INSERT: '추가',
  UPDATE: '수정',
  DELETE: '삭제',
};

function formatDateTime(s: string): string {
  const d = new Date(s);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yy}-${mm}-${dd} ${hh}:${mi}`;
}

export default function AuditLogPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const [filters, setFilters] = useState({
    table_name: '',
    action: '',
    from: '',
    to: '',
  });
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filters.table_name) params.set('table_name', filters.table_name);
    if (filters.action) params.set('action', filters.action);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to + 'T23:59:59');
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));

    const r = await fetch(`/api/admin/audit-log?${params}`, { cache: 'no-store' });
    if (!r.ok) {
      setError(`불러오기 실패: ${r.status}`);
      setLoading(false);
      return;
    }
    setData(await r.json());
    setLoading(false);
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <AdminShell>
      <div className="max-w-7xl p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <History className="h-6 w-6 text-[#447D9B]" />
            변경 이력
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">마스터 데이터(작업자·팀장·전문건설사·현장·단가)의 모든 변경 사항</p>
        </div>

        <Card className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-[#4B5563] block mb-1">테이블</label>
              <select
                value={filters.table_name}
                onChange={(e) => { setFilters((f) => ({ ...f, table_name: e.target.value })); setPage(1); }}
                className="h-9 w-full rounded-[5px] border border-[#D7D7D7] bg-white px-2.5 text-sm"
              >
                <option value="">전체</option>
                {TABLES.map((t) => (
                  <option key={t} value={t}>{TABLE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[#4B5563] block mb-1">액션</label>
              <select
                value={filters.action}
                onChange={(e) => { setFilters((f) => ({ ...f, action: e.target.value })); setPage(1); }}
                className="h-9 w-full rounded-[5px] border border-[#D7D7D7] bg-white px-2.5 text-sm"
              >
                <option value="">전체</option>
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>{ACTION_LABEL[a]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[#4B5563] block mb-1">시작일</label>
              <Input
                type="date"
                value={filters.from}
                onChange={(e) => { setFilters((f) => ({ ...f, from: e.target.value })); setPage(1); }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#4B5563] block mb-1">종료일</label>
              <Input
                type="date"
                value={filters.to}
                onChange={(e) => { setFilters((f) => ({ ...f, to: e.target.value })); setPage(1); }}
              />
            </div>
          </div>
        </Card>

        {error && <p className="rounded-[5px] bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] [&_th]:border-r [&_th]:border-r-[#EAEAEA] [&_td]:border-r [&_td]:border-r-[#EAEAEA] [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
              <thead className="bg-[#F5F5F5] text-[#4B5563]">
                <tr className="text-center text-[11px]">
                  <th className="px-3 py-2 font-medium w-32">시각</th>
                  <th className="px-3 py-2 font-medium w-32">사용자</th>
                  <th className="px-3 py-2 font-medium w-24">테이블</th>
                  <th className="px-3 py-2 font-medium w-28">대상</th>
                  <th className="px-3 py-2 font-medium w-16">액션</th>
                  <th className="px-3 py-2 font-medium">변경 내용</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D7D7D7]">
                {loading ? (
                  <tr><td colSpan={6} className="py-10 text-center text-[#9CA3AF]">불러오는 중...</td></tr>
                ) : !data || data.items.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-[#9CA3AF]">변경 이력이 없습니다.</td></tr>
                ) : (
                  data.items.map((r) => {
                    const actor = r.actor_user_id ? data.actors[r.actor_user_id] : null;
                    const recordName = getRecordName(r.before_data, r.after_data);
                    return (
                      <tr
                        key={r.id}
                        className="hover:bg-[#F5F5F5] cursor-pointer"
                        onClick={() => setSelected(r)}
                      >
                        <td className="px-3 py-2 text-[#4B5563] tabular-nums whitespace-nowrap">
                          {formatDateTime(r.created_at)}
                        </td>
                        <td className="px-3 py-2 text-[#091413] whitespace-nowrap">
                          {actor?.display_name ?? <span className="text-[#9CA3AF]">시스템</span>}
                        </td>
                        <td className="px-3 py-2 text-[#091413]">
                          {TABLE_LABELS[r.table_name] ?? r.table_name}
                        </td>
                        <td className="px-3 py-2 text-[#091413] font-medium">
                          {recordName ?? <span className="text-[#9CA3AF] font-mono text-[10px]">{r.record_id?.slice(0, 8) ?? '-'}</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold ${ACTION_BADGE[r.action] ?? ''}`}>
                            {ACTION_LABEL[r.action]}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[#4B5563]">
                          {summarizeChange(r.table_name, r.action, r.changed_fields, r.before_data, r.after_data)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {data && data.total > pageSize && (
            <div className="flex items-center justify-between border-t border-[#D7D7D7] px-4 py-2 text-xs">
              <span className="text-[#6B7280]">
                전체 {data.total}건 · {(page - 1) * pageSize + 1}~{Math.min(page * pageSize, data.total)}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                  이전
                </Button>
                <span className="tabular-nums">{page} / {totalPages}</span>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  다음
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {selected && (
        <AuditDetailModal
          row={selected}
          actor={selected.actor_user_id && data ? data.actors[selected.actor_user_id] ?? null : null}
          onClose={() => setSelected(null)}
        />
      )}
    </AdminShell>
  );
}

function AuditDetailModal({
  row,
  actor,
  onClose,
}: {
  row: AuditRow;
  actor: ActorInfo | null;
  onClose: () => void;
}) {
  const beforeMap = (row.before_data ?? {}) as Record<string, unknown>;
  const afterMap = (row.after_data ?? {}) as Record<string, unknown>;
  const changed = new Set(row.changed_fields ?? []);
  const recordName = getRecordName(row.before_data, row.after_data);

  // 표시할 키 집합
  let keys: string[];
  if (row.action === 'UPDATE') {
    keys = row.changed_fields ?? [];
  } else if (row.action === 'INSERT') {
    keys = Object.keys(afterMap);
  } else {
    keys = Object.keys(beforeMap);
  }
  // 노이즈 키 제외 (id 자체)
  keys = keys.filter((k) => k !== 'id');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-[5px] bg-white shadow-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#D7D7D7] px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">
              {TABLE_LABELS[row.table_name] ?? row.table_name}
              {recordName && <span className="ml-2 text-[#447D9B]">{recordName}</span>}
              <span className="ml-2 text-sm font-normal text-[#6B7280]">— {ACTION_LABEL[row.action]}</span>
            </h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              {formatDateTime(row.created_at)} · {actor?.display_name ?? '시스템'}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-[#9CA3AF] hover:bg-[#F5F5F5]" aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          {keys.length === 0 ? (
            <p className="text-sm text-[#6B7280]">표시할 변경 내용이 없습니다.</p>
          ) : (
            <table className="w-full text-[11px] [&_th]:border-r [&_th]:border-r-[#EAEAEA] [&_td]:border-r [&_td]:border-r-[#EAEAEA] [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
              <thead className="text-[#4B5563] border-b border-[#D7D7D7]">
                <tr className="text-center text-[11px]">
                  <th className="px-2 py-2 font-medium w-32">필드</th>
                  {row.action !== 'INSERT' && <th className="px-2 py-2 font-medium">변경 전</th>}
                  {row.action !== 'DELETE' && <th className="px-2 py-2 font-medium">변경 후</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D7D7D7]">
                {keys.map((k) => {
                  const isChanged = row.action === 'UPDATE' && changed.has(k);
                  return (
                    <tr key={k} className={isChanged ? 'bg-amber-50/50' : ''}>
                      <td className="px-2 py-1.5 text-[#4B5563] align-top">
                        {fieldLabel(row.table_name, k)}
                      </td>
                      {row.action !== 'INSERT' && (
                        <td className="px-2 py-1.5 text-[#091413] align-top break-all">
                          {formatFieldValue(k, beforeMap[k])}
                        </td>
                      )}
                      {row.action !== 'DELETE' && (
                        <td className="px-2 py-1.5 text-[#091413] align-top break-all">
                          {formatFieldValue(k, afterMap[k])}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
