'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { AttendanceMapModal, type MapWorker } from '@/components/attendance-map-modal';
import {
  MapPin, AlertTriangle,
  RefreshCw, X, ClipboardList,
} from 'lucide-react';
import { isWithinTrackWindow, TRACK_START_HOUR, TRACK_END_HOUR } from '@/lib/capacitor/track-window';

type LiveRow = {
  id: string;
  hours: number | null;
  approval_status: 'pending' | 'approved' | 'rejected' | null;
  created_at: string | null;
  gps_distance_m: number | null;
  worker_id: string;
  worker_name: string;
  worker_phone: string | null;
  worker_trade: string | null;
  worksite_id: string;
  worksite_name: string;
  site_has_gps: boolean;
  geofence_radius: number;
  worksite_lat: number | null;
  worksite_lng: number | null;
  today_ever_within: boolean;
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
  none: { label: '미제출', cls: 'bg-[#F5F5F5] text-[#9CA3AF]' },
};

function fmtTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

type DetailKey = 'present' | 'out';
const DETAIL_LABEL: Record<DetailKey, string> = {
  present: 'GPS 실시간 출역',
  out: '현장 이탈 중',
};

// 실시간 출역 판정 (sticky) — 조적·습식은 건물 안에서 GPS가 끊기므로,
// '오늘 현장 안 핑이 한 번이라도 있으면(today_ever_within) 명확히 이탈 전까지 present'로 본다.
const EXIT_MARGIN_M = 150; // 반경 + 여유(m)를 넘게 벗어나야 이탈로 인정 (실내 드리프트 오탐 방지)
function isClearlyOut(r: LiveRow): boolean {
  return (
    r.today_ever_within === true &&
    r.last_within === false &&
    r.last_distance_m != null &&
    r.last_distance_m > r.geofence_radius + EXIT_MARGIN_M
  );
}
function isPresent(r: LiveRow): boolean {
  return r.today_ever_within === true && !isClearlyOut(r);
}

type AssignedSite = {
  worksite_id: string;
  worksite_name: string;
  count: number;
  latitude: number | null;
  longitude: number | null;
  geofence_radius: number;
};

