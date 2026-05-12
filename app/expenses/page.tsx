import { Receipt } from 'lucide-react';
import { PlaceholderPage } from '@/components/placeholder-page';

export default function ExpensesPage() {
  return (
    <PlaceholderPage
      icon={Receipt}
      title="영수증"
      description="현장 비용 지출을 사진으로 기록합니다."
      comingFeatures={[
        '영수증 사진 촬영 + 업로드',
        '금액·결제처 자동 추출 (Gemini Vision)',
        '카테고리 분류 (식대/유류/자재/기타)',
        '현장별 / 월별 지출 합계 + 추이 차트',
        'CSV 내보내기',
      ]}
    />
  );
}
