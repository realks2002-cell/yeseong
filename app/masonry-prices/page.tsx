'use client';
import { useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MasonryPriceForm, type MasonryPrice, type MasonryPriceInput, type Worksite } from '@/components/masonry-price-form';
import { Plus, Pencil, Trash2 } from 'lucide-react';

export default function MasonryPricesPage() {
  const [list, setList] = useState<MasonryPrice[] | null>(null);
  const [worksites, setWorksites] = useState<Worksite[]>([]);
  const [filterWorksiteId, setFilterWorksiteId] = useState<string>('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<MasonryPrice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!list) return null;
    if (!filterWorksiteId) return list;
    return list.filter((p) => p.worksite_id === filterWorksiteId);
  }, [list, filterWorksiteId]);

  async function loadWorksites() {
    const r = await fetch('/api/worksites', { cache: 'no-store' });
    if (!r.ok) return;
    const data: Array<{ id: string; name: string; is_active: boolean }> = await r.json();
    setWorksites(data.filter((w) => w.is_active).map((w) => ({ id: w.id, name: w.name })));
  }

  async function load() {
    setError(null);
    const r = await fetch('/api/masonry-prices', { cache: 'no-store' });
    if (!r.ok) {
      setError('목록을 불러오지 못했습니다');
      setList([]);
      return;
    }
    setList(await r.json());
  }

  useEffect(() => {
    loadWorksites();
    load();
  }, []);

  async function handleAdd(input: MasonryPriceInput) {
    const r = await fetch('/api/masonry-prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '추가 실패');
    setShowAdd(false);
    load();
  }

  async function handleEdit(input: MasonryPriceInput) {
    if (!editing) return;
    const r = await fetch(`/api/masonry-prices/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '수정 실패');
    setEditing(null);
    load();
  }

  async function handleDelete(p: MasonryPrice) {
    const ws = p.yeseong_worksites?.name ?? '';
    const label = `${ws} · ${p.type_name}${p.size_spec ? ` (${p.size_spec})` : ''}`;
    if (!confirm(`"${label}" 단가를 삭제하시겠습니까?`)) return;
    const r = await fetch(`/api/masonry-prices/${p.id}`, { method: 'DELETE' });
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
            <h1 className="text-2xl font-bold tracking-tight">매사 단가</h1>
            <p className="text-sm text-[#6B7280] mt-1">현장별 벽돌 장당 단가 관리</p>
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            단가 추가
          </Button>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <label className="text-xs font-medium text-[#4B5563]">현장</label>
          <select
            value={filterWorksiteId}
            onChange={(e) => setFilterWorksiteId(e.target.value)}
            className="h-9 rounded-[5px] border border-[#D7D7D7] bg-white px-2.5 text-sm text-[#091413] focus:outline-none focus:ring-2 focus:ring-[#447D9B]"
          >
            <option value="">전체</option>
            {worksites.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <span className="ml-auto text-sm text-[#6B7280]">{filtered?.length ?? '...'}건</span>
        </div>

        {error && <p className="mb-4 rounded-[5px] bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F5F5F5] text-[#4B5563]">
                <tr className="text-left text-[11px]">
                  <th className="px-3 py-2 font-medium w-10">#</th>
                  <th className="px-3 py-2 font-medium">현장</th>
                  <th className="px-3 py-2 font-medium">벽돌</th>
                  <th className="px-3 py-2 font-medium">부위·규격</th>
                  <th className="px-3 py-2 font-medium text-right">단가 (원/장)</th>
                  <th className="px-3 py-2 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D7D7D7]">
                {filtered === null ? (
                  <tr><td colSpan={6} className="py-10 text-center text-[#9CA3AF]">불러오는 중...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-[#9CA3AF]">등록된 단가가 없습니다.</td></tr>
                ) : (
                  filtered.map((p, i) => (
                    <tr key={p.id} className="hover:bg-[#F5F5F5]">
                      <td className="px-3 py-2 text-[#6B7280] tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{p.yeseong_worksites?.name ?? '-'}</td>
                      <td className="px-3 py-2">{p.type_name}</td>
                      <td className="px-3 py-2 text-[#4B5563]">{p.size_spec ?? '-'}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {p.unit_price.toLocaleString()}원
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-0.5">
                          <button
                            className="rounded p-1 text-[#6B7280] hover:bg-[#F5F5F5] hover:text-[#091413]"
                            onClick={() => setEditing(p)}
                            aria-label="수정"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="rounded p-1 text-[#6B7280] hover:bg-red-50 hover:text-red-600"
                            onClick={() => handleDelete(p)}
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
        <MasonryPriceForm
          title="단가 추가"
          worksites={worksites}
          onSubmit={handleAdd}
          onCancel={() => setShowAdd(false)}
        />
      )}
      {editing && (
        <MasonryPriceForm
          title={`${editing.yeseong_worksites?.name ?? ''} · ${editing.type_name} 수정`}
          worksites={worksites}
          initial={editing}
          onSubmit={handleEdit}
          onCancel={() => setEditing(null)}
        />
      )}
    </AdminShell>
  );
}
