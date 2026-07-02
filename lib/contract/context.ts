// 작업자 1명의 근로계약서 컨텍스트 해석 (서버 전용, service_role 클라이언트 사용).
//   - 근로자 정보(이름·주민번호·전화·주소·직종·기능등급·일당)
//   - 현장·전문건설사: yeseong_worker_team_context 재사용 (팀장 추종 단일 출처)
//   - 그 현장에 지정된 계약서 양식(template)
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FrozenVars } from './variables';
import { contractDocTitle } from './variables';
import { CONTRACT_COMPANY } from './company';
import { pickTemplate, type TemplateLite } from './template-match';

// 서명 시점에 동결되는 사용자(갑) 회사정보 — 이후 회사정보가 바뀌어도 과거 계약서는 불변
export type ContractCompany = {
  name: string;
  ceo: string;
  bizNumber: string;
  phone: string;
  address: string;
};

// 전문건설사 마스터 행 → 계약서 갑(사용자) 회사정보. 빈 항목은 빈 문자열.
export function subcontractorToCompany(s: {
  name: string;
  representative: string | null;
  business_number: string | null;
  contact_phone: string | null;
  address: string | null;
}): ContractCompany {
  return {
    name: s.name ?? '',
    ceo: s.representative ?? '',
    bizNumber: s.business_number ?? '',
    phone: s.contact_phone ?? '',
    address: s.address ?? '',
  };
}

export type ContractSnapshot = {
  company: ContractCompany;
  worker_name: string;
  rrn: string;
  phone: string;
  address: string;
  worksite: string;
  subcontractor: string;
  trade: string;
  skill_grade: string;
  daily_wage: number | null;
  template_title: string;
  doc_title: string; // 급여형태별 문서 제목 (예: 근로계약서(일당직))
};

export type ContractContext = {
  worker_id: string;
  worksite_id: string | null;
  worksite_name: string | null;
  subcontractor_id: string | null;
  subcontractor_name: string | null;
  template_id: string | null;
  template_body: string | null;
  snapshot: ContractSnapshot;
};

function displayRrn(plain: string | null, prefix: string | null, gender: string | null): string {
  if (plain) return plain;
  if (prefix) return `${prefix}-${gender ?? ''}******`;
  return '';
}

export async function resolveContractContext(
  admin: SupabaseClient,
  workerId: string,
  // 배포 시 관리자가 고른 갑(전문건설사) 회사정보. 없으면 예성 상수 폴백.
  employerCompany?: ContractCompany,
): Promise<ContractContext | null> {
  const { data: w } = await admin
    .from('yeseong_workers')
    .select('id, name, phone, address, default_trade, default_wage, skill_grade, wage_type, rrn_plain, rrn_prefix, rrn_gender_digit')
    .eq('id', workerId)
    .maybeSingle();
  if (!w) return null;

  const { data: ctx } = await admin
    .rpc('yeseong_worker_team_context', { p_worker_id: workerId })
    .single<{
      worksite_id: string | null;
      worksite_name: string | null;
      subcontractor_id: string | null;
      subcontractor_name: string | null;
    }>();

  const worksite_id = ctx?.worksite_id ?? null;
  const worksite_name = ctx?.worksite_name ?? null;
  const subcontractor_id = ctx?.subcontractor_id ?? null;
  const subcontractor_name = ctx?.subcontractor_name ?? null;

  // 양식은 작업자 급여형태(wage_type)로만 매칭 — 전체 활성 양식에서 선택 (현장 지정 불필요).
  //   매사(월급/일급)는 pickTemplate에서 일급 양식으로 폴백.
  let template_id: string | null = null;
  let template_body: string | null = null;
  let template_title = '';
  let template_wage: string | null = null;
  {
    const { data: tplRows } = await admin
      .from('yeseong_contract_templates')
      .select('id, title, body, wage_type, is_active')
      .eq('is_active', true);
    const picked = pickTemplate(w.wage_type ?? null, (tplRows ?? []) as TemplateLite[]);
    if (picked) {
      template_id = picked.id;
      template_body = picked.body;
      template_title = picked.title;
      template_wage = picked.wage_type ?? null;
    }
  }

  const snapshot: ContractSnapshot = {
    company: employerCompany ? { ...employerCompany } : { ...CONTRACT_COMPANY },
    worker_name: w.name ?? '',
    rrn: displayRrn(w.rrn_plain, w.rrn_prefix, w.rrn_gender_digit),
    phone: w.phone ?? '',
    address: w.address ?? '',
    worksite: worksite_name ?? '',
    subcontractor: subcontractor_name ?? '',
    trade: w.default_trade ?? '',
    skill_grade: w.skill_grade ?? '',
    daily_wage: w.default_wage ?? null,
    template_title,
    doc_title: contractDocTitle(template_wage ?? w.wage_type ?? null),
  };

  return {
    worker_id: workerId,
    worksite_id,
    worksite_name,
    subcontractor_id,
    subcontractor_name,
    template_id,
    template_body,
    snapshot,
  };
}

// 스냅샷 → freeze용 변수맵 (계약일 제외)
export function snapshotToFrozenVars(s: ContractSnapshot): FrozenVars {
  return {
    worker_name: s.worker_name,
    rrn: s.rrn,
    phone: s.phone,
    address: s.address,
    worksite: s.worksite,
    subcontractor: s.subcontractor,
    trade: s.trade,
    skill_grade: s.skill_grade,
    daily_wage: s.daily_wage != null ? `${s.daily_wage.toLocaleString('ko-KR')}원` : '',
  };
}
