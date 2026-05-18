import { UserCog } from 'lucide-react';
import { PlaceholderPage } from '@/components/placeholder-page';

export default function MembersPage() {
  return (
    <PlaceholderPage
      icon={UserCog}
      title="사용자"
      description="회사 사용자 권한을 관리합니다."
      comingFeatures={[
        '사용자 목록 + 역할 (admin / manager / worker)',
        '팀장 ↔ 담당 현장 배정',
        '신규 가입자 승인 / 탈퇴 처리',
        'PIN 분실 작업자 reset',
        '로그인 이력 + 마지막 접속 시각',
      ]}
    />
  );
}
