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
    title: '팀장 앱',
    description: '현장 관리 · 작업자 출역 승인 · 발주',
    href: '/apps/yeseong-manager.apk',
    filename: 'yeseong-manager.apk',
  },
];

const SIGNUP_STEPS = [
  {
    image: '/1y.jpeg',
    title: '전화번호 입력',
    description:
      '본인의 휴대폰 번호를 입력합니다. 회사 작업자 명부에 등록된 번호와 일치해야 본인 정보가 자동으로 연결돼요.',
  },
  {
    image: '/2y.jpeg',
    title: 'PIN 4자리 만들기',
    description:
      '앱에서 사용할 비밀번호 4자리를 만들어주세요. 다음 화면에서 한 번 더 입력해 확인합니다.',
  },
  {
    image: '/3y.jpeg',
    title: '이름 · 국적 입력',
    description:
      '실명을 입력하고 내국인 / 외국인을 선택합니다. 외국인을 선택하면 영문 이름·국적·체류자격 단계가 추가돼요.',
  },
  {
    image: '/4y.jpeg',
    title: '주민등록번호 입력',
    description:
      '노임대장·임금명세서 등 공식 서류 출력에 사용됩니다. 13자리를 정확히 입력해 주세요.',
  },
  {
    image: '/5y.jpeg',
    title: '주소 입력',
    description:
      '도로명 또는 지번 주소를 입력합니다. 노임대장 출력 시 주소 칸에 자동으로 들어갑니다.',
  },
  {
    image: '/6y.jpeg',
    title: '계좌 정보 입력',
    description:
      '임금이 입금될 계좌를 등록합니다. 은행 선택 → 계좌번호 → 예금주 순서로 입력해 주세요.',
  },
  {
    image: '/7y.jpeg',
    title: '일당 · 공종 입력',
    description:
      '평소 일당(원)과 공종(미장공, 줄눈공 등)을 입력합니다. 출역 등록할 때 기본값으로 자동 채워져요.',
  },
  {
    image: '/8y.jpeg',
    title: '소속 · 현장 선택',
    description:
      '본인이 속한 협력사와 주로 일하는 현장을 선택합니다. 변경되면 앱 안 “내 정보”에서 언제든 수정할 수 있어요. 선택 후 “가입 완료”를 누르면 끝!',
  },
];

export default function AppDownloadPage() {
  return (
    <>
      <LandingHeader />
      <main className="bg-[#F5F5F5] py-16 md:py-24">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-block rounded-full bg-orange-500 px-3 py-1 text-xs font-bold text-white">
              App Download
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#091413] md:text-4xl">
              모바일 앱 다운로드
            </h1>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
            {APPS.map((app) => {
              const Icon = app.icon;
              return (
                <div
                  key={app.filename}
                  className="flex flex-col rounded-[5px] border border-[#D7D7D7] bg-white p-8 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-[5px] bg-blue-50 text-blue-700">
                    <Icon className="h-7 w-7" />
                  </div>
                  <h2 className="mt-6 text-xl font-bold text-[#091413]">{app.title}</h2>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-[#4B5563]">
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

          <div className="mx-auto mt-10 max-w-2xl rounded-[5px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-bold">설치 안내</p>
            <ul className="mt-2 space-y-1 text-[13px] leading-relaxed">
              <li>· Android 휴대폰에서만 설치할 수 있습니다.</li>
              <li>· 다운로드 후 알림창에서 APK 파일을 열어 설치하세요.</li>
              <li>
                · 설치 시 "출처를 알 수 없는 앱 설치 허용" 안내가 뜨면 한 번만 허용으로 설정하세요.
              </li>
            </ul>
          </div>

          <section className="mt-20">
            <div className="mx-auto max-w-2xl text-center">
              <span className="inline-block rounded-full bg-blue-800 px-3 py-1 text-xs font-bold text-white">
                Step-by-Step Guide
              </span>
              <h2 className="mt-4 text-2xl font-bold tracking-tight text-[#091413] md:text-3xl">
                처음 가입 안내
              </h2>
              <p className="mt-3 text-sm text-[#4B5563] md:text-base">
                앱을 처음 실행하면 아래 8단계로 본인 정보를 등록합니다.<br />
                (이미 작업자마스터에 등록된 기존 직원은 본인 정보등록 없이 바로 로그인 됩니다.)
              </p>
            </div>

            <ol className="mt-12 space-y-10 md:space-y-16">
              {SIGNUP_STEPS.map((step, idx) => (
                <li
                  key={step.image}
                  className="grid grid-cols-1 items-center gap-6 md:grid-cols-2 md:gap-10"
                >
                  <div
                    className={`flex justify-center ${
                      idx % 2 === 1 ? 'md:order-2' : ''
                    }`}
                  >
                    <img
                      src={step.image}
                      alt={`${idx + 1}단계 ${step.title}`}
                      className="w-full max-w-[260px] rounded-[14px] border border-[#D7D7D7] shadow-md md:max-w-[280px]"
                    />
                  </div>
                  <div className={idx % 2 === 1 ? 'md:order-1' : ''}>
                    <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-800 text-sm font-bold text-white">
                      {idx + 1}
                    </div>
                    <h3 className="mt-4 text-xl font-bold text-[#091413] md:text-2xl">
                      {step.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-[#4B5563] md:text-base">
                      {step.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mx-auto mt-16 max-w-2xl rounded-[5px] border border-blue-100 bg-blue-50 p-5 text-sm text-blue-900">
              <p className="font-bold">참고</p>
              <ul className="mt-2 space-y-1 text-[13px] leading-relaxed">
                <li>
                  · 회사 작업자 명부에 이미 등록된 번호로 가입하면 이름·계좌 등 일부 정보가 자동으로 채워집니다.
                </li>
                <li>· 잘못 입력한 정보는 가입 후 앱 안 "내 정보"에서 수정할 수 있어요.</li>
                <li>· PIN은 잊지 마세요. 분실 시 관리자에게 초기화를 요청해야 합니다.</li>
              </ul>
            </div>
          </section>
        </div>
      </main>
      <LandingFooter />
    </>
  );
}
