import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '(주)예성건축 | 방수·도장·습식 전문 건축',
  description:
    '(주)예성건축은 포스코건설·현대엔지니어링·CJ건설과 공동특허를 출원한 방수·도장·습식 전문 건축 기업입니다. 고품질 책임시공으로 신뢰받는 건축 파트너.',
  // iOS 홈 화면 추가(PWA) 대응 — 안드로이드는 Capacitor 네이티브 앱 사용
  appleWebApp: {
    capable: true,
    title: '예성건축',
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/apple-touch-icon.png',
  },
  // 구버전 iOS는 standalone 실행에 레거시 태그를 참조 (Next는 최신 mobile-web-app-capable만 자동 출력)
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

// viewport-fit=cover — Android 15 edge-to-edge에서 env(safe-area-inset-*) 활성화
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
