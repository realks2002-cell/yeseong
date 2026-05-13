'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, Save } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { getBrowserSupabase } from '@/lib/supabase/client';

type Option = { id: string; name: string };
type Me = {
  manager: { id: string; name: string; phone: string };
  worksites: Option[];
};

export default function ManagerAssignmentsPage() {
  const router = useRouter();
  const sb = getBrowserSupabase();
  const [isFirstSetup, setIsFirstSetup] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsFirstSetup(new URLSearchParams(window.location.search).get('first') === '1');
    }
  }, []);

  const [all, setAll] = useState<Option[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      router.replace('/m/manager/signup');
      return;
    }
    const [meRes, optsRes] = await Promise.all([
      sb.rpc('yeseong_manager_get_me'),
      fetch('/api/m/options', { credentials: 'include' }).then((r) => r.json()),
    ]);
    if (meRes.error || !meRes.data) {
      setError(meRes.error?.message ?? '프로필 로드 실패');
      setLoading(false);
      return;
    }
    const me = meRes.data as unknown as Me;
    setAll(optsRes.worksites ?? []);
    setSelected(new Set(me.worksites.map((w) => w.id)));
    setLoading(false);
  }, [sb, router]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (busy || selected.size === 0) return;
    setBusy(true);
    setError(undefined);
    const { error: rpcErr } = await sb.rpc('yeseong_manager_set_assignments', {
      p_worksite_ids: Array.from(selected),
    });
    setBusy(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    router.replace('/m/manager/home');
    router.refresh();
  };

  if (loading) {
    return (
      <MobileShell>
        <div className="flex h-full items-center justify-center text-zinc-400">로딩...</div>
      </MobileShell>
    );
  }

  return (
    <MobileShell>
      <div className="flex h-full min-h-svh sm:min-h-[860px] flex-col px-7 pt-8 pb-10">
        <div className="flex items-center">
          {!isFirstSetup && (
            <button
              onClick={() => router.back()}
              className="-ml-2 inline-flex h-12 w-12 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100"
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
          )}
        </div>

        <h1 className="mt-6 text-[32px] font-bold leading-tight text-zinc-900">
          담당하시는<br />현장을 선택해주세요
        </h1>
        <p className="mt-3 text-base text-zinc-500">
          여러 현장을 선택할 수 있어요. 나중에 변경 가능합니다.
        </p>

        <ul className="mt-8 space-y-3">
          {all.map((w) => {
            const on = selected.has(w.id);
            return (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => toggle(w.id)}
                  className={
                    'flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-4 text-left ring-2 transition active:scale-[0.99] ' +
                    (on
                      ? 'bg-blue-900 text-white ring-blue-900'
                      : 'bg-white text-zinc-700 ring-zinc-200 hover:ring-zinc-400')
                  }
                >
                  <span className="min-w-0 flex-1 text-lg font-bold leading-snug break-keep">{w.name}</span>
                  {on && (
                    <span className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-blue-900">
                      <Check className="h-5 w-5" />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {all.length === 0 && (
            <li className="rounded-2xl bg-zinc-50 px-6 py-10 text-center text-zinc-500">
              등록된 현장이 없습니다.
            </li>
          )}
        </ul>

        {error && <p className="mt-4 text-base font-semibold text-red-800">{error}</p>}

        <div className="mt-auto pt-10">
          <button
            onClick={save}
            disabled={busy || selected.size === 0}
            className={
              'flex h-[78px] w-full items-center justify-center gap-2 rounded-2xl text-2xl font-bold transition ' +
              (busy || selected.size === 0
                ? 'bg-zinc-100 text-zinc-400'
                : 'bg-blue-900 text-white active:scale-[0.98]')
            }
          >
            <Save className="h-6 w-6" />
            {busy ? '저장 중...' : `${selected.size}개 현장 저장`}
          </button>
        </div>
      </div>
    </MobileShell>
  );
}
