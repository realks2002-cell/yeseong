import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { resolveTargetTokens, type PushTargetType } from '@/lib/push/targets';
import { sendMulticast } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

export async function GET() {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await sb
    .from('yeseong_announcements')
    .select('*, yeseong_announcement_reads(count)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (data ?? []).map((a) => {
    const raw = a as Record<string, unknown>;
    const reads = raw.yeseong_announcement_reads as Array<{ count: number }> | undefined;
    const { yeseong_announcement_reads: _, ...rest } = raw;
    return { ...rest, read_count: reads?.[0]?.count ?? 0 };
  });

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { title, content, targetType, targetValue, fontSize, expiresAt, sendPush } = body;

  if (typeof title !== 'string' || !title.trim() || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: '제목과 내용은 필수입니다.' }, { status: 400 });
  }

  const VALID_TARGET_TYPES = ['all', 'leaders', 'team', 'phone'] as const;
  const tt = typeof targetType === 'string' && (VALID_TARGET_TYPES as readonly string[]).includes(targetType)
    ? targetType
    : 'all';

  const fs = typeof fontSize === 'number' && Number.isFinite(fontSize) && fontSize >= 10 && fontSize <= 32
    ? Math.floor(fontSize)
    : 16;

  // team / phone 같은 타겟은 target_value 필수
  if ((tt === 'team' || tt === 'phone') && (typeof targetValue !== 'string' || !targetValue.trim())) {
    return NextResponse.json({ error: '대상 값(target_value)이 필요합니다.' }, { status: 400 });
  }

  const { data, error } = await sb
    .from('yeseong_announcements')
    .insert({
      title: title.trim(),
      body: content.trim(),
      target_type: tt,
      target_value: typeof targetValue === 'string' && targetValue.trim() ? targetValue.trim() : null,
      font_size: fs,
      expires_at: typeof expiresAt === 'string' && expiresAt ? expiresAt : null,
      is_active: true,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 푸시도 함께 발송 — 공지와 같은 대상에게 FCM (실패해도 공지 등록은 유지)
  let pushSent: number | null = null;
  if (sendPush === true) {
    try {
      const tokens = await resolveTargetTokens(
        sb,
        tt as PushTargetType,
        typeof targetValue === 'string' ? targetValue : null,
      );
      if (tokens.length > 0) {
        const { successCount, failureCount } = await sendMulticast(
          tokens,
          `[공지] ${title.trim()}`,
          content.trim().slice(0, 200),
        );
        pushSent = successCount;
        // 알림 이력에도 기록
        await sb.from('yeseong_notifications').insert({
          title: `[공지] ${title.trim()}`,
          body: content.trim().slice(0, 200),
          target_type: tt,
          target_value: typeof targetValue === 'string' && targetValue.trim() ? targetValue.trim() : null,
          sent_count: successCount,
          fail_count: failureCount,
          sent_by: user.id,
        });
      } else {
        pushSent = 0;
      }
    } catch {
      pushSent = null; // 푸시 실패 — 공지는 정상 등록됨
    }
  }

  return NextResponse.json({ ...data, push_sent: pushSent }, { status: 201 });
}
