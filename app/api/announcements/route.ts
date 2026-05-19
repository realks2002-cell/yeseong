import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

  const body = await req.json();
  const { title, content, targetType, targetValue, fontSize, expiresAt } = body;

  if (!title || !content) {
    return NextResponse.json({ error: '제목과 내용은 필수입니다.' }, { status: 400 });
  }

  const { data, error } = await sb
    .from('yeseong_announcements')
    .insert({
      title,
      body: content,
      target_type: targetType ?? 'all',
      target_value: targetValue ?? null,
      font_size: fontSize ?? 16,
      expires_at: expiresAt ?? null,
      is_active: true,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
