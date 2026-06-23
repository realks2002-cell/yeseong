// 서명 PNG를 Storage에서 받아 base64 data URL로 변환 (같은 출처로 제공 → PDF 캡처 시 CORS taint 회피).
import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'signatures';

export async function signatureToDataUrl(
  admin: SupabaseClient,
  path: string,
): Promise<string | null> {
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  return `data:image/png;base64,${buf.toString('base64')}`;
}

// base64 dataURL → Storage 업로드 (service_role). 경로는 '{worker_id}/{uuid}.png'.
export async function uploadSignature(
  admin: SupabaseClient,
  workerId: string,
  dataUrl: string,
): Promise<{ path: string } | { error: string }> {
  const base64 = dataUrl.split(',')[1];
  if (!base64) return { error: '서명 데이터가 올바르지 않습니다' };
  const buffer = Buffer.from(base64, 'base64');
  const path = `${workerId}/${crypto.randomUUID()}.png`;
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: 'image/png', upsert: false });
  if (error) return { error: `서명 저장 실패: ${error.message}` };
  return { path };
}
