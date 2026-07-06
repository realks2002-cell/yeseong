#!/usr/bin/env node
// 테넌트(회사) 온보딩 자동화 — Phase 1: 프로비저닝.
//   빈 Supabase 프로젝트를 "예성과 동일한 완성 DB"로 만든다.
//   ① 마이그레이션 141개 일괄 적용(supabase db push) ② Storage 버킷 생성 ③ 관리자 계정 시드 ④ 검증.
//   예성 운영 앱은 전혀 건드리지 않는다(리스크 0).
//
// 반자동 흐름:
//   1) Supabase 대시보드에서 새 프로젝트 생성(2분)
//   2) 프로젝트의 값 3개 + 관리자 비번을 아래 env로 넣고 실행:
//
//   TENANT_NAME="이루건설" \
//   TENANT_DB_URL="postgresql://postgres:[DB_PASSWORD]@db.[REF].supabase.co:5432/postgres" \
//   TENANT_SUPABASE_URL="https://[REF].supabase.co" \
//   TENANT_SERVICE_ROLE_KEY="eyJ..." \
//   TENANT_ADMIN_PASSWORD="초기관리자비번" \
//   node scripts/onboard-tenant.mjs
//
//   (TENANT_ADMIN_EMAIL 미지정 시 admin@yeseong.local — 관리자 판정 도메인이 @yeseong.local이라 고정)
//   ⚠ DB_PASSWORD에 특수문자(@ : / 등)가 있으면 연결문자열에서 percent-encode 필요(예: @→%40).
//
// 멱등: 다시 실행해도 안전(버킷·관리자는 이미 있으면 건너뜀, 마이그레이션은 적용분 스킵).

import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';

// ── 매니페스트: 마이그레이션 밖의 것(버킷·시드). 새 버킷 생기면 여기만 추가하면 됨. ──
const BUCKETS = ['site-photos', 'contracts', 'signatures', 'worker-documents'];
const ADMIN_DOMAIN = '@yeseong.local'; // isAdminEmail 기준 — 회사 무관 고정

const {
  TENANT_NAME = '(이름미지정)',
  TENANT_DB_URL,
  TENANT_SUPABASE_URL,
  TENANT_SERVICE_ROLE_KEY,
  TENANT_ADMIN_EMAIL = `admin${ADMIN_DOMAIN}`,
  TENANT_ADMIN_PASSWORD,
} = process.env;

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!TENANT_DB_URL) die('TENANT_DB_URL (postgres 연결 문자열)이 필요합니다.');
if (!TENANT_SUPABASE_URL || !TENANT_SERVICE_ROLE_KEY) die('TENANT_SUPABASE_URL / TENANT_SERVICE_ROLE_KEY가 필요합니다.');
if (!TENANT_ADMIN_PASSWORD) die('TENANT_ADMIN_PASSWORD (초기 관리자 비밀번호)가 필요합니다.');
if (!TENANT_ADMIN_EMAIL.toLowerCase().endsWith(ADMIN_DOMAIN)) {
  die(`관리자 이메일은 ${ADMIN_DOMAIN}으로 끝나야 합니다(관리자 판정 기준). 현재: ${TENANT_ADMIN_EMAIL}`);
}

const sb = createClient(TENANT_SUPABASE_URL, TENANT_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

console.log(`\n▶ 테넌트 온보딩 시작: ${TENANT_NAME}  (${TENANT_SUPABASE_URL})\n`);

// ── ① 마이그레이션 일괄 적용 ──────────────────────────────────
console.log('① 마이그레이션 적용 (supabase db push)...');
try {
  // supabase/migrations/*.sql 을 순서대로 적용. 적용 이력은 대상 DB가 추적 → 재실행 시 스킵.
  execFileSync('supabase', ['db', 'push', '--db-url', TENANT_DB_URL, '--include-all'], {
    stdio: 'inherit',
  });
  console.log('  ✓ 마이그레이션 완료\n');
} catch {
  die('마이그레이션 실패 — supabase CLI 설치/연결문자열/네트워크 확인. (부분 적용됐을 수 있으니 재실행하면 남은 것만 적용됨)');
}

// ── ② Storage 버킷 생성 (private) ─────────────────────────────
console.log('② Storage 버킷 생성...');
for (const name of BUCKETS) {
  const { error } = await sb.storage.createBucket(name, { public: false });
  if (error) {
    if (/already exists|resource already exists/i.test(error.message)) {
      console.log(`  = ${name} (이미 있음)`);
    } else {
      die(`버킷 생성 실패(${name}): ${error.message}`);
    }
  } else {
    console.log(`  ✓ ${name}`);
  }
}
console.log('');

// ── ③ 관리자 계정 시드 ────────────────────────────────────────
console.log('③ 관리자 계정 시드...');
{
  const { data, error } = await sb.auth.admin.createUser({
    email: TENANT_ADMIN_EMAIL,
    password: TENANT_ADMIN_PASSWORD,
    email_confirm: true,
  });
  if (error) {
    if (/already.*registered|already been registered|exists/i.test(error.message)) {
      console.log(`  = 관리자 이미 있음 (${TENANT_ADMIN_EMAIL})`);
    } else {
      die(`관리자 생성 실패: ${error.message}`);
    }
  } else {
    console.log(`  ✓ 관리자 생성 (${TENANT_ADMIN_EMAIL}) id=${data.user?.id}`);
  }
}
console.log('');

// ── ④ 검증 ────────────────────────────────────────────────────
console.log('④ 검증...');
{
  // 대표 테이블 접근 가능 여부(스키마 적용 확인)
  const { error: tErr } = await sb.from('yeseong_worksites').select('id', { count: 'exact', head: true });
  if (tErr) die(`검증 실패 — yeseong_worksites 조회 불가: ${tErr.message}`);
  console.log('  ✓ 스키마 OK (yeseong_worksites 접근)');

  const { data: buckets } = await sb.storage.listBuckets();
  const names = new Set((buckets ?? []).map((b) => b.name));
  const missing = BUCKETS.filter((b) => !names.has(b));
  if (missing.length) die(`검증 실패 — 버킷 누락: ${missing.join(', ')}`);
  console.log(`  ✓ 버킷 OK (${BUCKETS.length}개)`);
}

console.log(`\n✅ 온보딩 완료: ${TENANT_NAME}`);
console.log('─'.repeat(56));
console.log('남은 수동 작업(개발 무관):');
console.log('  • Google Maps 키 리퍼러에 이 테넌트 도메인 추가');
console.log('  • Solapi 발신번호·알림톡 템플릿(회사별)');
console.log('  • 고객 데이터 입력: 현장·작업자·팀장·협력사·계약서 템플릿·회사정보');
console.log('  • Phase 2(런타임 라우팅) 완성 후: 이 프로젝트 자격을 테넌트 레지스트리에 등록');
console.log('─'.repeat(56));
