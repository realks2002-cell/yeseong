import { ShoppingCart } from 'lucide-react';
import { PlaceholderPage } from '@/components/placeholder-page';

export default function OrdersPage() {
  return (
    <PlaceholderPage
      icon={ShoppingCart}
      title="발주"
      description="자재 발주를 카카오톡으로 거래처에 전달합니다."
      comingFeatures={[]}
    />
  );
}
