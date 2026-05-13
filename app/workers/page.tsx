'use client';
import { useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WorkerForm, type Worker, type WorkerInput } from '@/components/worker-form';
import { maskFromParts } from '@/lib/crypto/rrn';
import { Search, UserPlus, Pencil, Trash2, X } from 'lucide-react';

function formatRrn(plain: string | null, prefix: string | null, gender: string | null): string {
  if (plain) {
    const d = plain.replace(/\D/g, '');
    if (d.length === 13) return `${d.slice(0, 6)}-${d.slice(6)}`;
    return plain;
  }
  return prefix && gender ? maskFromParts(prefix, gender) : '-';
}

export default function WorkersPage() {
  const [list, setList] = useState<Worker[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Worker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!list) return null;
    const raw = query.trim();
    if (!raw) return list;
    const lower = raw.toLowerCase();
    const digits = raw.replace(/\D/g, '');
    return list.filter((w) => {
      // 이름 부분일치 (한글·영문·국어)
      if (w.name?.toLowerCase().includes(lower)) return true;
      if (w.name_english?.toLowerCase().includes(lower)) return true;
      // 숫자 입력 시 전번/주민번호
      if (digits.length > 0) {
        const phone = (w.phone ?? '').replace(/\D/g, '');
        if (phone && phone.includes(digits)) return true;
        const rrn = (w.rrn_plain ?? '').replace(/\D/g, '');
        if (rrn && rrn.includes(digits)) return true;
        if (w.rrn_prefix && w.rrn_prefix.includes(digits)) return true;
      }
      return false;
    });
  }, [list, query]);

  async function load() {
    setError(null);
    const r = await fetch('/api/workers', { cache: 'no-store' });
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

  async function handleAdd(input: WorkerInput) {
    const r = await fetch('/api/workers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '추가 실패');
    setShowAdd(false);
    load();
  }

  async function handleEdit(input: WorkerInput) {
    if (!editing) return;
    // PATCH는 RRN 제외
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { rrn, ...patchable } = input;
    const r = await fetch(`/api/workers/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchable),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '수정 실패');
    setEditing(null);
    load();
  }

  async function handleDelete(w: Worker) {
    if (!confirm(`"${w.name}" 작업자를 삭제할까요?\n(노임대장에 이미 등록된 작업자라면 비활성화만 가능)`)) return;
    const r = await fetch(`/api/workers/${w.id}`, { method: 'DELETE' });
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
            <h1 className="text-2xl font-bold tracking-tight">작업자 마스터</h1>
            <p className="text-sm text-zinc-500 mt-1">
              총 {list?.length ?? '...'}명{query && filtered ? ` · 검색결과 ${filtered.length}명` : ''}. 주민번호 평문 표시 (관리자 전용).
            </p>
          </div>
          <Button onClick={() => setShowAdd(true)}>
            <UserPlus className="h-4 w-4" />
            작업자 추가
          </Button>
        </div>

        <div className="mb-4 relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 · 전화번호 · 주민번호로 검색"
            className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="검색어 지우기"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {error && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr className="text-left text-[11px]">
                  <th className="px-3 py-2 font-medium w-10">#</th>
                  <th className="px-3 py-2 font-medium">사번</th>
                  <th className="px-3 py-2 font-medium">성명</th>
                  <th className="px-3 py-2 font-medium">공종/등급</th>
                  <th className="px-3 py-2 font-medium">주민번호</th>
                  <th className="px-3 py-2 font-medium">은행</th>
                  <th className="px-3 py-2 font-medium">계좌</th>
                  <th className="px-3 py-2 font-medium">연락처</th>
                  <th className="px-3 py-2 font-medium text-center">PIN</th>
                  <th className="px-3 py-2 font-medium text-right">기본일당</th>
                  <th className="px-3 py-2 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered === null ? (
                  <tr><td colSpan={11} className="py-10 text-center text-zinc-400">불러오는 중...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={11} className="py-10 text-center text-zinc-400">
                    {query ? '검색 결과가 없습니다.' : '등록된 작업자가 없습니다.'}
                  </td></tr>
                ) : (
                  filtered.map((w, i) => (
                    <tr key={w.id} className={`hover:bg-zinc-50 ${!w.is_active ? 'text-zinc-400' : ''}`}>
                      <td className="px-3 py-2 text-zinc-500 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 font-mono text-zinc-600">{w.employee_code ?? '-'}</td>
                      <td className="px-3 py-2 font-medium">
                        {w.name}
                        {w.name_english && <span className="ml-1 text-[10px] text-zinc-400">({w.name_english})</span>}
                      </td>
                      <td className="px-3 py-2">
                        {w.default_trade && (
                          <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px]">{w.default_trade}</span>
                        )}
                        {w.skill_grade && (
                          <span className="ml-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">{w.skill_grade}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-zinc-700">
                        {formatRrn(w.rrn_plain, w.rrn_prefix, w.rrn_gender_digit)}
                        {w.is_foreign && <span className="ml-1 rounded bg-amber-50 px-1 py-0.5 text-[9px] text-amber-700">외</span>}
                      </td>
                      <td className="px-3 py-2">{w.bank_name ?? '-'}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-zinc-600">{w.account_number ?? '-'}</td>
                      <td className="px-3 py-2 font-mono text-[11px]">{w.phone ?? '-'}</td>
                      <td className="px-3 py-2 text-center font-mono tabular-nums">
                        {w.pin ? <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-white text-[11px]">{w.pin}</span> : <span className="text-zinc-300">-</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {w.default_wage ? `${w.default_wage.toLocaleString()}원` : <span className="text-zinc-400">-</span>}
                      </td>
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
        <WorkerForm
          title="작업자 추가"
          onSubmit={handleAdd}
          onCancel={() => setShowAdd(false)}
        />
      )}
      {editing && (
        <WorkerForm
          title={`${editing.name} 수정`}
          initial={editing}
          onSubmit={handleEdit}
          onCancel={() => setEditing(null)}
        />
      )}
    </AdminShell>
  );
}
