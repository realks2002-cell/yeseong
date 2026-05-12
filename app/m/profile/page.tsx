'use client';
import { useRouter } from 'next/navigation';
import { Camera, Check, ChevronRight, LogOut } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { logout } from '@/lib/mock/session';

export default function ProfilePage() {
  const router = useRouter();
  const handleLogout = () => {
    logout();
    router.replace('/m/signup');
  };
  return (
    <MobileShell showTabs activeTab="profile">
      <div className="px-7 pt-10 pb-8">
        <h1 className="text-[34px] font-bold text-zinc-900">내 정보</h1>
      </div>

      <section className="mx-7 mb-8 rounded-3xl bg-blue-900 p-6 text-white">
        <div className="flex items-center gap-4">
          <span className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-white text-3xl font-bold text-blue-900">
            김
          </span>
          <div>
            <p className="text-[26px] font-bold leading-tight">김명봉</p>
            <p className="mt-1 text-lg font-semibold text-blue-200">010-1234-5678</p>
          </div>
        </div>
      </section>

      <section className="px-7 space-y-3">
        <PhotoRow label="본인 사진" status="등록됨" />
        <PhotoRow label="통장 사진" status="미등록" missing />
      </section>

      <section className="mt-10 px-7 space-y-3">
        <SettingsRow label="PIN 변경" />
        <SettingsRow label="알림 설정" />
        <SettingsRow label="이용약관" />
      </section>

      <div className="mt-12 px-7 pb-10">
        <button
          onClick={handleLogout}
          className="flex h-[78px] w-full items-center justify-center gap-3 rounded-2xl bg-white text-xl font-bold text-red-800 ring-2 ring-red-800 active:scale-[0.99]"
        >
          <LogOut className="h-6 w-6" />
          로그아웃
        </button>
      </div>
    </MobileShell>
  );
}

function PhotoRow({ label, status, missing }: { label: string; status: string; missing?: boolean }) {
  return (
    <button
      className={
        'flex h-[88px] w-full items-center justify-between rounded-2xl px-6 text-left transition ' +
        (missing
          ? 'bg-white ring-2 ring-red-800'
          : 'bg-white ring-1 ring-zinc-200')
      }
    >
      <div>
        <div className="text-xl font-bold text-zinc-900">{label}</div>
        <div className={'mt-1 text-base font-semibold ' + (missing ? 'text-red-800' : 'text-zinc-500')}>
          {status}
        </div>
      </div>
      <span
        className={
          'inline-flex h-12 w-12 items-center justify-center rounded-full ' +
          (missing ? 'bg-red-800 text-white' : 'bg-blue-900 text-white')
        }
      >
        {missing ? <Camera className="h-6 w-6" /> : <Check className="h-6 w-6" />}
      </span>
    </button>
  );
}

function SettingsRow({ label }: { label: string }) {
  return (
    <button className="flex h-[68px] w-full items-center justify-between rounded-2xl bg-white px-6 text-left ring-1 ring-zinc-200 transition hover:ring-blue-900">
      <span className="text-xl font-semibold text-zinc-900">{label}</span>
      <ChevronRight className="h-6 w-6 text-zinc-400" />
    </button>
  );
}
