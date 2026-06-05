// 파일 다운로드 유틸 — cross-origin URL(Supabase signed URL)은 <a download>가
// 무시되므로 blob으로 받아서 저장한다.

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

export async function downloadFile(url: string, baseName: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('다운로드 실패');
  const blob = await res.blob();
  const ext = EXT_BY_MIME[blob.type] ?? 'jpg';

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = `${baseName}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
