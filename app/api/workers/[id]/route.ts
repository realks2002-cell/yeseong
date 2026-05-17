import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

// PATCH: 일반 필드 + (선택) RRN 평문. RRN은 별도 RPC로 4개 컬럼 일관 업데이트.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  if (typeof body.rrn === 'string' && body.rrn.trim()) {
    const rrn = body.rrn.trim();
    if (!/^\d{6}-?\d{7}$/.test(rrn)) {
      return NextResponse.json({ error: '주민번호 형식 오류 (000000-0000000)' }, { status: 400 });
    }
    const { error: rrnErr } = await sb.rpc('yeseong_admin_update_worker_rrn', {
      p_id: id,
      p_rrn_plain: rrn,
    });
    if (rrnErr) return NextResponse.json({ error: rrnErr.message }, { status: 500 });
  }

  const allowed = [
    'employee_code', 'name', 'name_english',
    'address', 'bank_name', 'account_number', 'account_holder', 'phone',
    'default_wage', 'default_trade', 'skill_grade', 'wage_type',
    'first_work_date', 'nationality', 'visa_status', 'is_active',
  ];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) {
      const v = body[k];
      if (k === 'default_wage') {
        patch[k] = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0;
      } else if (typeof v === 'string') {
        const trimmed = v.trim();
        patch[k] = trimmed || null;
      } else if (typeof v === 'boolean') {
        patch[k] = v;
      } else if (v === null) {
        patch[k] = null;
      }
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, id });
  }
  if (typeof patch.name === 'string' && !patch.name) {
    return NextResponse.json({ error: '성명은 비울 수 없습니다' }, { status: 400 });
  }

  const { data, error } = await sb
    .from('yeseong_workers')
    .update(patch)
    .eq('id', id)
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '중복된 값이 있습니다' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await sb
    .from('yeseong_workers')
    .update({ is_active: false })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
