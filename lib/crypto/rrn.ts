// 주민번호 처리 유틸
// - 평문은 클라이언트에 절대 가지 않음
// - 암호화/복호화는 Postgres pgp_sym_* (yeseong_encrypt_rrn, yeseong_decrypt_rrn) 사용
// - 표시용 prefix(생년월일 6자리) + gender_digit(7번째 자리)는 평문 보관 (검색용)

const RRN_PATTERN = /^\d{6}-?\d{7}$/;

export function normalizeRrn(input: string): string {
  // 공백 제거 + 하이픈 보장
  const s = input.replace(/\s/g, '');
  if (!RRN_PATTERN.test(s)) {
    throw new Error(`Invalid RRN format: ${maskRrn(s)}`);
  }
  if (s.length === 13) return `${s.slice(0, 6)}-${s.slice(6)}`;
  return s;  // already has hyphen
}

export function splitRrn(plain: string): { prefix: string; genderDigit: string } {
  const norm = normalizeRrn(plain);
  return {
    prefix: norm.slice(0, 6),                  // YYMMDD
    genderDigit: norm.slice(7, 8),             // 1자리
  };
}

export function maskRrn(plain: string): string {
  // '660621-1468716' → '660621-1******'
  const norm = plain.replace(/\s/g, '');
  if (norm.length < 8) return '******';
  const head = norm.includes('-') ? norm.slice(0, 8) : `${norm.slice(0, 6)}-${norm.slice(6, 7)}`;
  return `${head}******`;
}

export function maskFromParts(prefix: string, genderDigit: string): string {
  return `${prefix}-${genderDigit}******`;
}
