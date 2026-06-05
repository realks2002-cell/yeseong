'use client';
import { useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PackagePlus, Pencil, Trash2, Search, X } from 'lucide-react';

type Vendor = { id: string; name: string };
type Trade = { id: string; name: string };
type Item = {
  id: string;
  item_code: string | null;
  name: string;
  spec: string | null;
  unit: string;
  vendor_id: string | null;
  trades: string[] | null;
  is_active: boolean;
  created_at: string;
};
type ItemInput = {
  item_code: string | null;
  name: string;
  spec: string | null;
  unit: string;
  vendor_id: string | null;
  trades: string[] | null;
};

export default function ItemsPage() {
  const [list, setList] = useState<Item[] | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // 공종 필터 — '' = 전체, '__common__' = 공통(공종 미지정), 그 외 = 공종명
  const [tradeFilter, setTradeFilter] = useState('');

  const filtered = useMemo(() => {
    if (!list) return null;
    let result = list;
    if (tradeFilter === '__common__') {
      result = result.filter((it) => !it.trades || it.trades.length === 0);
    } else if (tradeFilter) {
      result = result.filter((it) => it.trades?.includes(tradeFilter));
    }
    const raw = query.trim().toLowerCase();
    if (!raw) return result;
    return result.filter((it) =>
      it.name.toLowerCase().includes(raw) ||
      (it.item_code?.toLowerCase().includes(raw)) ||
      (it.spec?.toLowerCase().includes(raw))
    );
  }, [list, query, tradeFilter]);

  // 공종별 품목 수 (필터 버튼 배지)
  const tradeCounts = useMemo(() => {
    const map = new Map<string, number>();
    let common = 0;
    for (const it of list ?? []) {
      if (!it.trades || it.trades.length === 0) { common++; continue; }
      for (const t of it.trades) map.set(t, (map.get(t) ?? 0) + 1);
    }
    return { map, common };
  }, [list]);

  const vendorMap = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors]);

  async function load() {
    setError(null);
    const [iRes, vRes, tRes] = await Promise.all([
      fetch('/api/items', { cache: 'no-store' }),
      fetch('/api/vendors', { cache: 'no-store' }),
      fetch('/api/trades?managersOnly=1', { cache: 'no-store' }), // 팀장에게 등록된 직종만
    ]);
    if (!iRes.ok) { setError('목록을 불러오지 못했습니다'); setList([]); return; }
    setList(await iRes.json());
    if (vRes.ok) setVendors(await vRes.json());
    if (tRes.ok) setTrades(await tRes.json());
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(input: ItemInput) {
    const r = await fetch('/api/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '추가 실패');
    setShowAdd(false); load();
  }

  async function handleEdit(input: ItemInput) {
    if (!editing) return;
    const r = await fetch(`/api/items/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '수정 실패');
    setEditing(null); load();
  }

  async function handleDelete(it: Item) {
    if (!confirm(`"${it.name}" 품목을 삭제하시겠습니까?`)) return;
    const r = await fetch(`/api/items/${it.id}`, { method: 'DELETE' });
    if (!r.ok) { alert((await r.json().catch(() => ({}))).error ?? '삭제 실패'); return; }
    load();
  }

  return (
    <AdminShell>
      <div className="max-w-7xl p-6">
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">품목 마스터</h1>
            <p className="text-sm text-[#6B7280] mt-1">
              총 {list?.length ?? '...'}개 품목
              {query && filtered ? ` · 검색결과 ${filtered.length}건` : ''}
            </p>
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <PackagePlus className="h-4 w-4" />
            품목 추가
          </Button>
        </div>

        {/* 공종 선택 버튼 — 누르면 해당 공종 품목만 표시 */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <FilterChip
            label="전체"
            count={list?.length}
            active={tradeFilter === ''}
            onClick={() => setTradeFilter('')}
          />
          <FilterChip
            label="공통"
            count={tradeCounts.common}
            active={tradeFilter === '__common__'}
            onClick={() => setTradeFilter('__common__')}
          />
          {trades.map((t) => (
            <FilterChip
              key={t.id}
              label={t.name}
              count={tradeCounts.map.get(t.name) ?? 0}
              active={tradeFilter === t.name}
              onClick={() => setTradeFilter(tradeFilter === t.name ? '' : t.name)}
            />
          ))}
        </div>

        <div className="mb-4 relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="품번 · 품목 · 규격으로 검색"
            className="w-full rounded-[5px] border border-[#D7D7D7] bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-[#447D9B] focus:ring-2 focus:ring-[#447D9B]/20"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#9CA3AF] hover:bg-[#F5F5F5]">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {error && <p className="mb-4 rounded-[5px] bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] whitespace-nowrap [&_th]:border-r [&_th]:border-r-[#EAEAEA] [&_td]:border-r [&_td]:border-r-[#EAEAEA] [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
              <thead className="bg-[#F5F5F5] text-[#4B5563]">
                <tr className="text-center text-[11px]">
                  <th className="px-3 py-2 font-medium w-10">#</th>
                  <th className="px-3 py-2 font-medium">품번</th>
                  <th className="px-3 py-2 font-medium">품목</th>
                  <th className="px-3 py-2 font-medium">규격</th>
                  <th className="px-3 py-2 font-medium">단위</th>
                  <th className="px-3 py-2 font-medium">공종</th>
                  <th className="px-3 py-2 font-medium">거래처</th>
                  <th className="px-3 py-2 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D7D7D7]">
                {filtered === null ? (
                  <tr><td colSpan={8} className="py-10 text-center text-[#9CA3AF]">불러오는 중...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="py-10 text-center text-[#9CA3AF]">
                    {query
                      ? '검색 결과가 없습니다.'
                      : tradeFilter
                        ? `${tradeFilter === '__common__' ? '공통' : tradeFilter} 품목이 없습니다. 품목 추가에서 공종을 선택해 등록하세요.`
                        : '등록된 품목이 없습니다.'}
                  </td></tr>
                ) : (
                  filtered.map((it, i) => (
                    <tr key={it.id} className="hover:bg-[#F5F5F5]">
                      <td className="px-3 py-2 text-[#6B7280] tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 font-mono text-[#4B5563]">{it.item_code ?? '-'}</td>
                      <td className="px-3 py-2 font-medium">{it.name}</td>
                      <td className="px-3 py-2 text-[#4B5563]">{it.spec ?? '-'}</td>
                      <td className="px-3 py-2">{it.unit}</td>
                      <td className="px-3 py-2 text-center">
                        {it.trades && it.trades.length > 0 ? (
                          <span className="inline-flex flex-wrap gap-0.5 justify-center">
                            {it.trades.map((t) => (
                              <span key={t} className="rounded bg-[#447D9B]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#447D9B]">{t}</span>
                            ))}
                          </span>
                        ) : (
                          <span className="rounded bg-[#F5F5F5] px-1.5 py-0.5 text-[10px] font-semibold text-[#9CA3AF]">공통</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[#4B5563]">{it.vendor_id ? vendorMap.get(it.vendor_id) ?? '-' : <span className="text-[#D7D7D7]">-</span>}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-0.5">
                          <button className="rounded p-1 text-[#6B7280] hover:bg-[#F5F5F5] hover:text-[#091413]" onClick={() => setEditing(it)} aria-label="수정"><Pencil className="h-3.5 w-3.5" /></button>
                          <button className="rounded p-1 text-[#6B7280] hover:bg-red-50 hover:text-red-600" onClick={() => handleDelete(it)} aria-label="삭제"><Trash2 className="h-3.5 w-3.5" /></button>
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

      {showAdd && (
        <ItemForm
          title="품목 추가"
          vendors={vendors}
          trades={trades}
          // 공종 필터 선택 중이면 그 공종이 미리 선택된 채로 등록
          initialTrades={tradeFilter && tradeFilter !== '__common__' ? [tradeFilter] : undefined}
          onSubmit={handleAdd}
          onCancel={() => setShowAdd(false)}
        />
      )}
      {editing && <ItemForm title={`${editing.name} 수정`} vendors={vendors} trades={trades} initial={editing} onSubmit={handleEdit} onCancel={() => setEditing(null)} />}
    </AdminShell>
  );
}

function FilterChip({ label, count, active, onClick }: {
  label: string; count?: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[5px] border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? 'border-[#273F4F] bg-[#273F4F] text-white'
          : 'border-[#D7D7D7] bg-white text-[#091413] hover:bg-[#F5F5F5]'
      }`}
    >
      {label}
      {typeof count === 'number' && (
        <span className={`ml-1 tabular-nums ${active ? 'text-white/70' : 'text-[#9CA3AF]'}`}>{count}</span>
      )}
    </button>
  );
}

function ItemForm({ title, vendors, trades, initial, initialTrades, onSubmit, onCancel }: {
  title: string; vendors: Vendor[]; trades: Trade[]; initial?: Item; initialTrades?: string[];
  onSubmit: (i: ItemInput) => Promise<void>; onCancel: () => void;
}) {
  const [itemCode, setItemCode] = useState(initial?.item_code ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [spec, setSpec] = useState(initial?.spec ?? '');
  const [unit, setUnit] = useState(initial?.unit ?? '');
  const [vendorId, setVendorId] = useState(initial?.vendor_id ?? '');
  const [selectedTrades, setSelectedTrades] = useState<string[]>(initial?.trades ?? initialTrades ?? []);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleTrade(t: string) {
    setSelectedTrades((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr('품목명을 입력하세요');
    if (!unit.trim()) return setErr('단위를 입력하세요');
    setLoading(true);
    try {
      const nullable = (s: string) => s.trim() || null;
      await onSubmit({
        item_code: nullable(itemCode), name: name.trim(), spec: nullable(spec), unit: unit.trim(),
        vendor_id: vendorId || null,
        trades: selectedTrades.length > 0 ? selectedTrades : null,
      });
    } catch (e) { setErr(e instanceof Error ? e.message : '저장 실패'); } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-[5px] bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#D7D7D7] px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onCancel} className="rounded p-1 text-[#9CA3AF] hover:bg-[#F5F5F5]"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 p-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">품번</label>
            <Input value={itemCode} onChange={(e) => setItemCode(e.target.value)} placeholder="선택" disabled={loading} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">단위 *</label>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="예: EA, 포, 장, m³" disabled={loading} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium">품목명 *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={loading} autoFocus />
          </div>
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium">규격</label>
            <Input value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="선택" disabled={loading} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium">
              노출 공종 <span className="text-[#9CA3AF] font-normal">(미선택 = 모든 팀장에게 노출)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {trades.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTrade(t.name)}
                  disabled={loading}
                  className={`rounded-[5px] border px-2.5 py-1.5 text-xs font-semibold ${
                    selectedTrades.includes(t.name)
                      ? 'border-[#273F4F] bg-[#273F4F] text-white'
                      : 'border-[#D7D7D7] bg-white text-[#091413] hover:bg-[#F5F5F5]'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium">거래처</label>
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              disabled={loading}
              className="flex h-9 w-full rounded-[5px] border border-[#D7D7D7] bg-white px-3 py-1 text-sm outline-none focus:border-[#447D9B] focus:ring-2 focus:ring-[#447D9B]/20"
            >
              <option value="">선택 안 함</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          {err && <p className="col-span-2 text-sm text-red-600">{err}</p>}
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>취소</Button>
            <Button type="submit" disabled={loading}>{loading ? '저장 중...' : '저장'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
