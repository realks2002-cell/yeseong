import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

// GET /api/orders — 발주 목록 (관리자 전용)
//   필터: status (requested|sent|delivered|cancelled)
export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const status = new URL(req.url).searchParams.get('status');

  let q = sb
    .from('yeseong_orders')
    .select(`
      id, order_no, status, delivery_date, note, sent_at, created_at,
      worksite:yeseong_worksites(id, name, address),
      requester:yeseong_site_managers(id, name, phone),
      items:yeseong_order_items(
        id, item_name, spec, unit, quantity, note, vendor_id,
        vendor:yeseong_vendors(name, contact_name, contact_phone)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
