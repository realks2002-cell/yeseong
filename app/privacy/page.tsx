import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '개인정보처리방침 | (주)예성건축',
  description: '(주)예성건축 작업자·팀장 앱 개인정보처리방침',
};

const UPDATED = '2026년 6월 14일';
const CONTACT_EMAIL = 'realks2002@gmail.com';

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed text-zinc-800">
      <h1 className="text-2xl font-bold text-zinc-900">개인정보처리방침</h1>
      <p className="mt-2 text-sm text-zinc-500">
        (주)예성건축(이하 &lsquo;회사&rsquo;)은 「개인정보 보호법」에 따라 이용자의 개인정보를 보호하고
        관련 권익을 보장하기 위해 다음과 같이 개인정보처리방침을 수립·공개합니다.
      </p>
      <p className="mt-1 text-sm text-zinc-500">시행일: {UPDATED}</p>

      <Section title="1. 수집하는 개인정보 항목 및 방법">
        <p>회사는 예성건축 작업자·팀장 앱(이하 &lsquo;앱&rsquo;) 운영을 위해 다음 정보를 수집합니다.</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li><b>계정·신원 정보</b>: 이름, 휴대전화번호, 주민등록번호, 주소 (가입 및 노임대장 작성·법정 의무 이행)</li>
          <li><b>급여·정산 정보</b>: 은행명, 계좌번호, 예금주, 직종, 출역(공수), 작업 성과(물량)</li>
          <li><b>위치 정보</b>: GPS 좌표(위도·경도). 출역(출근) 확인 및 현장 도착 검증을 위해 <b>앱이 백그라운드 상태이거나 종료된 경우에도</b> 근무시간 중 주기적으로 수집됩니다.</li>
          <li><b>사진·영상</b>: 카메라로 촬영하거나 기기에서 선택한 현장 작업 증빙 사진</li>
          <li><b>기기 정보</b>: 푸시 알림 발송을 위한 푸시 토큰(FCM), 단말 OS 정보</li>
        </ul>
        <p className="mt-2">수집 방법: 앱 내 직접 입력, 앱 이용 과정에서의 자동 수집(위치·기기정보), 관리자에 의한 등록.</p>
      </Section>

      <Section title="2. 개인정보의 수집·이용 목적">
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>회원 식별 및 로그인·인증</li>
          <li>현장 출역 등록 및 위치 기반 출역 자동 확인</li>
          <li>매사(작업) 성과 입력·검토 및 급여(노임대장) 산정·지급</li>
          <li>현장 작업 증빙 관리</li>
          <li>업무 관련 알림(푸시) 발송</li>
          <li>「소득세법」 등 관계 법령에 따른 의무 이행</li>
        </ul>
      </Section>

      <Section title="3. 위치정보의 처리">
        <p>
          본 앱은 출역 자동 확인을 위해 백그라운드 위치 정보를 수집합니다. 수집한 위치 정보는
          <b> 출역 확인 및 현장 도착 검증 목적으로만 사용</b>되며, 광고·마케팅 등 다른 목적으로
          이용하거나 제3자에게 제공·판매하지 않습니다. 위치 권한은 기기 설정에서 언제든지 철회할 수
          있으며, 철회 시 위치 기반 자동 확인 기능이 제한될 수 있습니다.
        </p>
      </Section>

      <Section title="4. 보유 및 이용 기간">
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li><b>위치 정보</b>: 수집일로부터 5일 후 자동 삭제</li>
          <li><b>급여·정산 및 신원 정보</b>: 「소득세법」 등 관계 법령에서 정한 기간 동안 보관 후 파기(예: 임금대장 등 관련 법정 보존기간)</li>
          <li>그 외 정보는 수집·이용 목적 달성 시 지체 없이 파기합니다.</li>
        </ul>
      </Section>

      <Section title="5. 개인정보의 제3자 제공 및 처리위탁">
        <p>
          회사는 이용자의 개인정보를 동의 없이 제3자에게 제공하지 않습니다. 다만 서비스 운영을 위해
          다음과 같이 처리를 위탁할 수 있습니다.
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>클라우드 인프라·데이터베이스: Supabase, Vercel (데이터 저장·호스팅)</li>
          <li>푸시 알림 발송: Google Firebase Cloud Messaging</li>
        </ul>
      </Section>

      <Section title="6. 앱 접근 권한 안내">
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li><b>위치(정확한 위치·백그라운드 위치)</b>: 출역 확인 및 현장 도착 검증</li>
          <li><b>카메라·사진/미디어</b>: 현장 작업 증빙 사진 촬영 및 업로드</li>
          <li><b>알림</b>: 출역·성과 검토 결과 등 업무 알림 수신</li>
        </ul>
        <p className="mt-2">필수 권한 외 선택 권한은 동의하지 않아도 해당 기능을 제외한 서비스 이용이 가능합니다.</p>
      </Section>

      <Section title="7. 이용자의 권리와 행사 방법">
        <p>
          이용자는 언제든지 본인의 개인정보 열람·정정·삭제·처리정지를 요청할 수 있습니다. 요청은
          아래 연락처로 접수할 수 있으며, 회사는 관계 법령에 따라 지체 없이 조치합니다.
        </p>
      </Section>

      <Section title="8. 개인정보의 안전성 확보 조치">
        <p>
          회사는 개인정보 보호를 위해 접근 권한 통제, 전송 구간 암호화(HTTPS), 주민등록번호 등
          민감정보의 암호화 저장, 접근 기록 관리 등의 안전성 확보 조치를 시행합니다.
        </p>
      </Section>

      <Section title="9. 개인정보 보호책임자 및 문의처">
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>처리자: (주)예성건축</li>
          <li>문의 이메일: {CONTACT_EMAIL}</li>
        </ul>
      </Section>

      <Section title="10. 고지의 의무">
        <p>
          본 개인정보처리방침의 내용 추가·삭제 및 수정이 있을 경우 시행 전 앱 또는 본 페이지를 통해
          고지합니다.
        </p>
      </Section>

      <p className="mt-10 border-t border-zinc-200 pt-4 text-sm text-zinc-400">
        © (주)예성건축. 본 방침은 {UPDATED}부터 적용됩니다.
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-lg font-bold text-zinc-900">{title}</h2>
      <div className="mt-2 text-zinc-700">{children}</div>
    </section>
  );
}
