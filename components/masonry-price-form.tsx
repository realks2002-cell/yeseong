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
  category: '조적' | '미장';
  worksite_id: string;
  type_name: string;
  size_spec: string | null;
  unit_price: number;
};

const BRICK_TYPES = ['치장벽돌', '시멘트벽돌'] as const;
const BRICK_SIZES = ['보통', '특수'] as const;

type Props = {
  category: '조적' | '미장';
  initial?: MasonryPrice;
  worksites: Worksite[];
  onSubmit: (input: MasonryPriceInput) => Promise<void>;
  onCancel: () => void;
  title: string;
};

export function MasonryPriceForm({ category, initial, worksites, onSubmit, onCancel, title }: Props) {
  const [worksiteId, setWorksiteId] = useState(initial?.worksite_id ?? '');
  const [typeName, setTypeName] = useState<string>(initial?.type_name ?? BRICK_TYPES[0]);
  const [sizeSpec, setSizeSpec] = useState<string>(initial?.size_spec ?? BRICK_SIZES[0]);
  const [unitPrice, setUnitPrice] = useState(initial?.unit_price ?? 0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setWorksiteId(initial?.worksite_id ?? '');
    setTypeName(initial?.type_name ?? BRICK_TYPES[0]);
    setSizeSpec(initial?.size_spec ?? BRICK_SIZES[0]);
    setUnitPrice(initial?.unit_price ?? 0);
  }, [initial]);

  const unitLabel = category === '조적' ? '장' : '㎡';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!worksiteId) return setErr('현장을 선택하세요');
    if (!unitPrice || unitPrice < 0) return setErr('단가를 입력하세요');
    setLoading(true);
    try {
      await onSubmit({
        category,
        worksite_id: worksiteId,
        type_name: category === '조적' ? typeName : '미장',
        size_spec: category === '조적' ? sizeSpec : null,
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

          {category === '조적' && (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">벽돌 종류 *</label>
                <select
                  value={typeName}
                  onChange={(e) => setTypeName(e.target.value)}
                  disabled={loading}
                  className="h-10 w-full rounded-[5px] border border-[#D7D7D7] bg-white px-3 text-sm text-[#091413] focus:outline-none focus:ring-2 focus:ring-[#447D9B]"
                >
                  {BRICK_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">부위·규격 *</label>
                <select
                  value={sizeSpec}
                  onChange={(e) => setSizeSpec(e.target.value)}
                  disabled={loading}
                  className="h-10 w-full rounded-[5px] border border-[#D7D7D7] bg-white px-3 text-sm text-[#091413] focus:outline-none focus:ring-2 focus:ring-[#447D9B]"
                >
                  {BRICK_SIZES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">단가 (원/{unitLabel}) *</label>
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
              <p className="text-xs text-[#6B7280]">{unitPrice.toLocaleString()}원/{unitLabel}</p>
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
