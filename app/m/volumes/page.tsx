'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { VolumesForm, type VolumesMe } from '@/components/mobile/volumes-form';
import { getBrowserSupabase } from '@/lib/supabase/client';

export default function WorkerVolumesPage() {
  const router = useRouter();
  const sb = getBrowserSupabase();
  const [data, setData] = useState<VolumesMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 재조회 시 loading을 켜면 폼이 언마운트돼 저장 토스트가 사라짐 — 첫 로드만 로딩 표시
  const load = useCallback(async () => {
    setError(null);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      router.replace('/m/signup');
      return;
    }
    const { data: res, error: rpcErr } = await sb.rpc('yeseong_mobile_get_volumes_me');
    if (rpcErr) {
      setError(rpcErr.message);
      setLoading(false);
      return;
    }
    setData(res as unknown as VolumesMe);
    setLoading(false);
  }, [sb, router]);

  useEffect(() => { load(); }, [load]);

  return (
    <MobileShell showTabs activeTab="volumes" variant="worker">
      <div className="p-5 pt-14">
        <header className="mb-4">
          <h1 className="text-[34px] font-bold text-zinc-900">매사 성과</h1>
          <p className="text-sm text-zinc-500 mt-0.5">조적·미장 작업 물량을 입력합니다</p>
        </header>

        {loading ? (
          <p className="text-center text-zinc-400 py-10">불러오는 중...</p>
        ) : error ? (
          <div className="rounded-[10px] bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : data ? (
          <VolumesForm data={data} onSaved={load} />
        ) : null}
      </div>
    </MobileShell>
  );
}
