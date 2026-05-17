'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';
import { formatRrnPlain } from '@/lib/crypto/rrn';

const RRN_PATTERN = /^\d{6}-?\d{7}$/;

const KOREAN_BANKS = [
  'KB국민은행', '신한은행', '우리은행', '하나은행', 'NH농협은행', 'IBK기업은행',
  'SC제일은행', '한국씨티은행', '카카오뱅크', '케이뱅크', '토스뱅크',
  '부산은행', '대구은행', '광주은행', '전북은행', '경남은행', '제주은행',
  '수협은행', '산업은행', '새마을금고', '신협', '우체국',
];

export type Worker = {
  id: string;
  employee_code: string | null;
  name: string;
  name_english: string | null;
  rrn_prefix: string | null;
  rrn_gender_digit: string | null;
  rrn_plain: string | null;
  pin: string | null;
  is_foreign: boolean;
  default_trade: string | null;
  skill_grade: string | null;
  wage_type: string | null;
  default_wage: number;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  phone: string | null;
  address: string | null;
  first_work_date: string | null;
  nationality: string | null;
  visa_status: string | null;
  is_active: boolean;
  created_at: string;
  auth_user_id: string | null;
};

export type WorkerInput = {
  employee_code: string | null;
  name: string;
  rrn: string;        // 평문 — POST 필수. PATCH는 비어있으면 변경 없음, 있으면 갱신.
  default_trade: string | null;
  default_wage: number;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  phone: string | null;
  address: string | null;
};

type Props = {
  initial?: Worker;
  onSubmit: (input: WorkerInput) => Promise<void>;
  onCancel: () => void;
  title: string;
  existingBanks?: string[];
};

export function WorkerForm({ initial, onSubmit, onCancel, title, existingBanks = [] }: Props) {
  const bankOptions = Array.from(new Set([...KOREAN_BANKS, ...existingBanks.filter(Boolean)]));
  const isEdit = !!initial;
  const [form, setForm] = useState<WorkerInput>(() => buildInitial(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  useEffect(() => {
    setForm(buildInitial(initial));
    setErrors({});
    setSubmitErr(null);
  }, [initial]);

  function set<K extends keyof WorkerInput>(key: K, value: WorkerInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function nullable(s: string): string | null {
    const v = s.trim();
    return v.length === 0 ? null : v;
  }

  function normalizeRrn(s: string): string {
    const digits = s.replace(/[\s-]/g, '');
    if (digits.length === 13) return `${digits.slice(0, 6)}-${digits.slice(6)}`;
    return s.trim();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErr(null);
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = '필수';
    const rrnTrimmed = form.rrn.trim();
    const rrnChanged = rrnTrimmed !== (initial?.rrn_plain ? formatRrnPlain(initial.rrn_plain) : '');
    if (!isEdit) {
      if (!RRN_PATTERN.test(normalizeRrn(rrnTrimmed))) next.rrn = '주민번호 형식: 000000-0000000';
    } else if (rrnChanged && rrnTrimmed.length > 0) {
      if (!RRN_PATTERN.test(normalizeRrn(rrnTrimmed))) next.rrn = '주민번호 형식: 000000-0000000';
    }
    if (!Number.isFinite(form.default_wage) || form.default_wage < 0) next.default_wage = '0 이상';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    try {
      await onSubmit({
        ...form,
        name: form.name.trim(),
        rrn: rrnChanged && rrnTrimmed ? normalizeRrn(rrnTrimmed) : '',
        default_wage: Math.floor(form.default_wage),
      });
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-2xl rounded-[5px] bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#D7D7D7] px-6 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onCancel} className="rounded p-1 text-[#6B7280] hover:bg-[#F5F5F5]" aria-label="닫기">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 p-6 max-h-[70vh] overflow-y-auto">
          <Field label="사번 (코드)">
            <Input
              value={form.employee_code ?? ''}
              onChange={(e) => set('employee_code', nullable(e.target.value))}
              placeholder="예: 04939"
              className="font-mono"
              disabled={loading}
            />
          </Field>
          <Field label="공종">
            <Input
              value={form.default_trade ?? ''}
              onChange={(e) => set('default_trade', nullable(e.target.value))}
              placeholder="미장공, 줄눈공 등"
              disabled={loading}
            />
          </Field>

          <Field label="성명" required error={errors.name}>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} disabled={loading} />
          </Field>
          <Field label="기본 일당 (원)" required error={errors.default_wage}>
            <Input
              type="number"
              value={form.default_wage || ''}
              onChange={(e) => set('default_wage', e.target.value === '' ? 0 : Number(e.target.value))}
              placeholder="270000"
              min={0}
              step={10000}
              className="text-right tabular-nums"
              disabled={loading}
            />
          </Field>

          <Field
            label="주민번호"
            required={!isEdit}
            error={errors.rrn}
            className="col-span-2"
          >
            <Input
              value={form.rrn}
              onChange={(e) => set('rrn', e.target.value)}
              placeholder="000000-0000000"
              className="font-mono"
              inputMode="numeric"
              disabled={loading}
            />
          </Field>

          <Field label="주소" className="col-span-2">
            <Input
              value={form.address ?? ''}
              onChange={(e) => set('address', nullable(e.target.value))}
              disabled={loading}
            />
          </Field>

          <Field label="은행명">
            <Input
              list="worker-bank-list"
              value={form.bank_name ?? ''}
              onChange={(e) => set('bank_name', nullable(e.target.value))}
              placeholder="은행 선택 또는 입력"
              disabled={loading}
            />
            <datalist id="worker-bank-list">
              {bankOptions.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <Field label="계좌번호">
            <Input
              value={form.account_number ?? ''}
              onChange={(e) => set('account_number', nullable(e.target.value))}
              className="font-mono"
              disabled={loading}
            />
          </Field>
          <Field label="예금주">
            <Input
              value={form.account_holder ?? ''}
              onChange={(e) => set('account_holder', nullable(e.target.value))}
              disabled={loading}
            />
          </Field>
          <Field label="연락처">
            <Input
              value={form.phone ?? ''}
              onChange={(e) => set('phone', nullable(e.target.value))}
              placeholder="010-0000-0000"
              className="font-mono"
              disabled={loading}
            />
          </Field>

          {submitErr && <p className="col-span-2 text-sm text-red-600">{submitErr}</p>}

          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>취소</Button>
            <Button type="submit" disabled={loading}>{loading ? '저장 중...' : (isEdit ? '저장' : '추가')}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function buildInitial(initial?: Worker): WorkerInput {
  return {
    employee_code: initial?.employee_code ?? null,
    name: initial?.name ?? '',
    rrn: initial?.rrn_plain ? formatRrnPlain(initial.rrn_plain) : '',
    default_trade: initial?.default_trade ?? null,
    default_wage: initial?.default_wage ?? 0,
    bank_name: initial?.bank_name ?? null,
    account_number: initial?.account_number ?? null,
    account_holder: initial?.account_holder ?? null,
    phone: initial?.phone ?? null,
    address: initial?.address ?? null,
  };
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
