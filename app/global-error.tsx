'use client';

// 루트 레벨 오류 안전망 — 배포 중 버전 충돌 등으로 클라이언트가 죽어도
// 백색 화면 대신 새로고침 안내를 보여준다.

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: 'sans-serif' }}>
        <div
          style={{
            minHeight: '100svh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 24,
            textAlign: 'center',
            background: '#fff',
          }}
        >
          <p style={{ fontSize: 20, fontWeight: 700, color: '#18181b' }}>
            화면을 불러오지 못했어요
          </p>
          <p style={{ fontSize: 14, color: '#71717a', lineHeight: 1.6 }}>
            업데이트 중 일시적인 문제일 수 있어요.
            <br />
            아래 버튼을 눌러 다시 시도해주세요.
          </p>
          <button
            onClick={() => {
              try {
                reset();
              } finally {
                window.location.reload();
              }
            }}
            style={{
              height: 52,
              padding: '0 32px',
              borderRadius: 6,
              border: 'none',
              background: '#1e3a8a',
              color: '#fff',
              fontSize: 17,
              fontWeight: 700,
            }}
          >
            새로고침
          </button>
        </div>
      </body>
    </html>
  );
}
