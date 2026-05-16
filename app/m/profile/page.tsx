'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { formatPhone } from '@/lib/auth/phone-email';

type Me = {
  worker: { id: string; name: string; phone: string | null; default_worksite_id: string | null; default_subcontractor_id: string | null };
  worksite: { id: string; name: string } | null;
  subcontractor: { id: string; name: string } | null;
};
type Option = { id: string; name: string };

export default function ProfilePage() {
  const router = useRouter();
  const sb = getBrowserSupabase();

  const [me, setMe] = useState<Me | null>(null);
  const [worksites, setWorksites] = useState<Option[]>([]);
  const [subcontractors, setSubcontractors] = useState<Option[]>([]);
  const [worksiteId, setWorksiteId] = useState('');
  const [subcontractorId, setSubcontractorId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      router.replace('/m/signup');
      return;
    }
    const [meRes, optsRes] = await Promise.all([
      sb.rpc('yeseong_mobile_get_me'),
      fetch('/api/m/options', { credentials: 'include' }).then((r) => r.json()),
    ]);
    if (meRes.error || !meRes.data) {
      setError(meRes.error?.message ?? '프로필 로드 실패');
      return;
    }
    const data = meRes.data as unknown as Me;
    setMe(data);
    setWorksiteId(data.worker.default_worksite_id ?? '');
    setSubcontractorId(data.worker.default_subcontractor_id ?? '');
    setWorksites(optsRes.worksites ?? []);
    setSubcontractors(optsRes.subcontractors ?? []);
  }, [sb, router]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!worksiteId || !subcontractorId || busy) return;
    setBusy(true);
    setError(undefined);
    setMsg(undefined);
    const { error: rpcErr } = await sb.rpc('yeseong_mobile_set_defaults', {
      p_worksite_id: worksiteId,
      p_subcontractor_id: subcontractorId,
    });
    setBusy(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setMsg('저장되었어요');
    await load();
  };

  if (!me) {
    return (
      <MobileShell showTabs activeTab="affiliation">
        <div className="flex h-full items-center justify-center text-zinc-400">로딩...</div>
      </MobileShell>
    );
  }

  return (
    <MobileShell showTabs activeTab="affiliation">
      <div className="px-7 pt-10 pb-8">
        <h1 className="text-[34px] font-bold text-zinc-900">소속</h1>
      </div>

      <section className="mx-7 mb-8 rounded-[5px] bg-blue-900 p-6 text-center text-white">
        <p className="text-[26px] font-bold leading-tight">{me.worker.name}</p>
        <p className="mt-1 text-lg font-semibold text-blue-200">
          {me.worker.phone ? formatPhone(me.worker.phone) : '-'}
        </p>
      </section>

      <section className="px-7 space-y-5">
        <div>
          <label className="text-base font-semibold text-zinc-500">소속</label>
          <select
            value={subcontractorId}
            onChange={(e) => setSubcontractorId(e.target.value)}
            className="mt-2 w-full rounded-[5px] bg-white px-5 py-4 text-lg font-bold text-zinc-900 ring-2 ring-zinc-200 focus:ring-blue-900 outline-none"
          >
            <option value="">선택하세요</option>
            {subcontractors.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-base font-semibold text-zinc-500">현장</label>
          <select
            value={worksiteId}
            onChange={(e) => setWorksiteId(e.target.value)}
            className="mt-2 w-full rounded-[5px] bg-white px-5 py-4 text-lg font-bold text-zinc-900 ring-2 ring-zinc-200 focus:ring-blue-900 outline-none"
          >
            <option value="">선택하세요</option>
            {worksites.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        <button
          onClick={save}
          disabled={!worksiteId || !subcontractorId || busy}
          className="flex h-[68px] w-full items-center justify-center gap-2 rounded-[5px] bg-blue-900 text-lg font-bold text-white disabled:bg-zinc-200 disabled:text-zinc-400"
        >
          <Save className="h-5 w-5" />
          {busy ? '저장 중...' : '저장'}
        </button>

        {msg && <p className="text-base font-semibold text-blue-900">{msg}</p>}
        {error && <p className="text-base font-semibold text-red-800">{error}</p>}
      </section>

    </MobileShell>
  );
}
