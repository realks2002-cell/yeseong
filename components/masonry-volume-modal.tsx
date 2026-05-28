'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, X } from 'lucide-react';
import { MASONRY_CATEGORIES } from '@/lib/constants/masonry';

export type MasonryPriceOption = {
  id: string;
  category: string;
  type_name: string;
  size_spec: string | null;
  unit: string;
  unit_price: number;
};

export type VolumeRow = {
  id?: string;
  masonry_price_id: string;
  quantity: number;
  note: string | null;
};

export type ExistingVolume = {
  id: string;
  payroll_worker_id: string;
  category: string;
  type_name: string | null;
  size_spec: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  unit: string | null;
  note: string | null;
};

type Props = {
  workerName: string;
  payrollWorkerId: string;
  siteId: string;
  yearMonth: string;
  existing: ExistingVolume[];
  prices: MasonryPriceOption[];
  onClose: () => void;
  onSaved: () => void;
};

// optgroup(분류) 안에서의 항목 라벨 — 종류·규격·단가/단위
function optionLabel(p: MasonryPriceOption): string {
  const parts: string[] = [];
  if (p.type_name && p.type_name !== p.category) parts.push(p.type_name);
  if (p.size_spec) parts.push(p.size_spec);
  if (parts.length === 0) parts.push(p.category);
  return `${parts.join(' ')} — ${p.unit_price.toLocaleString()}원/${p.unit}`;
}

// 기존 ExistingVolume → MasonryPriceOption 매칭
function matchPrice(existing: ExistingVolume, prices: MasonryPriceOption[]): string | null {
  const match = prices.find(
    (p) =>
      p.category === existing.category &&
      p.type_name === existing.type_name &&
      p.size_spec === existing.size_spec,
  );
  return match?.id ?? null;
}

export function MasonryVolumeModal({
  workerName,
  payrollWorkerId,
  siteId,
  yearMonth,
  existing,
  prices,
  onClose,
  onSaved,
}: Props) {
  // 기존 데이터를 row로 변환 (매칭 안 되는 단가는 무시 — 단가가 비활성화되었거나 변경된 경우)
  const initialRows: VolumeRow[] = useMemo(() => {
    const out: VolumeRow[] = [];
    for (const e of existing) {
      const priceId = matchPrice(e, prices);
      if (!priceId) continue;
      out.push({ id: e.id, masonry_price_id: priceId, quantity: Number(e.quantity), note: e.note });
    }
    return out;
  }, [existing, prices]);

  const [rows, setRows] = useState<VolumeRow[]>(initialRows);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setRows(initialRows), [initialRows]);

  const priceMap = useMemo(() => new Map(prices.map((p) => [p.id, p])), [prices]);

  // 분류별 그룹 (조적·미장·방수·타일·석공사 순)
  const grouped = useMemo(() => {
    const m = new Map<string, MasonryPriceOption[]>();
    for (const p of prices) {
      if (!m.has(p.category)) m.set(p.category, []);
      m.get(p.category)!.push(p);
    }
    const order = [...MASONRY_CATEGORIES] as string[];
    return [...m.keys()]
      .sort((a, b) => order.indexOf(a) - order.indexOf(b))
      .map((c) => [c, m.get(c)!] as const);
  }, [prices]);

  function updateRow(i: number, patch: Partial<VolumeRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    if (prices.length === 0) return;
    setRows((prev) => [...prev, { masonry_price_id: prices[0].id, quantity: 0, note: null }]);
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  const totalAmount = rows.reduce((sum, r) => {
    const p = priceMap.get(r.masonry_price_id);
    if (!p) return sum;
    return sum + Math.floor(r.quantity * p.unit_price);
  }, 0);

  async function handleSave() {
    setErr(null);
    setSaving(true);
    try {
      const r = await fetch(`/api/payroll/${siteId}/${yearMonth}/volumes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payroll_worker_id: payrollWorkerId,
          items: rows.map((row) => ({
            masonry_price_id: row.masonry_price_id,
            quantity: row.quantity,
            note: row.note,
          })),
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? '저장 실패');
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-[5px] bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#D7D7D7] px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">{workerName} — 월말 성과 입력</h2>
            <p className="text-xs text-[#6B7280] mt-0.5">조적·미장·방수·타일·석공사 — 현장 단가표 기준 종류·수량 입력.</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-[#9CA3AF] hover:bg-[#F5F5F5]" aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {prices.length === 0 ? (
            <p className="rounded-[5px] bg-amber-50 p-3 text-sm text-amber-700">
              이 현장에 등록된 매사 단가가 없습니다. /masonry-prices 페이지에서 먼저 단가를 등록해주세요.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                {rows.length === 0 ? (
                  <p className="text-sm text-[#6B7280] py-4 text-center">아래 + 버튼으로 항목을 추가하세요.</p>
                ) : (
                  rows.map((r, i) => {
                    const p = priceMap.get(r.masonry_price_id);
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <select
                          value={r.masonry_price_id}
                          onChange={(e) => updateRow(i, { masonry_price_id: e.target.value })}
                          disabled={saving}
                          className="flex-1 h-9 rounded-[5px] border border-[#D7D7D7] bg-white px-2.5 text-sm text-[#091413] focus:outline-none focus:ring-2 focus:ring-[#447D9B]"
                        >
                          {grouped.map(([cat, opts]) => (
                            <optgroup key={cat} label={cat}>
                              {opts.map((opt) => (
                                <option key={opt.id} value={opt.id}>{optionLabel(opt)}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <Input
                          type="number"
                          value={r.quantity || ''}
                          onChange={(e) => updateRow(i, { quantity: e.target.value === '' ? 0 : Number(e.target.value) })}
                          placeholder="0"
                          min={0}
                          step={p?.unit === '㎡' ? '0.01' : '1'}
                          className="w-24 text-right tabular-nums"
                          disabled={saving}
                        />
                        <span className="text-xs text-[#6B7280] w-8 text-center">{p?.unit ?? ''}</span>
                        <span className="text-sm tabular-nums w-28 text-right">
                          {p ? `${Math.floor(r.quantity * p.unit_price).toLocaleString()}원` : '-'}
                        </span>
                        <button
                          onClick={() => removeRow(i)}
                          className="rounded p-1 text-[#9CA3AF] hover:bg-red-50 hover:text-red-600"
                          aria-label="삭제"
                          disabled={saving}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <Button variant="outline" size="sm" onClick={addRow} disabled={saving}>
                <Plus className="h-3.5 w-3.5" />
                항목 추가
              </Button>

              <div className="flex items-center justify-between border-t border-[#D7D7D7] pt-3">
                <span className="text-sm font-medium text-[#4B5563]">합계 (이번 달 급여)</span>
                <span className="text-lg font-bold tabular-nums">{totalAmount.toLocaleString()}원</span>
              </div>
            </>
          )}

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#D7D7D7] px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>취소</Button>
          <Button onClick={handleSave} disabled={saving || prices.length === 0}>
            {saving ? '저장 중...' : '저장'}
          </Button>
        </div>
      </div>
    </div>
  );
}
