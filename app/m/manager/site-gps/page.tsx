'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Check, RefreshCw, AlertTriangle } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { getMirrorId } from '@/lib/manager/mirror';
import { getCurrentPosition, type Position } from '@/lib/capacitor/geolocation';

type SiteGps = {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius: number;
  gps_registered_at: string | null;
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

/** Haversine 거리(m) — 현 위치와 등록 좌표 비교 표시용 */
function distanceM(a: Position, lat: number, lng: number): number {
  const R = 6371000;
  const dLat = ((lat - a.latitude) * Math.PI) / 180;
  const dLng = ((lng - a.longitude) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

export default function ManagerSiteGpsPage() {
  const router = useRouter();
  const sb = getBrowserSupabase();
  const readOnly = !!getMirrorId(); // 관리자 미러 보기 — 등록 불가

  const [sites, setSites] = useState<SiteGps[] | null>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const [posLoading, setPosLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  // Google Map — 내 위치(파란 점) + 등록된 현장 핀
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<google.maps.Map | null>(null);
  const myMarker = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const siteMarkers = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setMapError('지도 API 키가 설정되지 않았습니다.');
      return;
    }
    if (window.google?.maps) {
      setMapLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker`;
    script.async = true;
    script.onload = () => setMapLoaded(true);
    script.onerror = () => setMapError('지도를 불러오지 못했습니다.');
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    if (!mapObj.current) {
      mapObj.current = new google.maps.Map(mapRef.current, {
        center: pos ? { lat: pos.latitude, lng: pos.longitude } : { lat: 36.5, lng: 127.0 },
        zoom: pos ? 17 : 7,
        mapId: 'site-gps-app',
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
      });
    }
    const map = mapObj.current;

    // 내 현재 위치 — 파란 점
    if (pos) {
      const position = { lat: pos.latitude, lng: pos.longitude };
      if (myMarker.current) {
        myMarker.current.position = position;
      } else {
        const dot = document.createElement('div');
        dot.style.cssText =
          'width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 3px rgba(37,99,235,.3)';
        myMarker.current = new google.maps.marker.AdvancedMarkerElement({
          map,
          position,
          content: dot,
          title: '내 현재 위치',
          zIndex: 10,
        });
      }
      map.setCenter(position);
      if ((map.getZoom() ?? 0) < 15) map.setZoom(17);
    }

    // 등록된 현장 핀 (초록)
    siteMarkers.current.forEach((m) => { m.map = null; });
    siteMarkers.current = [];
    for (const s of sites ?? []) {
      if (s.latitude === null || s.longitude === null) continue;
      const pin = new google.maps.marker.PinElement({
        background: '#047857',
        borderColor: '#065f46',
        glyphColor: '#fff',
      });
      siteMarkers.current.push(
        new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat: s.latitude, lng: s.longitude },
          content: pin.element,
          title: s.name,
        }),
      );
    }
  }, [mapLoaded, pos, sites]);

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user && !readOnly) {
      router.replace('/m/manager/signup');
      return;
    }
    const { data, error: rpcErr } = await sb.rpc('yeseong_manager_list_site_gps');
    if (rpcErr) {
      setError(rpcErr.message);
      setSites([]);
      return;
    }
    setSites((data as unknown as SiteGps[]) ?? []);
  }, [sb, router, readOnly]);

  const locate = useCallback(async () => {
    setPosLoading(true);
    const p = await getCurrentPosition();
    setPos(p);
    setPosLoading(false);
  }, []);

  useEffect(() => { load(); locate(); }, [load, locate]);

  const register = async (site: SiteGps) => {
    if (readOnly || busyId || !pos) return;
    if (site.latitude !== null) {
      const ok = confirm(
        `"${site.name}" 현장에 이미 좌표가 등록되어 있습니다 (${site.gps_registered_at ? fmtDate(site.gps_registered_at) : '-'}).\n현 위치로 다시 등록할까요?`,
      );
      if (!ok) return;
    }
    setBusyId(site.id);
    setError(undefined);
    const { error: rpcErr } = await sb.rpc('yeseong_manager_register_site_gps', {
      p_worksite_id: site.id,
      p_latitude: pos.latitude,
      p_longitude: pos.longitude,
    });
    setBusyId(null);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setDoneId(site.id);
    await load();
  };

  return (
    <MobileShell showTabs activeTab="home" variant="manager">
      <div className="px-5 pt-16 pb-8">
        <h1 className="text-[26px] font-bold text-zinc-900 flex items-center gap-2">
          <MapPin className="h-7 w-7 text-emerald-700" />
          현장 위치 등록
        </h1>
        <p className="mt-2 text-sm text-zinc-500 leading-relaxed">
          현장에서 이 화면을 열고 등록하면, 현 위치가 현장 좌표로 저장되어
          작업자 GPS 출역 확인에 사용됩니다.
        </p>

        {/* 현 위치 */}
        <div className="mt-5 rounded-[8px] bg-zinc-50 ring-1 ring-zinc-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-zinc-700">내 현재 위치</span>
            <button
              onClick={locate}
              disabled={posLoading}
              className="flex items-center gap-1 rounded-[5px] bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200 active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${posLoading ? 'animate-spin' : ''}`} />
              새로고침
            </button>
          </div>
          {posLoading ? (
            <p className="mt-1.5 text-sm text-zinc-400">위치 확인 중...</p>
          ) : pos ? (
            <p className="mt-1.5 font-mono text-xs text-zinc-600">
              {pos.latitude.toFixed(6)}, {pos.longitude.toFixed(6)}
            </p>
          ) : (
            <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-red-600">
              <AlertTriangle className="h-4 w-4" />
              위치를 가져올 수 없습니다. 위치 권한을 확인해주세요.
            </p>
          )}
        </div>

        {/* 지도 — 파란 점 = 내 위치, 초록 핀 = 등록된 현장 */}
        <div className="relative mt-3 h-[280px] w-full overflow-hidden rounded-[8px] ring-1 ring-zinc-200 bg-zinc-100">
          <div ref={mapRef} className="h-full w-full" />
          {!mapLoaded && !mapError && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
              지도 로딩 중...
            </div>
          )}
          {mapError && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm font-semibold text-red-600">
              {mapError}
            </div>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-400">
          파란 점 = 내 현재 위치 · 초록 핀 = 등록된 현장 좌표
        </p>

        {readOnly && (
          <p className="mt-3 rounded-[5px] bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
            관리자 보기 모드 — 등록은 팀장 본인만 가능합니다.
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-[5px] bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>
        )}

        {/* 담당 현장 목록 */}
        <h2 className="mt-6 text-base font-bold text-zinc-800">담당 현장</h2>
        <div className="mt-2 space-y-3">
          {sites === null ? (
            <p className="py-8 text-center text-sm text-zinc-400">불러오는 중...</p>
          ) : sites.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">담당 현장이 없습니다.</p>
          ) : (
            sites.map((site) => {
              const dist = pos && site.latitude !== null && site.longitude !== null
                ? distanceM(pos, site.latitude, site.longitude)
                : null;
              return (
                <div key={site.id} className="rounded-[8px] bg-white ring-1 ring-zinc-200 px-4 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-base font-bold text-zinc-900">{site.name}</p>
                      {site.address && (
                        <p className="mt-0.5 text-xs text-zinc-500 truncate">{site.address}</p>
                      )}
                      {site.latitude !== null ? (
                        <p className="mt-1 text-xs text-emerald-700 font-semibold">
                          등록됨 ({site.gps_registered_at ? fmtDate(site.gps_registered_at) : '-'})
                          {dist !== null && (
                            <span className="ml-1.5 text-zinc-400 font-normal">
                              · 현 위치에서 {dist >= 1000 ? `${(dist / 1000).toFixed(1)}km` : `${dist}m`}
                            </span>
                          )}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-zinc-400 font-semibold">좌표 미등록</p>
                      )}
                    </div>
                    {doneId === site.id && (
                      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">
                        <Check className="h-3 w-3" />
                        완료
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => register(site)}
                    disabled={readOnly || !pos || busyId !== null}
                    className="mt-3 h-[52px] w-full rounded-[5px] bg-emerald-700 text-base font-bold text-white active:scale-[0.99] disabled:opacity-40"
                  >
                    {busyId === site.id
                      ? '등록 중...'
                      : site.latitude !== null
                        ? '현 위치로 다시 등록'
                        : '현 위치를 현장 좌표로 등록'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </MobileShell>
  );
}
