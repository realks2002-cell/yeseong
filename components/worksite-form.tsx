'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

export type WorksiteInput = {
  name: string;
  address: string;
  is_active: boolean;
};

export type Worksite = {
  id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
};

type Props = {
  initial?: Worksite;
  onSubmit: (input: WorksiteInput) => Promise<void>;
  onCancel: () => void;
  title: string;
};

export function WorksiteForm({ initial, onSubmit, onCancel, title }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setName(initial?.name ?? '');
    setAddress(initial?.address ?? '');
    setIsActive(initial?.is_active ?? true);
  }, [initial]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr('현장명을 입력하세요');
    setLoading(true);
    try {
      await onSubmit({ name: name.trim(), address: address.trim(), is_active: isActive });
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-[5px] bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onCancel} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="ws-name">현장명 *</label>
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 보은현장"
              disabled={loading}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="ws-address">주소</label>
            <Input
              id="ws-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="(선택)"
              disabled={loading}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={loading}
              className="h-4 w-4"
            />
            활성
          </label>

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
