'use client';
import { useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Home, User, Wallet, ClipboardCheck, PackagePlus, Receipt, Building2, Package } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/client';

type WorkerTab = 'home' | 'payroll' | 'volumes' | 'affiliation' | 'profile';
type ManagerTab = 'home' | 'orders' | 'expenses' | 'volumes' | 'affiliation' | 'profile';
type ActiveTab = WorkerTab | ManagerTab;

type Props = {
  children: ReactNode;
  showTabs?: boolean;
  activeTab?: ActiveTab;
  variant?: 'worker' | 'manager';
};

const LOGOUT_HOLD_MS = 5000;

export function MobileShell({ children, showTabs = false, activeTab, variant = 'worker' }: Props) {
  return (
    <div className="min-h-svh bg-white flex items-center justify-center p-0 sm:p-6">
      <div className="relative w-full sm:max-w-[420px] sm:rounded-[40px] sm:ring-1 sm:ring-zinc-200 sm:shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)] sm:overflow-hidden bg-white min-h-svh sm:min-h-[860px] sm:max-h-[860px] flex flex-col">
        <div className="flex-1 overflow-y-auto">{children}</div>
        {showTabs && variant === 'worker' && (
          <nav className="shrink-0 grid grid-cols-5 border-t border-zinc-200 bg-white">
            <HomeTabWithLongPressLogout active={activeTab === 'home'} />
            <Tab href="/m/payroll" icon={<Wallet className="h-6 w-6" />} label="급여" active={activeTab === 'payroll'} />
            <Tab href="/m/volumes" icon={<Package className="h-6 w-6" />} label="성과" active={activeTab === 'volumes'} />
            <Tab href="/m/profile" icon={<Building2 className="h-6 w-6" />} label="소속" active={activeTab === 'affiliation'} />
            <Tab href="/m/me" icon={<User className="h-6 w-6" />} label="내 정보" active={activeTab === 'profile'} />
          </nav>
        )}
        {showTabs && variant === 'manager' && (
          <nav className="shrink-0 grid grid-cols-5 border-t border-zinc-200 bg-white">
            <ManagerHomeTabWithLongPressLogout active={activeTab === 'home'} />
            <Tab href="/m/manager/orders" icon={<PackagePlus className="h-6 w-6" />} label="발주" active={activeTab === 'orders'} />
            <Tab href="/m/manager/expenses" icon={<Receipt className="h-6 w-6" />} label="비용" active={activeTab === 'expenses'} />
            <Tab href="/m/manager/volumes" icon={<Package className="h-6 w-6" />} label="성과" active={activeTab === 'volumes'} />
            <Tab href="/m/manager/me" icon={<User className="h-6 w-6" />} label="내 정보" active={activeTab === 'profile'} />
          </nav>
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
function ManagerHomeTabWithLongPressLogout({ active }: { active: boolean }) {
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
    if (!active) router.push('/m/manager/home');
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
