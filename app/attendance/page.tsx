import { MapPin } from 'lucide-react';
import { PlaceholderPage } from '@/components/placeholder-page';

export default function AttendancePage() {
  return (
    <PlaceholderPage
      icon={MapPin}
      title="출역 현황 (실시간)"
      description="작업자 위치와 출퇴근 상태를 한눈에 확인합니다."
      comingFeatures={[
        '현장별 작업자 출근/퇴근/이탈 실시간 표시',
        'Google Maps에 작업자 현재 위치 표시',
        '앱 마지막 통신 시각 (last_ping_at) 표시',
        '강제종료 의심 작업자 빨강 표시',
        '소장이 작업자에게 바로 전화 걸기',
      ]}
    />
  );
}
