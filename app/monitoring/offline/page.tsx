import { BellOff } from 'lucide-react';
import { PlaceholderPage } from '@/components/placeholder-page';

export default function OfflineMonitoringPage() {
  return (
    <PlaceholderPage
      icon={BellOff}
      title="앱 종료 알림"
      description="강제종료된 작업자 앱의 감지 이력을 확인합니다."
      comingFeatures={[
        'last_ping_at 기준 의심/종료 작업자 목록',
        'Silent Probe 발송 → 회신 여부 표시',
        'FCM 알림 발송 이력 + 작업자 응답 시각',
        '제조사별 통계 (어떤 폰이 자주 종료되나)',
        '소장에게 자동 알림 카톡 발송',
      ]}
    />
  );
}
