import { BellOff } from 'lucide-react';
import { PlaceholderPage } from '@/components/placeholder-page';

export default function OfflineMonitoringPage() {
  return (
    <PlaceholderPage
      icon={BellOff}
      title="앱 종료 알림"
      description="강제종료된 작업자 앱의 감지 이력을 확인합니다."
      comingFeatures={[]}
    />
  );
}
