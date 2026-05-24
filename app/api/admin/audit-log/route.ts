import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

// GET /api/admin/audit-log
//   필터: table_name, action, actor_user_id, from, to
//   페이지네이션: page (default 1), pageSize (default 50, max 200)
//   응답: { items, total, actors: { [user_id]: { display_name, kind } } }
export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const tableName = url.searchParams.get('table_name');
  const action = url.searchParams.get('action');
  const actorUserId = url.searchParams.get('actor_user_id');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '50', 10) || 50));

  let q = sb
    .from('yeseong_audit_log')
    .select('id, table_name, record_id, action, actor_user_id, before_data, after_data, changed_fields, created_at', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (tableName) q = q.eq('table_name', tableName);
  if (action) q = q.eq('action', action);
  if (actorUserId) q = q.eq('actor_user_id', actorUserId);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to);

  const offset = (page - 1) * pageSize;
  q = q.range(offset, offset + pageSize - 1);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // actor 이름 매핑: auth.users(email) + yeseong_workers / yeseong_site_managers
  const actorIds = Array.from(new Set((data ?? []).map((r) => r.actor_user_id).filter((v): v is string => !!v)));
  const actors: Record<string, { display_name: string; kind: 'admin' | 'worker' | 'manager' | 'unknown' }> = {};

  if (actorIds.length > 0) {
    const svc = getServiceSupabase();
    // auth.users.email로 도메인 판별 + 작업자/팀장 이름 매핑
    const { data: authUsers } = await svc.auth.admin.listUsers({ perPage: 1000 });
    const userMap = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email ?? '']));

    const { data: workers } = await sb
      .from('yeseong_workers')
      .select('auth_user_id, name')
      .in('auth_user_id', actorIds);
    const workerMap = new Map((workers ?? []).map((w) => [w.auth_user_id, w.name]));

    const { data: managers } = await sb
      .from('yeseong_site_managers')
      .select('auth_user_id, name')
      .in('auth_user_id', actorIds);
    const managerMap = new Map((managers ?? []).map((m) => [m.auth_user_id, m.name]));

    for (const id of actorIds) {
      const email = userMap.get(id) ?? '';
      if (email.endsWith('@yeseong.local')) {
        actors[id] = { display_name: email.replace('@yeseong.local', '') + ' (관리자)', kind: 'admin' };
      } else if (email.endsWith('@yeseong.mobile')) {
        const name = workerMap.get(id);
        actors[id] = { display_name: name ? `${name} (작업자)` : `${email.split('@')[0]} (작업자)`, kind: 'worker' };
      } else if (email.endsWith('@yeseong.manager')) {
        const name = managerMap.get(id);
        actors[id] = { display_name: name ? `${name} (팀장)` : `${email.split('@')[0]} (팀장)`, kind: 'manager' };
      } else {
        actors[id] = { display_name: email || id.slice(0, 8), kind: 'unknown' };
      }
    }
  }

  return NextResponse.json({
    items: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
    actors,
  });
}
