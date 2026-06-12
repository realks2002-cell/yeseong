'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, AlertTriangle } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { AnnouncementPopup } from '@/components/mobile/announcement-popup';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { registerPush } from '@/lib/capacitor/push';
import { getPositionWithRetry } from '@/lib/capacitor/geolocation';
import { startForegroundPolling } from '@/lib/capacitor/foreground-gps';

type Hours = 0.5 | 1 | 1.5 | 2;

const NORMAL_OPTIONS: { value: Hours; title: string; sub: string; cls: string }[] = [
  { value: 0.5, title: '0.5 일', sub: '반나절', cls: 'bg-white text-blue-900 ring-blue-200' },
  { value: 1,   title: '1 일',   sub: '정상',   cls: 'bg-blue-900 text-white ring-blue-900' },
];

type AttendanceStatus = 'pending' | 'approved' | 'rejected';

type Me = {
  worker: { id: string; name: string; phone: string | null; default_trade: string | null; default_worksite_id: string | null; default_subcontractor_id: string | null };
  worksite: { id: string; name: string } | null;
  subcontractor: { id: string; name: string } | null;
  team_leader: { id: string; name: string } | null;
  recent: Array<{ work_date: string; hours: number; approval_status: AttendanceStatus; rejection_reason: string | null }>;
};

const TODAY_ISO = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

