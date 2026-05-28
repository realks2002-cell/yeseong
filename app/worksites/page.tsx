'use client';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WorksiteForm, type Worksite, type WorksiteInput, type Option } from '@/components/worksite-form';
import { Building2, Pencil, Trash2 } from 'lucide-react';

export default function WorksitesPage() {
  const [list, setList] = useState<Worksite[] | null>(null);
  const [clients, setClients] = useState<Option[]>([]);
  const [subcontractors, setSubcontractors] = useState<Option[]>([]);
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

  async function loadOptions() {
    const [rc, rs] = await Promise.all([
      fetch('/api/clients', { cache: 'no-store' }),
      fetch('/api/subcontractors', { cache: 'no-store' }),
    ]);
    if (rc.ok) {
      const data: Array<{ id: string; name: string }> = await rc.json();
      setClients(data.map((c) => ({ id: c.id, name: c.name })));
    }
    if (rs.ok) {
      const data: Array<{ id: string; name: string }> = await rs.json();
      setSubcontractors(data.map((s) => ({ id: s.id, name: s.name })));
    }
  }

  useEffect(() => {
    load();
    loadOptions();
  }, []);

  async function handleAdd(input: WorksiteInput) {
    const r = await fetch('/api/worksites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
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

  async function updateField(id: string, patch: { client_id?: string | null; subcontractor_id?: string | null }) {
    setList((prev) => (prev ? prev.map((w) => (w.id === id ? { ...w, ...patch } : w)) : prev));
    const r = await fetch(`/api/worksites/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? '저장 실패');
      load();
    }
  }

  const inlineSelectCls =
    'h-7 w-full max-w-[140px] rounded-[5px] border border-[#D7D7D7] bg-white px-1.5 text-[11px] text-[#091413] focus:outline-none focus:ring-1 focus:ring-[#447D9B]';

  return (
    <AdminShell>
      <div className="max-w-7xl p-6">
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">현장 마스터</h1>
            <p className="text-sm text-[#6B7280] mt-1">
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
            <table className="w-full text-[11px]">
              <thead className="bg-[#F5F5F5] text-[#4B5563]">
                <tr className="text-left text-[11px]">
                  <th className="px-3 py-2 font-medium w-10">#</th>
                  <th className="px-3 py-2 font-medium">현장명</th>
                  <th className="px-3 py-2 font-medium">원청사</th>
                  <th className="px-3 py-2 font-medium">전문건설사</th>
                  <th className="px-3 py-2 font-medium">주소</th>
                  <th className="px-3 py-2 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D7D7D7]">
                {list === null ? (
                  <tr><td colSpan={6} className="py-10 text-center text-[#9CA3AF]">불러오는 중...</td></tr>
                ) : list.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-[#9CA3AF]">등록된 현장이 없습니다.</td></tr>
                ) : (
                  list.map((w, i) => (
                    <tr key={w.id} className="hover:bg-[#F5F5F5]">
                      <td className="px-3 py-2 text-[#6B7280] tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{w.name}</td>
                      <td className="px-3 py-2">
                        <select
                          value={w.client_id ?? ''}
                          onChange={(e) => updateField(w.id, { client_id: e.target.value || null })}
                          className={inlineSelectCls}
                          aria-label="원청사 선택"
                        >
                          <option value="">선택 안 함</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={w.subcontractor_id ?? ''}
                          onChange={(e) => updateField(w.id, { subcontractor_id: e.target.value || null })}
                          className={inlineSelectCls}
                          aria-label="전문건설사 선택"
                        >
                          <option value="">선택 안 함</option>
                          {subcontractors.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-[#4B5563]">{w.address ?? '-'}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-0.5">
                          <button
                            className="rounded p-1 text-[#6B7280] hover:bg-[#F5F5F5] hover:text-[#091413]"
                            onClick={() => setEditing(w)}
                            aria-label="수정"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="rounded p-1 text-[#6B7280] hover:bg-red-50 hover:text-red-600"
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
          clients={clients}
          subcontractors={subcontractors}
          onSubmit={handleAdd}
          onCancel={() => setShowAdd(false)}
        />
      )}
      {editing && (
        <WorksiteForm
          title={`${editing.name} 수정`}
          initial={editing}
          clients={clients}
          subcontractors={subcontractors}
          onSubmit={handleEdit}
          onCancel={() => setEditing(null)}
        />
      )}
    </AdminShell>
  );
}
