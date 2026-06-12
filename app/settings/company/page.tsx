'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Form = {
  company_name: string;
  business_number: string;
  representative: string;
  address: string;
};

const EMPTY: Form = { company_name: '', business_number: '', representative: '', address: '' };

export default function CompanySettingsPage() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/settings/company', { cache: 'no-store' });
    if (!r.ok) {
      setError(`로드 실패: ${r.status}`);
      return;
    }
    const j = await r.json();
    setForm({
      company_name: j.company_name ?? '',
      business_number: j.business_number ?? '',
      representative: j.representative ?? '',
      address: j.address ?? '',
    });
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!form.company_name.trim()) {
      setError('회사명은 필수입니다');
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    const r = await fetch('/api/settings/company', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? `저장 실패: ${r.status}`);
      return;
    }
    setMsg('저장되었습니다');
  }

  return (
    <AdminShell>
      <div className="max-w-2xl p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">회사 정보</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">기본 정보</CardTitle>
            <CardDescription>* 표시는 필수</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!loaded ? (
              <p className="text-sm text-[#9CA3AF]">불러오는 중...</p>
            ) : (
              <>
                <Field label="회사명 *">
                  <Input
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    placeholder="(주)예성건축"
                  />
                </Field>
                <Field label="사업자번호">
                  <Input
                    value={form.business_number}
                    onChange={(e) => setForm({ ...form, business_number: e.target.value })}
                    placeholder="123-45-67890"
                  />
                </Field>
                <Field label="대표자">
                  <Input
                    value={form.representative}
                    onChange={(e) => setForm({ ...form, representative: e.target.value })}
                  />
                </Field>
                <Field label="주소">
                  <Input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </Field>

                {error && <p className="text-sm text-red-600">{error}</p>}
                {msg && <p className="text-sm text-green-700">{msg}</p>}

                <div className="flex justify-end pt-2">
                  <Button onClick={save} disabled={busy}>
                    {busy ? '저장 중...' : '저장'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-[#091413]">{label}</label>
      {children}
    </div>
  );
}
