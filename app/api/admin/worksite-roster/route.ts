import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

// GET /api/admin/worksite-roster?worksiteId=<uuid>
//   현장에 배치된(팀장 추종) 작업자 전체를 팀별로 + 오늘 출역 여부
export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const worksiteId = new URL(req.url).searchParams.get('worksiteId');
  if (!worksiteId) return NextResponse.json({ error: 'worksiteId required' }, { status: 400 });

  const { data, error } = await sb.rpc('yeseong_admin_worksite_roster', { p_worksite_id: worksiteId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ teams: data ?? [] });
}
