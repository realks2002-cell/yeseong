'use client';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WorksiteForm, type Worksite, type WorksiteInput, type Option } from '@/components/worksite-form';
import { WorksiteGpsModal } from '@/components/worksite-gps-modal';
import { Building2, MapPin, Pencil, Trash2 } from 'lucide-react';

export default function WorksitesPage() {
  const [list, setList] = useState<Worksite[] | null>(null);
  const [clients, setClients] = useState<Option[]>([]);
  const [subcontractors, setSubcontractors] = useState<Option[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Worksite | null>(null);
  const [gpsTarget, setGpsTarget] = useState<Worksite | null>(null);
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

  function fmtGpsDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

const inlineSelectCls =
    'w-full max-w-[160px] cursor-pointer rounded bg-transparent px-2 py-1 text-[11px] text-[#091413] outline-none hover:bg-[#F5F5F5] focus:bg-[#F5F5F5] focus:ring-1 focus:ring-[#447D9B]';

  return (
    <AdminShell>
      <div className="max-w-7xl p-6">
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">현장 마스터</h1>
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
            <table className="w-full text-[11px] [&_th]:border-r [&_th]:border-r-[#EAEAEA] [&_td]:border-r [&_td]:border-r-[#EAEAEA] [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
              <thead className="bg-[#F5F5F5] text-[#4B5563]">
                <tr className="text-center text-[11px]">
                  <th className="px-3 py-2 font-medium w-10">#</th>
                  <th className="px-3 py-2 font-medium">현장명</th>
                  <th className="px-3 py-2 font-medium">원청사</th>
                  <th className="px-3 py-2 font-medium">전문건설사</th>
                  <th className="px-3 py-2 font-medium">주소</th>
                  <th className="px-3 py-2 font-medium text-center">GPS</th>
                  <th className="px-3 py-2 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D7D7D7]">
                {list === null ? (
                  <tr><td colSpan={7} className="py-10 text-center text-[#9CA3AF]">불러오는 중...</td></tr>
                ) : list.length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center text-[#9CA3AF]">등록된 현장이 없습니다.</td></tr>
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
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => setGpsTarget(w)}
                          className={`inline-flex items-center gap-1 rounded-[5px] px-2 py-1 text-[10px] font-semibold ${
                            w.latitude
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-[#F5F5F5] text-[#9CA3AF] hover:bg-[#EAEAEA] hover:text-[#6B7280]'
                          }`}
                          title={w.latitude
                            ? `${w.latitude.toFixed(5)}, ${w.longitude!.toFixed(5)} (반경 ${w.geofence_radius}m)${w.gps_registered_at ? ` — 등록 ${fmtGpsDate(w.gps_registered_at)}` : ''}`
                            : '좌표 미등록'}
                        >
                          <MapPin className="h-3 w-3" />
                          {w.latitude
                            ? <span className="font-mono tabular-nums">{w.latitude.toFixed(5)}, {w.longitude!.toFixed(5)}</span>
                            : '미등록'}
                        </button>
                      </td>
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
      {gpsTarget && (
        <WorksiteGpsModal
          worksiteId={gpsTarget.id}
          worksiteName={gpsTarget.name}
          address={gpsTarget.address}
          initialLat={gpsTarget.latitude}
          initialLng={gpsTarget.longitude}
          initialRadius={gpsTarget.geofence_radius}
          onSave={async (lat, lng, radius) => {
            const r = await fetch(`/api/worksites/${gpsTarget.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ latitude: lat, longitude: lng, geofence_radius: radius }),
            });
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '저장 실패');
            setGpsTarget(null);
            load();
          }}
          onClear={async () => {
            const r = await fetch(`/api/worksites/${gpsTarget.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ latitude: null }),
            });
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '삭제 실패');
            setGpsTarget(null);
            load();
          }}
          onClose={() => setGpsTarget(null)}
        />
      )}
    </AdminShell>
  );
}
