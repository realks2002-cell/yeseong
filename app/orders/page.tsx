import { ShoppingCart } from 'lucide-react';
import { PlaceholderPage } from '@/components/placeholder-page';

export default function OrdersPage() {
  return (
    <PlaceholderPage
      icon={ShoppingCart}
      title="발주"
      description="자재 발주를 카카오톡으로 거래처에 전달합니다."
      comingFeatures={[
        '거래처 선택 (소장 본인 / 현장 공용 / 회사 공용)',
        '품목 입력 + 자주 쓰는 품목 자동완성',
        '메시지 자동 생성 → 카카오톡 공유 시트로 전송',
        '이전 발주 복제 (지난주 매코이 발주 다시 보내기)',
        '발주 이력 조회 + 거래처별 통계',
      ]}
    />
  );
}
