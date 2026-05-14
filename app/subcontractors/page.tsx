'use client';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SubcontractorForm, type Subcontractor, type SubcontractorInput } from '@/components/subcontractor-form';
import { HardHat, Pencil, Trash2 } from 'lucide-react';

export default function SubcontractorsPage() {
  const [list, setList] = useState<Subcontractor[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Subcontractor | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const r = await fetch('/api/subcontractors', { cache: 'no-store' });
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

  async function handleAdd(input: SubcontractorInput) {
    const r = await fetch('/api/subcontractors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '추가 실패');
    setShowAdd(false);
    load();
  }

  async function handleEdit(input: SubcontractorInput) {
    if (!editing) return;
    const r = await fetch(`/api/subcontractors/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '수정 실패');
    setEditing(null);
    load();
  }

  async function handleDelete(s: Subcontractor) {
    if (!confirm(`"${s.name}" 협력사를 삭제할까요?\n(연결된 작업자·노임대장 슬롯의 협력사 정보는 비워집니다)`)) return;
    const r = await fetch(`/api/subcontractors/${s.id}`, { method: 'DELETE' });
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
            <h1 className="text-2xl font-bold tracking-tight">협력사 마스터</h1>
            <p className="text-sm text-zinc-500 mt-1">
              총 {list?.length ?? '...'}개 협력사
            </p>
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <HardHat className="h-4 w-4" />
            협력사 추가
          </Button>
        </div>

        {error && <p className="mb-4 rounded-[5px] bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr className="text-left text-[11px]">
                  <th className="px-3 py-2 font-medium w-10">#</th>
                  <th className="px-3 py-2 font-medium">협력사명</th>
                  <th className="px-3 py-2 font-medium">사업자등록번호</th>
                  <th className="px-3 py-2 font-medium">연락처</th>
                  <th className="px-3 py-2 font-medium w-20">상태</th>
                  <th className="px-3 py-2 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {list === null ? (
                  <tr><td colSpan={6} className="py-10 text-center text-zinc-400">불러오는 중...</td></tr>
                ) : list.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-zinc-400">등록된 협력사가 없습니다.</td></tr>
                ) : (
                  list.map((s, i) => (
                    <tr key={s.id} className="hover:bg-zinc-50">
                      <td className="px-3 py-2 text-zinc-500 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{s.name}</td>
                      <td className="px-3 py-2 font-mono text-zinc-600">{s.business_number ?? '-'}</td>
                      <td className="px-3 py-2 font-mono text-zinc-600">{s.contact_phone ?? '-'}</td>
                      <td className="px-3 py-2">
                        {s.is_active ? (
                          <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">활성</span>
                        ) : (
                          <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">비활성</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-0.5">
                          <button
                            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                            onClick={() => setEditing(s)}
                            aria-label="수정"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="rounded p-1 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                            onClick={() => handleDelete(s)}
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
        <SubcontractorForm
          title="협력사 추가"
          onSubmit={handleAdd}
          onCancel={() => setShowAdd(false)}
        />
      )}
      {editing && (
        <SubcontractorForm
          title={`${editing.name} 수정`}
          initial={editing}
          onSubmit={handleEdit}
          onCancel={() => setEditing(null)}
        />
      )}
    </AdminShell>
  );
}
