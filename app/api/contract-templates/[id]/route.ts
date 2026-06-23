import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { parseWageType, WAGE_TYPES } from '@/lib/contract/template-match';

export const runtime = 'nodejs';

async function guard() {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user && isAdminEmail(user.email) ? user : null;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const admin = getServiceSupabase();

  const body = await req.json().catch(() => null);
  const patch: Record<string, unknown> = {};
  if (typeof body?.title === 'string') {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: '양식 제목을 입력하세요' }, { status: 400 });
    patch.title = t;
  }
  if (typeof body?.body === 'string') patch.body = body.body;
  if (typeof body?.is_active === 'boolean') patch.is_active = body.is_active;
  // wage_type: '공통'/'' → null, 유효값 → 그 값
  if (body?.wage_type !== undefined) {
    patch.wage_type =
      body.wage_type === '' || body.wage_type === '공통' || body.wage_type === null
        ? null
        : parseWageType(body.wage_type);
    if (patch.wage_type === null && body.wage_type && !(WAGE_TYPES as readonly string[]).includes(body.wage_type) && body.wage_type !== '공통') {
      return NextResponse.json({ error: '급여형태 값이 올바르지 않습니다' }, { status: 400 });
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 내용이 없습니다' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('yeseong_contract_templates')
    .update(patch)
    .eq('id', id)
    .select('id, title, body, wage_type, is_active, created_at, updated_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const admin = getServiceSupabase();

  // 이미 서명된 계약서가 있으면 삭제 금지 (계약서는 template_id on delete set null이지만, 양식 보존이 안전)
  const { count } = await admin
    .from('yeseong_worker_contracts')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', id);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: '이미 이 양식으로 서명된 계약서가 있어 삭제할 수 없습니다. 비활성화하세요.' },
      { status: 409 },
    );
  }

  const { error } = await admin.from('yeseong_contract_templates').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
