import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '계정 및 데이터 삭제 요청 | (주)예성건축',
  description: '(주)예성건축 작업자·팀장 앱 계정 및 개인정보 삭제 요청 안내',
};

const CONTACT_EMAIL = 'realks2002@gmail.com';
const UPDATED = '2026년 6월 14일';

export default function DataDeletionPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed text-zinc-800">
      <h1 className="text-2xl font-bold text-zinc-900">계정 및 데이터 삭제 요청</h1>
      <p className="mt-2 text-sm text-zinc-500">
        (주)예성건축 작업자·팀장 앱(이하 &lsquo;앱&rsquo;) 사용자는 본인의 계정과 개인정보 삭제를
        요청할 수 있습니다. 아래 안내에 따라 요청해 주세요.
      </p>
      <p className="mt-1 text-sm text-zinc-500">최종 업데이트: {UPDATED}</p>

      <Section title="1. 요청 방법">
        <p>아래 이메일로 본인 확인이 가능한 정보를 포함해 삭제를 요청해 주세요.</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>받는 사람: <b>{CONTACT_EMAIL}</b></li>
          <li>제목: <b>[데이터 삭제 요청]</b></li>
          <li>본문 포함 정보: 이름, 휴대전화번호(가입한 번호), 요청 내용</li>
        </ul>
        <p className="mt-2">
          앱에 직접 접속이 가능한 경우, 소속 관리자에게 삭제를 요청할 수도 있습니다.
        </p>
      </Section>

      <Section title="2. 삭제되는 데이터">
        <p>요청이 확인되면 다음 데이터가 삭제됩니다.</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>계정 정보(로그인 전화번호·인증 정보)</li>
          <li>위치 기록(GPS 좌표)</li>
          <li>업로드한 현장 증빙 사진</li>
          <li>푸시 알림용 기기 토큰</li>
          <li>프로필 정보(주소, 연락처 등)</li>
        </ul>
      </Section>

      <Section title="3. 법령에 따라 보존되는 데이터">
        <p>
          관계 법령에 따라 일정 기간 보존이 의무화된 정보는 즉시 삭제되지 않고, 법정 보존기간이
          경과한 후 안전하게 파기됩니다.
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>「소득세법」 등에 따른 급여·임금대장·정산 관련 기록(이름, 주민등록번호, 계좌, 지급 내역 등)</li>
        </ul>
        <p className="mt-2 text-sm text-zinc-500">
          위 보존 데이터는 보존 목적 외의 용도로 이용되지 않으며, 보존기간 종료 시 지체 없이 파기됩니다.
        </p>
      </Section>

      <Section title="4. 처리 기간">
        <p>
          삭제 요청은 접수 후 본인 확인을 거쳐 <b>30일 이내</b>에 처리됩니다. 처리 결과는 요청하신
          이메일로 회신해 드립니다.
        </p>
      </Section>

      <Section title="5. 문의">
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>처리자: (주)예성건축</li>
          <li>문의 이메일: {CONTACT_EMAIL}</li>
        </ul>
        <p className="mt-2 text-sm text-zinc-500">
          개인정보 처리에 관한 자세한 내용은{' '}
          <a href="/privacy" className="text-blue-700 underline">개인정보처리방침</a>을 참고하세요.
        </p>
      </Section>

      <p className="mt-10 border-t border-zinc-200 pt-4 text-sm text-zinc-400">
        © (주)예성건축
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
