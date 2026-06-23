// 계약서 양식 변수 치환 엔진.
//   - 양식 본문(계약조건)에 {{worker_name}} 같은 토큰을 넣으면 작업자별 값으로 치환.
//   - 계약일({{contract_date}})만 예외: 서명 시 freeze하지 않고 토큰을 남겨, 조회/PDF 시 live 값으로 채움
//     (관리자가 계약일을 수정하면 화면·PDF에 즉시 반영되도록).
import { CONTRACT_COMPANY } from './company';
import type { ContractSnapshot } from './context';

export type ContractVarKey =
  | 'worker_name'
  | 'rrn'
  | 'phone'
  | 'address'
  | 'worksite'
  | 'subcontractor'
  | 'trade'
  | 'skill_grade'
  | 'daily_wage'
  | 'contract_date'
  | 'contract_end_date';

// 관리자 양식 편집 화면의 '변수 삽입' 버튼 목록
export const CONTRACT_VARIABLES: { key: ContractVarKey; label: string }[] = [
  { key: 'worker_name', label: '근로자 이름' },
  { key: 'rrn', label: '주민등록번호' },
  { key: 'phone', label: '전화번호' },
  { key: 'address', label: '주소' },
  { key: 'worksite', label: '현장명' },
  { key: 'subcontractor', label: '전문건설사' },
  { key: 'trade', label: '직종' },
  { key: 'skill_grade', label: '기능등급' },
  { key: 'daily_wage', label: '일당' },
  { key: 'contract_date', label: '계약시작일' },
  { key: 'contract_end_date', label: '계약종료일' },
];

// 서명 시점에 freeze되는 값들 (계약일·종료일은 live 토큰이라 제외)
export type FrozenVars = Record<Exclude<ContractVarKey, 'contract_date' | 'contract_end_date'>, string>;

// {{key}} 중 map에 있는 키만 치환. 없는 키({{contract_date}} 등)는 그대로 남김.
function substitute(text: string, map: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (full, key: string) =>
    Object.prototype.hasOwnProperty.call(map, key) ? map[key] : full,
  );
}

// 서명 시: 계약일 빼고 전부 치환 → rendered_body로 저장 (불변 스냅샷)
export function freezeConditions(body: string, vars: FrozenVars): string {
  return substitute(body, vars);
}

// 조회/PDF 시: 남아있는 {{contract_date}}·{{contract_end_date}}를 live 값으로 치환.
//   종료일이 비면 '공종 종료일'로 표기(현장 공종 종료까지를 뜻함).
export function applyLiveDates(
  rendered: string,
  contractDate: string,
  contractEndDate?: string | null,
): string {
  return substitute(rendered, {
    contract_date: formatKoreanDate(contractDate),
    contract_end_date: contractEndDate ? formatKoreanDate(contractEndDate) : '공종 종료일',
  });
}

export function formatKoreanDate(iso: string): string {
  // 'YYYY-MM-DD' → 'YYYY년 MM월 DD일'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}

// 관리자 양식 편집 미리보기용 샘플 값 (실제 작업자 값으로 어떻게 치환되는지 보여줌)
const SAMPLE_VARS: Record<ContractVarKey, string> = {
  worker_name: '홍길동',
  rrn: '900101-1******',
  phone: '010-1234-5678',
  address: '서울특별시 OO구 OO로 12',
  worksite: 'OO 신축공사 현장',
  subcontractor: 'OO종합건설',
  trade: '조적',
  skill_grade: '기공',
  daily_wage: '180,000원',
  contract_date: '2026년 6월 19일',
  contract_end_date: '2026년 7월 31일',
};

export function renderPreview(body: string): string {
  return substitute(body, SAMPLE_VARS);
}

// 양식 편집 화면 — 본문을 '서명 전 전체 양식 완성본'으로 미리보기.
//   샘플 근로자/회사/날짜를 채운 ContractDocument용 데이터 반환 (서명란은 빈칸).
export const SAMPLE_CONTRACT_DATE = '2026-06-19';
export const SAMPLE_CONTRACT_END_DATE = '2026-07-31';

// 급여형태별 문서 제목 (엑셀 원본 제목과 동일)
export function contractDocTitle(wageType: string | null): string {
  if (wageType === '일급') return '근로계약서(일당직)';
  if (wageType === '월급') return '근로계약서(월급제)';
  return '근로계약서';
}

export function samplePreviewDoc(body: string, wageType: string | null = null): {
  snapshot: ContractSnapshot;
  contractDate: string;
  contractEndDate: string;
  renderedBody: string;
} {
  const snapshot: ContractSnapshot = {
    company: { ...CONTRACT_COMPANY },
    worker_name: SAMPLE_VARS.worker_name,
    rrn: SAMPLE_VARS.rrn,
    phone: SAMPLE_VARS.phone,
    address: SAMPLE_VARS.address,
    worksite: SAMPLE_VARS.worksite,
    subcontractor: SAMPLE_VARS.subcontractor,
    trade: SAMPLE_VARS.trade,
    skill_grade: SAMPLE_VARS.skill_grade,
    daily_wage: 180000,
    template_title: '',
    doc_title: contractDocTitle(wageType),
  };
  const renderedBody = freezeConditions(body, {
    worker_name: SAMPLE_VARS.worker_name,
    rrn: SAMPLE_VARS.rrn,
    phone: SAMPLE_VARS.phone,
    address: SAMPLE_VARS.address,
    worksite: SAMPLE_VARS.worksite,
    subcontractor: SAMPLE_VARS.subcontractor,
    trade: SAMPLE_VARS.trade,
    skill_grade: SAMPLE_VARS.skill_grade,
    daily_wage: SAMPLE_VARS.daily_wage,
  });
  return {
    snapshot,
    contractDate: SAMPLE_CONTRACT_DATE,
    contractEndDate: SAMPLE_CONTRACT_END_DATE,
    renderedBody,
  };
}
