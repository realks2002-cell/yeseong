'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { VolumesForm, type VolumesMe } from '@/components/mobile/volumes-form';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { getMirrorId, mirrorFetch } from '@/lib/manager/mirror';

export default function ManagerVolumesPage() {
  const router = useRouter();
  const sb = getBrowserSupabase();
  const [data, setData] = useState<VolumesMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const mirror = getMirrorId();
    if (mirror) {
      setReadOnly(true);
      try {
        setData(await mirrorFetch<VolumesMe>('volumes', mirror));
      } catch (e) {
        setError((e as Error).message);
      }
      setLoading(false);
      return;
    }
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      router.replace('/m/manager/signup');
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
    <MobileShell showTabs activeTab="volumes" variant="manager">
      <div className="p-5">
        <header className="mb-4">
          <h1 className="text-xl font-bold text-zinc-900">매사 성과</h1>
          <p className="text-sm text-zinc-500 mt-0.5">본인 조적·미장 작업 물량을 입력합니다</p>
        </header>

        {loading ? (
          <p className="text-center text-zinc-400 py-10">불러오는 중...</p>
        ) : error ? (
          <div className="rounded-[10px] bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : data ? (
          <VolumesForm data={data} onSaved={load} readOnly={readOnly} />
        ) : null}
      </div>
    </MobileShell>
  );
}
