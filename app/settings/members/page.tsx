'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserCog, UserPlus, KeyRound, Trash2, X } from 'lucide-react';
import { formatPhone } from '@/lib/auth/phone-email';

// 사용자 관리 — 로그인 계정(관리자/팀장/작업자) 목록·PIN 재설정·삭제·관리자 추가

type Member = {
  id: string;
  email: string;
  login_id: string;
  role: 'admin' | 'manager' | 'worker' | 'unknown';
  name: string | null;
  pin: string | null;
  created_at: string;
  last_sign_in_at: string | null;
};

const ROLE_LABEL: Record<Member['role'], { label: string; cls: string }> = {
  admin: { label: '관리자', cls: 'bg-[#273F4F] text-white' },
  manager: { label: '팀장', cls: 'bg-blue-50 text-blue-700' },
  worker: { label: '작업자', cls: 'bg-emerald-50 text-emerald-700' },
  unknown: { label: '기타', cls: 'bg-zinc-100 text-zinc-500' },
};

const ROLE_FILTERS = [
  { key: '', label: '전체' },
  { key: 'admin', label: '관리자' },
  { key: 'manager', label: '팀장' },
  { key: 'worker', label: '작업자' },
] as const;

function fmtDateTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [meId, setMeId] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [pinTarget, setPinTarget] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const r = await fetch('/api/admin/members', { cache: 'no-store' });
    if (!r.ok) {
      setError('목록을 불러오지 못했습니다');
      setMembers([]);
      return;
    }
    const json = await r.json();
    setMembers((json.members ?? []) as Member[]);
    setMeId(json.me ?? '');
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!members) return null;
    const list = roleFilter ? members.filter((m) => m.role === roleFilter) : members;
    // 최근 접속이 위로
    return [...list].sort((a, b) => (b.last_sign_in_at ?? '').localeCompare(a.last_sign_in_at ?? ''));
  }, [members, roleFilter]);

  const counts = useMemo(() => {
    const c = { admin: 0, manager: 0, worker: 0, unknown: 0 };
    for (const m of members ?? []) c[m.role]++;
    return c;
  }, [members]);

  const handleDelete = async (m: Member) => {
    if (!confirm(
      `"${m.name ?? m.login_id}" 계정을 삭제하시겠습니까?\n` +
      '로그인이 불가능해지며, 작업자/팀장 마스터 정보와 출역·노임 이력은 유지됩니다.',
    )) return;
    setBusy(true);
    setMsg(null);
    const r = await fetch('/api/admin/members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: m.id }),
    });
    setBusy(false);
    const json = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(json.error ?? '삭제 실패'); return; }
    setMsg(`"${m.name ?? m.login_id}" 계정이 삭제되었습니다`);
    load();
  };

  return (
    <AdminShell>
      <div className="max-w-5xl p-6 space-y-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <UserCog className="h-6 w-6 text-[#447D9B]" />
              사용자 관리
            </h1>
            <p className="text-sm text-[#6B7280] mt-1">
              로그인 계정을 관리합니다. 관리자 {counts.admin} · 팀장 {counts.manager} · 작업자 {counts.worker}
            </p>
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <UserPlus className="h-4 w-4" />
            관리자 계정 추가
          </Button>
        </div>

        {/* 역할 필터 */}
        <div className="flex flex-wrap gap-1.5">
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setRoleFilter(f.key)}
              className={`rounded-[5px] border px-2.5 py-1.5 text-xs font-semibold ${
                roleFilter === f.key
                  ? 'border-[#273F4F] bg-[#273F4F] text-white'
                  : 'border-[#D7D7D7] bg-white text-[#091413] hover:bg-[#F5F5F5]'
              }`}
            >
              {f.label}
              <span className={`ml-1 tabular-nums ${roleFilter === f.key ? 'text-white/70' : 'text-[#9CA3AF]'}`}>
                {f.key === '' ? (members?.length ?? 0) : counts[f.key as keyof typeof counts]}
              </span>
            </button>
          ))}
        </div>

        {error && <p className="rounded-[5px] bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        {msg && <p className="rounded-[5px] bg-blue-50 p-3 text-sm font-semibold text-blue-800">{msg}</p>}

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] whitespace-nowrap [&_th]:border-r [&_th]:border-r-[#EAEAEA] [&_td]:border-r [&_td]:border-r-[#EAEAEA] [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
              <thead className="bg-[#F5F5F5] text-[#4B5563]">
                <tr className="text-center">
                  <th className="px-3 py-2 font-medium w-10">#</th>
                  <th className="px-3 py-2 font-medium">역할</th>
                  <th className="px-3 py-2 font-medium">이름</th>
                  <th className="px-3 py-2 font-medium">ID / 전화번호</th>
                  <th className="px-3 py-2 font-medium">PIN</th>
                  <th className="px-3 py-2 font-medium">마지막 접속</th>
                  <th className="px-3 py-2 font-medium">가입일</th>
                  <th className="px-3 py-2 font-medium w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAEAEA]">
                {filtered === null ? (
                  <tr><td colSpan={8} className="py-10 text-center text-[#9CA3AF]">불러오는 중...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="py-10 text-center text-[#9CA3AF]">계정이 없습니다.</td></tr>
                ) : (
                  filtered.map((m, i) => {
                    const role = ROLE_LABEL[m.role];
                    const isMobile = m.role === 'manager' || m.role === 'worker';
                    return (
                      <tr key={m.id} className="hover:bg-[#F9FAFB]">
                        <td className="px-3 py-2 text-center text-[#9CA3AF] tabular-nums">{i + 1}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${role.cls}`}>{role.label}</span>
                        </td>
                        <td className="px-3 py-2 font-medium">
                          {m.name ?? <span className="text-[#9CA3AF]">-</span>}
                          {m.id === meId && <span className="ml-1.5 rounded bg-[#FE7743] px-1.5 py-0.5 text-[8px] font-semibold text-white">나</span>}
                        </td>
                        <td className="px-3 py-2 font-mono text-[#4B5563]">
                          {isMobile ? formatPhone(m.login_id) : m.login_id}
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-[#4B5563]">
                          {isMobile ? (m.pin ?? '-') : '-'}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums text-[#4B5563]">{fmtDateTime(m.last_sign_in_at)}</td>
                        <td className="px-3 py-2 text-center tabular-nums text-[#9CA3AF]">{fmtDateTime(m.created_at).slice(0, 10)}</td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-0.5">
                            {isMobile && (
                              <button
                                onClick={() => setPinTarget(m)}
                                disabled={busy}
                                className="rounded p-1 text-[#6B7280] hover:bg-[#F5F5F5] hover:text-[#447D9B]"
                                title="PIN 재설정"
                              >
                                <KeyRound className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {m.id !== meId && (
                              <button
                                onClick={() => handleDelete(m)}
                                disabled={busy}
                                className="rounded p-1 text-[#6B7280] hover:bg-red-50 hover:text-red-600"
                                title="계정 삭제"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <p className="text-xs text-[#9CA3AF] leading-relaxed">
          · 계정 삭제 시 로그인만 차단되며, 작업자/팀장 마스터·출역·노임 이력은 유지됩니다. 다시 가입하면 같은 정보로 재연결됩니다.<br />
          · PIN 재설정은 작업자·팀장 계정만 가능합니다. 관리자 비밀번호는 본인이 설정 → 계정에서 변경하세요.
        </p>
      </div>

      {showAdd && (
        <AddAdminModal
          onDone={(m) => { setShowAdd(false); setMsg(m); load(); }}
          onCancel={() => setShowAdd(false)}
        />
      )}
      {pinTarget && (
        <PinResetModal
          member={pinTarget}
          onDone={(m) => { setPinTarget(null); setMsg(m); load(); }}
          onCancel={() => setPinTarget(null)}
        />
      )}
    </AdminShell>
  );
}

function AddAdminModal({ onDone, onCancel }: { onDone: (msg: string) => void; onCancel: () => void }) {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!id.trim()) return setErr('ID를 입력하세요');
    if (password.length < 6) return setErr('비밀번호는 6자 이상이어야 합니다');
    setLoading(true);
    const r = await fetch('/api/admin/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id.trim(), password }),
    });
    setLoading(false);
    const json = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(json.error ?? '추가 실패'); return; }
    onDone(`관리자 "${id.trim()}" 계정이 추가되었습니다`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-[5px] bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#D7D7D7] px-5 py-3">
          <h2 className="text-base font-semibold">관리자 계정 추가</h2>
          <button onClick={onCancel} className="rounded p-1 text-[#9CA3AF] hover:bg-[#F5F5F5]"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">로그인 ID</label>
            <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="예: manager2" autoFocus disabled={loading} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">비밀번호 (6자 이상)</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>취소</Button>
            <Button type="submit" disabled={loading}>{loading ? '추가 중...' : '추가'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PinResetModal({ member, onDone, onCancel }: {
  member: Member; onDone: (msg: string) => void; onCancel: () => void;
}) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!/^\d{4}$/.test(pin)) return setErr('PIN은 숫자 4자리입니다');
    setLoading(true);
    const r = await fetch('/api/admin/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: member.id, pin }),
    });
    setLoading(false);
    const json = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(json.error ?? '재설정 실패'); return; }
    onDone(`"${member.name ?? member.login_id}" PIN이 ${pin}(으)로 변경되었습니다`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-[5px] bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#D7D7D7] px-5 py-3">
          <h2 className="text-base font-semibold">PIN 재설정 — {member.name ?? member.login_id}</h2>
          <button onClick={onCancel} className="rounded p-1 text-[#9CA3AF] hover:bg-[#F5F5F5]"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">새 PIN (숫자 4자리)</label>
            <Input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              placeholder="0000"
              className="text-center font-mono text-lg tracking-[0.5em]"
              autoFocus
              disabled={loading}
            />
          </div>
          <p className="text-xs text-[#6B7280]">변경 즉시 적용됩니다. 작업자에게 새 PIN을 알려주세요.</p>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>취소</Button>
            <Button type="submit" disabled={loading}>{loading ? '변경 중...' : 'PIN 변경'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
