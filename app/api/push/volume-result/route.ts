import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { pushVolumeRejectedToWorker } from '@/lib/push/volumes';

export const runtime = 'nodejs';

// POST /api/push/volume-result — 팀장이 팀원 매사 성과 반려 후 작업자에게 푸시
//   body: { payrollWorkerIds: string[] }
//   서버가 DB에서 실제 rejected_leader 상태를 확인한 뒤에만 발송한다.
export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isManager = !!user.email?.toLowerCase().endsWith('@yeseong.manager');
  if (!isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const ids = Array.isArray(body?.payrollWorkerIds)
    ? body.payrollWorkerIds.filter((x: unknown): x is string => typeof x === 'string')
    : null;
  if (!ids || ids.length === 0) {
    return NextResponse.json({ error: 'payrollWorkerIds is required' }, { status: 400 });
  }

  await pushVolumeRejectedToWorker(ids);
  return NextResponse.json({ ok: true });
}
