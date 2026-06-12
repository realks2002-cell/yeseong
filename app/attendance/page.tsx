'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import {
  MapPin, Users, CheckCircle2, Clock, XCircle, AlertTriangle,
  RefreshCw,
} from 'lucide-react';

type LiveRow = {
  id: string;
  hours: number;
  approval_status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  gps_distance_m: number | null;
  worker_id: string;
  worker_name: string;
  worker_phone: string | null;
  worker_trade: string | null;
  worksite_id: string;
  worksite_name: string;
  site_has_gps: boolean;
  geofence_radius: number;
  last_latitude: number | null;
  last_longitude: number | null;
  last_distance_m: number | null;
  last_within: boolean | null;
  last_seen_at: string | null;
};

const REFRESH_SEC = 30;

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  approved: { label: '승인', cls: 'bg-emerald-50 text-emerald-700' },
  pending: { label: '대기', cls: 'bg-amber-50 text-amber-700' },
  rejected: { label: '반려', cls: 'bg-red-50 text-red-600' },
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function AttendanceLivePage() {
  const [items, setItems] = useState<LiveRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [siteFilter, setSiteFilter] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/attendance-live', { cache: 'no-store' });
    if (!r.ok) {
      setError(`불러오기 실패: ${r.status}`);
      return;
    }
    const j = await r.json();
    setItems(j.items ?? []);
    setError(null);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_SEC * 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  const worksites = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of items ?? []) map.set(r.worksite_id, r.worksite_name);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [items]);

  const filtered = useMemo(
    () => (items ?? []).filter((r) => !siteFilter || r.worksite_id === siteFilter),
    [items, siteFilter],
  );

  // 현장별 출역 인원 (전체 기준 — 필터와 무관)
  const bySite = useMemo(() => {
    const m = new Map<string, { id: string; name: string; total: number; approved: number; pending: number; rejected: number }>();
    for (const r of items ?? []) {
      const s = m.get(r.worksite_id) ?? { id: r.worksite_id, name: r.worksite_name, total: 0, approved: 0, pending: 0, rejected: 0 };
      s.total += 1;
      if (r.approval_status === 'approved') s.approved += 1;
      else if (r.approval_status === 'pending') s.pending += 1;
      else s.rejected += 1;
      m.set(r.worksite_id, s);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ko'));
  }, [items]);

  const summary = useMemo(() => {
    const s = { total: 0, approved: 0, pending: 0, rejected: 0, out: 0 };
    for (const r of filtered) {
      s.total += 1;
      if (r.approval_status === 'approved') s.approved += 1;
      else if (r.approval_status === 'pending') s.pending += 1;
      else s.rejected += 1;
      if (r.last_within === false) s.out += 1;
    }
    return s;
  }, [filtered]);

  return (
    <AdminShell>
      <div className="max-w-7xl p-6 space-y-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <MapPin className="h-6 w-6 text-[#447D9B]" />
              출역 현황
              <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                LIVE
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-[#9CA3AF]">
                마지막 갱신 {fmtTime(lastUpdated.toISOString())}
              </span>
            )}
            <button
              onClick={load}
              className="flex items-center gap-1.5 rounded-[5px] border border-[#D7D7D7] bg-white px-3 py-1.5 text-xs font-semibold text-[#4B5563] hover:bg-[#F5F5F5]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              새로고침
            </button>
          </div>
        </div>

        {/* 요약 */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className="p-4 flex items-center gap-3">
            <Users className="h-5 w-5 text-[#447D9B]" />
            <div>
              <p className="text-[11px] text-[#6B7280]">출역 인원</p>
              <p className="text-xl font-bold tabular-nums">{summary.total}</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-[11px] text-[#6B7280]">승인</p>
              <p className="text-xl font-bold tabular-nums text-emerald-700">{summary.approved}</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-[11px] text-[#6B7280]">대기</p>
              <p className="text-xl font-bold tabular-nums text-amber-700">{summary.pending}</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-[11px] text-[#6B7280]">반려</p>
              <p className="text-xl font-bold tabular-nums text-red-600">{summary.rejected}</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            <div>
              <p className="text-[11px] text-[#6B7280]">현장 이탈 중</p>
              <p className="text-xl font-bold tabular-nums text-orange-600">{summary.out}</p>
            </div>
          </Card>
        </div>

        {/* 현장별 출역 인원 */}
        {bySite.length > 0 && (
          <Card className="p-4">
            <p className="text-sm font-semibold text-[#091413] mb-2.5">현장별 출역 인원</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {bySite.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSiteFilter(siteFilter === s.id ? '' : s.id)}
                  className={`flex items-center justify-between rounded-[5px] border px-3 py-2.5 text-left transition-colors ${
                    siteFilter === s.id
                      ? 'border-[#273F4F] bg-[#273F4F] text-white'
                      : 'border-[#D7D7D7] bg-white hover:bg-[#F5F5F5]'
                  }`}
                >
                  <span className="min-w-0 truncate text-xs font-semibold">{s.name}</span>
                  <span className="ml-2 shrink-0 text-right">
                    <span className="text-base font-bold tabular-nums">{s.total}</span>
                    <span className="text-[11px] font-medium">명</span>
                    <span className={`ml-1.5 text-[10px] ${siteFilter === s.id ? 'text-white/70' : 'text-[#9CA3AF]'}`}>
                      승인 {s.approved} · 대기 {s.pending}
                      {s.rejected > 0 && ` · 반려 ${s.rejected}`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* 현장 필터 */}
        {worksites.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSiteFilter('')}
              className={`rounded-[5px] border px-3 py-1.5 text-xs font-semibold ${
                !siteFilter
                  ? 'border-[#273F4F] bg-[#273F4F] text-white'
                  : 'border-[#D7D7D7] bg-white text-[#091413] hover:bg-[#F5F5F5]'
              }`}
            >
              전체
            </button>
            {worksites.map((w) => (
              <button
                key={w.id}
                onClick={() => setSiteFilter(w.id)}
                className={`rounded-[5px] border px-3 py-1.5 text-xs font-semibold ${
                  siteFilter === w.id
                    ? 'border-[#273F4F] bg-[#273F4F] text-white'
                    : 'border-[#D7D7D7] bg-white text-[#091413] hover:bg-[#F5F5F5]'
                }`}
              >
                {w.name}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="rounded-[5px] bg-red-50 p-3 text-sm text-red-600">{error}</p>
        )}

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] [&_th]:border-r [&_th]:border-r-[#EAEAEA] [&_td]:border-r [&_td]:border-r-[#EAEAEA] [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
              <thead className="bg-[#F5F5F5] text-[#4B5563]">
                <tr className="text-center text-[11px]">
                  <th className="px-3 py-2 font-medium">작업자</th>
                  <th className="px-3 py-2 font-medium">공종</th>
                  <th className="px-3 py-2 font-medium">현장</th>
                  <th className="px-3 py-2 font-medium w-14">공수</th>
                  <th className="px-3 py-2 font-medium w-14">상태</th>
                  <th className="px-3 py-2 font-medium w-20">출역제출시간</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D7D7D7]">
                {items === null ? (
                  <tr><td colSpan={6} className="py-10 text-center text-[#9CA3AF]">불러오는 중...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-[#9CA3AF]">오늘 출역 기록이 없습니다.</td></tr>
                ) : (
                  filtered.map((r) => {
                    const badge = STATUS_BADGE[r.approval_status];
                    return (
                      <tr key={r.id} className="hover:bg-[#F5F5F5]">
                        <td className="px-3 py-2 font-medium">{r.worker_name}</td>
                        <td className="px-3 py-2 text-center text-[#4B5563]">{r.worker_trade ?? '-'}</td>
                        <td className="px-3 py-2 text-[#4B5563]">{r.worksite_name}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{r.hours}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums text-[#4B5563]">{fmtTime(r.created_at)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
