'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';
import { BRICK_TYPES, BLOCK_SIZES, brickSizes, MASONRY_UNITS, categoryTypes, type MasonryCategory } from '@/lib/constants/masonry';

export type Worksite = { id: string; name: string };

export type MasonryPrice = {
  id: string;
  category: MasonryCategory;
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
  category: MasonryCategory;
  worksite_id: string;
  type_name: string;
  size_spec: string | null;
  unit: string;
  unit_price: number;
};

type Props = {
  category: MasonryCategory;
  initial?: MasonryPrice;
  worksites: Worksite[];
  existingTypeNames?: string[]; // 이미 등록된 품명(드롭다운 자동 제안용)
  onSubmit: (input: MasonryPriceInput) => Promise<void>;
  onCancel: () => void;
  title: string;
};

const CUSTOM = '__custom__';

export function MasonryPriceForm({ category, initial, worksites, existingTypeNames = [], onSubmit, onCancel, title }: Props) {
  const isBrick = category === '조적';
  const types = useMemo(() => categoryTypes(category), [category]); // 미장: 종류배열, 그 외: null
  const hasTypes = types != null;
  const usesTypeName = isBrick || hasTypes; // 품명 입력란을 쓰는 분류(조적·미장)
  const defaultType = isBrick ? BRICK_TYPES[0] : hasTypes ? types[0] : '';

  // 드롭다운 품명 = 기본 품명 ∪ 등록된 품명(distinct)
  const typeOptions = useMemo(() => {
    const base: readonly string[] = isBrick ? BRICK_TYPES : (types ?? []);
    const set = new Set<string>(base);
    for (const t of existingTypeNames) {
      const v = t?.trim();
      if (v) set.add(v);
    }
    return Array.from(set);
  }, [isBrick, types, existingTypeNames]);

  const [worksiteId, setWorksiteId] = useState(initial?.worksite_id ?? '');
  const [typeName, setTypeName] = useState<string>(initial?.type_name ?? defaultType);
  const [sizeSpec, setSizeSpec] = useState<string>(initial?.size_spec ?? '');
  const [unit, setUnit] = useState<string>(initial?.unit ?? (isBrick ? '장' : MASONRY_UNITS[0]));
  const [unitPrice, setUnitPrice] = useState(initial?.unit_price ?? 0);
  const [isCustom, setIsCustom] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setWorksiteId(initial?.worksite_id ?? '');
    const t = initial?.type_name ?? defaultType;
    setTypeName(t);
    const sizes = brickSizes(t);
    setSizeSpec(initial?.size_spec ?? (sizes ? sizes[0] : ''));
    setUnit(initial?.unit ?? (isBrick ? '장' : MASONRY_UNITS[0]));
    setUnitPrice(initial?.unit_price ?? 0);
    setIsCustom(false);
  }, [initial, isBrick, defaultType]);

  // 조적 종류 변경 시 규격 초기화(블록쌓기만 규격 보유)
  function changeBrickType(t: string) {
    setTypeName(t);
    const sizes = brickSizes(t);
    setSizeSpec(sizes ? sizes[0] : '');
  }

  // 품명 드롭다운 선택 ("+ 직접 입력" → 자유 입력 전환)
  function onTypeSelect(v: string) {
    if (v === CUSTOM) {
      setIsCustom(true);
      setTypeName('');
      if (isBrick) setSizeSpec('');
      return;
    }
    setIsCustom(false);
    if (isBrick) changeBrickType(v);
    else setTypeName(v);
  }

  const unitLabel = isBrick ? '장' : unit;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!worksiteId) return setErr('현장을 선택하세요');
    if (usesTypeName && !typeName.trim()) return setErr('품명을 입력하세요');
    if (isBrick && brickSizes(typeName) && !sizeSpec) return setErr('규격을 선택하세요');
    if (!unitPrice || unitPrice < 0) return setErr('단가를 입력하세요');
    setLoading(true);
    try {
      await onSubmit({
        category,
        worksite_id: worksiteId,
        type_name: usesTypeName ? typeName.trim() : category,
        size_spec: isBrick ? (brickSizes(typeName) ? sizeSpec : null) : null,
        unit: isBrick ? '장' : unit,
        unit_price: Math.floor(unitPrice),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setLoading(false);
    }
  }

  const selectCls =
    'h-10 w-full rounded-[5px] border border-[#D7D7D7] bg-white px-3 text-sm text-[#091413] focus:outline-none focus:ring-2 focus:ring-[#447D9B]';

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
            <select value={worksiteId} onChange={(e) => setWorksiteId(e.target.value)} disabled={loading} className={selectCls}>
              <option value="">현장 선택</option>
              {worksites.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          {usesTypeName && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">품명 *</label>
              <select
                value={isCustom ? CUSTOM : typeName}
                onChange={(e) => onTypeSelect(e.target.value)}
                disabled={loading}
                className={selectCls}
              >
                {typeOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                <option value={CUSTOM}>+ 직접 입력</option>
              </select>
              {isCustom && (
                <Input
                  value={typeName}
                  onChange={(e) => setTypeName(e.target.value)}
                  placeholder="새 품명 입력 (예: 파벽돌)"
                  disabled={loading}
                  autoFocus
                />
              )}
            </div>
          )}

          {isBrick && brickSizes(typeName) && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">규격 *</label>
              <select value={sizeSpec} onChange={(e) => setSizeSpec(e.target.value)} disabled={loading} className={selectCls}>
                {BLOCK_SIZES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          {!isBrick && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">단위 *</label>
              <select value={unit} onChange={(e) => setUnit(e.target.value)} disabled={loading} className={selectCls}>
                {MASONRY_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <p className="text-xs text-[#6B7280]">
                {hasTypes ? '품명·단위 조합마다 단가를 따로 등록합니다.' : '단위마다 단가를 따로 등록합니다.'}
              </p>
            </div>
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
