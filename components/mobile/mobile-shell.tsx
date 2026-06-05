'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Home, User, Wallet, ClipboardCheck, PackagePlus, Package, Camera } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { getMirrorId, withMirror } from '@/lib/manager/mirror';
import { LocationSettingsBar } from '@/components/mobile/location-settings-bar';

type WorkerTab = 'home' | 'payroll' | 'volumes' | 'proofs' | 'profile';
type ManagerTab = 'home' | 'orders' | 'proofs' | 'volumes' | 'affiliation' | 'profile';
type ActiveTab = WorkerTab | ManagerTab;

type Props = {
  children: ReactNode;
  showTabs?: boolean;
  activeTab?: ActiveTab;
  variant?: 'worker' | 'manager';
};

const LOGOUT_HOLD_MS = 5000;

export function MobileShell({ children, showTabs = false, activeTab, variant = 'worker' }: Props) {
  // 관리자 미러 모드(?mirror=<id>): 탭 이동 시 파라미터 유지
  const [mirror, setMirror] = useState<string | null>(null);
  useEffect(() => { setMirror(getMirrorId()); }, []);

  return (
    <div className="min-h-svh bg-white flex items-center justify-center p-0 sm:p-6">
      <div className="relative w-full sm:max-w-[420px] sm:rounded-[40px] sm:ring-1 sm:ring-zinc-200 sm:shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)] sm:overflow-hidden bg-white min-h-svh sm:min-h-[860px] sm:max-h-[860px] flex flex-col">
        <div className={'flex-1 overflow-y-auto' + (showTabs ? ' pb-32' : '')}>{children}</div>

        {/* 플로팅 하단 메뉴 — Android 엣지투엣지에서 시스템 내비게이션 바 위에 떠 있도록
            safe-area-inset-bottom 만큼 띄운다.
            모바일: 뷰포트 고정(fixed) — 페이지가 길어도 항상 보임 / 데스크톱 프레임: absolute */}
        {showTabs && (
          <div
            className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 sm:absolute"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 10px)' }}
          >
            <div className="pointer-events-auto space-y-2">
              {variant === 'worker' && <LocationSettingsBar />}
              {variant === 'worker' && (
                <nav className="grid grid-cols-5 overflow-hidden rounded-[18px] border border-zinc-200 bg-white/95 shadow-[0_8px_30px_rgba(15,23,42,0.18)] backdrop-blur">
                  <HomeTabWithLongPressLogout active={activeTab === 'home'} />
                  <Tab href="/m/payroll" icon={<Wallet className="h-6 w-6" />} label="급여" active={activeTab === 'payroll'} />
                  <Tab href="/m/volumes" icon={<Package className="h-6 w-6" />} label="성과" active={activeTab === 'volumes'} />
                  <Tab href="/m/site-photos" icon={<Camera className="h-6 w-6" />} label="현장증빙" active={activeTab === 'proofs'} />
                  <Tab href="/m/me" icon={<User className="h-6 w-6" />} label="내 정보" active={activeTab === 'profile'} />
                </nav>
              )}
              {variant === 'manager' && (
                <nav className="grid grid-cols-5 overflow-hidden rounded-[18px] border border-zinc-200 bg-white/95 shadow-[0_8px_30px_rgba(15,23,42,0.18)] backdrop-blur">
                  <ManagerHomeTabWithLongPressLogout active={activeTab === 'home'} mirror={mirror} />
                  <Tab href={withMirror('/m/manager/orders', mirror)} icon={<PackagePlus className="h-6 w-6" />} label="발주" active={activeTab === 'orders'} />
                  <Tab href={withMirror('/m/manager/site-photos', mirror)} icon={<Camera className="h-6 w-6" />} label="현장증빙" active={activeTab === 'proofs'} />
                  <Tab href={withMirror('/m/manager/volumes', mirror)} icon={<Package className="h-6 w-6" />} label="성과" active={activeTab === 'volumes'} />
                  <Tab href={withMirror('/m/manager/me', mirror)} icon={<User className="h-6 w-6" />} label="내 정보" active={activeTab === 'profile'} />
                </nav>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Tab({ href, icon, label, active }: { href: string; icon: ReactNode; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={
        'flex flex-col items-center justify-center gap-1 py-3 text-sm font-semibold transition-colors ' +
        (active ? 'text-blue-900' : 'text-zinc-400')
      }
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

// 팀장앱 출역검토 탭 long-press(5초)로 로그아웃. 짧은 탭은 /m/manager/home 이동.
function ManagerHomeTabWithLongPressLogout({ active, mirror }: { active: boolean; mirror: string | null }) {
  const router = useRouter();
  const [pressing, setPressing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggered = useRef(false);

  const start = () => {
    if (mirror) return; // 미러(보기 전용)에서는 로그아웃 비활성
    triggered.current = false;
    setPressing(true);
    timer.current = setTimeout(async () => {
      triggered.current = true;
      setPressing(false);
      const sb = getBrowserSupabase();
      await sb.auth.signOut();
      router.replace('/m/manager/signup');
      router.refresh();
    }, LOGOUT_HOLD_MS);
  };

  const cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setPressing(false);
  };

  const onClick = (e: React.MouseEvent) => {
    if (triggered.current) {
      e.preventDefault();
      return;
    }
    if (!active) router.push(withMirror('/m/manager/home', mirror));
  };

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={onClick}
      style={{
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        touchAction: 'manipulation',
      }}
      className={
        'relative flex flex-col items-center justify-center gap-1 py-3 text-sm font-semibold transition-colors overflow-hidden ' +
        (active ? 'text-blue-900' : 'text-zinc-400')
      }
    >
      {pressing && (
        <span
          className="absolute inset-0 bg-red-100 origin-bottom pointer-events-none"
          style={{ animationName: 'longpress', animationDuration: `${LOGOUT_HOLD_MS}ms`, animationTimingFunction: 'linear', animationFillMode: 'forwards' }}
        />
      )}
      <span className="relative">
        <ClipboardCheck className="h-6 w-6" />
      </span>
      <span className="relative">{pressing ? '계속 누르면 로그아웃' : '출역검토'}</span>
      <style jsx>{`
        @keyframes longpress {
          from { transform: scaleY(0); }
          to { transform: scaleY(1); }
        }
      `}</style>
    </button>
  );
}

// 출역 탭 long-press(5초)로 로그아웃. 짧은 탭은 /m/home 이동.
function HomeTabWithLongPressLogout({ active }: { active: boolean }) {
  const router = useRouter();
  const [pressing, setPressing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggered = useRef(false);

  const start = () => {
    triggered.current = false;
    setPressing(true);
    timer.current = setTimeout(async () => {
      triggered.current = true;
      setPressing(false);
      const sb = getBrowserSupabase();
      await sb.auth.signOut();
      router.replace('/m/signup');
      router.refresh();
    }, LOGOUT_HOLD_MS);
  };

  const cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setPressing(false);
  };

  const onClick = (e: React.MouseEvent) => {
    if (triggered.current) {
      e.preventDefault();
      return;
    }
    if (!active) router.push('/m/home');
  };

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onClick={onClick}
      className={
        'relative flex flex-col items-center justify-center gap-1 py-3 text-sm font-semibold transition-colors overflow-hidden ' +
        (active ? 'text-blue-900' : 'text-zinc-400')
      }
    >
      {pressing && (
        <span
          className="absolute inset-0 bg-red-100 origin-bottom animate-[longpress_5s_linear_forwards] pointer-events-none"
          style={{ animationName: 'longpress', animationDuration: `${LOGOUT_HOLD_MS}ms` }}
        />
      )}
      <span className="relative">
        <Home className="h-7 w-7" />
      </span>
      <span className="relative">{pressing ? '계속 누르면 로그아웃' : '출역'}</span>
      <style jsx>{`
        @keyframes longpress {
          from { transform: scaleY(0); }
          to { transform: scaleY(1); }
        }
      `}</style>
    </button>
  );
}
