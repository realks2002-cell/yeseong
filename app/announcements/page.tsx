'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { Megaphone, Plus, Trash2, Eye, Users, User, Phone } from 'lucide-react';

type TargetType = 'all' | 'leaders' | 'team' | 'phone';

type Leader = { id: string; name: string; phone: string | null };

type Announcement = {
  id: string;
  title: string;
  body: string;
  target_type: string;
  target_value: string | null;
  font_size: number;
  is_active: boolean;
  expires_at: string | null;
  read_count: number;
  created_at: string;
};

const TARGET_LABELS: Record<string, string> = {
  all: '전체',
  leaders: '팀장',
  team: '팀',
  phone: '전화번호',
};

const FONT_SIZES = [
  { value: 14, label: '작게 (14px)' },
  { value: 16, label: '보통 (16px)' },
  { value: 18, label: '크게 (18px)' },
  { value: 20, label: '매우 크게 (20px)' },
  { value: 24, label: '특대 (24px)' },
];

export default function AnnouncementsPage() {
  const sb = getBrowserSupabase();

  const [items, setItems] = useState<Announcement[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [leaders, setLeaders] = useState<Leader[]>([]);

  // 폼
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetType, setTargetType] = useState<TargetType>('all');
  const [targetValue, setTargetValue] = useState('');
  const [fontSize, setFontSize] = useState(16);
  const [expiresIn, setExpiresIn] = useState('');
  const [sendPush, setSendPush] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/announcements');
    if (res.ok) setItems(await res.json());
  }, []);

  const loadLeaders = useCallback(async () => {
    const { data } = await sb
      .from('yeseong_workers')
      .select('id, name, phone')
      .eq('skill_grade', '팀장')
      .eq('is_active', true)
      .order('name');
    setLeaders((data as Leader[]) ?? []);
  }, [sb]);

  useEffect(() => { load(); loadLeaders(); }, [load, loadLeaders]);

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) {
      setError('제목과 내용을 입력해주세요.');
      return;
    }
    if (targetType === 'team' && !targetValue) {
      setError('팀장을 선택해주세요.');
      return;
    }
    if (targetType === 'phone' && !targetValue.trim()) {
      setError('전화번호를 입력해주세요.');
      return;
    }

    setBusy(true);
    setError(null);

    let expiresAt: string | null = null;
    if (expiresIn) {
      const d = new Date();
      d.setDate(d.getDate() + parseInt(expiresIn, 10));
      expiresAt = d.toISOString();
    }

    const res = await fetch('/api/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        content: content.trim(),
        targetType,
        targetValue: targetValue.trim() || undefined,
        fontSize,
        expiresAt,
        sendPush,
      }),
    });

    setBusy(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || '생성 실패');
      return;
    }

    const created = await res.json().catch(() => null);
    if (sendPush && created?.push_sent != null) {
      alert(`공지 등록 완료 — 푸시 ${created.push_sent}건 발송됨`);
    }

    setTitle('');
    setContent('');
    setTargetType('all');
    setTargetValue('');
    setFontSize(16);
    setExpiresIn('');
    setSendPush(true);
    setShowForm(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 공지를 비활성화하시겠습니까?')) return;
    await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
    load();
  };

  /** 엑셀 붙여넣기에서 전화번호 파싱 */
  function parsePhones(raw: string): string[] {
    return raw
      .split(/[\n\r,\t]+/)
      .map((s) => s.replace(/\D/g, '').trim())
      .filter((s) => s.length >= 10);
  }

  return (
    <AdminShell>
      <div className="max-w-4xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-[#273F4F]" />
            <h1 className="text-2xl font-bold tracking-tight">인앱 공지</h1>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 rounded-[5px] bg-[#273F4F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e3340]"
          >
            <Plus className="h-4 w-4" />
            공지 작성
          </button>
        </div>

        {/* 작성 폼 */}
        {showForm && (
          <div className="mt-6 rounded-[5px] border border-[#D7D7D7] bg-[#FAFAFA] p-5 space-y-4">
            <h2 className="text-base font-bold text-[#091413]">새 공지 작성</h2>

            <div>
              <label className="block text-sm font-medium text-[#091413] mb-1">제목</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="공지 제목"
                className="w-full rounded-[5px] border border-[#D7D7D7] bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#091413] mb-1">내용</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="공지 내용을 입력하세요"
                rows={5}
                className="w-full resize-y rounded-[5px] border border-[#D7D7D7] bg-white px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#091413] mb-1">글씨 크기</label>
                <select
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full rounded-[5px] border border-[#D7D7D7] bg-white px-3 py-2 text-sm"
                >
                  {FONT_SIZES.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#091413] mb-1">만료</label>
                <select
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(e.target.value)}
                  className="w-full rounded-[5px] border border-[#D7D7D7] bg-white px-3 py-2 text-sm"
                >
                  <option value="">무기한</option>
                  <option value="1">1일 후</option>
                  <option value="3">3일 후</option>
                  <option value="7">7일 후</option>
                  <option value="14">14일 후</option>
                  <option value="30">30일 후</option>
                </select>
              </div>
            </div>

            {/* 대상 */}
            <div>
              <label className="block text-sm font-medium text-[#091413] mb-1">발송 대상</label>
              <div className="flex gap-2">
                {(['all', 'leaders', 'team', 'phone'] as TargetType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTargetType(t); setTargetValue(''); }}
                    className={`rounded-[5px] border px-3 py-1.5 text-sm font-semibold ${
                      targetType === t
                        ? 'border-[#273F4F] bg-[#273F4F] text-white'
                        : 'border-[#D7D7D7] bg-white text-[#091413]'
                    }`}
                  >
                    {TARGET_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {targetType === 'team' && (
              <div>
                <label className="block text-sm font-medium text-[#091413] mb-1">팀장 선택</label>
                <select
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  className="w-full rounded-[5px] border border-[#D7D7D7] bg-white px-3 py-2 text-sm"
                >
                  <option value="">-- 팀장 선택 --</option>
                  {leaders.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}{l.phone ? ` (${l.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {targetType === 'phone' && (
              <div>
                <label className="block text-sm font-medium text-[#091413] mb-1">
                  전화번호 <span className="text-[#6B7280] font-normal">(엑셀 붙여넣기 가능)</span>
                </label>
                <textarea
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  placeholder={"01012345678\n01098765432"}
                  rows={4}
                  className="w-full resize-y rounded-[5px] border border-[#D7D7D7] bg-white px-3 py-2 text-sm font-mono"
                />
                {targetValue.trim() && (
                  <p className="mt-1 text-xs text-[#6B7280]">
                    입력된 전화번호: <span className="font-semibold text-[#091413]">{parsePhones(targetValue).length}건</span>
                  </p>
                )}
              </div>
            )}

            {/* 미리보기 */}
            <div>
              <label className="block text-sm font-medium text-[#091413] mb-1">미리보기</label>
              <div className="rounded-[5px] border border-[#D7D7D7] bg-white overflow-hidden max-w-[320px]">
                <div className="flex items-center gap-2 bg-blue-900 px-4 py-2">
                  <Megaphone className="h-4 w-4 text-white" />
                  <span className="text-sm font-bold text-white">공지사항</span>
                </div>
                <div className="px-4 py-3">
                  <h3 className="text-base font-bold text-[#091413]">{title || '제목'}</h3>
                  <div
                    className="mt-2 whitespace-pre-wrap text-[#4B5563] leading-relaxed"
                    style={{ fontSize: `${fontSize}px` }}
                  >
                    {content || '내용이 여기에 표시됩니다.'}
                  </div>
                </div>
                <div className="px-4 pb-3">
                  <div className="h-9 rounded-[5px] bg-blue-900 flex items-center justify-center text-sm font-bold text-white">
                    확인
                  </div>
                </div>
              </div>
            </div>

            {/* 푸시 함께 발송 */}
            <label className="flex items-center gap-2.5 rounded-[5px] border border-[#D7D7D7] bg-white px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sendPush}
                onChange={(e) => setSendPush(e.target.checked)}
                className="h-4 w-4 accent-[#273F4F]"
              />
              <span className="text-sm font-semibold text-[#091413]">푸시 알림도 함께 발송</span>
              <span className="text-xs text-[#6B7280]">— 앱이 꺼져 있어도 상태바 알림으로 도착해요</span>
            </label>

            {error && (
              <p className="rounded-[5px] bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 h-10 rounded-[5px] bg-[#F5F5F5] text-sm font-bold text-[#4B5563]"
              >
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={busy}
                className="flex-1 h-10 rounded-[5px] bg-[#273F4F] text-sm font-bold text-white disabled:opacity-60"
              >
                {busy ? '생성 중...' : '공지 등록'}
              </button>
            </div>
          </div>
        )}

        {/* 공지 목록 */}
        <div className="mt-6">
          {items.length === 0 ? (
            <p className="mt-8 text-center text-sm text-[#9CA3AF]">등록된 공지가 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {items.map((a) => (
                <div
                  key={a.id}
                  className={`rounded-[5px] border px-4 py-3 ${a.is_active ? 'border-[#D7D7D7] bg-white' : 'border-[#D7D7D7] bg-[#F5F5F5] opacity-60'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-[#091413]">{a.title}</h3>
                        <span className="rounded bg-[#F5F5F5] px-1.5 py-0.5 text-[10px] font-semibold text-[#6B7280]">
                          {TARGET_LABELS[a.target_type] ?? a.target_type}
                        </span>
                        <span className="text-[10px] text-[#6B7280]">
                          {a.font_size}px
                        </span>
                        {!a.is_active && (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                            비활성
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-[#6B7280] line-clamp-2">{a.body}</p>
                      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-[#9CA3AF]">
                        <span>{fmtTime(a.created_at)}</span>
                        <span className="flex items-center gap-0.5">
                          <Eye className="h-3 w-3" /> {a.read_count}명 읽음
                        </span>
                        {a.expires_at && <span>만료: {fmtTime(a.expires_at)}</span>}
                      </div>
                    </div>
                    {a.is_active && (
                      <button
                        onClick={() => handleDelete(a.id)}
                        className="shrink-0 rounded-[5px] p-1.5 text-[#9CA3AF] hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}
