'use client';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WorksiteForm, type Worksite, type WorksiteInput } from '@/components/worksite-form';
import { Building2, Pencil, Trash2, Check } from 'lucide-react';

type Subcontractor = { id: string; name: string };

export default function WorksitesPage() {
  const [list, setList] = useState<Worksite[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Worksite | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 협력사 관련
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [wsSubMap, setWsSubMap] = useState<Record<string, string[]>>({});

  async function loadSubcontractors() {
    const r = await fetch('/api/subcontractors', { cache: 'no-store' });
    if (r.ok) setSubcontractors(await r.json());
  }

  async function loadWorksiteSubcontractors(worksites: Worksite[]) {
    const map: Record<string, string[]> = {};
    await Promise.all(
      worksites.map(async (ws) => {
        const r = await fetch(`/api/worksites/${ws.id}/subcontractors`, { cache: 'no-store' });
        if (r.ok) map[ws.id] = await r.json();
        else map[ws.id] = [];
      })
    );
    setWsSubMap(map);
  }

  async function load() {
    setError(null);
    const r = await fetch('/api/worksites', { cache: 'no-store' });
    if (!r.ok) {
      setError('목록을 불러오지 못했습니다');
      setList([]);
      return;
    }
    const data: Worksite[] = await r.json();
    setList(data);
    await loadWorksiteSubcontractors(data);
  }

  useEffect(() => {
    load();
    loadSubcontractors();
  }, []);

  async function toggleSubcontractor(worksiteId: string, subId: string) {
    const current = wsSubMap[worksiteId] ?? [];
    const next = current.includes(subId)
      ? current.filter((id) => id !== subId)
      : [...current, subId];
    // 낙관적 업데이트
    setWsSubMap((m) => ({ ...m, [worksiteId]: next }));
    const r = await fetch(`/api/worksites/${worksiteId}/subcontractors`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subcontractor_ids: next }),
    });
    if (!r.ok) {
      // 롤백
      setWsSubMap((m) => ({ ...m, [worksiteId]: current }));
    }
  }

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
            <table className="w-full text-xs">
              <thead className="bg-[#F5F5F5] text-[#4B5563]">
                <tr className="text-left text-[11px]">
                  <th className="px-3 py-2 font-medium w-10">#</th>
                  <th className="px-3 py-2 font-medium">현장명</th>
                  <th className="px-3 py-2 font-medium">협력사</th>
                  <th className="px-3 py-2 font-medium">주소</th>
                  <th className="px-3 py-2 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D7D7D7]">
                {list === null ? (
                  <tr><td colSpan={5} className="py-10 text-center text-[#9CA3AF]">불러오는 중...</td></tr>
                ) : list.length === 0 ? (
                  <tr><td colSpan={5} className="py-10 text-center text-[#9CA3AF]">등록된 현장이 없습니다.</td></tr>
                ) : (
                  list.map((w, i) => (
                    <tr key={w.id} className="hover:bg-[#F5F5F5]">
                      <td className="px-3 py-2 text-[#6B7280] tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{w.name}</td>
                      <td className="px-3 py-2">
                        <SubcontractorDropdown
                          worksiteId={w.id}
                          subcontractors={subcontractors}
                          selected={wsSubMap[w.id] ?? []}
                          onToggle={toggleSubcontractor}
                        />
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

function SubcontractorDropdown({
  worksiteId,
  subcontractors,
  selected,
  onToggle,
}: {
  worksiteId: string;
  subcontractors: Subcontractor[];
  selected: string[];
  onToggle: (worksiteId: string, subId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const selectedNames = subcontractors
    .filter((s) => selected.includes(s.id))
    .map((s) => s.name);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 rounded-[5px] border border-[#D7D7D7] bg-white px-2 py-1 text-xs hover:bg-[#F5F5F5] min-w-[120px] text-left"
      >
        {selectedNames.length > 0 ? (
          <span className="truncate max-w-[200px]">{selectedNames.join(', ')}</span>
        ) : (
          <span className="text-[#9CA3AF]">협력사 선택</span>
        )}
        <svg className="ml-auto h-3 w-3 shrink-0 text-[#9CA3AF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-[5px] border border-[#D7D7D7] bg-white py-1 shadow-lg">
            {subcontractors.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[#9CA3AF]">등록된 협력사 없음</p>
            ) : (
              subcontractors.map((s) => {
                const checked = selected.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onToggle(worksiteId, s.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-[#F5F5F5] text-left"
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-[#D7D7D7]'}`}>
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    {s.name}
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
