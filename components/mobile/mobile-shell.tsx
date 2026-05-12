import type { ReactNode } from 'react';
import Link from 'next/link';
import { Home, User, Wallet } from 'lucide-react';

type Props = {
  children: ReactNode;
  showTabs?: boolean;
  activeTab?: 'home' | 'payroll' | 'profile';
};

export function MobileShell({ children, showTabs = false, activeTab }: Props) {
  return (
    <div className="min-h-svh bg-white flex items-center justify-center p-0 sm:p-6">
      <div className="relative w-full sm:max-w-[420px] sm:rounded-[40px] sm:ring-1 sm:ring-zinc-200 sm:shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)] sm:overflow-hidden bg-white min-h-svh sm:min-h-[860px] sm:max-h-[860px] flex flex-col">
        <div className="flex-1 overflow-y-auto">{children}</div>
        {showTabs && (
          <nav className="shrink-0 grid grid-cols-3 border-t border-zinc-200 bg-white">
            <Tab href="/m/home" icon={<Home className="h-7 w-7" />} label="출역" active={activeTab === 'home'} />
            <Tab href="/m/payroll" icon={<Wallet className="h-7 w-7" />} label="급여내역" active={activeTab === 'payroll'} />
            <Tab href="/m/profile" icon={<User className="h-7 w-7" />} label="내 정보" active={activeTab === 'profile'} />
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
        'flex flex-col items-center justify-center gap-1 py-3 text-base font-semibold transition-colors ' +
        (active ? 'text-blue-900' : 'text-zinc-400')
      }
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
