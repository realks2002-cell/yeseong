import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

export const runtime = 'nodejs';

// 관리자 웹 팀장앱 미러링(보기 전용) 데이터 소스.
//   GET ?managerId=<uuid>&kind=me|pending|team|volumes|order_items|orders&ym=YYYY-MM
//   isAdminEmail 가드 후 service_role 로 admin RPC 호출.
const RPC: Record<string, string> = {
  me: 'yeseong_admin_manager_get_me',
  pending: 'yeseong_admin_manager_list_pending_attendance',
  team: 'yeseong_admin_manager_list_team_members',
  volumes: 'yeseong_admin_manager_get_volumes',
  order_items: 'yeseong_admin_manager_list_order_items',
  orders: 'yeseong_admin_manager_list_orders',
};

export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const managerId = url.searchParams.get('managerId');
  const kind = url.searchParams.get('kind') ?? '';
  const ym = url.searchParams.get('ym');

  if (!managerId) return NextResponse.json({ error: 'managerId required' }, { status: 400 });
  const fn = RPC[kind];
  if (!fn) return NextResponse.json({ error: 'invalid kind' }, { status: 400 });

  const admin = getServiceSupabase();
  const params: Record<string, unknown> = { p_manager_id: managerId };
  if (kind === 'volumes') params.p_year_month = ym ?? null;

  const { data, error } = await admin.rpc(fn, params);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? null);
}
