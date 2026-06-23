import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

export const runtime = 'nodejs';

type Snapshot = {
  worker_name?: string;
  worksite?: string;
  subcontractor?: string;
  trade?: string;
};

// 서명 완료된 계약서 목록 (관리자)
export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const worksiteId = url.searchParams.get('worksite') || null;
  const search = (url.searchParams.get('search') || '').trim();

  const admin = getServiceSupabase();
  let query = admin
    .from('yeseong_worker_contracts')
    .select('id, worker_id, worksite_id, status, snapshot, contract_date, signed_at, issued_at')
    .order('created_at', { ascending: false });
  if (worksiteId) query = query.eq('worksite_id', worksiteId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = (data ?? []).map((r) => {
    const s = (r.snapshot ?? {}) as Snapshot;
    return {
      id: r.id,
      worker_id: r.worker_id,
      worksite_id: r.worksite_id,
      status: r.status as 'issued' | 'signed',
      worker_name: s.worker_name ?? '',
      worksite: s.worksite ?? '',
      subcontractor: s.subcontractor ?? '',
      trade: s.trade ?? '',
      contract_date: r.contract_date,
      signed_at: r.signed_at,
      issued_at: r.issued_at,
    };
  });

  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (r) => r.worker_name.toLowerCase().includes(q) || r.worksite.toLowerCase().includes(q),
    );
  }

  return NextResponse.json(rows);
}
