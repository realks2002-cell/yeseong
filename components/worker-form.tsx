'use client';
import { useState, useEffect } from 'react';
import type { MockWorker } from '@/lib/mock/store';
import type { WorkerInput } from '@/lib/mock/use-workers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

const RRN_PATTERN = /^\d{6}-\d{7}$/;

type Props = {
  initial?: MockWorker;
  onSubmit: (input: WorkerInput) => void;
  onCancel: () => void;
  title: string;
};

export function WorkerForm({ initial, onSubmit, onCancel, title }: Props) {
  const [form, setForm] = useState<WorkerInput>(() => ({
    name: initial?.name ?? '',
    rrn: initial?.rrn ?? '',
    address: initial?.address ?? null,
    bankName: initial?.bankName ?? null,
    accountNumber: initial?.accountNumber ?? null,
    accountHolder: initial?.accountHolder ?? null,
    phone: initial?.phone ?? null,
    defaultWage: initial?.defaultWage ?? 0,
    defaultTrade: initial?.defaultTrade ?? null,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setForm({
      name: initial?.name ?? '',
      rrn: initial?.rrn ?? '',
      address: initial?.address ?? null,
      bankName: initial?.bankName ?? null,
      accountNumber: initial?.accountNumber ?? null,
      accountHolder: initial?.accountHolder ?? null,
      phone: initial?.phone ?? null,
      defaultWage: initial?.defaultWage ?? 0,
      defaultTrade: initial?.defaultTrade ?? null,
    });
  }, [initial]);

  function set<K extends keyof WorkerInput>(key: K, value: WorkerInput[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function nullable(s: string): string | null {
    const v = s.trim();
    return v.length === 0 ? null : v;
  }

  function normalizeRrn(s: string): string {
    const digits = s.replace(/\s/g, '').replace(/-/g, '');
    if (digits.length === 13) return `${digits.slice(0, 6)}-${digits.slice(6)}`;
    return s.trim();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = '필수';
    const rrn = normalizeRrn(form.rrn);
    if (!RRN_PATTERN.test(rrn)) next.rrn = '주민번호 형식: 000000-0000000';
    if (!Number.isFinite(form.defaultWage) || form.defaultWage <= 0) next.defaultWage = '양수';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    onSubmit({
      ...form,
      name: form.name.trim(),
      rrn,
      defaultWage: Number(form.defaultWage),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onCancel} className="rounded p-1 text-zinc-500 hover:bg-zinc-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 p-6 max-h-[70vh] overflow-y-auto">
          <Field label="성명" required error={errors.name}>
            <Input value={form.name} onChange={e => set('name', e.target.value)} />
          </Field>
          <Field label="공종">
            <Input value={form.defaultTrade ?? ''} onChange={e => set('defaultTrade', nullable(e.target.value))} placeholder="관리, 조적 등" />
          </Field>

          <Field label="주민번호" required error={errors.rrn} className="col-span-2">
            <Input
              value={form.rrn}
              onChange={e => set('rrn', e.target.value)}
              placeholder="000000-0000000"
              className="font-mono"
              inputMode="numeric"
            />
          </Field>

          <Field label="주소" className="col-span-2">
            <Input value={form.address ?? ''} onChange={e => set('address', nullable(e.target.value))} />
          </Field>

          <Field label="은행명">
            <Input value={form.bankName ?? ''} onChange={e => set('bankName', nullable(e.target.value))} />
          </Field>
          <Field label="계좌번호">
            <Input value={form.accountNumber ?? ''} onChange={e => set('accountNumber', nullable(e.target.value))} className="font-mono" />
          </Field>
          <Field label="예금주">
            <Input value={form.accountHolder ?? ''} onChange={e => set('accountHolder', nullable(e.target.value))} />
          </Field>
          <Field label="연락처">
            <Input value={form.phone ?? ''} onChange={e => set('phone', nullable(e.target.value))} placeholder="010-0000-0000" className="font-mono" />
          </Field>

          <Field label="기본 일당 (원)" required error={errors.defaultWage} className="col-span-2">
            <Input
              type="number"
              value={form.defaultWage || ''}
              onChange={e => set('defaultWage', e.target.value === '' ? 0 : Number(e.target.value))}
              placeholder="300000"
              min={0}
              step={10000}
              className="text-right tabular-nums"
            />
          </Field>

          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onCancel}>취소</Button>
            <Button type="submit">{initial ? '저장' : '추가'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  error,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="text-sm font-medium block mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
