import { Store } from 'lucide-react';
import { PlaceholderPage } from '@/components/placeholder-page';

export default function VendorsPage() {
  return (
    <PlaceholderPage
      icon={Store}
      title="거래처"
      description="자재·장비 거래처를 관리합니다."
      comingFeatures={[
        '소장 본인 거래처 / 현장 공용 / 회사 공용 3-tier 관리',
        '담당자 정보 + 자주 발주하는 품목 등록',
        '거래처별 발주 이력 + 통계',
        '카테고리 분류 (자재/장비/기타)',
        '거래처 검색 + 즐겨찾기',
      ]}
    />
  );
}
