'use client';
import { useEffect, useState } from 'react';
import { Smartphone, Eye } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { formatPhone } from '@/lib/auth/phone-email';

type Manager = { id: string; name: string; phone: string | null; is_active?: boolean };

export default function ManagerViewPage() {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/managers')
      .then(async (r) => {
        if (!r.ok) throw new Error('팀장 목록을 불러오지 못했습니다');
        return r.json();
      })
      .then((d: Manager[]) => setManagers(Array.isArray(d) ? d : []))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl p-6 space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#091413]">팀장 화면 보기</h1>
            <p className="mt-0.5 text-sm text-[#6B7280]">
              팀장 앱에 실제로 표시되는 화면과 데이터를 그대로 미러링합니다
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-[5px] bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
            <Eye className="h-3.5 w-3.5" /> 보기 전용 · 승인/저장은 동작하지 않습니다
          </span>
        </header>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <label className="shrink-0 text-sm font-semibold text-[#091413]">팀장 선택</label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={loading}
              className="h-10 w-full max-w-sm rounded-[5px] border border-[#D7D7D7] bg-white px-3 text-sm text-[#091413] focus:outline-none focus:ring-2 focus:ring-[#447D9B] disabled:bg-[#F5F5F5]"
            >
              <option value="">{loading ? '불러오는 중...' : '팀장을 선택하세요'}</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.phone ? ` (${formatPhone(m.phone)})` : ''}
                  {m.is_active === false ? ' · 비활성' : ''}
                </option>
              ))}
            </select>
          </div>
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        </Card>

        {selected ? (
          <div className="flex justify-center py-4">
            <div
              className="overflow-hidden rounded-[40px] bg-white ring-1 ring-[#D7D7D7] shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)]"
              style={{ width: 390, height: 820 }}
            >
              <iframe
                key={selected}
                src={`/m/manager/home?mirror=${selected}`}
                title="팀장앱 미러"
                className="h-full w-full border-0"
              />
            </div>
          </div>
        ) : (
          <Card className="flex flex-col items-center justify-center py-20 text-center">
            <Smartphone className="h-10 w-10 text-[#D7D7D7]" />
            <p className="mt-3 text-sm text-[#6B7280]">
              위에서 팀장을 선택하면
              <br />그 팀장의 앱 화면이 여기에 표시됩니다
            </p>
          </Card>
        )}
      </div>
    </AdminShell>
  );
}
