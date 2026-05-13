import { Receipt } from 'lucide-react';
import { PlaceholderPage } from '@/components/placeholder-page';

export default function ExpensesPage() {
  return (
    <PlaceholderPage
      icon={Receipt}
      title="영수증"
      description="현장 비용 지출을 사진으로 기록합니다."
      comingFeatures={[]}
    />
  );
}
