import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { pushAttendanceRejected } from '@/lib/push/attendance';

export const runtime = 'nodejs';

// POST /api/push/attendance-result — 출역 반려 푸시 트리거 (팀장앱/관리자)
//   body: { attendanceId: string }
//   서버가 DB에서 실제 반려 상태를 확인한 뒤에만 발송하므로 임의 내용 발송은 불가
export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isManager = !!user.email?.toLowerCase().endsWith('@yeseong.manager');
  if (!isManager && !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const attendanceId = body?.attendanceId;
  if (typeof attendanceId !== 'string' || !attendanceId) {
    return NextResponse.json({ error: 'attendanceId is required' }, { status: 400 });
  }

  await pushAttendanceRejected([attendanceId]);
  return NextResponse.json({ ok: true });
}
