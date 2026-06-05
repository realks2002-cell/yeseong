'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
  Building,
  Building2,
  Store,
  Layers,
  Megaphone,
  Package,
  Tags,
  ClipboardList,
  Bell,
  BellOff,
  ClipboardCheck,
  History,
  Smartphone,
  LogOut as LogOutIcon,
  KeyRound,
  Images,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { emailToId } from '@/lib/auth/id-email';

type Item = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  divider?: boolean; // 항목 아래 구분선
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
      { label: '현장증빙', href: '/admin/site-photos', icon: Images, badge: 'NEW' },
    ],
  },
  {
    label: '마스터 데이터',
    items: [
      { label: '작업자', href: '/workers', icon: Users },
      { label: '직종', href: '/trades', icon: Tags },
      { label: '팀장', href: '/managers', icon: HardHat },
      { label: '원청사', href: '/clients', icon: Building },
      { label: '전문건설사', href: '/subcontractors', icon: HardHat },
      { label: '현장', href: '/worksites', icon: Building2, divider: true },
      { label: '거래처', href: '/vendors', icon: Store },
      { label: '품목', href: '/items', icon: Package, divider: true },
      { label: '매사 단가', href: '/masonry-prices', icon: Layers },
    ],
  },
  {
    label: '커뮤니케이션',
    items: [
      { label: '알림 발송', href: '/notifications', icon: Bell },
      { label: '인앱 공지', href: '/announcements', icon: Megaphone },
    ],
  },
  {
    label: '모니터링',
    items: [
      { label: '팀장 화면 보기', href: '/admin/manager-view', icon: Smartphone },
      { label: '팀장출역 검토', href: '/monitoring/attendance-review', icon: ClipboardCheck },
      { label: '매사 성과 검토', href: '/monitoring/volumes-review', icon: ClipboardList },
      { label: '변경 이력', href: '/admin/audit-log', icon: History },
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
  const router = useRouter();
  const [userId, setUserId] = useState<string>('');
  const [orderCount, setOrderCount] = useState(0);

  useEffect(() => {
    const sb = getBrowserSupabase();
    sb.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? '';
      if (email) setUserId(emailToId(email));
    });
  }, []);

  // 발주 요청 건수 배지 — 60초마다 갱신
  useEffect(() => {
    const fetchCount = () => {
      fetch('/api/orders/pending-count', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) setOrderCount(d.count ?? 0); })
        .catch(() => {});
    };
    fetchCount();
    const t = setInterval(fetchCount, 60_000);
    return () => clearInterval(t);
  }, [pathname]);

  async function handleLogout() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    const sb = getBrowserSupabase();
    await sb.auth.signOut();
    router.replace('/admin');
    router.refresh();
  }

  return (
    <aside className="sticky top-0 h-svh w-[168px] shrink-0 border-r border-[#D7D7D7] bg-white flex flex-col">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 px-5 h-14 border-b border-[#D7D7D7] text-[#091413] font-semibold"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-[5px] bg-[#273F4F] text-white">
          <Hammer className="h-4 w-4" />
        </span>
        <span className="text-[12px]">(주)예성건축</span>
      </Link>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {groups.map(group => (
          <div key={group.label}>
            <p className="mb-1.5 rounded-[5px] bg-[#273F4F] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map(item => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href} className={cn(item.divider && 'border-b border-[#D7D7D7] pb-1.5 mb-1.5')}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2.5 rounded-[5px] px-3 py-1.5 text-[11px] transition-colors',
                        active
                          ? 'bg-[#E3E9EF] text-[#273F4F] font-semibold'
                          : 'text-[#091413] hover:bg-[#F5F5F5]'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {item.href === '/orders' && orderCount > 0 && (
                        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                          {orderCount}
                        </span>
                      )}
                      {item.badge && (
                        <span className="rounded px-1.5 py-0.5 text-[8px] font-semibold bg-[#FE7743] text-white">
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
        onClick={handleLogout}
        className="flex items-center gap-2.5 px-4 py-3 border-t border-[#D7D7D7] text-[12px] text-[#091413] hover:bg-[#F5F5F5]"
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#D7D7D7] text-[11px] font-semibold text-[#091413]">
          {userId ? userId.charAt(0).toUpperCase() : '?'}
        </span>
        <span className="flex-1 text-left">
          <span className="block text-[12px] font-medium leading-tight">{userId || '...'}</span>
          <span className="block text-[9px] text-[#6B7280] leading-tight">admin</span>
        </span>
        <LogOutIcon className="h-3.5 w-3.5 text-[#6B7280]" />
      </button>
    </aside>
  );
}
