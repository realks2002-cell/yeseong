// Google Maps JS API 로더 — 중복 주입 방지 (StrictMode 이중 실행·다중 컴포넌트 대응)

let mapsPromise: Promise<void> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window !== 'undefined' && window.google?.maps) return Promise.resolve();
  if (mapsPromise) return mapsPromise;

  mapsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-maps]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('지도를 불러오지 못했습니다.')));
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker`;
    script.async = true;
    script.dataset.googleMaps = '1';
    script.onload = () => resolve();
    script.onerror = () => {
      mapsPromise = null;
      reject(new Error('지도를 불러오지 못했습니다.'));
    };
    document.head.appendChild(script);
  });
  return mapsPromise;
}
