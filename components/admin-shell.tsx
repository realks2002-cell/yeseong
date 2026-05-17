import type { ReactNode } from 'react';
import { Sidebar } from './sidebar';

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh bg-[#F5F5F5]">
      <Sidebar />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
