'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import {
  ShoppingCart, Copy, Check, Phone, Truck, PackageCheck, XCircle, RotateCcw,
} from 'lucide-react';
import { buildOrderText, groupByVendor, type OrderLineForText } from '@/lib/orders/format';

type OrderRow = {
  id: string;
  order_no: string;
  status: 'requested' | 'sent' | 'delivered' | 'cancelled';
  delivery_date: string | null;
  note: string | null;
  sent_at: string | null;
  created_at: string;
  worksite: { id: string; name: string; address: string | null } | null;
  requester: { id: string; name: string; phone: string | null } | null;
  items: Array<{
    id: string;
    item_name: string;
    spec: string | null;
    unit: string;
    quantity: number;
    note: string | null;
    vendor_id: string | null;
    vendor: { name: string; contact_name: string | null; contact_phone: string | null } | null;
  }>;
};

const STATUS_TABS = [
  { value: 'requested', label: '요청됨' },
  { value: 'sent', label: '발주완료' },
  { value: 'delivered', label: '입고완료' },
  { value: 'cancelled', label: '취소' },
] as const;

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  requested: { label: '요청됨', cls: 'bg-amber-50 text-amber-700' },
  sent: { label: '발주완료', cls: 'bg-blue-50 text-blue-700' },
  delivered: { label: '입고완료', cls: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: '취소', cls: 'bg-[#F5F5F5] text-[#9CA3AF]' },
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function OrdersPage() {
  const [list, setList] = useState<OrderRow[] | null>(null);
  const [statusFilter, setStatusFilter] = useState('requested');
  const [worksiteFilter, setWorksiteFilter] = useState('');
  const [requesterFilter, setRequesterFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const params = statusFilter ? `?status=${statusFilter}` : '';
    const r = await fetch(`/api/orders${params}`, { cache: 'no-store' });
    if (!r.ok) {
      setError('목록을 불러오지 못했습니다');
      setList([]);
      return;
    }
    setList(await r.json());
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of list ?? []) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [list]);

  const worksiteOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of list ?? []) if (o.worksite) m.set(o.worksite.id, o.worksite.name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ko'));
  }, [list]);

  const requesterOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of list ?? []) if (o.requester) m.set(o.requester.id, o.requester.name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ko'));
  }, [list]);

  const filtered = useMemo(
    () =>
      (list ?? []).filter(
        (o) =>
          (!worksiteFilter || o.worksite?.id === worksiteFilter) &&
          (!requesterFilter || o.requester?.id === requesterFilter),
      ),
    [list, worksiteFilter, requesterFilter],
  );

  async function copyOrderText(order: OrderRow, groupKey: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(groupKey);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      alert('복사에 실패했습니다. 브라우저 권한을 확인해주세요.');
    }
  }

  async function setStatus(id: string, status: string, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusyId(id);
    const r = await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    if (!r.ok) {
      alert((await r.json().catch(() => ({}))).error ?? '상태 변경 실패');
      return;
    }
    load();
  }

  return (
    <AdminShell>
      <div className="max-w-5xl p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-[#447D9B]" />
            발주
          </h1>
        </div>

        {/* 상태 필터 */}
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setStatusFilter((prev) => (prev === t.value ? '' : t.value))}
              className={`rounded-[5px] border px-3 py-1.5 text-xs font-semibold ${
                statusFilter === t.value
                  ? 'border-[#273F4F] bg-[#273F4F] text-white'
                  : 'border-[#D7D7D7] bg-white text-[#091413] hover:bg-[#F5F5F5]'
              }`}
            >
              {t.label}
              {t.value && counts[t.value] != null && !statusFilter && (
                <span className="ml-1 text-[10px] opacity-70">{counts[t.value]}</span>
              )}
            </button>
          ))}

          {/* 현장·팀장 분류 */}
          <select
            value={worksiteFilter}
            onChange={(e) => setWorksiteFilter(e.target.value)}
            className="ml-auto h-[31px] rounded-[5px] border border-[#D7D7D7] bg-white px-2 text-xs font-semibold text-[#091413] outline-none focus:ring-2 focus:ring-[#447D9B]"
          >
            <option value="">현장 전체</option>
            {worksiteOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          <select
            value={requesterFilter}
            onChange={(e) => setRequesterFilter(e.target.value)}
            className="h-[31px] rounded-[5px] border border-[#D7D7D7] bg-white px-2 text-xs font-semibold text-[#091413] outline-none focus:ring-2 focus:ring-[#447D9B]"
          >
            <option value="">팀장 전체</option>
            {requesterOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>

        {error && <p className="rounded-[5px] bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        {/* 발주 목록 */}
        <div className="space-y-4">
          {list === null ? (
            <p className="py-10 text-center text-sm text-[#9CA3AF]">불러오는 중...</p>
          ) : filtered.length === 0 ? (
            <Card className="py-12 text-center text-sm text-[#9CA3AF]">
              {statusFilter || worksiteFilter || requesterFilter
                ? '조건에 맞는 발주가 없습니다.'
                : '발주 요청이 없습니다. 팀장앱에서 자재를 요청하면 여기에 표시됩니다.'}
            </Card>
          ) : (
            filtered.map((o) => {
              const badge = STATUS_BADGE[o.status];
              const lines: OrderLineForText[] = o.items.map((it) => ({
                item_name: it.item_name,
                spec: it.spec,
                unit: it.unit,
                quantity: it.quantity,
                note: it.note,
                vendor_id: it.vendor_id,
                vendor_name: it.vendor?.name ?? null,
                vendor_phone: it.vendor?.contact_phone ?? null,
              }));
              const groups = groupByVendor(lines);
              return (
                <Card key={o.id} className="p-5">
                  {/* 헤더 */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold">{o.order_no}</h2>
                        <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#6B7280]">
                        {fmtDateTime(o.created_at)}
                        {o.requester && ` · 요청: ${o.requester.name} 팀장`}
                        {o.worksite && ` · ${o.worksite.name}`}
                        {o.delivery_date && ` · 납기 ${o.delivery_date.slice(5).replace('-', '/')}`}
                      </p>
                      {o.note && <p className="mt-1 text-xs text-[#4B5563]">요청사항: {o.note}</p>}
                    </div>

                    {/* 상태 변경 버튼 */}
                    <div className="flex gap-1.5">
                      {o.status === 'requested' && (
                        <>
                          <button
                            onClick={() => setStatus(o.id, 'sent')}
                            disabled={busyId === o.id}
                            className="flex items-center gap-1 rounded-[5px] bg-[#273F4F] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1e3340] disabled:opacity-50"
                          >
                            <Truck className="h-3.5 w-3.5" />
                            발주완료 처리
                          </button>
                          <button
                            onClick={() => setStatus(o.id, 'cancelled', '이 발주 요청을 취소하시겠습니까?')}
                            disabled={busyId === o.id}
                            className="flex items-center gap-1 rounded-[5px] border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            취소
                          </button>
                        </>
                      )}
                      {o.status === 'sent' && (
                        <button
                          onClick={() => setStatus(o.id, 'delivered')}
                          disabled={busyId === o.id}
                          className="flex items-center gap-1 rounded-[5px] bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <PackageCheck className="h-3.5 w-3.5" />
                          입고완료 처리
                        </button>
                      )}
                      {o.status === 'cancelled' && (
                        <button
                          onClick={() => setStatus(o.id, 'requested')}
                          disabled={busyId === o.id}
                          className="flex items-center gap-1 rounded-[5px] border border-[#D7D7D7] px-2.5 py-1.5 text-xs font-semibold text-[#4B5563] hover:bg-[#F5F5F5] disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          요청으로 복원
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 거래처별 발주서 */}
                  <div className="mt-4 space-y-3">
                    {groups.map((g) => {
                      const groupKey = `${o.id}-${g.vendorId ?? 'none'}`;
                      const text = buildOrderText(
                        {
                          order_no: o.order_no,
                          worksite_name: o.worksite?.name ?? '-',
                          worksite_address: o.worksite?.address ?? null,
                          delivery_date: o.delivery_date,
                          note: o.note,
                        },
                        g,
                      );
                      return (
                        <div key={groupKey} className="rounded-[5px] border border-[#EAEAEA] bg-[#FAFAFA]">
                          <div className="flex items-center justify-between gap-2 border-b border-[#EAEAEA] px-4 py-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm font-bold text-[#091413]">{g.vendorName}</span>
                              {g.vendorPhone && (
                                <a
                                  href={`tel:${g.vendorPhone}`}
                                  className="flex items-center gap-1 text-xs text-[#447D9B] hover:underline"
                                >
                                  <Phone className="h-3 w-3" />
                                  {g.vendorPhone}
                                </a>
                              )}
                            </div>
                            <button
                              onClick={() => copyOrderText(o, groupKey, text)}
                              className={`flex shrink-0 items-center gap-1 rounded-[5px] px-2.5 py-1.5 text-xs font-semibold ${
                                copiedKey === groupKey
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-[#FFD43B] text-[#3C1E1E] hover:bg-[#fac800]'
                              }`}
                            >
                              {copiedKey === groupKey ? (
                                <>
                                  <Check className="h-3.5 w-3.5" />
                                  복사됨
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5" />
                                  발주서 복사
                                </>
                              )}
                            </button>
                          </div>
                          <pre className="px-4 py-3 text-xs leading-relaxed text-[#4B5563] whitespace-pre-wrap font-sans">
                            {text}
                          </pre>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </AdminShell>
  );
}
