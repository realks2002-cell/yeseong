import { Building2 } from 'lucide-react';
import { PlaceholderPage } from '@/components/placeholder-page';

export default function WorksitesPage() {
  return (
    <PlaceholderPage
      icon={Building2}
      title="현장"
      description="공사 현장 마스터와 GPS 영역을 관리합니다."
      comingFeatures={[
        '현장 등록·수정·종료',
        'Google Maps에서 현장 중심 좌표 + 영역 반경 설정',
        '담당 소장·작업자 배정',
        '현장별 출역 통계 / 자재 사용량 / 지출',
        '현장 종료 시 자동 아카이브',
      ]}
    />
  );
}
