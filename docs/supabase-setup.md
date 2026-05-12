# Supabase 설정 가이드 (테스트 환경)

이 프로젝트는 Supabase Free Tier를 테스트 환경으로 사용한다.
무료 한도(DB 500MB, Auth 50,000 MAU, Storage 1GB)로 단일 회사 내부 도구 운영에 충분.

---

## 1. Supabase 프로젝트 생성

1. https://supabase.com 접속 → 회원가입/로그인
2. **New project** 클릭
3. 입력값:
   - **Name**: `yeseong-test` (운영 시 `yeseong-prod` 별도 생성)
   - **Database Password**: 강한 비밀번호 (`1Password` 등에 저장)
   - **Region**: `Northeast Asia (Seoul) ap-northeast-2`
   - **Plan**: Free
4. 생성 완료까지 약 2분 대기

---

## 2. 환경변수 확보

프로젝트 페이지 → **Settings**

### Settings → API
다음 3개 값 복사:
- **Project URL**: `https://xxxxxxxx.supabase.co` → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public**: `eyJ...` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role**: `eyJ...` → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ 절대 클라이언트 노출 금지)

### Settings → Database
- **Connection string** (URI) → `DATABASE_URL` (마이그레이션 적용 시 필요)

---

## 3. Vault에 주민번호 암호화 키 등록

> 주민번호는 `pgp_sym_encrypt`로 DB 저장. 키는 Supabase Vault에 보관.

1. 32바이트 랜덤 키 생성 (로컬 터미널):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Supabase Dashboard → **Project Settings → Vault → New Secret**
3. 입력값:
   - **Name**: `rrn_key` (마이그레이션 SQL이 이 이름으로 조회)
   - **Secret**: 위에서 생성한 hex 문자열
4. 저장

> ⚠️ 키 분실 시 모든 주민번호 복호화 불가. 안전한 곳에 백업.

---

## 4. 마이그레이션 적용

옵션 A. **Supabase Dashboard SQL Editor** (가장 간단, 추천)

1. Dashboard → **SQL Editor** → **New query**
2. `supabase/migrations/20260509000000_init.sql` 전체 복사하여 붙여넣기
3. **Run** 클릭
4. 성공하면 **Database → Tables**에 `yeseong_*` 테이블 8개 표시 확인

옵션 B. **Supabase CLI** (선택)

```bash
brew install supabase/tap/supabase
supabase link --project-ref <PROJECT_REF>
supabase db push
```

---

## 5. 시드 데이터 (회사·현장·관리자 계정)

### 5-1. 관리자 계정 생성
Dashboard → **Authentication → Users → Add user → Create new user**
- **Email**: `admin@iru.test` (테스트용 임시 도메인)
- **Password**: 8자 이상
- **Auto Confirm User**: ON 체크 (이메일 인증 스킵)

### 5-2. 회사 + 멤버십 + 현장 시드
SQL Editor에서 실행:
```sql
-- 회사
insert into yeseong_companies (name) values ('㈜이루건설') returning id;
-- 위에서 반환된 id를 :company_id 자리에 넣기

-- 관리자 사용자 ↔ 회사
insert into yeseong_company_members (user_id, company_id, role)
  select id, '<COMPANY_UUID>', 'admin'
  from auth.users where email = 'admin@iru.test';

-- 현장
insert into yeseong_worksites (company_id, name)
  values ('<COMPANY_UUID>', '보은현장');
```

또는 `pnpm tsx scripts/seed.ts` (서비스 키 사용, 1회 실행).

---

## 6. 작업자 마스터 임포트

기존 엑셀(`노무비대장양식_이루건설_1778293884524.xlsx`)의 4월 시트에서
26명 작업자 정보를 추출하여 `yeseong_workers`에 일괄 삽입.

```bash
pnpm tsx scripts/import-workers.ts
```

스크립트가 하는 일:
1. `노임대장_04월)` 시트에서 행 9, 11, 13, ..., 59 순회
2. E(성명) / F(주민번호) / G(주소) / H(은행) / I(계좌) / J(예금주) / K(연락처) / D(공종) / AD(일당) 추출
3. 주민번호는 `yeseong_encrypt_rrn(...)` SQL 함수로 암호화하여 `rrn_encrypted`에 저장
4. 동명·동일주민번호는 upsert로 중복 방지

---

## 7. 로컬 .env.local 작성

`yeseong/.env.local` (커밋 금지):

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Google Gemini (Vision)
GOOGLE_GENERATIVE_AI_API_KEY=AIzaSy...

# Vercel Blob (이미지 저장)
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# 시드 스크립트용 (서버 전용)
SEED_ADMIN_EMAIL=admin@iru.test
SEED_COMPANY_NAME=㈜이루건설
SEED_WORKSITE_NAME=보은현장
```

> Google Gemini API 키는 https://aistudio.google.com/apikey 에서 무료로 발급.
> Vercel Blob 토큰은 Vercel 프로젝트 연결 후 `vercel env pull .env.local` 또는
> Dashboard → Storage → Blob → Connect Project로 자동 주입.

---

## 8. 동작 검증

```bash
pnpm dev
```

체크리스트:
- [ ] `/login`에서 `admin@iru.test`로 로그인 성공
- [ ] `/dashboard`에 '보은현장' 카드 표시
- [ ] `/workers`에 26명 표시 (주민번호는 `660621-1******` 마스킹)
- [ ] Supabase Dashboard → **Table Editor → yeseong_workers**에서
      `rrn_encrypted` 컬럼이 bytea (16진수)로 표시됨 (평문 노출 X)

---

## 9. 운영 환경 분리 시점

테스트 환경에서 충분히 검증된 후:
1. `yeseong-prod` 별도 Supabase 프로젝트 생성
2. 동일하게 1~5 단계 반복 (관리자 이메일은 실제 회사 메일)
3. Vercel 환경변수에서 **Production**과 **Preview**를 다른 키로 분리
4. 테스트 환경의 작업자 데이터는 절대 prod로 복사하지 않음 (개인정보)

---

## 트러블슈팅

| 증상 | 원인 / 해결 |
|---|---|
| `function yeseong_encrypt_rrn does not exist` | Vault에 `rrn_key` 미등록 또는 마이그레이션 미실행 |
| `permission denied for function yeseong_decrypt_rrn` | 의도된 동작. `service_role` 키로만 호출 |
| 로그인 후 `/workers` 빈 화면 | `yeseong_company_members`에 user_id 매핑 누락 |
| RLS 에러 (row level security) | 위와 동일. 멤버십 행 확인 |
