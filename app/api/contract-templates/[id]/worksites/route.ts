import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

export const runtime = 'nodejs';

async function guard() {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user && isAdminEmail(user.email) ? user : null;
}

// 이 양식을 적용할 현장 목록 설정 (체크박스).
//   한 현장 = 급여형태별 1장: 같은 급여형태(wage_type)의 다른 양식에 묶여 있던 현장도
//   여기서 체크하면 이 양식으로 옮겨짐(같은 급여형태의 이전 양식에서 자동 제거).
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const admin = getServiceSupabase();

  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.worksite_ids)
    ? body.worksite_ids.filter((x: unknown): x is string => typeof x === 'string')
    : [];

  // 이 양식의 급여형태
  const { data: tpl } = await admin
    .from('yeseong_contract_templates')
    .select('wage_type')
    .eq('id', id)
    .maybeSingle();
  if (!tpl) return NextResponse.json({ error: '양식을 찾을 수 없습니다' }, { status: 404 });
  const wt: string | null = tpl.wage_type ?? null;

  // 1) 이 양식의 기존 배정 전부 제거 후 재구성
  {
    const { error } = await admin
      .from('yeseong_worksite_contract_templates')
      .delete()
      .eq('template_id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (ids.length) {
    // 2) 같은 급여형태의 '다른' 양식들에서 이 현장들 제거 (현장당 급여형태별 1장 보장)
    let sameWtQuery = admin.from('yeseong_contract_templates').select('id').neq('id', id);
    sameWtQuery = wt === null ? sameWtQuery.is('wage_type', null) : sameWtQuery.eq('wage_type', wt);
    const { data: others } = await sameWtQuery;
    const otherIds = (others ?? []).map((t) => t.id);
    if (otherIds.length) {
      const { error } = await admin
        .from('yeseong_worksite_contract_templates')
        .delete()
        .in('template_id', otherIds)
        .in('worksite_id', ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 3) 이 양식에 현장들 연결
    const { error } = await admin
      .from('yeseong_worksite_contract_templates')
      .insert(ids.map((wid) => ({ worksite_id: wid, template_id: id })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, worksite_ids: ids });
}