const TODAY_LABEL = (() => {
  const d = new Date();
  const dow = ['일','월','화','수','목','금','토'][d.getDay()];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${dow})`;
})();

export default function HomePage() {
  const router = useRouter();
  const sb = getBrowserSupabase();

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<Hours | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) {
        router.replace('/m/signup');
        return;
      }
      const { data, error: rpcErr } = await sb.rpc('yeseong_mobile_get_me');
      if (rpcErr || !data) {
        setError(rpcErr?.message ?? '프로필 로드 실패');
        return;
      }
      setMe(data as unknown as Me);
    } finally {
      setLoading(false);
    }
  }, [sb, router]);

  useEffect(() => {
    load();
    registerPush('worker');
    // GPS 3 레이어 — 위치 획득 시 서버에 기록
    const reportGps = (lat: number, lng: number) => {
      fetch('/api/m/gps-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: lat, longitude: lng }),
      }).catch(() => {});
    };
    // 백그라운드 워처 비활성화 (구글 심사 대응) — 복구 시 startBackgroundTracking(reportGps) + 매니페스트 권한 2줄 복원
    // 포그라운드 폴링 (앱 사용 중 허용만으로 작동, 5분마다)
    startForegroundPolling(reportGps);
  }, [load]);

  const todayRecord = me?.recent.find((r) => r.work_date === TODAY_ISO) ?? null;
  const isRejected = todayRecord?.approval_status === 'rejected';
  const showRegister = todayRecord === null || isRejected;

  const submit = async (h: Hours) => {
    if (busy) return;
    setBusy(true);
    setError(undefined);

    // ③ GPS 좌표 가져오기 — 실패 시 재시도 + 최근 위치 폴백
    const pos = await getPositionWithRetry();

    const { error: rpcErr } = await sb.rpc('yeseong_mobile_register_attendance', {
      p_work_date: TODAY_ISO,
      p_hours: h,
      p_latitude: pos?.latitude ?? null,
      p_longitude: pos?.longitude ?? null,
    });
    setBusy(false);
    setConfirm(null);
    if (rpcErr) {
      if (rpcErr.message.includes('already approved')) {
        setError('이미 승인 완료된 출역입니다. 새로고침 후 확인해주세요.');
        await load();
      } else {
        setError(rpcErr.message);
      }
      return;
    }
    await load();
  };

  if (loading) {
    return (
      <MobileShell showTabs activeTab="home">
        <div className="flex h-full items-center justify-center text-zinc-400">로딩...</div>
      </MobileShell>
    );
  }

  if (!me?.worksite) {
    return (
      <MobileShell showTabs activeTab="home">
        <div className="px-7 pt-10">
          <h1 className="text-2xl font-bold text-zinc-900">현장이 아직 설정되지 않았어요</h1>
          <p className="mt-3 text-base leading-relaxed text-zinc-500">
            {me?.team_leader
              ? '팀장님이 현장을 설정하면 자동으로 표시돼요. 관리자에게 문의해주세요.'
              : '아직 팀장이 배정되지 않았어요. 관리자에게 문의해주세요.'}
          </p>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell showTabs activeTab="home">
      <div className="px-7 pt-14 pb-4">
        <p className="text-[24px] font-bold text-zinc-700">{TODAY_LABEL}</p>
        <h1 className="mt-8 text-[26px] font-bold leading-tight text-zinc-900">
          {me.worker.name}님
          {me.worker.default_trade && (
            <span className="ml-2 text-[20px] font-semibold text-zinc-500">
              ({me.worker.default_trade})
            </span>
          )}
        </h1>
      </div>

      {isRejected && todayRecord && (
        <RejectedNotice hours={todayRecord.hours} reason={todayRecord.rejection_reason} />
      )}
      {showRegister ? (
        <RegisterView onPick={setConfirm} />
      ) : todayRecord ? (
        <LockedView hours={todayRecord.hours} />
      ) : null}

      {error && <p className="mx-7 mt-4 text-base font-semibold text-red-800">{error}</p>}

      <HistorySection recent={me.recent} />

      {confirm !== null && (
        <ConfirmDialog
          hours={confirm}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => submit(confirm)}
        />
      )}

      <AnnouncementPopup />
    </MobileShell>
  );
}

function RegisterView({ onPick }: { onPick: (h: Hours) => void }) {
  return (
    <section className="mt-4 px-7">
      <h2 className="text-2xl font-bold text-zinc-900">오늘 근무를 등록해주세요</h2>
      <ul className="mt-5 space-y-3">
        {NORMAL_OPTIONS.map((o) => (
          <li key={o.value}>
            <button
              onClick={() => onPick(o.value)}
              className={
                'flex h-[88px] w-full items-center justify-between rounded-[5px] px-7 ring-2 transition active:scale-[0.99] ' +
                o.cls
              }
            >
              <span className="text-[34px] font-bold">{o.title}</span>
              <span className="text-xl font-semibold opacity-90">{o.sub}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RejectedNotice({ hours, reason }: { hours: number; reason: string | null }) {
  return (
    <section className="mx-7 mb-4 rounded-[5px] bg-red-50 px-6 py-5 ring-2 ring-red-200">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <p className="text-base font-bold text-red-800">
            팀장님이 출역을 반려했습니다
          </p>
          <p className="mt-1 text-sm text-red-700">
            기존 등록: <span className="font-semibold">{hours}일</span>
          </p>
          {reason && (
            <p className="mt-2 rounded-[5px] bg-white px-3 py-2 text-sm leading-relaxed text-zinc-700">
              사유: {reason}
            </p>
          )}
          <p className="mt-3 text-sm font-semibold text-red-800">
            아래에서 다시 등록해주세요.
          </p>
        </div>
      </div>
    </section>
  );
}

function LockedView({ hours }: { hours: number }) {
  return (
    <section className="mx-7 rounded-[5px] bg-blue-900 px-8 py-10 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold text-blue-200">오늘 등록 완료</p>
          <p className="mt-2 text-[56px] font-bold leading-none">{hours}일</p>
        </div>
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-white text-blue-900">
          <Check className="h-9 w-9" />
        </span>
      </div>
      <p className="mt-8 text-base text-blue-200">
        수정이 필요하시면 팀장님께 말씀해주세요
      </p>
    </section>
  );
}

function HistorySection({
  recent,
}: {
  recent: Array<{ work_date: string; hours: number; approval_status: AttendanceStatus; rejection_reason: string | null }>;
}) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const todayDate = now.getDate();
  const startDow = new Date(y, m, 1).getDay();
  const numDays = new Date(y, m + 1, 0).getDate();
  const iso = (day: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const byDate = new Map(recent.map((r) => [r.work_date, r]));

  // 합계는 이번 달, 반려 건 제외
  let total = 0;
  for (let d = 1; d <= numDays; d++) {
    const r = byDate.get(iso(d));
    if (r && r.approval_status !== 'rejected') total += r.hours;
  }

  const cells: Array<number | null> = [
    ...Array.from({ length: startDow }, () => null),
    ...Array.from({ length: numDays }, (_, i) => i + 1),
  ];

  return (
    <section className="mt-10 px-7 pb-10">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-zinc-900">{m + 1}월 출역</h2>
        <span className="text-base font-semibold text-zinc-400">합계 {total}일</span>
      </div>
      <div className="mt-4 rounded-[5px] bg-white p-3 ring-1 ring-zinc-200">
        <div className="grid grid-cols-7 text-center text-xs font-semibold text-zinc-400">
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
            <span key={d} className={i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : ''}>
              {d}
            </span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7">
          {cells.map((day, idx) => {
            if (day === null) return <div key={`e${idx}`} className="h-14" />;
            const r = byDate.get(iso(day));
            const isToday = day === todayDate;
            const isFuture = day > todayDate;
            const isRejected = r?.approval_status === 'rejected';
            const isPending = r?.approval_status === 'pending';
            const hoursClass = isRejected
              ? 'text-red-500 line-through'
              : isPending
              ? 'text-amber-600'
              : 'text-blue-900';
            return (
              <div key={day} className="flex h-14 flex-col items-center pt-1">
                <span
                  className={
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ' +
                    (isToday
                      ? 'bg-blue-900 text-white'
                      : isFuture
                      ? 'text-zinc-300'
                      : 'text-zinc-600')
                  }
                >
                  {day}
                </span>
                {r ? (
                  <span className={'mt-0.5 text-[13px] font-bold ' + hoursClass}>{r.hours}일</span>
                ) : (
                  !isFuture && <span className="mt-0.5 text-sm text-zinc-200">─</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ConfirmDialog({
  hours,
  busy,
  onCancel,
  onConfirm,
}: {
  hours: Hours;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-blue-950/50 sm:items-center">
      <div className="w-full sm:max-w-[400px] rounded-t-[5px] sm:rounded-[5px] bg-white p-7">
        <p className="text-center text-xl text-zinc-500">오늘 근무를</p>
        <p className="mt-2 text-center text-[44px] font-bold text-zinc-900">{hours}일로 등록할까요?</p>
        <p className="mt-3 text-center text-base text-zinc-500">등록 후 수정은 팀장님만 가능해요</p>
        <div className="mt-7 grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="h-[68px] rounded-[5px] bg-zinc-100 text-xl font-bold text-zinc-700 disabled:opacity-50"
          >
            아니오
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="h-[68px] rounded-[5px] bg-blue-900 text-xl font-bold text-white disabled:opacity-60"
          >
            {busy ? '등록 중...' : '네, 등록할게요'}
          </button>
        </div>
      </div>
    </div>
  );
}
