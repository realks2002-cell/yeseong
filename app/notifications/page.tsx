'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { Bell, Send, Users, User, Phone, Megaphone } from 'lucide-react';

type TargetType = 'all' | 'leaders' | 'team' | 'phone';

type Leader = { id: string; name: string; phone: string | null };

type NotifLog = {
  id: string;
  title: string;
  body: string;
  target_type: string;
  target_value: string | null;
  sent_count: number;
  fail_count: number;
  created_at: string;
};

const TARGET_LABELS: Record<TargetType, string> = {
  all: '전체 발송',
  leaders: '팀장 발송',
  team: '팀 발송',
  phone: '전화번호 발송',
};

const TARGET_ICONS: Record<TargetType, typeof Bell> = {
  all: Megaphone,
  leaders: User,
  team: Users,
  phone: Phone,
};

/** 엑셀 붙여넣기 등에서 전화번호를 파싱 (줄바꿈, 쉼표, 탭, 공백 구분) */
function parsePhones(raw: string): string[] {
  return raw
    .split(/[\n\r,\t]+/)
    .map((s) => s.replace(/\D/g, '').trim())
    .filter((s) => s.length >= 10);
}

export default function NotificationsPage() {
  const sb = getBrowserSupabase();

  const [targetType, setTargetType] = useState<TargetType>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 팀장 목록 (팀 발송용)
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [logs, setLogs] = useState<NotifLog[]>([]);

  const loadLeaders = useCallback(async () => {
    const { data } = await sb
      .from('yeseong_workers')
      .select('id, name, phone')
      .eq('skill_grade', '팀장')
      .eq('is_active', true)
      .order('name');
    setLeaders((data as Leader[]) ?? []);
  }, [sb]);

  const loadLogs = useCallback(async () => {
    const res = await fetch('/api/notifications/history');
    if (res.ok) {
      setLogs(await res.json());
    }
  }, []);

  useEffect(() => {
    loadLeaders();
    loadLogs();
  }, [loadLeaders, loadLogs]);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      setError('제목과 내용을 입력해주세요.');
      return;
    }
    if (targetType === 'team' && !targetValue) {
      setError('팀장을 선택해주세요.');
      return;
    }
    if (targetType === 'phone') {
      const phones = parsePhones(targetValue);
      if (phones.length === 0) {
        setError('유효한 전화번호를 입력해주세요.');
        return;
      }
    }

    const label = TARGET_LABELS[targetType];
    const phoneCount = targetType === 'phone' ? parsePhones(targetValue).length : 0;
    const confirmMsg = targetType === 'phone'
      ? `[${label}] ${phoneCount}개 번호에 알림을 발송하시겠습니까?`
      : `[${label}] 알림을 발송하시겠습니까?`;
    if (!confirm(confirmMsg)) return;

    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        body: body.trim(),
        targetType,
      };
      if (targetType === 'phone') {
        payload.phones = parsePhones(targetValue);
      } else {
        payload.targetValue = targetValue.trim() || undefined;
      }
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '발송 실패');
      } else {
        setResult(`발송 완료: 성공 ${data.sent}건, 실패 ${data.failed}건${data.message ? ` (${data.message})` : ''}`);
        setTitle('');
        setBody('');
        setTargetValue('');
        loadLogs();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell>
      <div className="max-w-4xl p-6">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-[#273F4F]" />
          <h1 className="text-2xl font-bold tracking-tight">알림 발송</h1>
        </div>
        <p className="mt-1 text-sm text-[#6B7280]">
          FCM 푸시 알림을 작업자·팀장 앱으로 발송합니다.
        </p>

        {/* 발송 대상 탭 */}
        <div className="mt-6 grid grid-cols-4 gap-2">
          {(['all', 'leaders', 'team', 'phone'] as TargetType[]).map((t) => {
            const Icon = TARGET_ICONS[t];
            const active = targetType === t;
            return (
              <button
                key={t}
                onClick={() => { setTargetType(t); setTargetValue(''); setError(null); }}
                className={`flex flex-col items-center gap-1.5 rounded-[5px] border px-3 py-3 text-sm font-semibold transition-colors ${
                  active
                    ? 'border-[#273F4F] bg-[#273F4F] text-white'
                    : 'border-[#D7D7D7] bg-white text-[#091413] hover:bg-[#F5F5F5]'
                }`}
              >
                <Icon className="h-5 w-5" />
                {TARGET_LABELS[t]}
              </button>
            );
          })}
        </div>

        {/* 대상 상세 */}
        {targetType === 'team' && (
          <div className="mt-4">
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
          <div className="mt-4">
            <label className="block text-sm font-medium text-[#091413] mb-1">
              전화번호 <span className="text-[#6B7280] font-normal">(엑셀에서 복사하여 붙여넣기 가능, 줄바꿈·쉼표·탭으로 구분)</span>
            </label>
            <textarea
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder={"01012345678\n01098765432\n01011112222"}
              rows={6}
              className="w-full resize-y rounded-[5px] border border-[#D7D7D7] bg-white px-3 py-2 text-sm font-mono"
            />
            {targetValue.trim() && (
              <p className="mt-1 text-xs text-[#6B7280]">
                입력된 전화번호: <span className="font-semibold text-[#091413]">{parsePhones(targetValue).length}건</span>
              </p>
            )}
          </div>
        )}

        {/* 제목 / 내용 */}
        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-[#091413] mb-1">제목</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="알림 제목"
              className="w-full rounded-[5px] border border-[#D7D7D7] bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#091413] mb-1">내용</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="알림 내용을 입력하세요"
              rows={4}
              className="w-full resize-none rounded-[5px] border border-[#D7D7D7] bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-[5px] bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>
        )}
        {result && (
          <p className="mt-3 rounded-[5px] bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">{result}</p>
        )}

        <button
          onClick={handleSend}
          disabled={busy}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-[5px] bg-[#273F4F] text-base font-bold text-white hover:bg-[#1e3340] disabled:opacity-60"
        >
          <Send className="h-5 w-5" />
          {busy ? '발송 중...' : '알림 발송'}
        </button>

        {/* 발송 이력 */}
        <div className="mt-10">
          <h2 className="text-lg font-bold text-[#091413]">발송 이력</h2>
          {logs.length === 0 ? (
            <p className="mt-4 text-center text-sm text-[#9CA3AF]">발송 이력이 없습니다.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[11px] [&_th]:border-r [&_th]:border-r-[#EAEAEA] [&_td]:border-r [&_td]:border-r-[#EAEAEA] [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
                <thead>
                  <tr className="border-b border-[#D7D7D7] text-center text-[11px] font-semibold text-[#6B7280] uppercase">
                    <th className="py-2 pr-3">시간</th>
                    <th className="py-2 pr-3">대상</th>
                    <th className="py-2 pr-3">제목</th>
                    <th className="py-2 pr-3">내용</th>
                    <th className="py-2 pr-3 text-center">성공</th>
                    <th className="py-2 text-center">실패</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-[#F5F5F5]">
                      <td className="py-2 pr-3 whitespace-nowrap text-[#6B7280] tabular-nums">
                        {fmtTime(log.created_at)}
                      </td>
                      <td className="py-2 pr-3">
                        <span className="inline-block rounded bg-[#F5F5F5] px-1.5 py-0.5 text-[11px] font-semibold">
                          {TARGET_LABELS[log.target_type as TargetType] ?? log.target_type}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-medium max-w-[160px] truncate">{log.title}</td>
                      <td className="py-2 pr-3 text-[#6B7280] max-w-[200px] truncate">{log.body}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-green-700">{log.sent_count}</td>
                      <td className="py-2 text-right tabular-nums text-red-600">{log.fail_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
