import Link from 'next/link';
import { Button } from '@/components/ui/button';

const NAV_ITEMS = [
  { href: '#services', label: '서비스' },
  { href: '#about', label: '회사소개' },
  { href: '#partners', label: '협력사' },
  { href: '#contact', label: '문의' },
];

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-block h-7 w-1 rounded-sm bg-brand" aria-hidden />
          <span className="text-lg font-bold tracking-tight text-zinc-900">예성건설</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <Link href="/login">
          <Button variant="outline" size="sm">
            관리자
          </Button>
        </Link>
      </div>
    </header>
  );
}
