import { LogOut } from 'lucide-react';
import { PlaceholderPage } from '@/components/placeholder-page';

export default function DeparturesPage() {
  return (
    <PlaceholderPage
      icon={LogOut}
      title="이탈 기록"
      description="근무 시간 중 현장 이탈 기록을 확인합니다."
      comingFeatures={[
        '작업자별 / 현장별 이탈 시각 + 복귀 시각',
        '이탈 시간 (duration_minutes) 합계',
        '90일 자동 보관 후 삭제',
        '이탈 빈도 상위 작업자 통계',
        '소장 검토 + 비고 입력',
      ]}
    />
  );
}
