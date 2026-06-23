import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { parseWageType } from '@/lib/contract/template-match';

export const runtime = 'nodejs';

async function guard() {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

// 양식 목록 + 각 양식에 지정된 현장 id 목록
export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const admin = getServiceSupabase();

  const { data: templates, error } = await admin
    .from('yeseong_contract_templates')
    .select('id, title, body, wage_type, is_active, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: links } = await admin
    .from('yeseong_worksite_contract_templates')
    .select('worksite_id, template_id');

  const byTemplate = new Map<string, string[]>();
  for (const l of links ?? []) {
    const arr = byTemplate.get(l.template_id) ?? [];
    arr.push(l.worksite_id);
    byTemplate.set(l.template_id, arr);
  }

  return NextResponse.json(
    (templates ?? []).map((t) => ({ ...t, worksite_ids: byTemplate.get(t.id) ?? [] })),
  );
}

export async function POST(req: Request) {
  if (!(await guard())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const admin = getServiceSupabase();

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const tplBody = typeof body?.body === 'string' ? body.body : '';
  const wageType = parseWageType(body?.wage_type);
  if (!title) return NextResponse.json({ error: '양식 제목을 입력하세요' }, { status: 400 });

  const { data, error } = await admin
    .from('yeseong_contract_templates')
    .insert({ title, body: tplBody, wage_type: wageType })
    .select('id, title, body, wage_type, is_active, created_at, updated_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, worksite_ids: [] }, { status: 201 });
}
