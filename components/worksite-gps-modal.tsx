'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, MapPin, Navigation, RotateCcw, LocateFixed } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  worksiteId: string;
  worksiteName: string;
  address: string | null;
  initialLat: number | null;
  initialLng: number | null;
  initialRadius: number;
  onSave: (lat: number, lng: number, radius: number) => Promise<void>;
  onClear: () => Promise<void>;
  onClose: () => void;
};

const RADIUS_OPTIONS = [100, 200, 300, 500, 1000];

export function WorksiteGpsModal({
  worksiteId,
  worksiteName,
  address,
  initialLat,
  initialLng,
  initialRadius,
  onSave,
  onClear,
  onClose,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);

  const [lat, setLat] = useState<number | null>(initialLat);
  const [lng, setLng] = useState<number | null>(initialLng);
  const [radius, setRadius] = useState(initialRadius || 300);
  const [searchAddr, setSearchAddr] = useState(address ?? '');
  const [coordInput, setCoordInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Google Maps 스크립트 로드
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setError('Google Maps API 키가 설정되지 않았습니다.');
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
    script.onerror = () => setError('Google Maps 로드 실패');
    document.head.appendChild(script);
  }, []);

  const updateMarker = useCallback((map: google.maps.Map, position: google.maps.LatLng, r: number) => {
    if (markerRef.current) {
      markerRef.current.position = position;
    } else {
      markerRef.current = new google.maps.marker.AdvancedMarkerElement({
        map,
        position,
        gmpDraggable: true,
        title: worksiteName,
      });
      markerRef.current.addListener('dragend', () => {
        const pos = markerRef.current?.position;
        if (pos) {
          const newLat = typeof pos.lat === 'function' ? pos.lat() : pos.lat;
          const newLng = typeof pos.lng === 'function' ? pos.lng() : pos.lng;
          setLat(newLat);
          setLng(newLng);
          if (circleRef.current) {
            circleRef.current.setCenter({ lat: newLat, lng: newLng });
          }
        }
      });
    }

    if (circleRef.current) {
      circleRef.current.setCenter(position);
      circleRef.current.setRadius(r);
    } else {
      circleRef.current = new google.maps.Circle({
        map,
        center: position,
        radius: r,
        fillColor: '#447D9B',
        fillOpacity: 0.15,
        strokeColor: '#447D9B',
        strokeOpacity: 0.6,
        strokeWeight: 2,
      });
    }
  }, [worksiteName]);

  // 지도 초기화
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;

    const defaultCenter = { lat: lat ?? 36.5, lng: lng ?? 127.0 };

    const map = new google.maps.Map(mapRef.current, {
      center: defaultCenter,
      zoom: lat ? 16 : 7,
      mapId: 'worksite-gps',
      disableDefaultUI: false,
      zoomControl: true,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
    });
    mapInstanceRef.current = map;

    // 지도 클릭 시 마커 이동
    map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const clickLat = e.latLng.lat();
      const clickLng = e.latLng.lng();
      setLat(clickLat);
      setLng(clickLng);
      updateMarker(map, e.latLng, radius);
    });

    if (lat && lng) {
      updateMarker(map, new google.maps.LatLng(lat, lng), radius);
    } else if (address) {
      // 주소로 Geocoding
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address }, (results, status) => {
        if (status === 'OK' && results?.[0]) {
          const loc = results[0].geometry.location;
          setLat(loc.lat());
          setLng(loc.lng());
          map.setCenter(loc);
          map.setZoom(16);
          updateMarker(map, loc, radius);
        }
      });
    }

    return () => {
      markerRef.current = null;
      circleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded]);

  // 반경 변경 시 원 업데이트
  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(radius);
    }
  }, [radius]);

  const handleGeocode = async () => {
    const q = searchAddr.trim();
    if (!q || !mapInstanceRef.current) return;
    setError(null);
    const geocoder = new google.maps.Geocoder();
    // 한국 내 검색으로 한정 (지역 코드 KR)
    geocoder.geocode({ address: q, region: 'KR' }, (results, status) => {
      if (status === 'OK' && results?.[0]) {
        const loc = results[0].geometry.location;
        setLat(loc.lat());
        setLng(loc.lng());
        mapInstanceRef.current!.setCenter(loc);
        mapInstanceRef.current!.setZoom(16);
        updateMarker(mapInstanceRef.current!, loc, radius);
      } else if (status === 'REQUEST_DENIED') {
        setError('주소 검색 기능(Geocoding API)이 비활성화되어 있습니다. 아래 "좌표 직접 입력"을 사용하거나 지도를 클릭하세요.');
      } else {
        setError('주소를 찾을 수 없습니다. 좌표 직접 입력 또는 지도 클릭을 사용하세요.');
      }
    });
  };

  // 위/경도 직접 입력 ("37.268884, 127.307617" 형식)
  const handleCoordInput = () => {
    if (!mapInstanceRef.current) return;
    setError(null);
    const m = coordInput.trim().match(/(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/);
    if (!m) {
      setError('좌표 형식이 올바르지 않습니다. 예: 37.268884, 127.307617');
      return;
    }
    const newLat = parseFloat(m[1]);
    const newLng = parseFloat(m[2]);
    if (newLat < 33 || newLat > 39 || newLng < 124 || newLng > 132) {
      setError('한국 좌표 범위를 벗어났습니다. 위도(앞), 경도(뒤) 순서를 확인하세요.');
      return;
    }
    const loc = new google.maps.LatLng(newLat, newLng);
    setLat(newLat);
    setLng(newLng);
    mapInstanceRef.current.setCenter(loc);
    mapInstanceRef.current.setZoom(17);
    updateMarker(mapInstanceRef.current, loc, radius);
  };

  // 현재 위치(브라우저 geolocation)로 마커 이동
  const handleMyLocation = () => {
    if (!navigator.geolocation) {
      setError('이 브라우저는 위치 기능을 지원하지 않습니다.');
      return;
    }
    if (!mapInstanceRef.current) return;
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const loc = new google.maps.LatLng(p.coords.latitude, p.coords.longitude);
        setLat(p.coords.latitude);
        setLng(p.coords.longitude);
        mapInstanceRef.current!.setCenter(loc);
        mapInstanceRef.current!.setZoom(17);
        updateMarker(mapInstanceRef.current!, loc, radius);
      },
      () => setError('현재 위치를 가져올 수 없습니다. 위치 권한을 확인해주세요.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleSave = async () => {
    if (lat === null || lng === null) {
      setError('지도에서 위치를 선택해주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(lat, lng, radius);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('GPS 좌표를 삭제하시겠습니까?')) return;
    setBusy(true);
    try {
      await onClear();
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-[5px] bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-[#D7D7D7] px-5 py-3">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[#447D9B]" />
              GPS 좌표 등록 — {worksiteName}
            </h2>
            {address && <p className="text-xs text-[#6B7280] mt-0.5">{address}</p>}
          </div>
          <button onClick={onClose} className="rounded p-1 text-[#9CA3AF] hover:bg-[#F5F5F5] hover:text-[#091413]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 지도 */}
        <div className="relative">
          <div ref={mapRef} className="h-[400px] w-full bg-[#F5F5F5]" />
          {!mapLoaded && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-[#9CA3AF]">
              지도 로딩 중...
            </div>
          )}
        </div>

        {/* 컨트롤 */}
        <div className="space-y-3 border-t border-[#D7D7D7] px-5 py-4">
          {/* 주소 검색 */}
          <div className="flex items-center gap-2">
            <input
              value={searchAddr}
              onChange={(e) => setSearchAddr(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleGeocode(); }}
              placeholder="주소 입력 (예: 동탄기흥로 864)"
              className="h-9 flex-1 rounded-[5px] border border-[#D7D7D7] px-2 text-sm"
            />
            <button
              onClick={handleGeocode}
              disabled={!searchAddr.trim()}
              className="flex h-9 shrink-0 items-center gap-1 rounded-[5px] bg-[#273F4F] px-3 text-xs font-semibold text-white hover:bg-[#1d303d] disabled:opacity-40"
            >
              <Navigation className="h-3 w-3" />
              주소로 검색
            </button>
            <button
              onClick={handleMyLocation}
              className="flex h-9 shrink-0 items-center gap-1 rounded-[5px] border border-[#D7D7D7] px-3 text-xs font-medium text-[#4B5563] hover:bg-[#F5F5F5]"
            >
              <LocateFixed className="h-3 w-3" />
              현재 위치
            </button>
          </div>

          {/* 좌표 직접 입력 */}
          <div className="flex items-center gap-2">
            <input
              value={coordInput}
              onChange={(e) => setCoordInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCoordInput(); }}
              placeholder="좌표 직접 입력 (예: 37.268884, 127.307617)"
              className="h-9 flex-1 rounded-[5px] border border-[#D7D7D7] px-2 text-sm font-mono"
            />
            <button
              onClick={handleCoordInput}
              disabled={!coordInput.trim()}
              className="flex h-9 shrink-0 items-center gap-1 rounded-[5px] bg-[#447D9B] px-3 text-xs font-semibold text-white hover:bg-[#366379] disabled:opacity-40"
            >
              <MapPin className="h-3 w-3" />
              좌표 적용
            </button>
          </div>

          {/* 좌표 표시 */}
          <div className="flex items-center gap-4 text-sm">
            <span className="text-[#6B7280]">좌표:</span>
            {lat && lng ? (
              <span className="font-mono text-xs text-[#091413]">
                {lat.toFixed(6)}, {lng.toFixed(6)}
              </span>
            ) : (
              <span className="text-xs text-[#9CA3AF]">지도를 클릭하거나 주소 검색을 사용하세요</span>
            )}
          </div>

          {/* 반경 */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#6B7280]">반경:</span>
            <div className="flex gap-1.5">
              {RADIUS_OPTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRadius(r)}
                  className={`rounded-[5px] border px-2.5 py-1 text-xs font-semibold ${
                    radius === r
                      ? 'border-[#273F4F] bg-[#273F4F] text-white'
                      : 'border-[#D7D7D7] bg-white text-[#091413] hover:bg-[#F5F5F5]'
                  }`}
                >
                  {r}m
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* 버튼 */}
          <div className="flex gap-2 pt-1">
            {initialLat && (
              <button
                onClick={handleClear}
                disabled={busy}
                className="flex items-center gap-1 rounded-[5px] border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <RotateCcw className="h-3 w-3" />
                좌표 삭제
              </button>
            )}
            <div className="flex-1" />
            <Button variant="outline" onClick={onClose} disabled={busy}>취소</Button>
            <Button onClick={handleSave} disabled={busy || lat === null}>
              {busy ? '저장 중...' : '저장'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
