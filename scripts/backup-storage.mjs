#!/usr/bin/env node
// Supabase Storage 전체 백업 — 일일 DB 백업에 포함되지 않는 버킷(사진·문서·서명)을 로컬로 내려받는다.
// 실행: node scripts/backup-storage.mjs   (프로젝트 루트에서, .env.local 로드됨)
// 결과: ./storage-backups/<날짜시각>/<버킷>/<원본경로> + manifest.json
// 권장: cron/주기 실행 후 결과 폴더를 외부(구글드라이브 등)로 복사.

import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

// .env.local → .env 순으로 로드 (없으면 셸 환경변수 사용)
for (const f of ['.env.local', '.env']) {
  try {
    const { config } = await import('dotenv');
    config({ path: f });
  } catch {
    /* dotenv 없으면 셸 env 사용 */
  }
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.');
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// 타임스탬프 (YYYY-MM-DD_HHmm)
const now = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}_${p2(now.getHours())}${p2(now.getMinutes())}`;
const OUT = join(process.cwd(), 'storage-backups', stamp);

// 버킷 내 폴더를 재귀적으로 순회하며 모든 객체 경로 수집
async function listAll(bucket, prefix = '') {
  const found = [];
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
        // 폴더 → 재귀
        found.push(...(await listAll(bucket, path)));
      } else {
        found.push({ path, size: entry.metadata?.size ?? 0 });
      }
    }
    if (data.length < PAGE) break;
  }
  return found;
}

async function run() {
  console.log(`\n📦 Supabase Storage 백업 → ${OUT}\n`);
  const { data: buckets, error: bErr } = await sb.storage.listBuckets();
  if (bErr) {
    console.error('✗ 버킷 목록 조회 실패:', bErr.message);
    process.exit(1);
  }

  const manifest = { createdAt: now.toISOString(), url: URL, buckets: [] };
  let grandFiles = 0;
  let grandBytes = 0;

  for (const b of buckets) {
    const objects = await listAll(b.id);
    let ok = 0;
    let bytes = 0;
    for (const obj of objects) {
      const { data: blob, error } = await sb.storage.from(b.id).download(obj.path);
      if (error) {
        console.warn(`  ⚠ 다운로드 실패 ${b.id}/${obj.path}: ${error.message}`);
        continue;
      }
      const buf = Buffer.from(await blob.arrayBuffer());
      const dest = join(OUT, b.id, obj.path);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, buf);
      ok += 1;
      bytes += buf.length;
    }
    manifest.buckets.push({ bucket: b.id, files: ok, bytes });
    grandFiles += ok;
    grandBytes += bytes;
    console.log(`  ✓ ${b.id}: ${ok}/${objects.length} 파일, ${(bytes / 1024).toFixed(0)} KB`);
  }

  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\n✅ 완료: ${grandFiles} 파일 · ${(grandBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   ${OUT}`);
  console.log(`   ↳ 이 폴더를 외부(구글드라이브 등)로 복사해 오프사이트 보관하세요.\n`);
}

run().catch((e) => {
  console.error('✗ 백업 실패:', e.message);
  process.exit(1);
});
