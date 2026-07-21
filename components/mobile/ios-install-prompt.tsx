'use client';

import { useEffect, useState } from 'react';
import { Share, Plus, X } from 'lucide-react';

const DISMISS_KEY = 'ios-install-dismissed';
const DISMISS_DAYS = 14;

// iOS 사파리에서만, 홈 화면 미설치 상태일 때만 노출.
// (안드로이드는 Capacitor 네이티브 앱을 쓰므로 대상 아님)
function shouldShow(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;

  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS는 데스크톱 UA로 위장 → 터치 지원으로 판별
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIOS) return false;

  // Chrome/Firefox/Edge(iOS)·카카오 등 인앱 브라우저는 홈 화면 추가 불가 → 사파리만
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|kakaotalk|naver|fban|fbav|instagram|line/i.test(ua);
  if (!isSafari) return false;

  // 이미 홈 화면에서 실행 중이면 숨김
  const standalone =
    ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone) ||
    window.matchMedia('(display-mode: standalone)').matches;
  if (standalone) return false;

  const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
  if (dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 864e5) return false;

  return true;
}

export function IosInstallPrompt() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // 렌더 후 한 박자 뒤 노출 → 등장 애니메이션 트리거
    const t = setTimeout(() => setOpen(shouldShow()), 600);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[100] px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] motion-safe:animate-[slideUp_.3s_cubic-bezier(.22,1,.36,1)]"
      role="dialog"
      aria-label="홈 화면에 추가 안내"
    >
      <div className="mx-auto max-w-md rounded-2xl border border-[#D7D7D7] bg-white p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <img src="/icons/icon-192.png" alt="" className="h-11 w-11 rounded-xl border border-[#D7D7D7]" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-[#091413]">홈 화면에 추가하고 앱처럼 쓰세요</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-[#5b6b6a]">
              사파리 하단{' '}
              <Share className="mx-0.5 inline-block h-4 w-4 -translate-y-px text-[#447D9B]" aria-label="공유" />{' '}
              공유 버튼을 누르고
              <br />
              <span className="inline-flex items-center gap-1 font-medium text-[#091413]">
                <Plus className="h-3.5 w-3.5" aria-hidden /> 홈 화면에 추가
              </span>
              를 선택하세요.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="닫기"
            className="-m-1 shrink-0 rounded-full p-1 text-[#8a9897] transition-colors hover:bg-[#f2f4f4] hover:text-[#091413]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
