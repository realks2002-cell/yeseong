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

// 다중 선택 — 카메라는 1장씩(네이티브 촬영은 다중 불가), 보관함만 최대 max장.
//   결과는 항상 배열. 취소 시 빈 배열.
export async function pickPhotos(source: PhotoSource, max: number): Promise<Blob[]> {
  if (source === 'camera' || max <= 1) {
    const one = await pickPhoto(source);
    return one ? [one] : [];
  }
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await Camera.pickImages({ quality: 90, limit: max });
      const picked = (result?.photos ?? []).slice(0, max);
      const blobs: Blob[] = [];
      for (const ph of picked) {
        if (!ph.webPath) continue;
        const res = await fetch(ph.webPath);
        blobs.push(await res.blob());
      }
      return blobs;
    } catch (e) {
      if (/cancel/i.test((e as Error).message ?? '')) return [];
      throw e;
    }
  }
  return webPickPhotos(max);
}

function webPickPhotos(max: number): Promise<Blob[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => resolve(input.files ? Array.from(input.files).slice(0, max) : []);
    input.click();
  });
}
