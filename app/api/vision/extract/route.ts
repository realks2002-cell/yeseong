import { NextResponse } from 'next/server';
import { extractAttendanceFromImage } from '@/lib/vision/gemini';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

export const runtime = 'nodejs';

type Body = {
  imageBase64DataUrl: string;
  yearMonth: string;
};

export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body.imageBase64DataUrl || !body.yearMonth) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }

  let visionResult;
  try {
    visionResult = await extractAttendanceFromImage({
      imageBase64DataUrl: body.imageBase64DataUrl,
      hintYearMonth: body.yearMonth,
    });
  } catch (e) {
    return NextResponse.json({ error: 'vision failed', detail: (e as Error).message }, { status: 500 });
  }

  const usingMock = !process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  // 매칭은 클라이언트가 자기 워커 목록(편집 반영)으로 직접 수행
  return NextResponse.json({
    usingMock,
    visionResult,
  });
}
