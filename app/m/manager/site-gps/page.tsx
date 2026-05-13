import { MapPin } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';

export default function ManagerSiteGpsPage() {
  return (
    <MobileShell showTabs activeTab="home" variant="manager">
      <div className="flex h-full flex-col items-center justify-center px-7 text-center">
        <span className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <MapPin className="h-10 w-10" />
        </span>
        <h1 className="mt-6 text-[28px] font-bold text-zinc-900">현장 위치 등록</h1>
        <p className="mt-3 text-base text-zinc-500">
          준비 중입니다.
        </p>
        <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
          현장에서 이 화면을 열면<br />
          현 위치 좌표를 등록해<br />
          작업자 GPS 출근 확인에 사용합니다.
        </p>
      </div>
    </MobileShell>
  );
}
