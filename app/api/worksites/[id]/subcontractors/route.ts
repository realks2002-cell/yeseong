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

// PUT: 현장의 협력사 매핑을 통째로 교체 (단일 트랜잭션 RPC)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.subcontractor_ids) ? body.subcontractor_ids : [];

  const { data: count, error } = await sb.rpc('yeseong_replace_worksite_subcontractors', {
    p_worksite_id: id,
    p_subcontractor_ids: ids,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: count ?? 0 });
}
