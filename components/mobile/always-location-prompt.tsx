'use client';
// 위치 "항상 허용" 유도 — 사전 고지(Prominent Disclosure) 전체화면 + 재유도 배너
// Play 정책: 백그라운드 위치 권한 요청 전에 인앱 사전 고지 필수.
// 권한 요청은 반드시 사용자 버튼 탭에서만 (자동 트리거 금지 — ANR 루프).

import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, Settings } from 'lucide-react';
import {
  getLocationAuthStatus,
  requestAlwaysLocation,
  type LocationAuthStatus,
} from '@/lib/capacitor/background-permission';

const DISCLOSURE_KEY = 'bg-location-disclosure-shown';

export function AlwaysLocationPrompt({
  appName,
  onAlways,
}: {
  appName: string;
  onAlways?: () => void;
}) {
  const [status, setStatus] = useState<LocationAuthStatus | null>(null);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const notifiedAlways = useRef(false);

  const refresh = useCallback(async () => {
    const s = await getLocationAuthStatus();
    setStatus(s);
    if (s === 'always' && !notifiedAlways.current) {
      notifiedAlways.current = true;
      onAlways?.();
    }
    return s;
  }, [onAlways]);

  useEffect(() => {
    (async () => {
      const s = await refresh();
      // 웹/구버전 APK(null)·이미 항상 허용이면 노출 안 함
      if (s === null || s === 'always') return;
      let shown = false;
      try { shown = localStorage.getItem(DISCLOSURE_KEY) === '1'; } catch { /* 무시 */ }
      if (!shown) setDisclosureOpen(true);
    })();
  }, [refresh]);

  // 설정 화면에서 돌아온 순간 상태 재확인 (요청은 하지 않음 — 검사만)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const markShown = () => {
    try { localStorage.setItem(DISCLOSURE_KEY, '1'); } catch { /* 무시 */ }
  };

  // 사용자 버튼 탭 → 포그라운드 → 백그라운드 순차 요청 (유일한 권한 요청 경로)
  const goSettings = async () => {
    if (busy) return;
    setBusy(true);
    markShown();
    await requestAlwaysLocation();
    await refresh();
    setBusy(false);
    setDisclosureOpen(false);
  };

  const later = () => {
    markShown();
    setDisclosureOpen(false);
  };

  if (status === null) return null;

  // ── 사전 고지 전체화면 ──
  if (disclosureOpen && status !== 'always') {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-white overflow-y-auto">
        <div className="flex-1 px-7 pt-16 pb-6">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
            <MapPin className="h-7 w-7 text-navy" />
          </span>
          <h1 className="mt-6 text-[28px] font-bold leading-snug text-zinc-900">
            위치 권한이<br />필요해요
          </h1>

          <p className="mt-5 text-base leading-relaxed text-zinc-600">
            {appName} 앱은 출역(출근) 확인을 위해{' '}
            <strong className="text-zinc-900">
              앱이 백그라운드 상태이거나 종료된 경우에도 위치 정보를 수집합니다.
            </strong>
          </p>

          <ul className="mt-5 space-y-2 text-[15px] leading-relaxed text-zinc-600">
            <li>• <strong className="text-zinc-800">수집 목적</strong>: 현장 출역 확인 및 현장 도착 여부 검증</li>
            <li>• <strong className="text-zinc-800">수집 항목</strong>: GPS 좌표 (위도·경도)</li>
            <li>• <strong className="text-zinc-800">사용 시점</strong>: 근무시간 중 주기적 수집</li>
            <li>• <strong className="text-zinc-800">보관 기간</strong>: 5일 후 자동 삭제, 제3자 제공 없음</li>
          </ul>

          <div className="mt-6 rounded-[10px] bg-blue-50 p-4">
            <p className="text-[15px] font-bold leading-relaxed text-navy">
              다음 화면에서 위치 권한을 <span className="underline">&lsquo;항상 허용&rsquo;</span>으로
              선택해주세요.
            </p>
            <p className="mt-1 text-sm leading-relaxed text-navy/80">
              &lsquo;앱 사용 중에만 허용&rsquo;으로는 출역 자동 확인이 동작하지 않습니다.
            </p>
          </div>

          <p className="mt-5 text-sm leading-relaxed text-zinc-400">
            거부해도 출역 등록은 가능하지만 위치 자동 확인이 제한됩니다.
            나중에 폰 설정 → 앱 → {appName} → 권한 → 위치에서 변경할 수 있어요.
          </p>
        </div>

        <div className="shrink-0 space-y-3 px-7 pb-10">
          <button
            onClick={goSettings}
            disabled={busy}
            className="h-[60px] w-full rounded-[5px] bg-navy text-lg font-bold text-white active:scale-[0.99] disabled:opacity-60"
          >
            {busy ? '확인 중...' : '위치 권한 설정으로 이동'}
          </button>
          <button
            onClick={later}
            disabled={busy}
            className="h-[52px] w-full rounded-[5px] bg-zinc-100 text-base font-semibold text-zinc-500 disabled:opacity-50"
          >
            나중에 설정하기
          </button>
        </div>
      </div>
    );
  }

  // ── 재유도 배너 ──
  if (status !== 'always') {
    return (
      <button
        onClick={goSettings}
        disabled={busy}
        className="mb-5 flex w-full items-start gap-3 rounded-[10px] bg-amber-50 px-4 py-3.5 text-left ring-1 ring-amber-200 active:scale-[0.99] disabled:opacity-60"
      >
        <Settings className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <span className="min-w-0">
          <span className="block text-[15px] font-bold text-amber-900">
            위치 권한이 &lsquo;항상 허용&rsquo;으로 설정되어 있지 않습니다
          </span>
          <span className="mt-0.5 block text-[13px] leading-snug text-amber-800/80">
            탭해서 설정 → 앱 → {appName} → 권한 → 위치 → &lsquo;항상 허용&rsquo; 선택
          </span>
        </span>
      </button>
    );
  }

  return null;
}
