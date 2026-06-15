'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toUserMessage } from '@/lib/errors/message';
import { useRouter } from 'next/navigation';
import { PackagePlus, Search, X, Check, ClipboardList } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { getMirrorId, mirrorFetch } from '@/lib/manager/mirror';

type OrderItem = {
  id: string;
  item_code: string | null;
  name: string;
  spec: string | null;
  unit: string;
  vendor_name: string | null;
};

type MyOrder = {
  id: string;
  order_no: string;
  status: 'requested' | 'sent' | 'delivered' | 'cancelled';
  delivery_date: string | null;
  note: string | null;
  created_at: string;
  worksite_name: string;
  items: Array<{ item_name: string; spec: string | null; unit: string; quantity: number; note: string | null }> | null;
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  requested: { label: '요청됨', cls: 'bg-amber-50 text-amber-700' },
  sent: { label: '발주완료', cls: 'bg-blue-50 text-blue-700' },
  delivered: { label: '입고완료', cls: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: '취소', cls: 'bg-zinc-100 text-zinc-500' },
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function ManagerOrdersPage() {
  const router = useRouter();
  const sb = getBrowserSupabase();
  const readOnly = !!getMirrorId();

  const [tab, setTab] = useState<'new' | 'history'>('new');
  const [items, setItems] = useState<OrderItem[] | null>(null);
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [query, setQuery] = useState('');
  // 품목별 수량 입력값 (문자열 — 입력 중 빈 값 허용). 양수만 발주 라인으로 전송
  const [qty, setQtyMap] = useState<Record<string, string>>({});
  const [deliveryDate, setDeliveryDate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    const mirror = getMirrorId();
    if (mirror) {
      try {
        const [its, ords] = await Promise.all([
          mirrorFetch<OrderItem[]>('order_items', mirror),
          mirrorFetch<MyOrder[]>('orders', mirror),
        ]);
        setItems(its ?? []);
        setOrders(ords ?? []);
      } catch (e) {
        setError((e as Error).message);
        setItems([]);
        setOrders([]);
      }
      return;
    }
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      router.replace('/m/manager/signup');
      return;
    }
    const [itemsRes, ordersRes] = await Promise.all([
      sb.rpc('yeseong_manager_list_order_items'),
      sb.rpc('yeseong_manager_list_orders'),
    ]);
    if (itemsRes.error) setError(itemsRes.error.message);
    setItems((itemsRes.data as unknown as OrderItem[]) ?? []);
    setOrders((ordersRes.data as unknown as MyOrder[]) ?? []);
  }, [sb, router]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!items) return null;
    const raw = query.trim().toLowerCase();
    if (!raw) return items;
    return items.filter((it) =>
      it.name.toLowerCase().includes(raw) ||
      (it.spec?.toLowerCase().includes(raw)) ||
      (it.item_code?.toLowerCase().includes(raw)),
    );
  }, [items, query]);

  // 수량이 양수로 입력된 품목만 발주 대상
  const selected = useMemo(
    () =>
      (items ?? [])
        .map((it) => ({ item: it, quantity: parseFloat(qty[it.id] ?? '') }))
        .filter((l) => Number.isFinite(l.quantity) && l.quantity > 0),
    [items, qty],
  );

  const submit = async () => {
    if (readOnly || busy || selected.length === 0) return;
    setBusy(true);
    setError(undefined);
    const { error: rpcErr } = await sb.rpc('yeseong_manager_create_order', {
      p_items: selected.map((l) => ({ item_id: l.item.id, quantity: l.quantity })),
      p_delivery_date: deliveryDate || null,
      p_note: note || null,
    });
    setBusy(false);
    if (rpcErr) {
      setError(toUserMessage(rpcErr));
      return;
    }
    setQtyMap({});
    setDeliveryDate('');
    setNote('');
    setDone(true);
    setTimeout(() => setDone(false), 2500);
    await load();
    setTab('history');
  };

  return (
    <MobileShell showTabs activeTab="orders" variant="manager">
      <div className="px-5 pt-14 pb-8">
        <h1 className="text-[34px] font-bold text-zinc-900 flex items-center gap-2">
          <PackagePlus className="h-7 w-7 text-navy" />
          자재 발주
        </h1>

        {/* 탭 */}
        <div className="mt-4 flex rounded-[8px] bg-zinc-100 p-1">
          <button
            onClick={() => setTab('new')}
            className={`flex-1 h-10 rounded-[6px] text-sm font-bold ${
              tab === 'new' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
            }`}
          >
            발주 요청
          </button>
          <button
            onClick={() => setTab('history')}
            className={`flex-1 h-10 rounded-[6px] text-sm font-bold ${
              tab === 'history' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
            }`}
          >
            요청 이력
          </button>
        </div>

        {done && (
          <p className="mt-3 flex items-center gap-1.5 rounded-[5px] bg-emerald-50 px-3 py-2.5 text-sm font-bold text-emerald-700">
            <Check className="h-4 w-4" />
            발주 요청이 전송되었습니다. 관리자가 확인 후 발주합니다.
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-[5px] bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>
        )}
        {readOnly && tab === 'new' && (
          <p className="mt-3 rounded-[5px] bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
            관리자 보기 모드 — 요청은 팀장 본인만 가능합니다.
          </p>
        )}

        {tab === 'new' ? (
          <>
            {/* 품목 검색 */}
            <div className="mt-4 relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="자재 검색"
                className="h-12 w-full rounded-[8px] border border-zinc-200 bg-white pl-9 pr-9 text-base"
              />
              {query && (
                <button onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* 품목 리스트 — 품목 / 규격 / 수량 표 (수량 직접 입력) */}
            {filtered === null ? (
              <p className="py-8 text-center text-sm text-zinc-400">불러오는 중...</p>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-400 whitespace-pre-line">
                {query ? '검색 결과가 없습니다.' : '발주 가능한 자재가 없습니다.\n관리자에게 품목 등록을 요청해주세요.'}
              </p>
            ) : (
              <div className="mt-3 overflow-hidden rounded-[8px] bg-white ring-1 ring-zinc-200">
                <div className="grid grid-cols-[1.1fr_1fr_84px] items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs font-bold text-zinc-500">
                  <span>품목</span>
                  <span>규격</span>
                  <span className="text-center">수량</span>
                </div>
                {filtered.map((it) => {
                  const v = qty[it.id] ?? '';
                  const active = Number.isFinite(parseFloat(v)) && parseFloat(v) > 0;
                  return (
                    <div
                      key={it.id}
                      className={`grid grid-cols-[1.1fr_1fr_84px] items-center gap-2 border-b border-zinc-100 px-3 py-3 last:border-b-0 ${
                        active ? 'bg-blue-50/60' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-zinc-900 break-words leading-tight">{it.name}</p>
                        {it.vendor_name && (
                          <p className="mt-0.5 text-[10px] text-zinc-400 truncate">{it.vendor_name}</p>
                        )}
                      </div>
                      <p className="min-w-0 text-xs text-zinc-600 break-words leading-tight">{it.spec || '-'}</p>
                      <div className="flex flex-col items-center gap-0.5">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          placeholder="수량"
                          value={v}
                          disabled={readOnly}
                          onChange={(e) => setQtyMap((prev) => ({ ...prev, [it.id]: e.target.value }))}
                          className={`h-10 w-[72px] rounded-[6px] border text-center text-base font-bold tabular-nums focus:placeholder:text-transparent ${
                            active ? 'border-blue-400 bg-white text-navy' : 'border-zinc-200 bg-zinc-50 text-zinc-700'
                          }`}
                        />
                        <span className="text-[10px] font-semibold text-zinc-400">{it.unit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 납기 + 요청사항 + 제출 */}
            {(items?.length ?? 0) > 0 && (
              <div className="mt-4 space-y-2 rounded-[8px] bg-blue-50 ring-1 ring-blue-200 p-3">
                <p className="text-sm font-bold text-navy">
                  선택한 자재 {selected.length}개
                  {selected.length > 0 && (
                    <span className="ml-1.5 font-semibold text-blue-700/70 text-xs">
                      {selected.map((l) => `${l.item.name} ${l.quantity}${l.item.unit}`).join(', ')}
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-navy w-16 shrink-0">납기 희망</label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="h-10 flex-1 rounded-[5px] border border-zinc-200 bg-white px-2.5 text-sm"
                  />
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="요청사항 (선택) — 예: 오전 중 하차 부탁드립니다"
                  rows={2}
                  className="w-full resize-none rounded-[5px] border border-zinc-200 bg-white px-3 py-2 text-sm"
                />
                <button
                  onClick={submit}
                  disabled={readOnly || busy || selected.length === 0}
                  className="h-[52px] w-full rounded-[5px] bg-navy text-base font-bold text-white active:scale-[0.99] disabled:opacity-40"
                >
                  {busy ? '전송 중...' : `발주 요청 (${selected.length}개 품목)`}
                </button>
              </div>
            )}
          </>
        ) : (
          /* 요청 이력 */
          <div className="mt-4 space-y-3">
            {orders === null ? (
              <p className="py-8 text-center text-sm text-zinc-400">불러오는 중...</p>
            ) : orders.length === 0 ? (
              <div className="py-10 text-center">
                <ClipboardList className="mx-auto h-10 w-10 text-zinc-300" />
                <p className="mt-2 text-sm text-zinc-400">발주 요청 이력이 없습니다.</p>
              </div>
            ) : (
              orders.map((o) => {
                const badge = STATUS_LABEL[o.status] ?? STATUS_LABEL.requested;
                return (
                  <div key={o.id} className="rounded-[8px] bg-white ring-1 ring-zinc-200 px-4 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-zinc-900">{o.order_no}</p>
                      <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-zinc-400">
                      {fmtDate(o.created_at)} · {o.worksite_name}
                      {o.delivery_date && ` · 납기 ${o.delivery_date.slice(5).replace('-', '/')}`}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {(o.items ?? []).map((it, i) => (
                        <li key={i} className="flex items-center justify-between text-sm">
                          <span className="text-zinc-700 truncate">
                            {it.item_name}{it.spec ? ` (${it.spec})` : ''}
                          </span>
                          <span className="shrink-0 font-bold tabular-nums text-zinc-900">
                            {it.quantity} {it.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {o.note && <p className="mt-2 text-xs text-zinc-500">요청: {o.note}</p>}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </MobileShell>
  );
}
