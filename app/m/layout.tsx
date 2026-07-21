import { IosInstallPrompt } from '@/components/mobile/ios-install-prompt';

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <IosInstallPrompt />
    </>
  );
}
