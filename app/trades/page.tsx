'use client';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Pencil, Trash2, X } from 'lucide-react';

type Trade = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};
type TradeInput = { name: string; sort_order: number };

export default function TradesPage() {
  const [list, setList] = useState<Trade[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Trade | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const r = await fetch('/api/trades', { cache: 'no-store' });
    if (!r.ok) { setError('목록을 불러오지 못했습니다'); setList([]); return; }
    setList(await r.json());
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(input: TradeInput) {
    const r = await fetch('/api/trades', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '추가 실패');
    setShowAdd(false); load();
  }

  async function handleEdit(input: TradeInput) {
    if (!editing) return;
    const r = await fetch(`/api/trades/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '수정 실패');
    setEditing(null); load();
  }

  async function handleDelete(t: Trade) {
    if (!confirm(`"${t.name}" 직종을 삭제하시겠습니까?\n기존 작업자에 입력된 값은 그대로 유지됩니다.`)) return;
    const r = await fetch(`/api/trades/${t.id}`, { method: 'DELETE' });
    if (!r.ok) { alert((await r.json().catch(() => ({}))).error ?? '삭제 실패'); return; }
    load();
  }

  return (
    <AdminShell>
      <div className="max-w-3xl p-6">
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">직종 마스터</h1>
            <p className="text-sm text-[#6B7280] mt-1">
              총 {list?.length ?? '...'}개 · 작업자 추가/수정 시 직종 드롭다운의 기준 목록
            </p>
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            직종 추가
          </Button>
        </div>

        {error && <p className="mb-4 rounded-[5px] bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] whitespace-nowrap [&_th]:border-r [&_th]:border-r-[#EAEAEA] [&_td]:border-r [&_td]:border-r-[#EAEAEA] [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
              <thead className="bg-[#F5F5F5] text-[#4B5563]">
                <tr className="text-center text-[11px]">
                  <th className="px-4 py-2 font-medium w-20">순서</th>
                  <th className="px-4 py-2 font-medium">직종명</th>
                  <th className="px-4 py-2 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D7D7D7]">
                {list === null ? (
                  <tr><td colSpan={3} className="py-10 text-center text-[#9CA3AF]">불러오는 중...</td></tr>
                ) : list.length === 0 ? (
                  <tr><td colSpan={3} className="py-10 text-center text-[#9CA3AF]">등록된 직종이 없습니다.</td></tr>
                ) : (
                  list.map((t) => (
                    <tr key={t.id} className="hover:bg-[#F5F5F5]">
                      <td className="px-4 py-2 text-[#6B7280] tabular-nums">{t.sort_order}</td>
                      <td className="px-4 py-2 font-medium">{t.name}</td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-0.5">
                          <button className="rounded p-1 text-[#6B7280] hover:bg-[#F5F5F5] hover:text-[#091413]" onClick={() => setEditing(t)} aria-label="수정"><Pencil className="h-3.5 w-3.5" /></button>
                          <button className="rounded p-1 text-[#6B7280] hover:bg-red-50 hover:text-red-600" onClick={() => handleDelete(t)} aria-label="삭제"><Trash2 className="h-3.5 w-3.5" /></button>
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
        <TradeForm
          title="직종 추가"
          defaultSortOrder={(list?.reduce((m, t) => Math.max(m, t.sort_order), 0) ?? 0) + 1}
          onSubmit={handleAdd}
          onCancel={() => setShowAdd(false)}
        />
      )}
      {editing && (
        <TradeForm title={`${editing.name} 수정`} initial={editing} onSubmit={handleEdit} onCancel={() => setEditing(null)} />
      )}
    </AdminShell>
  );
}

function TradeForm({ title, initial, defaultSortOrder, onSubmit, onCancel }: {
  title: string; initial?: Trade; defaultSortOrder?: number;
  onSubmit: (i: TradeInput) => Promise<void>; onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [sortOrder, setSortOrder] = useState<number>(initial?.sort_order ?? defaultSortOrder ?? 0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr('직종명을 입력하세요');
    setLoading(true);
    try {
      await onSubmit({ name: name.trim(), sort_order: sortOrder });
    } catch (e) { setErr(e instanceof Error ? e.message : '저장 실패'); } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-[5px] bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#D7D7D7] px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onCancel} className="rounded p-1 text-[#9CA3AF] hover:bg-[#F5F5F5]"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-3 gap-4 p-5">
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium">직종명 *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 미장공" disabled={loading} autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">순서</label>
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} min={0} className="text-right tabular-nums" disabled={loading} />
          </div>
          {err && <p className="col-span-3 text-sm text-red-600">{err}</p>}
          <div className="col-span-3 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>취소</Button>
            <Button type="submit" disabled={loading}>{loading ? '저장 중...' : '저장'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
