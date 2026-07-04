'use client';

import { useEffect, useRef, useState } from 'react';
import { X, MapPin, Users, Loader2 } from 'lucide-react';
import { loadGoogleMaps } from '@/lib/google-maps';

export type MapWorker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: 'present' | 'out' | 'unknown';
  distanceM: number | null;
  lastSeen: string | null;
};

type Props = {
  worksiteId: string;
  worksiteName: string;
  siteLat: number | null;
  siteLng: number | null;
  radius: number;
  workers: MapWorker[];
  onClose: () => void;
};

type RosterMember = {
  id: string;
  name: string;
  trade: string | null;
  is_leader: boolean;
  attended: boolean;
  present_gps: boolean;
};
type RosterTeam = {
  leader_id: string;
  leader_name: string;
  member_count: number;
  attended_count: number;
  members: RosterMember[];
};

const STATUS_COLOR: Record<MapWorker['status'], string> = {
  present: '#059669', // 현장 안
  out: '#ea580c', // 이탈
  unknown: '#6b7280', // 위치 확인 불가
};

function fmtTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const STATUS_TEXT: Record<MapWorker['status'], string> = {
  present: '현장 안',
  out: '이탈',
  unknown: '위치 미확인',
};

// 마커 핀 — 색 점만 (이름은 클릭 시 메모로 표시)
function makePin(color: string): HTMLElement {
  const dot = document.createElement('div');
  dot.style.cssText = `width:16px;height:16px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.45);cursor:pointer`;
  return dot;
}

// 겹치는 마커 분리 — 같은 지점(≈11m 격자)에 여러 명이면 작은 원으로 부채꼴 배치해
// 모두 보이게 한다. 실제 좌표(lat/lng)는 그대로 두고 표시 좌표(dLat/dLng)만 옮긴다.
function spreadOverlaps(workers: MapWorker[]): (MapWorker & { dLat: number; dLng: number })[] {
  const groups = new Map<string, MapWorker[]>();
  for (const w of workers) {
    const key = `${w.lat.toFixed(4)},${w.lng.toFixed(4)}`;
    const g = groups.get(key);
    if (g) g.push(w);
    else groups.set(key, [w]);
  }
  const out: (MapWorker & { dLat: number; dLng: number })[] = [];
  for (const g of groups.values()) {
    if (g.length === 1) {
      out.push({ ...g[0], dLat: g[0].lat, dLng: g[0].lng });
      continue;
    }
    const R = 0.00018; // ≈20m 반경으로 펼쳐 16px 점이 겹치지 않게
    g.forEach((w, i) => {
      const ang = (2 * Math.PI * i) / g.length;
      out.push({ ...w, dLat: w.lat + R * Math.cos(ang), dLng: w.lng + R * Math.sin(ang) });
    });
  }
  return out;
}

// 클릭 시 뜨는 메모(InfoWindow) 내용 — XSS 방지 위해 textContent로 구성
function makeMemo(title: string, sub: string): HTMLElement {
  const box = document.createElement('div');
  box.style.cssText = 'padding:2px 4px;min-width:80px';
  const t = document.createElement('div');
  t.textContent = title;
  t.style.cssText = 'font-weight:700;font-size:13px;color:#091413';
  box.appendChild(t);
  if (sub) {
    const s = document.createElement('div');
    s.textContent = sub;
    s.style.cssText = 'font-size:11px;color:#6b7280;margin-top:3px';
    box.appendChild(s);
  }
  return box;
}

