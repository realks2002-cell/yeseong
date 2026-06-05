'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { BellOff, BellRing, RefreshCw, Loader2 } from 'lucide-react';

// 앱 종료 알림 — 오늘 출역한 작업자 중 GPS 신호가 끊긴(앱 종료 추정) 작업자 감지
//   데이터: /api/admin/attendance-live (오늘 출역 + 마지막 GPS 로그)
//   조치: 끊긴 작업자에게 "앱을 열어주세요" 푸시 발송

type LiveItem = {
  worker_id: string;
  worker_name: string;
  worker_phone: string | null;
  worker_trade: string | null;
  worksite_name: string;
  approval_status: string;
  site_has_gps: boolean;
  last_seen_at: string | null;
};

type Status = 'ok' | 'stale' | 'none';

const THRESHOLDS = [15, 30, 60] as const;

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtElapsed(min: number): string {
  if (min < 60) return `${min}분 전`;
  return `${Math.floor(min / 60)}시간 ${min % 60}분 전`;
}

export default function OfflineMonitoringPage() {
  const [items, setItems] = useState<LiveItem[] | null>(null);
  const [threshold, setThreshold] = useState<number>(30);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/attendance-live', { cache: 'no-store' });
      if (!r.ok) throw new Error('목록을 불러오지 못했습니다');
      const json = await r.json();
      // 한 작업자가 여러 출역 행을 가질 수 있어 worker_id로 중복 제거
      const seen = new Set<string>();
      const dedup: LiveItem[] = [];
      for (const it of (json.items ?? []) as LiveItem[]) {
        if (seen.has(it.worker_id)) continue;
        seen.add(it.worker_id);
        dedup.push(it);
      }
      setItems(dedup);
      setNow(Date.now());
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // 60초마다 자동 갱신
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const rows = useMemo(() => {
    return (items ?? []).map((it) => {
      let status: Status = 'none';
      let elapsedMin: number | null = null;
      if (it.last_seen_at) {
        elapsedMin = Math.max(0, Math.floor((now - new Date(it.last_seen_at).getTime()) / 60_000));
        status = elapsedMin <= threshold ? 'ok' : 'stale';
      }
      return { ...it, status, elapsedMin };
    }).sort((a, b) => {
      // 문제 있는 작업자 먼저: 신호 없음 → 끊김 → 정상
      const rank = (s: Status) => (s === 'none' ? 0 : s === 'stale' ? 1 : 2);
      return rank(a.status) - rank(b.status) || a.worker_name.localeCompare(b.worker_name, 'ko');
    });
  }, [items, threshold, now]);

  const offline = useMemo(() => rows.filter((r) => r.status !== 'ok'), [rows]);

  const sendPush = async (workerIds: string[]) => {
    if (pushBusy || workerIds.length === 0) return;
    if (!confirm(`${workerIds.length}명에게 앱 실행 알림을 보낼까요?`)) return;
    setPushBusy(true);
    setPushMsg(null);
    try {
      const r = await fetch('/api/admin/offline-monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_ids: workerIds }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || '발송 실패');
      setPushMsg(
        `푸시 ${json.sent}건 발송` +
        (json.failed ? ` · 실패 ${json.failed}건` : '') +
        (json.no_token ? ` · 앱 미설치/미로그인 ${json.no_token}명` : ''),
      );
    } catch (e) {
      setPushMsg((e as Error).message);
    } finally {
      setPushBusy(false);
    }
  };

  const counts = useMemo(() => ({
    total: rows.length,
    ok: rows.filter((r) => r.status === 'ok').length,
    stale: rows.filter((r) => r.status === 'stale').length,
    none: rows.filter((r) => r.status === 'none').length,
  }), [rows]);

  return (
    <AdminShell>
      <div className="max-w-5xl p-6 space-y-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BellOff className="h-6 w-6 text-[#447D9B]" />
              앱 종료 알림
            </h1>
            <p className="text-sm text-[#6B7280] mt-1">
              오늘 출역한 작업자 중 GPS 신호가 끊긴(앱 종료 추정) 작업자를 감지합니다.
            </p>
          </div>
          <button
            onClick={load}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-[5px] border border-[#D7D7D7] bg-white px-3 py-1.5 text-xs font-semibold text-[#4B5563] hover:bg-[#F5F5F5] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        {/* 요약 + 기준 선택 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            <span className="rounded-full bg-[#F5F5F5] px-3 py-1 text-xs font-semibold text-[#4B5563]">출역 {counts.total}명</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">정상 {counts.ok}</span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">끊김 {counts.stale}</span>
            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">신호 없음 {counts.none}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-[#6B7280]">끊김 기준:</span>
            {THRESHOLDS.map((m) => (
              <button
                key={m}
                onClick={() => setThreshold(m)}
                className={`rounded-[5px] border px-2.5 py-1 text-xs font-semibold ${
                  threshold === m
                    ? 'border-[#273F4F] bg-[#273F4F] text-white'
                    : 'border-[#D7D7D7] bg-white text-[#091413] hover:bg-[#F5F5F5]'
                }`}
              >
                {m}분
              </button>
            ))}
          </div>
        </div>

        {error && <p className="rounded-[5px] bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        {pushMsg && <p className="rounded-[5px] bg-blue-50 p-3 text-sm font-semibold text-blue-800">{pushMsg}</p>}

        {/* 일괄 알림 */}
        {offline.length > 0 && (
          <button
            onClick={() => sendPush(offline.map((r) => r.worker_id))}
            disabled={pushBusy}
            className="flex items-center gap-2 rounded-[5px] bg-[#447D9B] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#366379] disabled:opacity-50"
          >
            {pushBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
            신호 끊긴 {offline.length}명 전체에게 앱 실행 알림 보내기
          </button>
        )}

        {/* 목록 */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] whitespace-nowrap [&_th]:border-r [&_th]:border-r-[#EAEAEA] [&_td]:border-r [&_td]:border-r-[#EAEAEA] [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
              <thead className="bg-[#F5F5F5] text-[#4B5563]">
                <tr className="text-center">
                  <th className="px-3 py-2 font-medium w-10">#</th>
                  <th className="px-3 py-2 font-medium">작업자</th>
                  <th className="px-3 py-2 font-medium">공종</th>
                  <th className="px-3 py-2 font-medium">현장</th>
                  <th className="px-3 py-2 font-medium">마지막 신호</th>
                  <th className="px-3 py-2 font-medium">상태</th>
                  <th className="px-3 py-2 font-medium w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAEAEA]">
                {items === null ? (
                  <tr><td colSpan={7} className="py-10 text-center text-[#9CA3AF]">불러오는 중...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center text-[#9CA3AF]">오늘 출역한 작업자가 없습니다.</td></tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={r.worker_id} className="hover:bg-[#F9FAFB]">
                      <td className="px-3 py-2 text-center text-[#9CA3AF] tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{r.worker_name}</td>
                      <td className="px-3 py-2 text-[#4B5563]">{r.worker_trade ?? '-'}</td>
                      <td className="px-3 py-2 text-[#4B5563]">{r.worksite_name}</td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {r.last_seen_at ? (
                          <>
                            {fmtTime(r.last_seen_at)}
                            <span className="ml-1 text-[#9CA3AF]">({fmtElapsed(r.elapsedMin!)})</span>
                          </>
                        ) : (
                          <span className="text-[#9CA3AF]">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.status === 'ok' && (
                          <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">정상</span>
                        )}
                        {r.status === 'stale' && (
                          <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">끊김</span>
                        )}
                        {r.status === 'none' && (
                          <span className="rounded bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">신호 없음</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.status !== 'ok' && (
                          <button
                            onClick={() => sendPush([r.worker_id])}
                            disabled={pushBusy}
                            className="rounded-[5px] border border-[#D7D7D7] bg-white px-2 py-1 text-[10px] font-semibold text-[#447D9B] hover:bg-[#F5F5F5] disabled:opacity-50"
                          >
                            알림 보내기
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <p className="text-xs text-[#9CA3AF] leading-relaxed">
          · 작업자 앱은 백그라운드에서 이동 시 위치를 전송하고, 화면이 켜져 있으면 5분마다 전송합니다.<br />
          · 정지 상태로 오래 있으면 신호 간격이 길어질 수 있으니 기준(15/30/60분)을 조절해 확인하세요.<br />
          · 60초마다 자동 갱신됩니다.
        </p>
      </div>
    </AdminShell>
  );
}
