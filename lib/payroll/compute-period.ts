import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeGeneralDeductions,
  computeMasonryDeductions,
  ageFromRrn,
  type DeductionResult,
} from './deductions';

const MASONRY = '월급/일급';

type Slot = {
  worker: {
    id: string;
    name: string;
    rrn_plain: string | null;
    default_wage: number;
    wage_type: string | null;
  };
  attendance: Array<{ work_date: string; hours: number }>;
};

export type ComputedRow = {
  worker_id: string;
  name: string;
  rrn: string; // 13자리
  wage_type: string | null;
  deductions: DeductionResult;
};

// period의 승인 출역(admin_get_payroll, 엑셀 다운로드와 동일 소스)으로 공제를 계산한다.
export async function computePeriodDeductions(
  periodId: string,
  sb: SupabaseClient,
  svc: SupabaseClient,
): Promise<ComputedRow[]> {
  const { data: payload, error } = await sb.rpc('yeseong_admin_get_payroll', { p_period_id: periodId });
  if (error) throw new Error(error.message);
  const slots = ((payload as unknown as { slots?: Slot[] })?.slots ?? []).filter((s) => s.worker?.id);
  if (slots.length === 0) return [];

  // 외국인/비자/제외구분 보강
  const ids = slots.map((s) => s.worker.id);
  const { data: extras } = await svc
    .from('yeseong_workers')
    .select('id, is_foreign, visa_status, exempt_employment_ins, exempt_pension')
    .in('id', ids);
  const extraMap = new Map(
    (extras ?? []).map((w) => [
      w.id as string,
      {
        isForeign: !!w.is_foreign,
        visa: (w.visa_status as string | null) ?? null,
        exemptEmployment: !!w.exempt_employment_ins,
        exemptPension: !!w.exempt_pension,
      },
    ]),
  );

  const rows: ComputedRow[] = [];
  for (const s of slots) {
    const w = s.worker;
    const ad = w.default_wage ?? 0;
    const att = (s.attendance ?? []).filter((a) => a.hours > 0);
    const perDayWage = att.map((a) => ad * a.hours);
    const days = att.length;
    const totalHours = att.reduce((sum, a) => sum + a.hours, 0);
    const ex = extraMap.get(w.id) ?? { isForeign: false, visa: null, exemptEmployment: false, exemptPension: false };

    let deductions: DeductionResult;
    if (w.wage_type === MASONRY) {
      deductions = computeMasonryDeductions({
        perDayWage,
        days,
        gross: ad * totalHours,
        age: ageFromRrn(w.rrn_plain),
        isForeign: ex.isForeign,
        visa: ex.visa,
      });
    } else {
      deductions = computeGeneralDeductions({
        perDayWage,
        days,
        gross: w.wage_type === '월급' ? ad : ad * totalHours,
        exemptEmployment: ex.exemptEmployment,
        exemptPension: ex.exemptPension,
      });
    }

    rows.push({
      worker_id: w.id,
      name: w.name,
      rrn: (w.rrn_plain ?? '').replace(/\D/g, '').slice(0, 13),
      wage_type: w.wage_type,
      deductions,
    });
  }
  return rows;
}

// 계산 + payroll_workers 저장. 저장된 인원 수 반환.
export async function persistPeriodDeductions(
  periodId: string,
  sb: SupabaseClient,
  svc: SupabaseClient,
): Promise<number> {
  const rows = await computePeriodDeductions(periodId, sb, svc);
  if (rows.length === 0) return 0;
  const now = new Date().toISOString();
  for (const r of rows) {
    const { error } = await svc
      .from('yeseong_payroll_workers')
      .update({ ...r.deductions, deductions_updated_at: now })
      .eq('period_id', periodId)
      .eq('worker_id', r.worker_id);
    if (error) throw new Error(error.message);
  }
  return rows.length;
}
