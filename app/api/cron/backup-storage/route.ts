import { NextResponse } from 'next/server';
import { AwsClient } from 'aws4fetch';
import { getServiceSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Supabase Storage → Cloudflare R2 미러 백업 (Vercel Cron으로 매일 실행).
//   일일 DB 백업에 포함되지 않는 Storage 파일(사진·문서·서명)을 외부(R2)로 복사한다.
//   키 구조: <버킷>/<원본경로> 그대로 미러. 같은 크기 파일은 건너뜀(증분).

function r2() {
  return new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    service: 's3',
    region: 'auto',
  });
}

function r2Url(key: string): string {
  const safe = key.split('/').map(encodeURIComponent).join('/');
  return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}/${safe}`;
}

type Obj = { path: string; size: number };

async function listAll(
  sb: ReturnType<typeof getServiceSupabase>,
  bucket: string,
  prefix = '',
): Promise<Obj[]> {
  const out: Obj[] = [];
  const PAGE = 100;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await sb.storage
      .from(bucket)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        out.push(...(await listAll(sb, bucket, path)));
      } else {
        out.push({ path, size: (entry.metadata?.size as number) ?? 0 });
      }
    }
    if (data.length < PAGE) break;
  }
  return out;
}

export async function GET(req: Request) {
  // Vercel Cron은 CRON_SECRET 설정 시 Authorization: Bearer <secret> 헤더를 보냄
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].filter(
    (k) => !process.env[k],
  );
  if (missing.length) {
    return NextResponse.json({ error: `R2 env 미설정: ${missing.join(', ')}` }, { status: 500 });
  }

  const sb = getServiceSupabase();
  const client = r2();

  const { data: buckets, error } = await sb.storage.listBuckets();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let bytes = 0;
  const perBucket: Array<{ bucket: string; total: number; uploaded: number; skipped: number; failed: number }> = [];

  for (const b of buckets) {
    const objects = await listAll(sb, b.id);
    let u = 0;
    let s = 0;
    let f = 0;
    for (const obj of objects) {
      const key = `${b.id}/${obj.path}`;
      // 이미 같은 크기로 올라가 있으면 건너뜀 (증분)
      try {
        const head = await client.fetch(r2Url(key), { method: 'HEAD' });
        if (head.ok && obj.size > 0 && Number(head.headers.get('content-length')) === obj.size) {
          s++;
          skipped++;
          continue;
        }
      } catch {
        /* HEAD 실패 → 업로드 진행 */
      }

      const { data: blob, error: dErr } = await sb.storage.from(b.id).download(obj.path);
      if (dErr || !blob) {
        f++;
        failed++;
        continue;
      }
      const buf = Buffer.from(await blob.arrayBuffer());
      const put = await client.fetch(r2Url(key), {
        method: 'PUT',
        body: buf,
        headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      });
      if (put.ok) {
        u++;
        uploaded++;
        bytes += buf.length;
      } else {
        f++;
        failed++;
      }
    }
    perBucket.push({ bucket: b.id, total: objects.length, uploaded: u, skipped: s, failed: f });
  }

  return NextResponse.json({
    ok: failed === 0,
    uploaded,
    skipped,
    failed,
    mb: +(bytes / 1024 / 1024).toFixed(2),
    buckets: perBucket,
  });
}
