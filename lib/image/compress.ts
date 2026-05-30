// 브라우저 캔버스로 이미지 압축. EXIF orientation은 createImageBitmap이 자동 보정.
//   - 긴 변 maxSide(기본 1600px)로 다운스케일
//   - JPEG quality 0.8 (기본). 결과 Blob.

export type CompressOptions = {
  maxSide?: number;
  quality?: number;
  mimeType?: 'image/jpeg' | 'image/webp';
};

export async function compressImage(input: Blob, opts: CompressOptions = {}): Promise<Blob> {
  const { maxSide = 1600, quality = 0.8, mimeType = 'image/jpeg' } = opts;

  const bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      mimeType,
      quality,
    );
  });
}
