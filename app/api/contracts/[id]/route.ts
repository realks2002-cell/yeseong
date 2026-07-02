import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { signatureToDataUrl } from '@/lib/contract/signature-storage';

export const runtime = 'nodejs';

async function guard() {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user && isAdminEmail(user.email) ? user : null;
}

// 단건 — 문서 전체 + 서명 이미지(base64)
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const admin = getServiceSupabase();

  const { data, error } = await admin
    .from('yeseong_worker_contracts')
    .select('id, status, snapshot, rendered_body, contract_date, contract_end_date, sign_date, signed_at, issued_at, signature_path')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: '계약서를 찾을 수 없습니다' }, { status: 404 });

  const signatureUrl = data.signature_path ? await signatureToDataUrl(admin, data.signature_path) : null;
  return NextResponse.json({
    id: data.id,
    status: data.status,
    snapshot: data.snapshot,
    rendered_body: data.rendered_body,
    contract_date: data.contract_date,
    contract_end_date: data.contract_end_date,
    sign_date: data.sign_date,
    signed_at: data.signed_at,
    issued_at: data.issued_at,
    signature_data_url: signatureUrl,
  });
}

// 수정 (관리자): 계약일은 항상, 본문은 미서명(issued) 상태에서만
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const admin = getServiceSupabase();

  const body = await req.json().catch(() => null);
  const patch: Record<string, unknown> = {};

  if (body?.contract_date !== undefined) {
    const d = typeof body.contract_date === 'string' ? body.contract_date : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)' }, { status: 400 });
    }
    patch.contract_date = d;
  }

  if (body?.contract_end_date !== undefined) {
    const d = body.contract_end_date;
    if (d === null || d === '') {
      patch.contract_end_date = null;
    } else if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      patch.contract_end_date = d;
    } else {
      return NextResponse.json({ error: '종료일 형식이 올바르지 않습니다 (YYYY-MM-DD)' }, { status: 400 });
    }
  }

  // 서명일(서명란 날짜) — 서명 후에도 관리자가 수정 가능 (계약기간과 별개)
  if (body?.sign_date !== undefined) {
    const d = body.sign_date;
    if (d === null || d === '') {
      patch.sign_date = null;
    } else if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      patch.sign_date = d;
    } else {
      return NextResponse.json({ error: '서명일 형식이 올바르지 않습니다 (YYYY-MM-DD)' }, { status: 400 });
    }
  }

  if (body?.rendered_body !== undefined) {
    if (typeof body.rendered_body !== 'string') {
      return NextResponse.json({ error: '본문 형식이 올바르지 않습니다' }, { status: 400 });
    }
    // 서명 후 본문 동결 — issued 상태에서만 수정 허용
    const { data: cur } = await admin
      .from('yeseong_worker_contracts')
      .select('status')
      .eq('id', id)
      .maybeSingle();
    if (!cur) return NextResponse.json({ error: '계약서를 찾을 수 없습니다' }, { status: 404 });
    if (cur.status !== 'issued') {
      return NextResponse.json({ error: '이미 서명된 계약서의 본문은 수정할 수 없습니다' }, { status: 409 });
    }
    patch.rendered_body = body.rendered_body;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 내용이 없습니다' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('yeseong_worker_contracts')
    .update(patch)
    .eq('id', id)
    .select('id, contract_date, contract_end_date, sign_date, rendered_body, status')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await ctx.params;
  const admin = getServiceSupabase();

  const { data: row } = await admin
    .from('yeseong_worker_contracts')
    .select('signature_path')
    .eq('id', id)
    .maybeSingle();

  const { error } = await admin.from('yeseong_worker_contracts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (row?.signature_path) {
    await admin.storage.from('signatures').remove([row.signature_path]);
  }
  return NextResponse.json({ ok: true });
}