export function AttendanceMapModal({
  worksiteId,
  worksiteName,
  siteLat,
  siteLng,
  radius,
  workers,
  onClose,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teams, setTeams] = useState<RosterTeam[] | null>(null);

  const plotted = workers.filter((w) => w.lat != null && w.lng != null);

  // 현장 배치 팀 명단 로드
  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/worksite-roster?worksiteId=${encodeURIComponent(worksiteId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { teams: [] }))
      .then((j) => { if (alive) setTeams(j.teams ?? []); })
      .catch(() => { if (alive) setTeams([]); });
    return () => { alive = false; };
  }, [worksiteId]);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setError('Google Maps API 키가 설정되지 않았습니다.');
      return;
    }
    loadGoogleMaps(apiKey)
      .then(() => setLoaded(true))
      .catch(() => setError('Google Maps 로드 실패'));
  }, []);

  useEffect(() => {
    if (!loaded || !mapRef.current) return;

    const hasSite = siteLat != null && siteLng != null;
    const center = hasSite
      ? { lat: siteLat as number, lng: siteLng as number }
      : plotted.length > 0
        ? { lat: plotted[0].lat, lng: plotted[0].lng }
        : { lat: 36.5, lng: 127.0 };

    const map = new google.maps.Map(mapRef.current, {
      center,
      zoom: 16,
      mapId: 'attendance-live-map',
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: true,
    });

    const bounds = new google.maps.LatLngBounds();
    const info = new google.maps.InfoWindow();

    // 현장 geofence 원 (중심 마커는 원과 중복이라 생략)
    if (hasSite) {
      const sitePos = { lat: siteLat as number, lng: siteLng as number };
      new google.maps.Circle({
        map,
        center: sitePos,
        radius,
        fillColor: '#447D9B',
        fillOpacity: 0.12,
        strokeColor: '#447D9B',
        strokeOpacity: 0.6,
        strokeWeight: 2,
      });
      bounds.extend(sitePos);
    }

    // 작업자 마커 (겹치는 위치는 부채꼴로 분리해 모두 보이게)
    for (const w of spreadOverlaps(plotted)) {
      const pos = { lat: w.dLat, lng: w.dLng };
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: pos,
        content: makePin(STATUS_COLOR[w.status]),
        title: w.name,
        gmpClickable: true,
      });
      marker.addListener('click', () => {
        const sub = `${STATUS_TEXT[w.status]} · ${w.distanceM != null ? `${Math.round(w.distanceM)}m` : '거리 미상'} · ${fmtTime(w.lastSeen)}`;
        info.setContent(makeMemo(w.name, sub));
        info.open({ map, anchor: marker });
      });
      bounds.extend(pos);
    }

    // 화면 맞춤
    if (!bounds.isEmpty()) {
      if (hasSite) {
        // 원 반경이 보이도록 최소 영역 확보
        const r = radius / 111320; // m → 대략 도(deg)
        bounds.extend({ lat: (siteLat as number) + r, lng: siteLng as number });
        bounds.extend({ lat: (siteLat as number) - r, lng: siteLng as number });
      }
      map.fitBounds(bounds, 64);
      if (plotted.length + (hasSite ? 1 : 0) === 1) map.setZoom(17);
    }
    // 모달은 열릴 때 1회 초기화 (폴링 재렌더로 지도 재생성/깜빡임 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const presentN = workers.filter((w) => w.status === 'present').length;
  const outN = workers.filter((w) => w.status === 'out').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-5xl rounded-[5px] bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-[#D7D7D7] px-5 py-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold text-[#091413]">
              <MapPin className="h-4 w-4 shrink-0 text-[#447D9B]" />
              <span className="truncate">{worksiteName}</span>
            </h2>
            <div className="mt-1 flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1 text-[#6B7280]">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#059669]" /> 현장 {presentN}
              </span>
              <span className="flex items-center gap-1 text-[#6B7280]">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#ea580c]" /> 이탈 {outN}
              </span>
              <span className="flex items-center gap-1 text-[#6B7280]">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#6b7280]" /> 미확인 {workers.length - presentN - outN}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-[#9CA3AF] hover:bg-[#F5F5F5] hover:text-[#091413]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row">
          {/* 지도 */}
          <div className="relative flex-1">
            <div ref={mapRef} className="h-[360px] w-full bg-[#F5F5F5] sm:h-[520px]" />
            {!loaded && !error && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-[#9CA3AF]">지도 로딩 중...</div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-red-600">{error}</div>
            )}
            {loaded && !error && siteLat == null && (
              <div className="absolute left-3 top-3 rounded-[5px] bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 shadow">
                이 현장은 좌표가 등록되지 않아 반경 원이 표시되지 않습니다.
              </div>
            )}
            {loaded && !error && plotted.length === 0 && (
              <div className="absolute left-3 bottom-3 rounded-[5px] bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-[#6B7280] shadow">
                오늘 위치가 기록된 작업자가 없습니다.
              </div>
            )}
          </div>

          {/* 오른쪽 — 배치 팀 명단 */}
          <div className="flex w-full shrink-0 flex-col border-t border-[#D7D7D7] sm:h-[520px] sm:w-80 sm:border-l sm:border-t-0">
            <div className="flex items-center justify-between border-b border-[#D7D7D7] px-4 py-2.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[#091413]">
                <Users className="h-3.5 w-3.5 text-[#447D9B]" />
                배치 팀 명단
              </span>
              {teams && teams.length > 0 && (
                <span className="text-[11px] font-medium tabular-nums text-[#6B7280]">
                  출역 {teams.reduce((n, t) => n + t.attended_count, 0)}/{teams.reduce((n, t) => n + t.member_count, 0)}
                </span>
              )}
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
              {teams === null ? (
                <div className="flex items-center justify-center py-8 text-xs text-[#9CA3AF]">
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  불러오는 중…
                </div>
              ) : teams.length === 0 ? (
                <p className="py-8 text-center text-xs text-[#9CA3AF]">배치된 작업자가 없습니다.</p>
              ) : (
                teams.map((t) => (
                  <div key={t.leader_id}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="truncate text-[12px] font-bold text-[#091413]">
                        {t.leader_name === '팀 미지정' ? t.leader_name : `${t.leader_name}팀`}
                      </p>
                      <span className="shrink-0 text-[10px] tabular-nums text-[#6B7280]">
                        출역 {t.attended_count}/{t.member_count}
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {t.members.map((m) => (
                        <li key={m.id} className="flex items-center justify-between gap-2 text-[12px]">
                          <span className="flex min-w-0 items-center gap-1 text-[#091413]">
                            <span className="truncate font-medium">{m.name}</span>
                            {m.is_leader && (
                              <span className="shrink-0 rounded bg-[#273F4F] px-1 py-0.5 text-[9px] font-semibold text-white">팀장</span>
                            )}
                            {m.trade && <span className="shrink-0 text-[10px] text-[#9CA3AF]">{m.trade}</span>}
                          </span>
                          {m.attended ? (
                            <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">출역</span>
                          ) : (
                            <span className="shrink-0 rounded bg-[#F5F5F5] px-1.5 py-0.5 text-[10px] font-semibold text-[#9CA3AF]">미출역</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
