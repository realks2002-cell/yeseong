import { MapPin } from 'lucide-react';
import { PlaceholderPage } from '@/components/placeholder-page';

export default function AttendancePage() {
  return (
    <PlaceholderPage
      icon={MapPin}
      title="출역 현황 (실시간)"
      description="작업자 위치와 출퇴근 상태를 한눈에 확인합니다."
      comingFeatures={[]}
    />
  );
}
