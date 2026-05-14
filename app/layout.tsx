import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '(주)예성건축 | 방수·도장·습식 전문 건축',
  description:
    '(주)예성건축은 포스코건설·현대엔지니어링·CJ건설과 공동특허를 출원한 방수·도장·습식 전문 건축 기업입니다. 고품질 책임시공으로 신뢰받는 건축 파트너.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