export default function AttendanceLivePage() {
  const [items, setItems] = useState<LiveRow[] | null>(null);
  const [assigned, setAssigned] = useState<AssignedSite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [siteFilter, setSiteFilter] = useState('');
  const [detailKey, setDetailKey] = useState<DetailKey | null>(null);
  const [mapSiteId, setMapSiteId] = useState<string | null>(null);
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

  // 배정인원(작업자 마스터 기준) — 변동이 드물어 마운트 시 1회만
  useEffect(() => {
    fetch('/api/admin/assigned', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => setAssigned(j.items ?? []))
      .catch(() => setAssigned([]));
  }, []);

  const filtered = useMemo(
    () => (items ?? []).filter((r) => !siteFilter || r.worksite_id === siteFilter),
    [items, siteFilter],
  );

  // 총 배정인원 (작업자 마스터 기준) — 항상 전체 합계 고정 (현장 선택과 무관)
  const totalAssigned = useMemo(
    () => (assigned ?? []).reduce((n, a) => n + a.count, 0),
    [assigned],
  );

  // 현장별: 배정 인원(마스터) + 실시간 출역/이탈(최근 위치) 병합 — 배정된 현장 전체 표시
  const bySite = useMemo(() => {
    const live = new Map<string, { present: number; out: number }>();
    const monitoring = isWithinTrackWindow(); // 근무시간(07~17) 밖이면 출역/이탈 0
    for (const r of monitoring ? (items ?? []) : []) {
      if (!isPresent(r) && !isClearlyOut(r)) continue;
      const l = live.get(r.worksite_id) ?? { present: 0, out: 0 };
      if (isPresent(r)) l.present += 1;
      else l.out += 1;
      live.set(r.worksite_id, l);
    }
    return (assigned ?? [])
      .map((a) => ({
        id: a.worksite_id,
        name: a.worksite_name,
        assigned: a.count,
        present: live.get(a.worksite_id)?.present ?? 0,
        out: live.get(a.worksite_id)?.out ?? 0,
      }))
      .sort((a, b) => b.assigned - a.assigned || a.name.localeCompare(b.name, 'ko'));
  }, [items, assigned]);

  const summary = useMemo(() => {
    const s = { present: 0, out: 0 };
    if (!isWithinTrackWindow()) return s; // 근무시간(07~17) 밖이면 실시간 집계 중단
    for (const r of filtered) {
      if (isPresent(r)) s.present += 1;
      else if (isClearlyOut(r)) s.out += 1;
    }
    return s;
  }, [filtered]);

  // 카드 클릭 시 보여줄 상세 목록 (현장별 그룹 → 이름)
  const detailGroups = useMemo(() => {
    if (!detailKey) return [];
    const match = (r: LiveRow) =>
      detailKey === 'present' ? isPresent(r) : isClearlyOut(r);
    const m = new Map<string, LiveRow[]>();
    for (const r of filtered) {
      if (!match(r)) continue;
      const arr = m.get(r.worksite_name) ?? [];
      arr.push(r);
      m.set(r.worksite_name, arr);
    }
    return Array.from(m.entries())
      .map(([site, rows]) => ({ site, rows: rows.sort((a, b) => a.worker_name.localeCompare(b.worker_name, 'ko')) }))
      .sort((a, b) => b.rows.length - a.rows.length || a.site.localeCompare(b.site, 'ko'));
  }, [detailKey, filtered]);

  // 지도 모달용 데이터 — 배정 현장(좌표) 기준. 오늘 활동 없는 현장도 열림.
  const mapData = useMemo(() => {
    if (!mapSiteId) return null;
    const site = (assigned ?? []).find((a) => a.worksite_id === mapSiteId);
    if (!site) return null;
    const workers: MapWorker[] = (items ?? [])
      .filter((r) => r.worksite_id === mapSiteId && r.last_latitude != null && r.last_longitude != null)
      .map((r) => ({
        id: r.worker_id,
        name: r.worker_name,
        lat: r.last_latitude as number,
        lng: r.last_longitude as number,
        status: isPresent(r) ? 'present' : isClearlyOut(r) ? 'out' : 'unknown',
        distanceM: r.last_distance_m,
        lastSeen: r.last_seen_at,
      }));
    return {
      id: mapSiteId,
      name: site.worksite_name,
      lat: site.latitude,
      lng: site.longitude,
      radius: site.geofence_radius,
      workers,
    };
  }, [mapSiteId, assigned, items]);

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

        {/* 요약 — 숫자 클릭 시 현장별 명단 표시 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* 총 배정인원 — 작업자 마스터(팀장 추종) 기준 */}
          <Card className="p-4 flex items-center gap-3">
            <ClipboardList className="h-5 w-5 text-[#273F4F]" />
            <div>
              <p className="text-[11px] text-[#6B7280]">총 배정인원</p>
              <p className="text-xl font-bold tabular-nums">{totalAssigned}</p>
            </div>
          </Card>
          {([
            { key: 'present' as const, icon: MapPin, label: 'GPS 실시간 출역', value: summary.present, color: 'text-[#447D9B]', num: 'text-[#447D9B]' },
            { key: 'out' as const, icon: AlertTriangle, label: '현장 이탈 중', value: summary.out, color: 'text-orange-500', num: 'text-orange-600' },
          ]).map(({ key, icon: Icon, label, value, color, num }) => (
            <Card
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => value > 0 && setDetailKey(key)}
              onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && value > 0) { e.preventDefault(); setDetailKey(key); } }}
              className={`p-4 flex items-center gap-3 transition-colors ${value > 0 ? 'cursor-pointer hover:bg-[#F5F5F5]' : 'cursor-default'}`}
            >
              <Icon className={`h-5 w-5 ${color}`} />
              <div>
                <p className="text-[11px] text-[#6B7280]">{label}</p>
                <p className={`text-xl font-bold tabular-nums ${num}`}>{value}</p>
              </div>
            </Card>
          ))}
        </div>

        {!isWithinTrackWindow() && (
          <p className="rounded-[5px] bg-[#F5F5F5] px-3 py-2 text-xs text-[#6B7280]">
            근무시간({String(TRACK_START_HOUR).padStart(2, '0')}:00~{String(TRACK_END_HOUR).padStart(2, '0')}:00)이 아니어서 실시간 출역 집계가 멈춰 있습니다.
          </p>
        )}

        {/* 현장별 실시간 출역 — 앱 GPS 최근 위치 기준 (현장 안 인원) */}
        {bySite.length > 0 && (
          <Card className="p-4">
            <p className="text-sm font-semibold text-[#091413] mb-2.5">
              GPS 현장별 실시간 출역
              <span className="ml-1.5 text-[11px] font-normal text-[#9CA3AF]">GPS 현장 진입 기준 (이탈 전까지 유지)</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {bySite.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setMapSiteId(s.id)}
                  title="지도에서 작업자 위치 보기"
                  className="flex items-center justify-between rounded-[5px] border border-[#D7D7D7] bg-white px-3 py-2.5 text-left transition-colors hover:border-[#447D9B] hover:bg-[#F5F5F5]"
                >
                  <span className="flex min-w-0 items-center gap-1 truncate text-xs font-semibold">
                    <MapPin className="h-3 w-3 shrink-0 text-[#447D9B]" />
                    <span className="truncate">{s.name}</span>
                  </span>
                  <span className="ml-2 shrink-0 text-right">
                    <span className="text-base font-bold tabular-nums">{s.present}</span>
                    <span className="text-[11px] font-medium text-[#9CA3AF]"> / 배정 {s.assigned}</span>
                    {s.out > 0 && (
                      <span className="ml-1.5 text-[10px] text-orange-500">이탈 {s.out}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* 현장 선택 표시 — 위 '현장별 실시간 출역' 카드가 필터 역할 */}
        {siteFilter && (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-[#091413]">
              {(assigned ?? []).find((a) => a.worksite_id === siteFilter)?.worksite_name ?? '선택한 현장'}
            </span>
            <button
              onClick={() => setSiteFilter('')}
              className="rounded-[5px] border border-[#D7D7D7] bg-white px-2 py-1 font-semibold text-[#4B5563] hover:bg-[#F5F5F5]"
            >
              전체 보기
            </button>
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
                  <tr><td colSpan={6} className="py-10 text-center text-[#9CA3AF]">오늘 근무·위치 기록이 없습니다.</td></tr>
                ) : (
                  filtered.map((r) => {
                    const badge = STATUS_BADGE[r.approval_status ?? 'none'];
                    const monitoring = isWithinTrackWindow();
                    const present = monitoring && isPresent(r);
                    const out = monitoring && isClearlyOut(r);
                    return (
                      <tr key={r.id} className="hover:bg-[#F5F5F5]">
                        <td className="px-3 py-2 font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            {r.worker_name}
                            {present && (
                              <span className="rounded px-1 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                                현장
                              </span>
                            )}
                            {out && (
                              <span className="rounded px-1 py-0.5 text-[10px] font-semibold bg-orange-50 text-orange-600">
                                이탈 {r.last_distance_m != null ? `${Math.round(r.last_distance_m)}m` : ''}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-[#4B5563]">{r.worker_trade ?? '-'}</td>
                        <td className="px-3 py-2 text-[#4B5563]">{r.worksite_name}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{r.hours ?? '-'}</td>
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

      {/* 카드 클릭 상세 — 현장별 명단 */}
      {detailKey && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDetailKey(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-[5px] bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#D7D7D7] px-4 py-3">
              <p className="text-sm font-semibold text-[#091413]">
                {DETAIL_LABEL[detailKey]}
                <span className="ml-1.5 text-[#6B7280]">{detailGroups.reduce((n, g) => n + g.rows.length, 0)}명</span>
              </p>
              <button onClick={() => setDetailKey(null)} className="rounded-[5px] p-1 text-[#9CA3AF] hover:bg-[#F5F5F5]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[calc(80vh-49px)] overflow-y-auto p-4 space-y-4">
              {detailGroups.length === 0 ? (
                <p className="py-6 text-center text-sm text-[#9CA3AF]">해당 인원이 없습니다.</p>
              ) : (
                detailGroups.map((g) => (
                  <div key={g.site}>
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[#091413]">
                      <MapPin className="h-3.5 w-3.5 text-[#447D9B]" />
                      {g.site}
                      <span className="text-[#9CA3AF]">· {g.rows.length}명</span>
                    </p>
                    <ul className="space-y-1 pl-5">
                      {g.rows.map((r) => (
                        <li key={r.id} className="flex items-center justify-between text-[13px] text-[#4B5563]">
                          <span className="font-medium text-[#091413]">{r.worker_name}</span>
                          <span className="tabular-nums text-[11px] text-[#9CA3AF]">
                            {detailKey === 'out'
                              ? `${r.last_distance_m != null ? `${Math.round(r.last_distance_m)}m · ` : ''}${fmtTime(r.last_seen_at)}`
                              : detailKey === 'present'
                              ? fmtTime(r.last_seen_at)
                              : r.worker_trade ?? ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {mapData && (
        <AttendanceMapModal
          worksiteId={mapData.id}
          worksiteName={mapData.name}
          siteLat={mapData.lat}
          siteLng={mapData.lng}
          radius={mapData.radius}
          workers={mapData.workers}
          onClose={() => setMapSiteId(null)}
        />
      )}
    </AdminShell>
  );
}
