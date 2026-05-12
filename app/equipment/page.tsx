import { Wrench } from 'lucide-react';
import { PlaceholderPage } from '@/components/placeholder-page';

export default function EquipmentPage() {
  return (
    <PlaceholderPage
      icon={Wrench}
      title="장비 렌탈"
      description="장비 렌탈/반납 이력을 사진으로 추적합니다."
      comingFeatures={[
        '장비 마스터 등록 (이름·시리얼)',
        '렌탈: 작업자 → 장비 선택 → 사진 촬영 → 시작',
        '반납: 미반납 목록 → 반납 처리 → 사진 촬영',
        '미반납 알림 + 장기 미반납 통계',
        '장비별 렌탈 이력 조회',
      ]}
    />
  );
}
