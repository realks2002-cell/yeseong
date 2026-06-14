'use client';

import { useCallback, useEffect, useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/client';

type Announcement = {
  id: string;
  title: string;
  body: string;
  font_size: number;
  created_at: string;
};

export function AnnouncementPopup() {
  const sb = getBrowserSupabase();
  const [list, setList] = useState<Announcement[]>([]);
  const [current, setCurrent] = useState<Announcement | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const { data, error } = await sb.rpc('yeseong_get_unread_announcements');
    if (error || !data) return;
    const items = data as unknown as Announcement[];
    if (items.length > 0) {
      setList(items);
      setCurrent(items[0]);
    }
  }, [sb]);

  useEffect(() => { load(); }, [load]);

  const dismiss = async () => {
    if (!current) return;
    // 읽음 처리
    await sb.rpc('yeseong_mark_announcement_read', {
      p_announcement_id: current.id,
    });
    // 다음 공지가 있으면 표시
    const remaining = list.filter((a) => a.id !== current.id);
    setList(remaining);
    setCurrent(remaining.length > 0 ? remaining[0] : null);
  };

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 px-5">
      <div className="w-full max-w-[380px] rounded-[5px] bg-white shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center gap-2 bg-navy px-5 py-3">
          <Megaphone className="h-5 w-5 text-white" />
          <span className="flex-1 text-base font-bold text-white">공지사항</span>
          {list.length > 1 && (
            <span className="text-xs text-blue-200">
              {list.indexOf(current) + 1} / {list.length}
            </span>
          )}
        </div>

        {/* 본문 */}
        <div className="px-6 py-5">
          <h3 className="text-xl font-bold text-zinc-900 leading-snug">
            {current.title}
          </h3>
          <div
            className="mt-4 whitespace-pre-wrap text-zinc-700 leading-relaxed"
            style={{ fontSize: `${current.font_size}px` }}
          >
            {current.body}
          </div>
          <p className="mt-4 text-[11px] text-zinc-400">
            {fmtDate(current.created_at)}
          </p>
        </div>

        {/* 확인 버튼 */}
        <div className="px-6 pb-5">
          <button
            onClick={dismiss}
            className="h-[52px] w-full rounded-[5px] bg-navy text-lg font-bold text-white active:scale-[0.99]"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}
