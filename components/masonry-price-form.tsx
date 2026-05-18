'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

export type MasonryPrice = {
  id: string;
  category: '조적' | '미장';
  type_name: string;
  size_spec: string | null;
  unit: string;
  unit_price: number;
  is_active: boolean;
  created_at: string;
};

export type MasonryPriceInput = {
  category: '조적' | '미장';
  type_name: string;
  size_spec: string | null;
  unit_price: number;
};

type Props = {
  initial?: MasonryPrice;
  defaultCategory?: '조적' | '미장';
  onSubmit: (input: MasonryPriceInput) => Promise<void>;
  onCancel: () => void;
  title: string;
};

export function MasonryPriceForm({ initial, defaultCategory, onSubmit, onCancel, title }: Props) {
  const isEdit = !!initial;
  const [category, setCategory] = useState<'조적' | '미장'>(initial?.category ?? defaultCategory ?? '조적');
  const [typeName, setTypeName] = useState(initial?.type_name ?? '');
  const [sizeSpec, setSizeSpec] = useState(initial?.size_spec ?? '');
  const [unitPrice, setUnitPrice] = useState(initial?.unit_price ?? 0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setCategory(initial?.category ?? defaultCategory ?? '조적');
    setTypeName(initial?.type_name ?? '');
    setSizeSpec(initial?.size_spec ?? '');
    setUnitPrice(initial?.unit_price ?? 0);
  }, [initial, defaultCategory]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!typeName.trim()) return setErr('종류명을 입력하세요');
    if (category === '조적' && !sizeSpec.trim()) return setErr('규격을 입력하세요');
    if (!unitPrice || unitPrice < 0) return setErr('단가를 입력하세요');
    setLoading(true);
    try {
      await onSubmit({
        category,
        type_name: typeName.trim(),
        size_spec: category === '조적' ? sizeSpec.trim() : null,
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
            <label className="text-sm font-medium">카테고리 *</label>
            <div className="flex gap-2">
              {(['조적', '미장'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  disabled={isEdit || loading}
                  className={
                    'flex-1 rounded-[5px] py-2 text-sm font-semibold ring-2 transition ' +
                    (category === c
                      ? 'bg-[#273F4F] text-white ring-[#273F4F]'
                      : 'bg-white text-[#4B5563] ring-[#D7D7D7] hover:ring-[#9CA3AF]')
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">종류명 *</label>
            <Input
              value={typeName}
              onChange={(e) => setTypeName(e.target.value)}
              placeholder={category === '조적' ? '예: 시멘트벽돌, 적벽돌' : '예: 시멘트미장, 줄눈'}
              disabled={loading}
              autoFocus
            />
          </div>

          {category === '조적' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">규격 *</label>
              <Input
                value={sizeSpec}
                onChange={(e) => setSizeSpec(e.target.value)}
                placeholder="예: 190×90×57"
                disabled={loading}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              단가 ({category === '조적' ? '원/장' : '원/㎡'}) *
            </label>
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
              <p className="text-xs text-[#6B7280]">{unitPrice.toLocaleString()}원/{category === '조적' ? '장' : '㎡'}</p>
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
