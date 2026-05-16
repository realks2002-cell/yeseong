'use client';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WorksiteForm, type Worksite, type WorksiteInput } from '@/components/worksite-form';
import { Building2, Pencil, Trash2 } from 'lucide-react';

export default function WorksitesPage() {
  const [list, setList] = useState<Worksite[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Worksite | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const r = await fetch('/api/worksites', { cache: 'no-store' });
    if (!r.ok) {
      setError('목록을 불러오지 못했습니다');
      setList([]);
      return;
    }
    setList(await r.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(input: WorksiteInput) {
    const r = await fetch('/api/worksites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.name, address: input.address }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '추가 실패');
    setShowAdd(false);
    load();
  }

  async function handleEdit(input: WorksiteInput) {
    if (!editing) return;
    const r = await fetch(`/api/worksites/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '수정 실패');
    setEditing(null);
    load();
  }

  async function handleDelete(w: Worksite) {
    if (!confirm(`"${w.name}" 현장을 삭제하시겠습니까?`)) return;
    const r = await fetch(`/api/worksites/${w.id}`, { method: 'DELETE' });
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
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">현장 마스터</h1>
            <p className="text-sm text-zinc-500 mt-1">
              총 {list?.length ?? '...'}개 현장
            </p>
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <Building2 className="h-4 w-4" />
            현장 추가
          </Button>
        </div>

        {error && (
          <p className="mb-4 rounded-[5px] bg-red-50 p-3 text-sm text-red-600">{error}</p>
        )}

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr className="text-left text-[11px]">
                  <th className="px-3 py-2 font-medium w-10">#</th>
                  <th className="px-3 py-2 font-medium">현장명</th>
                  <th className="px-3 py-2 font-medium">주소</th>
                  <th className="px-3 py-2 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {list === null ? (
                  <tr><td colSpan={4} className="py-10 text-center text-zinc-400">불러오는 중...</td></tr>
                ) : list.length === 0 ? (
                  <tr><td colSpan={4} className="py-10 text-center text-zinc-400">등록된 현장이 없습니다.</td></tr>
                ) : (
                  list.map((w, i) => (
                    <tr key={w.id} className="hover:bg-zinc-50">
                      <td className="px-3 py-2 text-zinc-500 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{w.name}</td>
                      <td className="px-3 py-2 text-zinc-600">{w.address ?? '-'}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-0.5">
                          <button
                            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                            onClick={() => setEditing(w)}
                            aria-label="수정"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="rounded p-1 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                            onClick={() => handleDelete(w)}
                            aria-label="삭제"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

      {showAdd && (
        <WorksiteForm
          title="현장 추가"
          onSubmit={handleAdd}
          onCancel={() => setShowAdd(false)}
        />
      )}
      {editing && (
        <WorksiteForm
          title={`${editing.name} 수정`}
          initial={editing}
          onSubmit={handleEdit}
          onCancel={() => setEditing(null)}
        />
      )}
    </AdminShell>
  );
}
