import { Settings } from 'lucide-react';
import { PlaceholderPage } from '@/components/placeholder-page';

export default function CompanySettingsPage() {
  return (
    <PlaceholderPage
      icon={Settings}
      title="회사 정보"
      description="회사 기본 정보와 시스템 설정을 관리합니다."
      comingFeatures={[
        '회사명·사업자번호·대표자·주소 관리',
        '로고 업로드 (사이드바·노임대장 표기용)',
        'Google Maps API 키 / Firebase 설정 관리',
        '카카오톡 발주 메시지 템플릿 편집',
        'GPS 영역 기본 반경 / 90일 보관 정책 설정',
      ]}
    />
  );
}
