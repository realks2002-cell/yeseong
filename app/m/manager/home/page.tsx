'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toUserMessage } from '@/lib/errors/message';
import { useRouter } from 'next/navigation';
import { Check, CheckCheck, ClipboardCheck, X } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { AnnouncementPopup } from '@/components/mobile/announcement-popup';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { getMirrorId, mirrorFetch } from '@/lib/manager/mirror';
import { registerPush } from '@/lib/capacitor/push';
import { getPositionWithRetry } from '@/lib/capacitor/geolocation';
import { startTrackingScheduler, stopTrackingScheduler, requestSync } from '@/lib/capacitor/tracking';
import { AlwaysLocationPrompt } from '@/components/mobile/always-location-prompt';

type PendingItem = {
  attendance_id: string;
  work_date: string;
  hours: number;
  source: string;
  worker_name: string;
  worker_phone: string | null;
  worker_trade: string | null;
  is_self?: boolean;
  worksite_id: string;
  worksite_name: string;
  subcontractor_name: string | null;
  created_at: string;
};

type MyAttendance = {
  attendance_id: string;
  work_date: string;
  hours: number;
  approval_status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  worksite_name: string;
} | null;

const TODAY_ISO = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

const TODAY_LABEL = (() => {
  const d = new Date();
  const dow = ['일','월','화','수','목','금','토'][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${dow})`;
})();

type Me = {
  manager: { id: string; name: string; phone: string };
  worksites: Array<{ id: string; name: string }>;
};

export default function ManagerHomePage() {
  const router = useRouter();
  const sb = getBrowserSupabase();

  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<PendingItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [rejectTarget, setRejectTarget] = useState<PendingItem | null>(null);
  const [approveAllBusy, setApproveAllBusy] = useState(false);
  const [confirmApproveAll, setConfirmApproveAll] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [myAtt, setMyAtt] = useState<MyAttendance>(null);
  const [myAttBusy, setMyAttBusy] = useState(false);
  const [confirmMyHours, setConfirmMyHours] = useState<0.5 | 1 | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const mirror = getMirrorId();
    if (mirror) {
      setReadOnly(true);
      try {
        const list = await mirrorFetch<PendingItem[]>('pending', mirror);
        setItems(list ?? []);
      } catch (e) {
        setError((e as Error).message);
      }
      setLoading(false);
      return;
    }
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      router.replace('/m/manager/signup');
      return;
    }
    const [meRes, listRes, myAttRes] = await Promise.all([
      sb.rpc('yeseong_manager_get_me'),
      sb.rpc('yeseong_manager_list_pending_attendance'),
      sb.rpc('yeseong_manager_my_attendance', { p_work_date: TODAY_ISO }),
    ]);
    if (meRes.error) {
      setError(meRes.error.message);
      setLoading(false);
      return;
    }
    const meData = meRes.data as unknown as Me | null;
    if (!meData?.manager) {
      router.replace('/m/manager/signup');
      return;
    }
    if (!meData.worksites || meData.worksites.length === 0) {
      router.replace('/m/manager/assignments?first=1');
      return;
    }
    setMe(meData);
    if (listRes.error) {
      setError(listRes.error.message);
    } else {
      setItems((listRes.data as unknown as PendingItem[]) ?? []);
    }
    if (!myAttRes.error) {
      setMyAtt((myAttRes.data as unknown as MyAttendance) ?? null);
    }
    setLoading(false);
  }, [sb, router]);

  const reportGps = useCallback((lat: number, lng: number) => {
    fetch('/api/m/gps-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: lat, longitude: lng }),
    }).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    registerPush('manager');
    // 추적 스케줄러 — 근무 시간대(08:00~17:00)에만 가동 (미러/보기전용 모드 제외)
    if (!getMirrorId()) {
      startTrackingScheduler(reportGps);
      return () => stopTrackingScheduler();
    }
  }, [load, reportGps]);

  // "항상 허용" 부여 직후 즉시 재평가 (시간대 내이면 백그라운드 워처 시작)
  const onAlways = useCallback(() => { requestSync(); }, []);

  // 내 출역 제출 (0.5 / 1일) — 본인 출역도 아래 검토 리스트에 포함된다
  const submitMyAttendance = async (h: 0.5 | 1) => {
    if (readOnly || myAttBusy) return;
    setMyAttBusy(true);
    setError(undefined);
    const pos = await getPositionWithRetry();
    const { error: rpcErr } = await sb.rpc('yeseong_manager_register_my_attendance', {
      p_work_date: TODAY_ISO,
      p_hours: h,
      p_latitude: pos?.latitude ?? null,
      p_longitude: pos?.longitude ?? null,
    });
    setMyAttBusy(false);
    setConfirmMyHours(null);
    if (rpcErr) {
      setError(rpcErr.message.includes('already approved')
        ? '이미 승인 완료된 출역입니다.'
        : toUserMessage(rpcErr));
      return;
    }
    await load();
  };

  const approve = async (item: PendingItem) => {
    if (readOnly || busyId) return;
    setBusyId(item.attendance_id);
    setError(undefined);
    const { error: rpcErr } = await sb.rpc('yeseong_manager_approve_attendance', {
      p_attendance_id: item.attendance_id,
      p_approve: true,
      p_reason: null,
    });
    setBusyId(null);
    if (rpcErr) {
      setError(toUserMessage(rpcErr));
      return;
    }
    setItems((prev) => (prev ?? []).filter((x) => x.attendance_id !== item.attendance_id));
  };

  const reject = async (item: PendingItem, reason: string) => {
    if (readOnly || busyId) return;
    setBusyId(item.attendance_id);
    setError(undefined);
    const { error: rpcErr } = await sb.rpc('yeseong_manager_approve_attendance', {
      p_attendance_id: item.attendance_id,
      p_approve: false,
      p_reason: reason || null,
    });
    setBusyId(null);
    setRejectTarget(null);
    if (rpcErr) {
      setError(toUserMessage(rpcErr));
      return;
    }
    // 작업자에게 반려 푸시 (실패해도 무시 — 보조 채널)
    fetch('/api/push/attendance-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendanceId: item.attendance_id }),
    }).catch(() => {});
    setItems((prev) => (prev ?? []).filter((x) => x.attendance_id !== item.attendance_id));
  };

  const approveAll = async () => {
    if (readOnly || approveAllBusy) return;
    setApproveAllBusy(true);
    setError(undefined);
    const { data, error: rpcErr } = await sb.rpc('yeseong_manager_approve_all_pending');
    setApproveAllBusy(false);
    setConfirmApproveAll(false);
    if (rpcErr) {
      setError(toUserMessage(rpcErr));
      return;
    }
    setItems([]);
    console.log(`승인 처리 ${data}건`);
  };

  const grouped = useMemo(() => {
    if (!items) return [];
    const byDate = new Map<string, PendingItem[]>();
    for (const it of items) {
      if (!byDate.has(it.work_date)) byDate.set(it.work_date, []);
      byDate.get(it.work_date)!.push(it);
    }
    return Array.from(byDate.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [items]);

  if (loading) {
    return (
      <MobileShell showTabs activeTab="home" variant="manager">
        <div className="flex h-full items-center justify-center text-zinc-400">로딩...</div>
      </MobileShell>
    );
  }

  return (
    <MobileShell showTabs activeTab="home" variant="manager">
      <section className="px-7 pt-14 pb-10">
        {!readOnly && <AlwaysLocationPrompt appName="예성건축 팀장" onAlways={onAlways} />}
        {/* 내 출역 — 팀장 본인 출역 제출 */}
        {!readOnly && (
          <div className="mb-7">
            <div className="flex items-center justify-between pr-12">
              <h2 className="text-xl font-bold text-zinc-900">내 출역</h2>
              <span className="text-sm font-semibold text-zinc-400">{TODAY_LABEL}</span>
            </div>
            {myAtt && myAtt.approval_status !== 'rejected' ? (
              <div className="mt-3 flex items-center gap-3 rounded-[5px] bg-zinc-50 px-4 py-4 ring-1 ring-zinc-200">
                <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  myAtt.approval_status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-navy'
                }`}>
                  <Check className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-zinc-900">
                    {myAtt.hours}일 제출됨
                    <span className={`ml-2 text-sm font-semibold ${
                      myAtt.approval_status === 'approved' ? 'text-emerald-600' : 'text-navy'
                    }`}>
                      {myAtt.approval_status === 'approved' ? '승인 완료' : '검토 대기'}
                    </span>
                  </p>
                  <p className="truncate text-sm text-zinc-500">
                    {myAtt.worksite_name}
                    {myAtt.approval_status === 'pending' && ' · 아래 목록에서 함께 승인하세요'}
                  </p>
                </div>
              </div>
            ) : (
              <>
                {myAtt?.approval_status === 'rejected' && (
                  <p className="mt-3 rounded-[5px] bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                    반려됨{myAtt.rejection_reason ? ` · ${myAtt.rejection_reason}` : ''} — 다시 제출해주세요
                  </p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setConfirmMyHours(0.5)}
                    disabled={myAttBusy}
                    className="flex h-[64px] flex-col items-center justify-center rounded-[5px] bg-white ring-2 ring-blue-200 active:scale-[0.99] disabled:opacity-50"
                  >
                    <span className="text-lg font-bold text-navy">0.5 일</span>
                    <span className="text-xs font-medium text-zinc-400">반나절</span>
                  </button>
                  <button
                    onClick={() => setConfirmMyHours(1)}
                    disabled={myAttBusy}
                    className="flex h-[64px] flex-col items-center justify-center rounded-[5px] bg-navy ring-2 ring-navy active:scale-[0.99] disabled:opacity-60"
                  >
                    <span className="text-lg font-bold text-white">1 일</span>
                    <span className="text-xs font-medium text-blue-200">정상</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pr-12">
          <h2 className="text-xl font-bold text-zinc-900">검토 대기 출역</h2>
          <span className="text-sm font-semibold text-zinc-400">{items?.length ?? 0}건</span>
        </div>

        {error && <p className="mt-4 text-base font-semibold text-red-800">{error}</p>}

        {items && items.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center rounded-[5px] bg-zinc-50 px-6 py-14 text-center">
            <ClipboardCheck className="h-10 w-10 text-zinc-300" />
            <p className="mt-3 text-base font-semibold text-zinc-500">
              검토할 출역이 없어요
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 space-y-5">
              {grouped.map(([date, list]) => (
                <div key={date}>
                  <p className="mb-2 text-sm font-semibold text-zinc-500">{formatDate(date)}</p>
                  <ul className="space-y-2">
                    {list.map((it) => (
                      <li key={it.attendance_id}>
                        <PendingCard
                          item={it}
                          busy={busyId === it.attendance_id}
                          onApprove={() => approve(it)}
                          onReject={() => setRejectTarget(it)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <button
              onClick={() => setConfirmApproveAll(true)}
              disabled={approveAllBusy}
              className="mt-6 flex h-[60px] w-full items-center justify-center gap-2 rounded-[5px] bg-signal text-lg font-bold text-[#0f172a] active:scale-[0.99] disabled:opacity-60"
            >
              <CheckCheck className="h-6 w-6" />
              {approveAllBusy ? '처리 중...' : `모두 승인 (${items?.length ?? 0}건)`}
            </button>
          </>
        )}
      </section>

      {confirmMyHours !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 sm:items-center">
          <div className="w-full sm:max-w-[400px] rounded-t-[5px] sm:rounded-[5px] bg-white p-7">
            <p className="text-center text-base text-zinc-500">{TODAY_LABEL} 내 출역</p>
            <p className="mt-2 text-center text-[28px] font-bold text-zinc-900">
              {confirmMyHours}일 제출할까요?
            </p>
            <p className="mt-3 text-center text-sm text-zinc-500">
              제출 후 검토 대기 목록에서 함께 승인됩니다
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={() => setConfirmMyHours(null)}
                disabled={myAttBusy}
                className="h-[60px] rounded-[5px] bg-zinc-100 text-lg font-bold text-zinc-700 disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={() => submitMyAttendance(confirmMyHours)}
                disabled={myAttBusy}
                className="h-[60px] rounded-[5px] bg-navy text-lg font-bold text-white disabled:opacity-60"
              >
                {myAttBusy ? '제출 중...' : '제출'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmApproveAll && items && items.length > 0 && (
        <ApproveAllDialog
          count={items.length}
          busy={approveAllBusy}
          onCancel={() => setConfirmApproveAll(false)}
          onConfirm={approveAll}
        />
      )}

      {rejectTarget && (
        <RejectDialog
          item={rejectTarget}
          busy={busyId === rejectTarget.attendance_id}
          onCancel={() => setRejectTarget(null)}
          onConfirm={(reason) => reject(rejectTarget, reason)}
        />
      )}

      <AnnouncementPopup />
    </MobileShell>
  );
}

function PendingCard({
  item, busy, onApprove, onReject,
}: {
  item: PendingItem;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[5px] bg-white px-3 py-2 ring-1 ring-zinc-200">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-zinc-900">
          {item.worker_name}
          {item.is_self && (
            <span className="ml-1.5 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">나</span>
          )}
          {item.worker_trade && <span className="ml-1.5 text-[11px] font-medium text-zinc-400">({item.worker_trade})</span>}
        </p>
        <p className="text-[10px] text-zinc-400 tabular-nums">{formatTime(item.created_at)}</p>
      </div>
      <p className="shrink-0 text-base font-bold tabular-nums text-navy">{item.hours}일</p>
      <div className="shrink-0 flex gap-1.5">
        <button
          onClick={onReject}
          disabled={busy}
          aria-label="반려"
          className="inline-flex h-8 w-8 items-center justify-center rounded-[5px] bg-white text-red-800 ring-2 ring-red-200 active:scale-[0.95] disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
        <button
          onClick={onApprove}
          disabled={busy}
          aria-label="승인"
          className="inline-flex h-8 w-8 items-center justify-center rounded-[5px] bg-navy text-white active:scale-[0.95] disabled:opacity-60"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ApproveAllDialog({
  count, busy, onCancel, onConfirm,
}: {
  count: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 sm:items-center">
      <div className="w-full sm:max-w-[400px] rounded-t-[5px] sm:rounded-[5px] bg-white p-7">
        <p className="text-center text-base text-zinc-500">검토 대기 출역</p>
        <p className="mt-2 text-center text-[28px] font-bold text-zinc-900">
          {count}건 모두 승인할까요?
        </p>
        <p className="mt-3 text-center text-sm text-zinc-500">
          승인 후에는 되돌릴 수 없어요
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="h-[60px] rounded-[5px] bg-zinc-100 text-lg font-bold text-zinc-700 disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="h-[60px] rounded-[5px] bg-signal text-lg font-bold text-[#0f172a] disabled:opacity-60"
          >
            {busy ? '처리 중...' : '모두 승인'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RejectDialog({
  item, busy, onCancel, onConfirm,
}: {
  item: PendingItem;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 sm:items-center">
      <div className="w-full sm:max-w-[400px] rounded-t-[5px] sm:rounded-[5px] bg-white p-7">
        <p className="text-center text-base text-zinc-500">반려 사유</p>
        <p className="mt-2 text-center text-[24px] font-bold text-zinc-900">
          {item.worker_name} · {item.hours}일
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="사유를 입력해주세요 (선택)"
          rows={3}
          autoFocus
          className="mt-5 w-full resize-none rounded-[5px] bg-zinc-50 p-4 text-base text-zinc-900 ring-2 ring-zinc-200 focus:ring-navy outline-none"
        />
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="h-[60px] rounded-[5px] bg-zinc-100 text-lg font-bold text-zinc-700 disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={busy}
            className="h-[60px] rounded-[5px] bg-red-800 text-lg font-bold text-white disabled:opacity-60"
          >
            {busy ? '처리 중...' : '반려'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dow = ['일','월','화','수','목','금','토'][date.getDay()];
  return `${m}월 ${d}일 (${dow})`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${ampm} ${h12}:${m} 제출`;
}
