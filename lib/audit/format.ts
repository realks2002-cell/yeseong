// audit_log 표시용 라벨 + 값 포맷팅
//   대상: 마스터 5개 (작업자/팀장/전문건설사/현장/조적·미장 단가)
//   - 테이블 한글 이름
//   - 컬럼 한글 라벨 (테이블별)
//   - 값 포맷: 금액·boolean·날짜·null

export const TABLE_LABELS: Record<string, string> = {
  yeseong_workers: '작업자',
  yeseong_site_managers: '팀장',
  yeseong_subcontractors: '전문건설사',
  yeseong_clients: '원청사',
  yeseong_worksites: '현장',
  yeseong_masonry_prices: '조적·미장 단가',
};

export const TABLES = Object.keys(TABLE_LABELS);

// 테이블별 필드 한글 라벨
const FIELD_LABELS: Record<string, Record<string, string>> = {
  yeseong_workers: {
    employee_code: '사번',
    name: '성명',
    name_english: '영문명',
    phone: '연락처',
    default_trade: '직종',
    skill_grade: '구분',
    default_wage: '기본일당',
    wage_type: '급여형태',
    bank_name: '은행',
    account_number: '계좌번호',
    account_holder: '예금주',
    address: '주소',
    team_leader_id: '팀장',
    first_work_date: '첫근무일',
    nationality: '국적',
    visa_status: '비자',
    is_foreign: '외국인',
    is_active: '활성',
    pin: 'PIN',
    rrn_plain: '주민번호',
    rrn_prefix: '주민번호(앞6)',
    rrn_gender_digit: '성별숫자',
    auth_user_id: '앱계정',
    default_worksite_id: '기본현장',
    default_subcontractor_id: '기본전문건설사',
  },
  yeseong_site_managers: {
    name: '성명',
    phone: '연락처',
    default_trade: '직종',
    pin: 'PIN',
    auth_user_id: '앱계정',
  },
  yeseong_subcontractors: {
    name: '전문건설사명',
    is_active: '활성',
  },
  yeseong_clients: {
    name: '원청사명',
    business_number: '사업자등록번호',
    contact_phone: '연락처',
    is_active: '활성',
  },
  yeseong_worksites: {
    name: '현장명',
    address: '주소',
    client_id: '원청사',
    subcontractor_id: '전문건설사',
    is_active: '활성',
  },
  yeseong_masonry_prices: {
    category: '분류',
    type_name: '종류',
    size_spec: '규격',
    unit: '단위',
    unit_price: '단가',
    worksite_id: '현장',
    is_active: '활성',
  },
};

export function fieldLabel(tableName: string, field: string): string {
  return FIELD_LABELS[tableName]?.[field] ?? field;
}

// 금액 필드 (천 단위 콤마 + '원')
const MONEY_FIELDS = new Set(['default_wage', 'daily_wage', 'unit_price', 'amount']);

// boolean 한글 라벨
const BOOL_LABELS: Record<string, { true: string; false: string }> = {
  is_active: { true: '활성', false: '비활성' },
  is_foreign: { true: '외국인', false: '내국인' },
};

export function formatFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return '(없음)';

  if (typeof value === 'boolean') {
    const map = BOOL_LABELS[field];
    if (map) return value ? map.true : map.false;
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    if (MONEY_FIELDS.has(field)) return `${value.toLocaleString()}원`;
    return value.toLocaleString();
  }

  if (typeof value === 'string') {
    if (value === '') return '(빈값)';
    // ISO 날짜시간 → 보기 좋게
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        const yy = String(d.getFullYear()).slice(2);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${yy}-${mm}-${dd} ${hh}:${mi}`;
      }
    }
    return value;
  }

  return JSON.stringify(value);
}

// audit row의 before/after에서 대표 이름(name) 추출
export function getRecordName(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string | null {
  const d = after ?? before;
  if (!d) return null;
  const name = typeof d.name === 'string' && d.name ? d.name : null;
  return name;
}

// 리스트 표시용 1줄 요약
export function summarizeChange(
  tableName: string,
  action: 'INSERT' | 'UPDATE' | 'DELETE',
  changedFields: string[] | null,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string {
  if (action === 'INSERT') return '신규 추가';
  if (action === 'DELETE') return '삭제';
  // UPDATE
  if (!changedFields || changedFields.length === 0) return '-';
  if (changedFields.length <= 2) {
    return changedFields
      .map((f) => {
        const b = before ? formatFieldValue(f, before[f]) : '?';
        const a = after ? formatFieldValue(f, after[f]) : '?';
        return `${fieldLabel(tableName, f)}: ${b} → ${a}`;
      })
      .join(', ');
  }
  return changedFields.map((f) => fieldLabel(tableName, f)).join(', ');
}
