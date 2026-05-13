import { Receipt } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';

export default function ManagerExpensesPage() {
  return (
    <MobileShell showTabs activeTab="expenses" variant="manager">
      <div className="flex h-full flex-col items-center justify-center px-7 text-center">
        <span className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-red-50 text-red-800">
          <Receipt className="h-10 w-10" />
        </span>
        <h1 className="mt-6 text-[28px] font-bold text-zinc-900">비용처리</h1>
        <p className="mt-3 text-base text-zinc-500">
          준비 중입니다.
        </p>
      </div>
    </MobileShell>
  );
}
