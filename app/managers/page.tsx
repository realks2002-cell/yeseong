'use client';
import { useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, X, HardHat, UserPlus, Pencil, Trash2 } from 'lucide-react';

type Manager = {
  id: string;
  name: string;
  phone: string;
  pin: string | null;
  created_at: string;
  yeseong_site_manager_assignments: Array<{
    worksite_id: string;
    yeseong_worksites: { id: string; name: string } | null;
  }>;
};

type Worksite = { id: string; name: string };

type ManagerInput = {
  name: string;
  phone: string;
  pin: string;
  worksite_ids: string[];
};

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ManagersPage() {
  const [list, setList] = useState<Manager[] | null>(null);
  const [worksites, setWorksites] = useState<Worksite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Manager | null>(null);

  const filtered = useMemo(() => {
    if (!list) return null;
    const raw = query.trim().toLowerCase();
    if (!raw) return list;
    const digits = raw.replace(/\D/g, '');
    return list.filter((m) => {
      if (m.name?.toLowerCase().includes(raw)) return true;
      if (digits && m.phone.replace(/\D/g, '').includes(digits)) return true;
      const sites = m.yeseong_site_manager_assignments
        .map((a) => a.yeseong_worksites?.name ?? '')
        .join(' ');
      if (sites.toLowerCase().includes(raw)) return true;
      return false;
    });
  }, [list, query]);

  async function load() {
    setError(null);
    const [mRes, wRes] = await Promise.all([
      fetch('/api/managers', { cache: 'no-store' }),
      fetch('/api/worksites', { cache: 'no-store' }),
    ]);
    if (!mRes.ok) {
      setError('목록을 불러오지 못했습니다');
      setList([]);
      return;
    }
    setList(await mRes.json());
    if (wRes.ok) setWorksites(await wRes.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(input: ManagerInput) {
    const r = await fetch('/api/managers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '추가 실패');
    setShowAdd(false);
    load();
  }

  async function handleEdit(input: ManagerInput) {
    if (!editing) return;
    const r = await fetch(`/api/managers/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '수정 실패');
    setEditing(null);
    load();
  }

  async function handleDelete(m: Manager) {
    if (!confirm(`"${m.name}" 소장을 삭제할까요?`)) return;
    const r = await fetch(`/api/managers/${m.id}`, { method: 'DELETE' });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? '삭제 실패');
      return;
    }
    load();
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">현장 소장</h1>
            <p className="mt-1 text-sm text-zinc-500">
              총 {list?.length ?? '...'}명{query && filtered ? ` · 검색결과 ${filtered.length}명` : ''}.
              관리자가 직접 추가/수정하거나 소장 앱에서 가입한 사용자가 노출됩니다.
            </p>
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <UserPlus className="h-4 w-4" />
            소장 추가
          </Button>
        </div>

        <div className="relative mb-4 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 · 전화번호 · 현장으로 검색"
            className="w-full rounded-[5px] border border-zinc-200 bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="검색어 지우기"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {error && <p className="mb-4 rounded-[5px] bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr className="text-left text-xs">
                  <th className="w-10 px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">성명</th>
                  <th className="px-3 py-2 font-medium">전화번호</th>
                  <th className="px-3 py-2 font-medium text-center">PIN</th>
                  <th className="px-3 py-2 font-medium">담당 현장</th>
                  <th className="px-3 py-2 font-medium">가입일</th>
                  <th className="w-20 px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered === null ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-zinc-400">
                      불러오는 중...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-zinc-400">
                      {query ? '검색 결과가 없습니다.' : '등록된 소장이 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((m, i) => {
                    const sites = m.yeseong_site_manager_assignments
                      .map((a) => a.yeseong_worksites)
                      .filter((s): s is { id: string; name: string } => s !== null);
                    return (
                      <tr key={m.id} className="hover:bg-zinc-50">
                        <td className="px-3 py-2 tabular-nums text-zinc-500">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <HardHat className="h-3.5 w-3.5 text-zinc-400" />
                            {m.name}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{formatPhone(m.phone)}</td>
                        <td className="px-3 py-2 text-center font-mono tabular-nums">
                          {m.pin ? (
                            <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[11px] text-white">{m.pin}</span>
                          ) : (
                            <span className="text-zinc-300">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {sites.length === 0 ? (
                            <span className="text-xs text-zinc-400">미배정</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {sites.map((s) => (
                                <span
                                  key={s.id}
                                  className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700"
                                >
                                  {s.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-zinc-600">{formatDate(m.created_at)}</td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-0.5">
                            <button
                              className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                              onClick={() => setEditing(m)}
                              aria-label="수정"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="rounded p-1 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                              onClick={() => handleDelete(m)}
                              aria-label="삭제"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
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
      </div>

      {showAdd && (
        <ManagerForm
          title="소장 추가"
          worksites={worksites}
          onSubmit={handleAdd}
          onCancel={() => setShowAdd(false)}
        />
      )}
      {editing && (
        <ManagerForm
          title={`${editing.name} 수정`}
          worksites={worksites}
          initial={{
            name: editing.name,
            phone: editing.phone,
            pin: editing.pin ?? '',
            worksite_ids: editing.yeseong_site_manager_assignments
              .map((a) => a.worksite_id),
          }}
          onSubmit={handleEdit}
          onCancel={() => setEditing(null)}
        />
      )}
    </AdminShell>
  );
}

function ManagerForm({
  title,
  worksites,
  initial,
  onSubmit,
  onCancel,
}: {
  title: string;
  worksites: Worksite[];
  initial?: ManagerInput;
  onSubmit: (input: ManagerInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [pin, setPin] = useState(initial?.pin ?? '');
  const [worksiteIds, setWorksiteIds] = useState<string[]>(initial?.worksite_ids ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(id: string) {
    setWorksiteIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr('성명을 입력하세요');
    if (phone.replace(/\D/g, '').length < 10) return setErr('전화번호 형식 오류');
    if (pin && !/^\d{4}$/.test(pin)) return setErr('PIN은 4자리 숫자');
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), phone, pin, worksite_ids: worksiteIds });
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-[5px] bg-white p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onCancel} className="rounded p-1 text-zinc-400 hover:bg-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">성명 *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-[5px] border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">전화번호 *</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
              className="w-full rounded-[5px] border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              PIN (4자리, 모바일 앱 로그인용)
            </label>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="0000"
              className="w-32 rounded-[5px] border border-zinc-200 px-3 py-2 font-mono text-sm outline-none focus:border-blue-500"
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              비워두면 모바일 앱에서 직접 가입할 수 있는 shell만 생성됩니다.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">담당 현장</label>
            <div className="max-h-40 overflow-y-auto rounded-[5px] border border-zinc-200 p-2">
              {worksites.length === 0 ? (
                <p className="px-1 py-2 text-xs text-zinc-400">현장이 없습니다.</p>
              ) : (
                worksites.map((w) => (
                  <label
                    key={w.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-zinc-50"
                  >
                    <input
                      type="checkbox"
                      checked={worksiteIds.includes(w.id)}
                      onChange={() => toggle(w.id)}
                    />
                    <span className="text-sm">{w.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        {err && <p className="mt-3 rounded-[5px] bg-red-50 p-2 text-xs text-red-600">{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            취소
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? '저장 중...' : '저장'}
          </Button>
        </div>
      </form>
    </div>
  );
}
