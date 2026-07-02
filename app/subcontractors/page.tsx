'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SubcontractorForm, type Subcontractor, type SubcontractorInput } from '@/components/subcontractor-form';
import { HardHat, Pencil, RotateCcw, Trash2 } from 'lucide-react';

export default function SubcontractorsPage() {
  const [list, setList] = useState<Subcontractor[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Subcontractor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const r = await fetch(`/api/subcontractors${showArchived ? '?includeArchived=true' : ''}`, {
      cache: 'no-store',
    });
    if (!r.ok) {
      setError('목록을 불러오지 못했습니다');
      setList([]);
      return;
    }
    setList(await r.json());
  }, [showArchived]);

  useEffect(() => {
    load();
  }, [load]);

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
    if (!confirm(`"${s.name}" 전문건설사를 보관함으로 이동할까요?\n과거 데이터는 그대로 유지되고, 목록에서만 숨겨집니다.`)) return;
    const r = await fetch(`/api/subcontractors/${s.id}`, { method: 'DELETE' });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? '보관 실패');
      return;
    }
    load();
  }

  async function handleRestore(s: Subcontractor) {
    if (!confirm(`"${s.name}" 전문건설사를 복원할까요?`)) return;
    const r = await fetch(`/api/subcontractors/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: true }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? '복원 실패');
      return;
    }
    load();
  }

  return (
    <AdminShell>
      <div className="max-w-7xl p-6">
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">전문건설사 마스터</h1>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-[#4B5563] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded border-[#D7D7D7]"
              />
              보관함 보기
            </label>
            <Button onClick={() => setShowAdd(true)}>
              <HardHat className="h-4 w-4" />
              전문건설사 추가
            </Button>
          </div>
        </div>

        {error && <p className="mb-4 rounded-[5px] bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] [&_th]:border-r [&_th]:border-r-[#EAEAEA] [&_td]:border-r [&_td]:border-r-[#EAEAEA] [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
              <thead className="bg-[#F5F5F5] text-[#4B5563]">
                <tr className="text-center text-[11px]">
                  <th className="px-3 py-2 font-medium w-10">#</th>
                  <th className="px-3 py-2 font-medium">전문건설사명</th>
                  <th className="px-3 py-2 font-medium">대표자</th>
                  <th className="px-3 py-2 font-medium">사업자등록번호</th>
                  <th className="px-3 py-2 font-medium">연락처</th>
                  <th className="px-3 py-2 font-medium">소재지</th>
                  <th className="px-3 py-2 font-medium w-20">상태</th>
                  <th className="px-3 py-2 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D7D7D7]">
                {list === null ? (
                  <tr><td colSpan={8} className="py-10 text-center text-[#9CA3AF]">불러오는 중...</td></tr>
                ) : list.length === 0 ? (
                  <tr><td colSpan={8} className="py-10 text-center text-[#9CA3AF]">등록된 전문건설사가 없습니다.</td></tr>
                ) : (
                  list.map((s, i) => (
                    <tr key={s.id} className={`hover:bg-[#F5F5F5] ${!s.is_active ? 'text-[#9CA3AF]' : ''}`}>
                      <td className="px-3 py-2 text-[#6B7280] tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{s.name}</td>
                      <td className="px-3 py-2 text-[#4B5563]">{s.representative ?? '-'}</td>
                      <td className="px-3 py-2 font-mono text-[#4B5563]">{s.business_number ?? '-'}</td>
                      <td className="px-3 py-2 font-mono text-[#4B5563]">{s.contact_phone ?? '-'}</td>
                      <td className="px-3 py-2 text-[#4B5563] max-w-[220px] truncate" title={s.address ?? ''}>{s.address ?? '-'}</td>
                      <td className="px-3 py-2">
                        {s.is_active ? (
                          <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">활성</span>
                        ) : (
                          <span className="rounded-full bg-[#F5F5F5] px-1.5 py-0.5 text-[10px] text-[#6B7280]">보관됨</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-0.5">
                          {s.is_active ? (
                            <>
                              <button
                                className="rounded p-1 text-[#6B7280] hover:bg-[#F5F5F5] hover:text-[#091413]"
                                onClick={() => setEditing(s)}
                                aria-label="수정"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                className="rounded p-1 text-[#6B7280] hover:bg-red-50 hover:text-red-600"
                                onClick={() => handleDelete(s)}
                                aria-label="보관"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <button
                              className="rounded p-1 text-[#6B7280] hover:bg-emerald-50 hover:text-emerald-700"
                              onClick={() => handleRestore(s)}
                              aria-label="복원"
                              title="복원"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
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
          title="전문건설사 추가"
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
