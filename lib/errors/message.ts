// 앱 사용자에게 보여줄 오류 메시지로 변환.
//  - 알려진 영문/기술 메시지 → 한글 안내
//  - 이미 한글 메시지(RPC가 한글로 raise한 경우) → 그대로 노출
//  - DB 코드·정의되지 않은 영문 메시지 → 일반 안내 (내부 정보 노출 방지)

type ErrLike = { message?: string | null; code?: string | null } | null | undefined;

const DEFAULT_MESSAGE = '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주십시오.';

// key는 소문자. lower === key 또는 lower.startsWith(key) 로 매칭 (파라미터 붙는 메시지 대응)
const MAP: Array<[string, string]> = [
  ['already approved', '이미 승인 완료된 항목입니다.'],
  ['attendance not found', '출역 정보를 찾을 수 없습니다.'],
  ['consent_foreign_id_required', '외국인등록번호 수집 동의가 필요합니다.'],
  ['consent_personal_required', '개인정보 수집 동의가 필요합니다.'],
  ['consent_rrn_required', '주민등록번호 수집 동의가 필요합니다.'],
  ['invalid coordinates', '위치 정보가 올바르지 않습니다.'],
  ['invalid hours', '공수 값이 올바르지 않습니다.'],
  ['invalid name', '이름이 올바르지 않습니다.'],
  ['invalid phone', '전화번호가 올바르지 않습니다.'],
  ['invalid pin', 'PIN이 올바르지 않습니다.'],
  ['invalid quantity', '수량이 올바르지 않습니다.'],
  ['invalid rrn', '주민번호가 올바르지 않습니다.'],
  ['invalid year_month', '기간 정보가 올바르지 않습니다.'],
  ['item not found', '항목을 찾을 수 없습니다.'],
  ['items required', '입력 항목이 필요합니다.'],
  ['latitude/longitude required', '위치 권한을 확인해 주십시오.'],
  ['manager id required', '팀장 정보가 필요합니다.'],
  ['manager not found', '팀장 정보를 찾을 수 없습니다.'],
  ['manager not linked', '팀장 계정이 연결되어 있지 않습니다.'],
  ['name required', '이름을 입력해 주십시오.'],
  ['no assigned worksite', '배정된 현장이 없습니다.'],
  ['not your assigned worksite', '담당 현장이 아닙니다.'],
  ['not your team member', '본인 팀원이 아닙니다.'],
  ['not your worksite', '담당 현장이 아닙니다.'],
  ['payroll_worker_id required', '급여 정보가 필요합니다.'],
  ['phone already taken', '이미 등록된 전화번호입니다.'],
  ['profile not found', '프로필 정보를 찾을 수 없습니다.'],
  ['rrn required', '주민번호를 입력해 주십시오.'],
  ['rrn_key not found in vault', '주민번호 처리 중 오류가 발생했습니다. 관리자에게 문의해 주십시오.'],
  ['slot full', '등록 가능한 한도를 초과했습니다.'],
  ['unauthenticated', '로그인이 필요합니다. 다시 로그인해 주십시오.'],
  ['worker already linked to another account', '다른 계정에 연결된 작업자입니다.'],
  ['worker archived', '비활성 처리된 작업자입니다. 관리자에게 문의해 주십시오.'],
  ['worker not found', '작업자 정보를 찾을 수 없습니다.'],
  ['worker not linked', '작업자 계정이 연결되어 있지 않습니다.'],
  ['worksite required', '기본 현장이 설정되지 않았습니다. 내 정보에서 현장을 선택해 주십시오.'],
];

export function toUserMessage(err: ErrLike, fallback: string = DEFAULT_MESSAGE): string {
  const raw = (err?.message ?? '').trim();
  if (!raw) return fallback;
  const lower = raw.toLowerCase();

  for (const [key, msg] of MAP) {
    if (lower === key || lower.startsWith(key)) return msg;
  }

  // DB 코드 / 키워드 기반 매핑 (내부 메시지 숨김)
  if (err?.code === '23505' || lower.includes('duplicate key')) return '이미 등록된 정보입니다.';
  if (err?.code === '42501' || lower.includes('permission denied') || lower.includes('row-level security')) {
    return '권한이 없습니다.';
  }
  if (lower.includes('jwt') || lower.includes('not authenticated') || lower.includes('unauthenticated')) {
    return '로그인이 필요합니다. 다시 로그인해 주십시오.';
  }
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('network request')) {
    return '네트워크 연결을 확인해 주십시오.';
  }

  // RPC가 한글로 직접 raise한 메시지는 그대로 노출 (이미 사용자 친화적)
  if (/[가-힣]/.test(raw)) return raw;

  // 그 외 영문/기술 메시지는 숨기고 일반 안내
  return fallback;
}
