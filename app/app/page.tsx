import { Download, HardHat, Users } from 'lucide-react';
import { LandingHeader } from '@/components/landing/landing-header';
import { LandingFooter } from '@/components/landing/landing-footer';

const APPS = [
  {
    icon: Users,
    title: '작업자 앱',
    description: '출역 등록 · 일당 확인 · 노임대장 조회',
    href: '/apps/yeseong-worker.apk',
    filename: 'yeseong-worker.apk',
  },
  {
    icon: HardHat,
    title: '소장 앱',
    description: '현장 관리 · 작업자 출역 승인 · 발주',
    href: '/apps/yeseong-manager.apk',
    filename: 'yeseong-manager.apk',
  },
];

export default function AppDownloadPage() {
  return (
    <>
      <LandingHeader />
      <main className="bg-zinc-50 py-16 md:py-24">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-block rounded-full bg-orange-500 px-3 py-1 text-xs font-bold text-white">
              App Download
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl">
              모바일 앱 다운로드
            </h1>
            <p className="mt-4 text-base text-zinc-600 md:text-lg">
              현장에서 바로 사용할 수 있는 Android 앱을 설치하세요.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
            {APPS.map((app) => {
              const Icon = app.icon;
              return (
                <div
                  key={app.filename}
                  className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                    <Icon className="h-7 w-7" />
                  </div>
                  <h2 className="mt-6 text-xl font-bold text-zinc-900">{app.title}</h2>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-600">
                    {app.description}
                  </p>
                  <a
                    href={app.href}
                    download={app.filename}
                    className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-blue-800 px-6 py-3 text-sm font-bold text-white transition-all hover:bg-blue-900"
                  >
                    <Download className="h-4 w-4" />
                    APK 다운로드
                  </a>
                </div>
              );
            })}
          </div>

          <div className="mx-auto mt-10 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-bold">설치 안내</p>
            <ul className="mt-2 space-y-1 text-[13px] leading-relaxed">
              <li>· Android 휴대폰에서만 설치할 수 있습니다.</li>
              <li>· 다운로드 후 알림창에서 APK 파일을 열어 설치하세요.</li>
              <li>
                · 설치 시 "출처를 알 수 없는 앱 설치 허용" 안내가 뜨면 한 번만 허용으로 설정하세요.
              </li>
            </ul>
          </div>
        </div>
      </main>
      <LandingFooter />
    </>
  );
}
