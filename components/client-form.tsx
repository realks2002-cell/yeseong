'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

export type Client = {
  id: string;
  name: string;
  business_number: string | null;
  contact_phone: string | null;
  is_active: boolean;
  created_at: string;
};

export type ClientInput = {
  name: string;
  business_number: string;
  contact_phone: string;
  is_active: boolean;
};

type Props = {
  initial?: Client;
  onSubmit: (input: ClientInput) => Promise<void>;
  onCancel: () => void;
  title: string;
};

export function ClientForm({ initial, onSubmit, onCancel, title }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [businessNumber, setBusinessNumber] = useState(initial?.business_number ?? '');
  const [contactPhone, setContactPhone] = useState(initial?.contact_phone ?? '');
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setName(initial?.name ?? '');
    setBusinessNumber(initial?.business_number ?? '');
    setContactPhone(initial?.contact_phone ?? '');
    setIsActive(initial?.is_active ?? true);
  }, [initial]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr('원청사명을 입력하세요');
    setLoading(true);
    try {
      await onSubmit({
        name: name.trim(),
        business_number: businessNumber.trim(),
        contact_phone: contactPhone.trim(),
        is_active: isActive,
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
          <button onClick={onCancel} className="rounded p-1 text-[#9CA3AF] hover:bg-[#F5F5F5] hover:text-[#091413]" aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="cl-name">원청사명 *</label>
            <Input id="cl-name" value={name} onChange={(e) => setName(e.target.value)} disabled={loading} autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="cl-bn">사업자등록번호</label>
            <Input
              id="cl-bn"
              value={businessNumber}
              onChange={(e) => setBusinessNumber(e.target.value)}
              placeholder="(선택) 예: 123-45-67890"
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="cl-phone">연락처</label>
            <Input
              id="cl-phone"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
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
