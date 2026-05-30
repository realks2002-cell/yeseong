// 사진 선택 — Capacitor 네이티브(카메라/갤러리) + 웹 폴백(<input type=file>)
//   - 네이티브: @capacitor/camera 사용
//   - 웹: file input (capture 속성으로 카메라 트리거)

import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export type PhotoSource = 'camera' | 'gallery';

export async function pickPhoto(source: PhotoSource): Promise<Blob | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await Camera.getPhoto({
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
        resultType: CameraResultType.Uri,
        quality: 90,
        allowEditing: false,
      });
      if (!result?.webPath) return null;
      const res = await fetch(result.webPath);
      return await res.blob();
    } catch (e) {
      const msg = (e as Error).message ?? '';
      // 사용자가 취소한 경우는 null로 조용히 종료
      if (/cancel/i.test(msg)) return null;
      throw e;
    }
  }
  return webPickPhoto(source === 'camera');
}

function webPickPhoto(useCamera: boolean): Promise<Blob | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (useCamera) input.setAttribute('capture', 'environment');
    input.onchange = () => resolve(input.files?.[0] ?? null);
    // <input> cancel 이벤트는 모든 브라우저 미지원 — focus 복귀 시간차로 추정
    input.click();
  });
}
