'use client';
import { useCallback, useEffect, useState } from 'react';
import { toUserMessage } from '@/lib/errors/message';
import { useRouter } from 'next/navigation';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { VolumesForm, type VolumesMe } from '@/components/mobile/volumes-form';
import { ManagerVolumesReview } from '@/components/mobile/manager-volumes-review';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { getMirrorId, mirrorFetch } from '@/lib/manager/mirror';

type View = 'mine' | 'team';

export default function ManagerVolumesPage() {
  const router = useRouter();
  const sb = getBrowserSupabase();
  const [data, setData] = useState<VolumesMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [view, setView] = useState<View>('mine');
  const [teamCount, setTeamCount] = useState<number | null>(null);

  // 재조회 시 loading을 켜면 폼이 언마운트돼 저장 토스트가 사라짐 — 첫 로드만 로딩 표시
  const load = useCallback(async () => {
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
      setError(toUserMessage(rpcErr));
      setLoading(false);
      return;
    }
    setData(res as unknown as VolumesMe);
    setLoading(false);
  }, [sb, router]);

  // 팀원 검토 대기 건수 (탭 배지용) — 미러 모드에서는 미지원
  const loadTeamCount = useCallback(async () => {
    if (getMirrorId()) return;
    const { data, error } = await sb.rpc('yeseong_manager_list_pending_volumes');
    if (!error) setTeamCount(((data as unknown as unknown[]) ?? []).length);
  }, [sb]);

  useEffect(() => { load(); loadTeamCount(); }, [load, loadTeamCount]);

  return (
    <MobileShell showTabs activeTab="volumes" variant="manager">
      <div className="p-5 pt-14">
        <header className="mb-4">
          <h1 className="text-[34px] font-bold text-zinc-900">매사 성과</h1>
          <p className="text-sm text-zinc-500 mt-0.5">본인 입력 후 팀원 성과를 검토·제출합니다</p>
        </header>

        {!readOnly && (
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-[10px] bg-zinc-100 p-1">
            <SegBtn active={view === 'mine'} onClick={() => setView('mine')}>내 성과</SegBtn>
            <SegBtn active={view === 'team'} onClick={() => { setView('team'); }}>
              팀원 검토{teamCount ? ` (${teamCount})` : ''}
            </SegBtn>
          </div>
        )}

        {view === 'mine' ? (
          loading ? (
            <p className="text-center text-zinc-400 py-10">불러오는 중...</p>
          ) : error ? (
            <div className="rounded-[10px] bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : data ? (
            <VolumesForm data={data} onSaved={load} readOnly={readOnly} role="manager" />
          ) : null
        ) : (
          <ManagerVolumesReview onCountChange={setTeamCount} />
        )}
      </div>
    </MobileShell>
  );
}

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'h-10 rounded-[8px] text-sm font-bold transition ' +
        (active ? 'bg-white text-navy shadow-sm' : 'text-zinc-500')
      }
    >
      {children}
    </button>
  );
}
