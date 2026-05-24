import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// 가입 흐름에서 belonging 단계 도착 시 아직 로그인 전이므로 RLS 우회 필요.
// 노출 정보: 활성 현장명/협력사명/팀장명+phone (민감 정보 아님).
export async function GET() {
  const sb = getServiceSupabase();
  const [worksites, subcontractors, teamLeaders] = await Promise.all([
    sb.from('yeseong_worksites').select('id, name').eq('is_active', true).order('name'),
    sb.from('yeseong_subcontractors').select('id, name').eq('is_active', true).order('name'),
    sb.from('yeseong_site_managers').select('id, name, phone').order('name'),
  ]);

  if (worksites.error) return NextResponse.json({ error: worksites.error.message }, { status: 500 });
  if (subcontractors.error) return NextResponse.json({ error: subcontractors.error.message }, { status: 500 });
  if (teamLeaders.error) return NextResponse.json({ error: teamLeaders.error.message }, { status: 500 });

  return NextResponse.json({
    worksites: worksites.data ?? [],
    subcontractors: subcontractors.data ?? [],
    teamLeaders: teamLeaders.data ?? [],
  });
}
