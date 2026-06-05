'use client';

import { useEffect, useState } from 'react';
import { MapPin, ChevronRight } from 'lucide-react';
import { isAlwaysAllowGranted } from '@/lib/capacitor/background-permission';
import { openLocationSettings } from '@/lib/capacitor/background-gps';

/**
 * 위치 "항상 허용" 미설정 시 탭바 위에 노출되는 하단 메뉴.
 * - 누르면 시스템 앱 설정으로 이동 → 위치 → 항상 허용
 * - 이미 항상 허용이면 렌더링하지 않음
 * - 설정에서 돌아오면(visibilitychange) 재확인해 자동으로 사라짐
 */
export function LocationSettingsBar() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const granted = await isAlwaysAllowGranted();
      if (mounted) setShow(!granted);
    };
    check();

    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!show) return null;

  return (
    <button
      type="button"
      onClick={() => openLocationSettings()}
      className="flex w-full shrink-0 items-center gap-3 border-t border-amber-200 bg-amber-50 px-5 py-3 text-left active:bg-amber-100"
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100">
        <MapPin className="h-5 w-5 text-amber-700" />
      </span>
      <span className="flex-1">
        <span className="block text-sm font-bold text-amber-900">위치 권한 설정이 필요해요</span>
        <span className="block text-xs text-amber-700">
          눌러서 설정 → 권한 → 위치 → <strong>항상 허용</strong> 선택
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-amber-400" />
    </button>
  );
}
