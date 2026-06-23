import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { normalizePhone } from '@/lib/auth/phone-email';
import { resolveContractContext } from '@/lib/contract/context';

export const runtime = 'nodejs';

type RowStatus = 'none' | 'issued' | 'signed' | 'no_worksite' | 'no_template' | 'not_found';

// 붙여넣은 전화번호 목록 → 작업자 매칭 + 각자 현재 현장/양식/계약 상태
export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const text: string = typeof body?.text === 'string' ? body.text : '';

  // 엑셀/줄바꿈/콤마/공백/탭 구분 → 정규화 → 10자리 이상 → 중복 제거 (입력 순서 유지)
  const phones = Array.from(
    new Set(
      text
        .split(/[\s,;]+/)
        .map((p) => normalizePhone(p))
        .filter((p) => p.length >= 10),
    ),
  );

  if (phones.length === 0) {
    return NextResponse.json({ rows: [] });
  }

  const admin = getServiceSupabase();

  // 전화번호 → 작업자 일괄 조회
  const { data: workers } = await admin
    .from('yeseong_workers')
    .select('id, name, phone')
    .in('phone', phones)
    .eq('is_active', true);
  const byPhone = new Map((workers ?? []).map((w) => [w.phone, w]));

  const rows: {
    phone: string;
    found: boolean;
    worker_id?: string;
    name?: string;
    worksite?: string | null;
    status: RowStatus;
  }[] = [];

  for (const phone of phones) {
    const w = byPhone.get(phone);
    if (!w) {
      rows.push({ phone, found: false, status: 'not_found' });
      continue;
    }
    const ctx = await resolveContractContext(admin, w.id);
    if (!ctx || !ctx.worksite_id) {
      rows.push({ phone, found: true, worker_id: w.id, name: w.name, worksite: null, status: 'no_worksite' });
      continue;
    }
    if (!ctx.template_id) {
      rows.push({
        phone, found: true, worker_id: w.id, name: w.name, worksite: ctx.worksite_name, status: 'no_template',
      });
      continue;
    }

    const { data: contracts } = await admin
      .from('yeseong_worker_contracts')
      .select('status')
      .eq('worker_id', w.id)
      .eq('worksite_id', ctx.worksite_id)
      .is('attendance_id', null);
    const hasPending = (contracts ?? []).some((c) => c.status === 'issued');
    const hasSigned = (contracts ?? []).some((c) => c.status === 'signed');

    rows.push({
      phone, found: true, worker_id: w.id, name: w.name, worksite: ctx.worksite_name,
      status: hasPending ? 'issued' : hasSigned ? 'signed' : 'none',
    });
  }

  return NextResponse.json({ rows });
}
