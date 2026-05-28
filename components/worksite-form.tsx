'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

export type WorksiteInput = {
  name: string;
  address: string;
  client_id: string | null;
  subcontractor_id: string | null;
  is_active: boolean;
};

export type Worksite = {
  id: string;
  name: string;
  address: string | null;
  client_id: string | null;
  subcontractor_id: string | null;
  is_active: boolean;
  created_at: string;
};

export type Option = { id: string; name: string };

type Props = {
  initial?: Worksite;
  clients: Option[];
  subcontractors: Option[];
  onSubmit: (input: WorksiteInput) => Promise<void>;
  onCancel: () => void;
  title: string;
};

export function WorksiteForm({ initial, clients, subcontractors, onSubmit, onCancel, title }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [clientId, setClientId] = useState(initial?.client_id ?? '');
  const [subcontractorId, setSubcontractorId] = useState(initial?.subcontractor_id ?? '');
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setName(initial?.name ?? '');
    setAddress(initial?.address ?? '');
    setClientId(initial?.client_id ?? '');
    setSubcontractorId(initial?.subcontractor_id ?? '');
    setIsActive(initial?.is_active ?? true);
  }, [initial]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr('현장명을 입력하세요');
    setLoading(true);
    try {
      await onSubmit({
        name: name.trim(),
        address: address.trim(),
        client_id: clientId || null,
        subcontractor_id: subcontractorId || null,
        is_active: isActive,
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
          <button onClick={onCancel} className="rounded p-1 text-[#9CA3AF] hover:bg-[#F5F5F5] hover:text-[#091413]" aria-label="닫기">
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
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="ws-client">원청사</label>
            <select
              id="ws-client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={loading}
              className={selectCls}
            >
              <option value="">선택 안 함</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="ws-sub">전문건설사</label>
            <select
              id="ws-sub"
              value={subcontractorId}
              onChange={(e) => setSubcontractorId(e.target.value)}
              disabled={loading}
              className={selectCls}
            >
              <option value="">선택 안 함</option>
              {subcontractors.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
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
