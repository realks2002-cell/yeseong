// 서명 완료 계약서 PDF를 Storage(contracts 버킷)에 보관 / 서명 URL 발급 (service_role).
import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'contracts';

// 경로는 '{worker_id}/{contract_id}.pdf' — 계약당 1개(재보관 시 덮어씀).
export async function uploadContractPdf(
  admin: SupabaseClient,
  workerId: string,
  contractId: string,
  buffer: Buffer,
): Promise<{ path: string } | { error: string }> {
  const path = `${workerId}/${contractId}.pdf`;
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true });
  if (error) return { error: `계약서 PDF 보관 실패: ${error.message}` };
  return { path };
}

export async function contractPdfSignedUrl(
  admin: SupabaseClient,
  path: string,
  downloadName?: string,
): Promise<string | null> {
  const { data } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, 600, downloadName ? { download: downloadName } : undefined);
  return data?.signedUrl ?? null;
}
