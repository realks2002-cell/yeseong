'use client';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Store, Plus, Pencil, Trash2, X } from 'lucide-react';

type Vendor = {
  id: string;
  name: string;
  business_number: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  address: string | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
};

type VendorInput = {
  name: string;
  business_number: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  address: string | null;
  note: string | null;
};

export default function VendorsPage() {
  const [list, setList] = useState<Vendor[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const r = await fetch('/api/vendors', { cache: 'no-store' });
    if (!r.ok) { setError('목록을 불러오지 못했습니다'); setList([]); return; }
    setList(await r.json());
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(input: VendorInput) {
    const r = await fetch('/api/vendors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '추가 실패');
    setShowAdd(false); load();
  }

  async function handleEdit(input: VendorInput) {
    if (!editing) return;
    const r = await fetch(`/api/vendors/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '수정 실패');
    setEditing(null); load();
  }

  async function handleDelete(v: Vendor) {
    if (!confirm(`"${v.name}" 거래처를 삭제하시겠습니까?`)) return;
    const r = await fetch(`/api/vendors/${v.id}`, { method: 'DELETE' });
    if (!r.ok) { alert((await r.json().catch(() => ({}))).error ?? '삭제 실패'); return; }
    load();
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">거래처</h1>
            <p className="text-sm text-[#6B7280] mt-1">총 {list?.length ?? '...'}개 거래처</p>
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            거래처 추가
          </Button>
        </div>

        {error && <p className="mb-4 rounded-[5px] bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-[#F5F5F5] text-[#4B5563]">
                <tr className="text-left text-[11px]">
                  <th className="px-3 py-2 font-medium w-10">#</th>
                  <th className="px-3 py-2 font-medium">거래처명</th>
                  <th className="px-3 py-2 font-medium">사업자번호</th>
                  <th className="px-3 py-2 font-medium">담당자</th>
                  <th className="px-3 py-2 font-medium">연락처</th>
                  <th className="px-3 py-2 font-medium">주소</th>
                  <th className="px-3 py-2 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D7D7D7]">
                {list === null ? (
                  <tr><td colSpan={7} className="py-10 text-center text-[#9CA3AF]">불러오는 중...</td></tr>
                ) : list.length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center text-[#9CA3AF]">등록된 거래처가 없습니다.</td></tr>
                ) : (
                  list.map((v, i) => (
                    <tr key={v.id} className="hover:bg-[#F5F5F5]">
                      <td className="px-3 py-2 text-[#6B7280] tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{v.name}</td>
                      <td className="px-3 py-2 font-mono text-[#4B5563]">{v.business_number ?? '-'}</td>
                      <td className="px-3 py-2">{v.contact_name ?? '-'}</td>
                      <td className="px-3 py-2 font-mono text-[11px]">{v.contact_phone ?? '-'}</td>
                      <td className="px-3 py-2 text-[#4B5563] max-w-[200px] truncate">{v.address ?? '-'}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-0.5">
                          <button className="rounded p-1 text-[#6B7280] hover:bg-[#F5F5F5] hover:text-[#091413]" onClick={() => setEditing(v)} aria-label="수정"><Pencil className="h-3.5 w-3.5" /></button>
                          <button className="rounded p-1 text-[#6B7280] hover:bg-red-50 hover:text-red-600" onClick={() => handleDelete(v)} aria-label="삭제"><Trash2 className="h-3.5 w-3.5" /></button>
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

      {showAdd && <VendorForm title="거래처 추가" onSubmit={handleAdd} onCancel={() => setShowAdd(false)} />}
      {editing && <VendorForm title={`${editing.name} 수정`} initial={editing} onSubmit={handleEdit} onCancel={() => setEditing(null)} />}
    </AdminShell>
  );
}

function VendorForm({ title, initial, onSubmit, onCancel }: { title: string; initial?: Vendor; onSubmit: (i: VendorInput) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [bizNum, setBizNum] = useState(initial?.business_number ?? '');
  const [cName, setCName] = useState(initial?.contact_name ?? '');
  const [cPhone, setCPhone] = useState(initial?.contact_phone ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr('거래처명을 입력하세요');
    setLoading(true);
    try {
      const nullable = (s: string) => s.trim() || null;
      await onSubmit({ name: name.trim(), business_number: nullable(bizNum), contact_name: nullable(cName), contact_phone: nullable(cPhone), address: nullable(address), note: nullable(note) });
    } catch (e) { setErr(e instanceof Error ? e.message : '저장 실패'); } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-[5px] bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#D7D7D7] px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onCancel} className="rounded p-1 text-[#9CA3AF] hover:bg-[#F5F5F5]"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 p-5">
          <div className="col-span-2 space-y-1.5"><label className="text-sm font-medium">거래처명 *</label><Input value={name} onChange={(e) => setName(e.target.value)} disabled={loading} autoFocus /></div>
          <div className="space-y-1.5"><label className="text-sm font-medium">사업자번호</label><Input value={bizNum} onChange={(e) => setBizNum(e.target.value)} placeholder="000-00-00000" disabled={loading} className="font-mono" /></div>
          <div className="space-y-1.5"><label className="text-sm font-medium">담당자</label><Input value={cName} onChange={(e) => setCName(e.target.value)} disabled={loading} /></div>
          <div className="space-y-1.5"><label className="text-sm font-medium">연락처</label><Input value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="010-0000-0000" disabled={loading} className="font-mono" /></div>
          <div className="space-y-1.5"><label className="text-sm font-medium">주소</label><Input value={address} onChange={(e) => setAddress(e.target.value)} disabled={loading} /></div>
          <div className="col-span-2 space-y-1.5"><label className="text-sm font-medium">비고</label><Input value={note} onChange={(e) => setNote(e.target.value)} disabled={loading} /></div>
          {err && <p className="col-span-2 text-sm text-red-600">{err}</p>}
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>취소</Button>
            <Button type="submit" disabled={loading}>{loading ? '저장 중...' : '저장'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
