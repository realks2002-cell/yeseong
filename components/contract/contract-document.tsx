// 근로계약서 문서 — 휴멘드 서식(레이아웃)을 예성용으로 차용한 고정 껍데기.
//   - [사용자]=예성건설 / [근로자]·[근무정보]=스냅샷 변수 / [계약조건]=양식 본문(동적) / 서명란
//   - 색은 전부 inline hex (Tailwind oklch 회피 — html2canvas PDF 캡처 안전)
//   - 화면 표시·PDF 캡처 공용. ref로 캡처 대상 DOM 접근.
import { forwardRef } from 'react';
import { CONTRACT_COMPANY } from '@/lib/contract/company';
import { applyLiveDates, formatKoreanDate } from '@/lib/contract/variables';
import { formatPhone } from '@/lib/auth/phone-email';
import type { ContractSnapshot } from '@/lib/contract/context';

// 주민/외국인등록번호 표시 포맷 (마스킹된 값은 그대로, 13자리 숫자는 ######-#######)
function formatRrn(v: string): string {
  if (!v) return '';
  if (v.includes('*') || v.includes('-')) return v; // 이미 포맷/마스킹됨
  const d = v.replace(/\D/g, '');
  return d.length === 13 ? `${d.slice(0, 6)}-${d.slice(6)}` : v;
}

const NAVY = '#273F4F';
const INK = '#091413';
const LABEL_BG = '#F2F4F6';
const LABEL_INK = '#4B5563';
const LINE = '#D7D7D7';

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: NAVY, color: '#ffffff', padding: '8px 12px', fontSize: 13, fontWeight: 600 }}>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  label2,
  value2,
}: {
  label: string;
  value: React.ReactNode;
  label2?: string;
  value2?: React.ReactNode;
}) {
  const cell = (l: string, v: React.ReactNode, withLeftBorder = false) => (
    <>
      <div
        style={{
          width: 110,
          flexShrink: 0,
          background: LABEL_BG,
          color: LABEL_INK,
          padding: '8px 12px',
          fontWeight: 500,
          borderRight: `1px solid ${LINE}`,
          borderLeft: withLeftBorder ? `1px solid ${LINE}` : undefined,
        }}
      >
        {l}
      </div>
      <div style={{ flex: 1, padding: '8px 12px', color: INK, minWidth: 0 }}>{v || '-'}</div>
    </>
  );
  return (
    <div style={{ display: 'flex', borderBottom: `1px solid ${LINE}`, fontSize: 13 }}>
      {cell(label, value)}
      {label2 !== undefined && cell(label2, value2, true)}
    </div>
  );
}

export type ContractDocumentData = {
  snapshot: ContractSnapshot;
  contractDate: string; // ISO YYYY-MM-DD (live, 계약시작일)
  contractEndDate?: string | null; // ISO YYYY-MM-DD (live, 계약종료일·없으면 공종 종료일)
  renderedBody: string; // freeze된 계약조건 (날짜 토큰만 남아있음)
  signatureUrl?: string | null;
};

export const ContractDocument = forwardRef<HTMLDivElement, ContractDocumentData>(
  function ContractDocument({ snapshot, contractDate, contractEndDate, renderedBody, signatureUrl }, ref) {
    const s = snapshot;
    // 회사정보: 서명본은 동결된 스냅샷 값, 미서명/구버전은 현재 상수 폴백
    const company = s.company ?? CONTRACT_COMPANY;
    const conditions = applyLiveDates(renderedBody, contractDate, contractEndDate);
    const wage = s.daily_wage != null ? `${s.daily_wage.toLocaleString('ko-KR')}원` : '';
    const phoneFmt = s.phone ? formatPhone(s.phone) : '';
    const rrnFmt = formatRrn(s.rrn);
    const period = `${formatKoreanDate(contractDate)} ~ ${
      contractEndDate ? formatKoreanDate(contractEndDate) : '공종 종료일'
    }`;

    return (
      <div
        ref={ref}
        style={{
          background: '#ffffff',
          color: INK,
          fontFamily: '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif',
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {/* 타이틀 */}
        <div style={{ padding: '12px 0', textAlign: 'center' }}>
          <h1 style={{ color: INK, fontSize: 24, fontWeight: 700, margin: 0 }}>
            {s.doc_title || '근로계약서'}
          </h1>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 사용자 */}
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 5, overflow: 'hidden' }}>
            <SectionHeader>사용자 (갑)</SectionHeader>
            <Row label="회사명" value={company.name} label2="대표자" value2={company.ceo} />
            <Row label="사업자번호" value={company.bizNumber} label2="연락처" value2={company.phone} />
            <Row label="소재지" value={company.address} />
          </div>

          {/* 근로자 */}
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 5, overflow: 'hidden' }}>
            <SectionHeader>근로자 (을)</SectionHeader>
            <Row label="성명" value={s.worker_name} label2="주민등록번호" value2={rrnFmt} />
            <Row label="휴대전화" value={phoneFmt} label2="주소" value2={s.address} />
          </div>

          {/* 근무 정보 */}
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 5, overflow: 'hidden' }}>
            <SectionHeader>근무 정보</SectionHeader>
            <Row label="현장명" value={s.worksite} label2="전문건설사" value2={s.subcontractor} />
            <Row label="직종" value={[s.trade, s.skill_grade].filter(Boolean).join(' / ')} label2="일당" value2={wage} />
            <Row label="계약기간" value={period} />
          </div>

          {/* 계약 조건 */}
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 5, overflow: 'hidden' }}>
            <SectionHeader>계약 조건</SectionHeader>
            <div style={{ padding: 16, whiteSpace: 'pre-wrap', color: '#374151', fontSize: 13, lineHeight: 1.7 }}>
              {conditions.trim() || '계약 조건 본문이 아직 등록되지 않았습니다. 관리자에게 문의하세요.'}
            </div>
          </div>

          {/* 서명란 (엑셀 하단부) — 계약일 + 사용자(갑) + 근로자(을) */}
          <p style={{ textAlign: 'center', fontSize: 14, fontWeight: 500, margin: '8px 0 4px' }}>
            {formatKoreanDate(contractDate)}
          </p>

          {/* 사용자 (갑) */}
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 5, overflow: 'hidden' }}>
            <SectionHeader>사용자 (갑)</SectionHeader>
            <Row label="상호" value={company.name} />
            <Row
              label="현장 대리인"
              value={<span style={{ fontWeight: 700 }}>(인)</span>}
            />
          </div>

          {/* 근로자 (을) */}
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 5, overflow: 'hidden' }}>
            <SectionHeader>근로자 (을)</SectionHeader>
            <div style={{ display: 'flex', borderBottom: `1px solid ${LINE}`, fontSize: 13 }}>
              <div
                style={{
                  width: 110,
                  flexShrink: 0,
                  background: LABEL_BG,
                  color: LABEL_INK,
                  padding: '8px 12px',
                  fontWeight: 500,
                  borderRight: `1px solid ${LINE}`,
                }}
              >
                성명 (서명)
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px' }}>
                <span style={{ color: INK }}>{s.worker_name}</span>
                {signatureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={signatureUrl} alt="서명" style={{ height: 56 }} crossOrigin="anonymous" />
                ) : (
                  <span style={{ display: 'inline-block', height: 56, flex: 1 }} aria-hidden />
                )}
                <span style={{ fontWeight: 700, color: INK }}>(인)</span>
              </div>
            </div>
            <Row label="주민등록번호" value={rrnFmt} />
          </div>
        </div>
      </div>
    );
  },
);
