'use client';

import { useState } from 'react';
import { MapPin, X } from 'lucide-react';

const STORAGE_KEY = 'gps-guide-dismissed';

/**
 * "항상 허용" 위치 권한 안내 배너
 * - 최초 1회만 표시 (dismiss 후 localStorage에 기록)
 * - 출역 화면 상단에 노출
 */
export function GpsPermissionGuide() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(STORAGE_KEY) === '1';
  });

  if (dismissed) return null;

  function handleDismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    setDismissed(true);
  }

  return (
    <div className="mx-4 mt-3 rounded-[8px] bg-blue-50 border border-blue-200 px-4 py-3 relative">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 rounded p-0.5 text-blue-400 hover:text-blue-600"
        aria-label="닫기"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <div className="mt-0.5 shrink-0 rounded-full bg-blue-100 p-1.5">
          <MapPin className="h-4 w-4 text-blue-700" />
        </div>
        <div>
          <p className="text-sm font-bold text-blue-900">
            위치 권한을 &quot;항상 허용&quot;으로 설정해주세요
          </p>
          <p className="mt-1 text-xs text-blue-700 leading-relaxed">
            출역 확인을 위해 현장 위치를 백그라운드에서 확인합니다.
            <br />
            권한 요청이 뜨면 <strong>&quot;항상 허용&quot;</strong>을 선택해주세요.
          </p>
          <p className="mt-1.5 text-[10px] text-blue-500">
            설정 → 앱 → 예성건축 → 권한 → 위치 → 항상 허용
          </p>
        </div>
      </div>
    </div>
  );
}
