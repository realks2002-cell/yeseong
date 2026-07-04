import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// GPS 위치 로그 5일 자동 삭제 (Vercel Cron으로 매일 실행).
//   위치 권한 사전 고지·가입 동의서에서 "수집 후 5일 뒤 자동 삭제"로 안내한 것을 강제한다.
//   삭제 기준(5일)은 yeseong_cleanup_gps_logs() 함수에 있다 — 단일 진실원천.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getServiceSupabase();
  const { error } = await sb.rpc('yeseong_cleanup_gps_logs');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
