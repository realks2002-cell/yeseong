import Link from 'next/link';
import { Hammer } from 'lucide-react';

export function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
        <Link href="/dashboard" className="flex items-center gap-2 text-zinc-900 font-semibold">
          <Hammer className="h-5 w-5" />
          <span>이루건설 노임대장</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/dashboard" className="rounded-[5px] px-3 py-1.5 hover:bg-zinc-100 text-zinc-700">대시보드</Link>
          <Link href="/workers" className="rounded-[5px] px-3 py-1.5 hover:bg-zinc-100 text-zinc-700">작업자</Link>
        </nav>
        <div className="ml-auto text-xs text-zinc-500">
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Mock 모드</span>
        </div>
      </div>
    </header>
  );
}
