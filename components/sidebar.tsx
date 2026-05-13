'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Hammer,
  LayoutDashboard,
  MapPin,
  FileSpreadsheet,
  ShoppingCart,
  Receipt,
  Wrench,
  Users,
  HardHat,
  Building2,
  Store,
  BellOff,
  LogOut as LogOutIcon,
  KeyRound,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type Item = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
};

type Group = {
  label: string;
  items: Item[];
};

const groups: Group[] = [
  {
    label: '메인',
    items: [
      { label: '대시보드', href: '/dashboard', icon: LayoutDashboard },
      { label: '출역 현황', href: '/attendance', icon: MapPin, badge: 'LIVE' },
      { label: '노임대장', href: '/payroll', icon: FileSpreadsheet },
    ],
  },
  {
    label: '현장 운영',
    items: [
      { label: '발주', href: '/orders', icon: ShoppingCart },
      { label: '영수증', href: '/expenses', icon: Receipt },
      { label: '장비 렌탈', href: '/equipment', icon: Wrench },
    ],
  },
  {
    label: '마스터 데이터',
    items: [
      { label: '작업자', href: '/workers', icon: Users },
      { label: '협력사', href: '/subcontractors', icon: HardHat },
      { label: '현장', href: '/worksites', icon: Building2 },
      { label: '거래처', href: '/vendors', icon: Store },
    ],
  },
  {
    label: '모니터링',
    items: [
      { label: '앱 종료 알림', href: '/monitoring/offline', icon: BellOff },
      { label: '이탈 기록', href: '/monitoring/departures', icon: LogOutIcon },
    ],
  },
  {
    label: '설정',
    items: [
      { label: '계정 (ID/비밀번호)', href: '/settings/account', icon: KeyRound },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/';
  if (href === '/payroll') return pathname.startsWith('/payroll');
  return pathname === href || pathname.startsWith(href + '/');
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 h-svh w-60 shrink-0 border-r border-zinc-200 bg-white flex flex-col">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 px-5 h-14 border-b border-zinc-200 text-zinc-900 font-semibold"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-white">
          <Hammer className="h-4 w-4" />
        </span>
        <span className="text-[11px]">예성건설</span>
      </Link>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {groups.map(group => (
          <div key={group.label}>
            <p className="px-3 mb-1 text-[8px] font-semibold uppercase tracking-wider text-zinc-400">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map(item => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[11px] transition-colors',
                        active
                          ? 'bg-zinc-900 text-white'
                          : 'text-zinc-700 hover:bg-zinc-100'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {item.badge && (
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[7px] font-semibold',
                            active
                              ? 'bg-white/20 text-white'
                              : 'bg-emerald-100 text-emerald-700'
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <button
        type="button"
        className="flex items-center gap-2.5 px-4 py-3 border-t border-zinc-200 text-[11px] text-zinc-700 hover:bg-zinc-50"
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-semibold text-zinc-700">
          김
        </span>
        <span className="flex-1 text-left">
          <span className="block text-[11px] font-medium leading-tight">김관리</span>
          <span className="block text-[8px] text-zinc-500 leading-tight">admin</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
      </button>
    </aside>
  );
}
