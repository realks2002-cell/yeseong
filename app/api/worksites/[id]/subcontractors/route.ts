import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

// GET: 현장에 매핑된 협력사 id 목록
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await sb
    .from('yeseong_worksite_subcontractors')
    .select('subcontractor_id')
    .eq('worksite_id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data?.map((r) => r.subcontractor_id) ?? []);
}

// PUT: 현장의 협력사 매핑을 통째로 교체
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.subcontractor_ids) ? body.subcontractor_ids : [];

  // 기존 매핑 삭제
  const { error: delErr } = await sb
    .from('yeseong_worksite_subcontractors')
    .delete()
    .eq('worksite_id', id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  // 새 매핑 삽입
  if (ids.length > 0) {
    const rows = ids.map((subcontractor_id) => ({ worksite_id: id, subcontractor_id }));
    const { error: insErr } = await sb
      .from('yeseong_worksite_subcontractors')
      .insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
