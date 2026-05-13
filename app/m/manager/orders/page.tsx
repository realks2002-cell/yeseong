import { PackagePlus } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';

export default function ManagerOrdersPage() {
  return (
    <MobileShell showTabs activeTab="orders" variant="manager">
      <div className="flex h-full flex-col items-center justify-center px-7 text-center">
        <span className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-50 text-blue-900">
          <PackagePlus className="h-10 w-10" />
        </span>
        <h1 className="mt-6 text-[28px] font-bold text-zinc-900">자재발주</h1>
        <p className="mt-3 text-base text-zinc-500">
          준비 중입니다.
        </p>
      </div>
    </MobileShell>
  );
}
