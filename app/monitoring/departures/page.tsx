import { LogOut } from 'lucide-react';
import { PlaceholderPage } from '@/components/placeholder-page';

export default function DeparturesPage() {
  return (
    <PlaceholderPage
      icon={LogOut}
      title="이탈 기록"
      description="근무 시간 중 현장 이탈 기록을 확인합니다."
      comingFeatures={[]}
    />
  );
}
