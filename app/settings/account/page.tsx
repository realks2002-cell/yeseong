'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus, Pencil, Trash2, X } from 'lucide-react';

type Admin = {
  id: string;
  login_id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  is_self: boolean;
};

type FormMode = { kind: 'add' } | { kind: 'edit'; admin: Admin } | null;

export default function AccountPage() {
  const [list, setList] = useState<Admin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormMode>(null);

  const load = useCallback(async () => {
    setError(null);
    const r = await fetch('/api/admins', { cache: 'no-store' });
    if (!r.ok) {
      setError('목록을 불러오지 못했습니다');
      setList([]);
      return;
    }
    setList(await r.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(a: Admin) {
    if (a.is_self) {
      alert('본인은 삭제할 수 없습니다');
      return;
    }
    if (!confirm(`관리자 "${a.login_id}"를 삭제할까요?`)) return;
    const r = await fetch(`/api/admins/${a.id}`, { method: 'DELETE' });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? '삭제 실패');
      return;
    }
    load();
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">관리자 계정</h1>
            <p className="text-sm text-zinc-500 mt-1">
              총 {list?.length ?? '...'}명. 여러 관리자가 동시에 접속할 수 있습니다.
            </p>
          </div>
          <Button onClick={() => setForm({ kind: 'add' })}>
            <UserPlus className="h-4 w-4" />
            관리자 추가
          </Button>
        </div>

        {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr className="text-left text-xs">
                  <th className="px-4 py-3 font-medium w-12">#</th>
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">마지막 로그인</th>
                  <th className="px-4 py-3 font-medium">생성일</th>
                  <th className="px-4 py-3 font-medium w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {list === null ? (
                  <tr><td colSpan={5} className="py-12 text-center text-zinc-400">불러오는 중...</td></tr>
                ) : list.length === 0 ? (
                  <tr><td colSpan={5} className="py-12 text-center text-zinc-400">관리자가 없습니다.</td></tr>
                ) : (
                  list.map((a, i) => (
                    <tr key={a.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 text-zinc-500 tabular-nums">{i + 1}</td>
                      <td className="px-4 py-3 font-medium">
                        {a.login_id}
                        {a.is_self && <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">본인</span>}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 tabular-nums">{formatDate(a.last_sign_in_at)}</td>
                      <td className="px-4 py-3 text-zinc-600 tabular-nums">{formatDate(a.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                            onClick={() => setForm({ kind: 'edit', admin: a })}
                            aria-label="수정"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            className="rounded p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                            onClick={() => handleDelete(a)}
                            disabled={a.is_self}
                            aria-label="삭제"
                            title={a.is_self ? '본인은 삭제할 수 없습니다' : '삭제'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {form && (
        <AdminFormModal
          mode={form}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); load(); }}
        />
      )}
    </AdminShell>
  );
}

function formatDate(s: string | null): string {
  if (!s) return '-';
  const d = new Date(s);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function AdminFormModal({
  mode,
  onClose,
  onSaved,
}: {
  mode: { kind: 'add' } | { kind: 'edit'; admin: Admin };
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = mode.kind === 'edit';
  const [loginId, setLoginId] = useState(isEdit ? mode.admin.login_id : '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!loginId.trim()) return setErr('ID를 입력하세요');
    if (!isEdit && password.length < 6) return setErr('비밀번호는 6자 이상');
    if (isEdit && password.length > 0 && password.length < 6) return setErr('비밀번호는 6자 이상');

    setBusy(true);
    const url = isEdit ? `/api/admins/${mode.admin.id}` : '/api/admins';
    const method = isEdit ? 'PATCH' : 'POST';
    const body: Record<string, string> = { login_id: loginId.trim() };
    if (password.length > 0) body.password = password;

    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErr(j.error ?? `${isEdit ? '수정' : '추가'} 실패`);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h2 className="text-lg font-semibold">{isEdit ? `${mode.admin.login_id} 수정` : '관리자 추가'}</h2>
          <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700">ID</label>
            <Input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="admin"
              autoComplete="off"
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700">
              비밀번호 {isEdit && <span className="text-xs text-zinc-400">(비우면 변경 안 함)</span>}
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6자 이상"
              autoComplete="new-password"
              disabled={busy}
            />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>취소</Button>
            <Button type="submit" disabled={busy}>{busy ? '저장 중...' : isEdit ? '수정' : '추가'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
