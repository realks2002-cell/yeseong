'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

export type Worksite = { id: string; name: string };

export type MasonryPrice = {
  id: string;
  category: '조적' | '미장';
  type_name: string;
  size_spec: string | null;
  unit: string;
  unit_price: number;
  is_active: boolean;
  worksite_id: string | null;
  yeseong_worksites: { id: string; name: string } | null;
  created_at: string;
};

export type MasonryPriceInput = {
  worksite_id: string;
  type_name: string;
  size_spec: string | null;
  unit_price: number;
};

type Props = {
  initial?: MasonryPrice;
  worksites: Worksite[];
  onSubmit: (input: MasonryPriceInput) => Promise<void>;
  onCancel: () => void;
  title: string;
};

export function MasonryPriceForm({ initial, worksites, onSubmit, onCancel, title }: Props) {
  const [worksiteId, setWorksiteId] = useState(initial?.worksite_id ?? '');
  const [typeName, setTypeName] = useState(initial?.type_name ?? '시멘트벽돌');
  const [sizeSpec, setSizeSpec] = useState(initial?.size_spec ?? '');
  const [unitPrice, setUnitPrice] = useState(initial?.unit_price ?? 0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setWorksiteId(initial?.worksite_id ?? '');
    setTypeName(initial?.type_name ?? '시멘트벽돌');
    setSizeSpec(initial?.size_spec ?? '');
    setUnitPrice(initial?.unit_price ?? 0);
  }, [initial]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!worksiteId) return setErr('현장을 선택하세요');
    if (!typeName.trim()) return setErr('벽돌 종류를 입력하세요');
    if (!unitPrice || unitPrice < 0) return setErr('단가를 입력하세요');
    setLoading(true);
    try {
      await onSubmit({
        worksite_id: worksiteId,
        type_name: typeName.trim(),
        size_spec: sizeSpec.trim() || null,
        unit_price: Math.floor(unitPrice),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-[5px] bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#D7D7D7] px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onCancel} className="rounded p-1 text-[#9CA3AF] hover:bg-[#F5F5F5]" aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">현장 *</label>
            <select
              value={worksiteId}
              onChange={(e) => setWorksiteId(e.target.value)}
              disabled={loading}
              className="h-10 w-full rounded-[5px] border border-[#D7D7D7] bg-white px-3 text-sm text-[#091413] focus:outline-none focus:ring-2 focus:ring-[#447D9B]"
            >
              <option value="">현장 선택</option>
              {worksites.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">벽돌 종류 *</label>
            <Input
              value={typeName}
              onChange={(e) => setTypeName(e.target.value)}
              placeholder="예: 시멘트벽돌, 적벽돌"
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">부위·규격</label>
            <Input
              value={sizeSpec}
              onChange={(e) => setSizeSpec(e.target.value)}
              placeholder="예: 일반 / 주방 / 190×90×57"
              disabled={loading}
            />
            <p className="text-xs text-[#6B7280]">동일 현장 안에서 부위별 단가가 다르면 구분 (예: 일반/주방)</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">단가 (원/장) *</label>
            <Input
              type="number"
              value={unitPrice || ''}
              onChange={(e) => setUnitPrice(e.target.value === '' ? 0 : Number(e.target.value))}
              placeholder="0"
              min={0}
              step={1}
              className="text-right tabular-nums"
              disabled={loading}
            />
            {unitPrice > 0 && (
              <p className="text-xs text-[#6B7280]">{unitPrice.toLocaleString()}원/장</p>
            )}
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>취소</Button>
            <Button type="submit" disabled={loading}>{loading ? '저장 중...' : '저장'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
