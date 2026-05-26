'use client';
import { useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MasonryPriceForm, type MasonryPrice, type MasonryPriceInput, type Worksite } from '@/components/masonry-price-form';
import { MASONRY_CATEGORIES, categoryTypes, type MasonryCategory } from '@/lib/constants/masonry';
import { Plus, Pencil, Trash2 } from 'lucide-react';

export default function MasonryPricesPage() {
  const [category, setCategory] = useState<MasonryCategory>('조적');
  const [list, setList] = useState<MasonryPrice[] | null>(null);
  const [worksites, setWorksites] = useState<Worksite[]>([]);
  const [filterWorksiteId, setFilterWorksiteId] = useState<string>('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<MasonryPrice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isBrick = category === '조적';
  const hasTypes = categoryTypes(category) != null; // 미장: 종류+단위

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

  async function load(cat: MasonryCategory) {
    setError(null);
    setList(null);
    const r = await fetch(`/api/masonry-prices?category=${encodeURIComponent(cat)}`, { cache: 'no-store' });
    if (!r.ok) {
      setError('목록을 불러오지 못했습니다');
      setList([]);
      return;
    }
    setList(await r.json());
  }

  useEffect(() => {
    loadWorksites();
  }, []);

  useEffect(() => {
    load(category);
  }, [category]);

  async function handleAdd(input: MasonryPriceInput) {
    const r = await fetch('/api/masonry-prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '추가 실패');
    setShowAdd(false);
    load(category);
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
    load(category);
  }

  async function handleDelete(p: MasonryPrice) {
    const ws = p.yeseong_worksites?.name ?? '';
    const label = isBrick
      ? `${ws} · ${p.type_name}${p.size_spec ? ` (${p.size_spec})` : ''}`
      : hasTypes
      ? `${ws} · ${category} ${p.type_name} (${p.unit})`
      : `${ws} · ${category} (${p.unit})`;
    if (!confirm(`"${label}" 단가를 삭제하시겠습니까?`)) return;
    const r = await fetch(`/api/masonry-prices/${p.id}`, { method: 'DELETE' });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? '삭제 실패');
      return;
    }
    load(category);
  }

  const headerCols = isBrick || hasTypes ? 6 : 5;

  return (
    <AdminShell>
      <div className="max-w-[960px] p-6">
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">매사 단가</h1>
            <p className="text-sm text-[#6B7280] mt-1">
              {isBrick ? '현장별 조적 장당 단가 관리' : `현장별 ${category} 단위별 단가 관리`}
            </p>
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            단가 추가
          </Button>
        </div>

        <div className="mb-4 flex items-center gap-1 border-b border-[#D7D7D7]">
          {MASONRY_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => {
                setCategory(c);
                setFilterWorksiteId('');
              }}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                category === c
                  ? 'border-[#447D9B] text-[#091413]'
                  : 'border-transparent text-[#6B7280] hover:text-[#091413]'
              }`}
            >
              {c}
            </button>
          ))}
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
            <table className="w-full text-[11px]">
              <thead className="bg-[#F5F5F5] text-[#4B5563]">
                <tr className="text-left text-[11px]">
                  <th className="px-3 py-2 font-medium w-10">#</th>
                  <th className="px-3 py-2 font-medium">현장</th>
                  {isBrick ? (
                    <>
                      <th className="px-3 py-2 font-medium">종류</th>
                      <th className="px-3 py-2 font-medium">규격</th>
                    </>
                  ) : hasTypes ? (
                    <>
                      <th className="px-3 py-2 font-medium">종류</th>
                      <th className="px-3 py-2 font-medium">단위</th>
                    </>
                  ) : (
                    <th className="px-3 py-2 font-medium">단위</th>
                  )}
                  <th className="px-3 py-2 font-medium text-right">단가</th>
                  <th className="px-3 py-2 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D7D7D7]">
                {filtered === null ? (
                  <tr><td colSpan={headerCols} className="py-10 text-center text-[#9CA3AF]">불러오는 중...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={headerCols} className="py-10 text-center text-[#9CA3AF]">등록된 단가가 없습니다.</td></tr>
                ) : (
                  filtered.map((p, i) => (
                    <tr key={p.id} className="hover:bg-[#F5F5F5]">
                      <td className="px-3 py-2 text-[#6B7280] tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{p.yeseong_worksites?.name ?? '-'}</td>
                      {isBrick ? (
                        <>
                          <td className="px-3 py-2">{p.type_name}</td>
                          <td className="px-3 py-2 text-[#4B5563]">{p.size_spec ?? '-'}</td>
                        </>
                      ) : hasTypes ? (
                        <>
                          <td className="px-3 py-2">{p.type_name}</td>
                          <td className="px-3 py-2 text-[#4B5563]">{p.unit}</td>
                        </>
                      ) : (
                        <td className="px-3 py-2">{p.unit}</td>
                      )}
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {p.unit_price.toLocaleString()}원/{p.unit}
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
          category={category}
          title={`${category} 단가 추가`}
          worksites={worksites}
          onSubmit={handleAdd}
          onCancel={() => setShowAdd(false)}
        />
      )}
      {editing && (
        <MasonryPriceForm
          category={category}
          title={
            isBrick
              ? `${editing.yeseong_worksites?.name ?? ''} · ${editing.type_name} 수정`
              : hasTypes
              ? `${editing.yeseong_worksites?.name ?? ''} · ${category} ${editing.type_name} (${editing.unit}) 수정`
              : `${editing.yeseong_worksites?.name ?? ''} · ${category} (${editing.unit}) 수정`
          }
          worksites={worksites}
          initial={editing}
          onSubmit={handleEdit}
          onCancel={() => setEditing(null)}
        />
      )}
    </AdminShell>
  );
}
