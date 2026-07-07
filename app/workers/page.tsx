'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WorkerForm, type Worker, type WorkerInput, type TeamLeaderOption } from '@/components/worker-form';
import { WorkerDocumentsModal, type DocSubject } from '@/components/worker-documents-modal';
import { formatRrnDisplay } from '@/lib/crypto/rrn';
import { formatPhone } from '@/lib/auth/phone-email';
import { Search, UserPlus, Pencil, Trash2, X, Download, RotateCcw, ListFilter } from 'lucide-react';

// ── 컬럼 필터 정의: 지정 7개 컬럼에 엑셀식 값 필터 ─────────────
const FILTER_COLS = [
  { key: 'name', label: '성명' },
  { key: 'leader', label: '팀장' },
  { key: 'grade', label: '구분' },
  { key: 'trade', label: '직종' },
  { key: 'app', label: '앱' },
  { key: 'defaultWage', label: '기본일당' },
  { key: 'wageType', label: '급여형태' },
] as const;

// 각 컬럼에서 필터/그룹 기준이 되는 원시 값(테이블 표시 규칙과 일치)
function colValue(key: string, w: Worker): string {
  switch (key) {
    case 'name': return w.name ?? '';
    case 'leader': return w.skill_grade === '팀장' ? '팀장' : (w.team_leader_name ?? '없음');
    case 'grade': return w.skill_grade ?? '미설정';
    case 'trade': return w.default_trade ?? '미설정';
    case 'app': return w.auth_user_id ? '가입' : '미가입';
    case 'defaultWage': return w.default_wage ? String(w.default_wage) : '미설정';
    case 'wageType': return w.wage_type ?? '미설정';
    default: return '';
  }
}

function colDisplay(key: string, v: string): string {
  if (key === 'defaultWage' && v !== '미설정') return `${Number(v).toLocaleString()}원`;
  return v;
}

function sortOptions(key: string, arr: string[]): string[] {
  return [...arr].sort((a, b) => {
    const aEmpty = a === '미설정' || a === '없음';
    const bEmpty = b === '미설정' || b === '없음';
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1; // 미설정/없음은 뒤로
    if (key === 'defaultWage' && !aEmpty && !bEmpty) return Number(a) - Number(b);
    return a.localeCompare(b, 'ko');
  });
}

function HeaderFilter({
  label, colKey, options, selected, onChange, isOpen, onOpen, onClose,
}: {
  label: string;
  colKey: string;
  options: string[];
  selected: ReadonlySet<string> | undefined;
  onChange: (s: Set<string> | undefined) => void;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [q, setQ] = useState('');
  const active = selected !== undefined;

  function handleOpen() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, top: r.bottom + 4 });
    setQ('');
    onOpen();
  }
  // undefined = 필터 없음(전부 표시). Set = 그 값만 통과(빈 Set이면 아무것도 안 보임).
  function toggle(o: string) {
    let next: Set<string> | undefined;
    if (selected === undefined) { next = new Set(options); next.delete(o); }
    else if (selected.has(o)) { next = new Set(selected); next.delete(o); }
    else { next = new Set(selected); next.add(o); }
    if (next && next.size === options.length) next = undefined; // 전부 선택 = 필터 없음
    onChange(next);
  }
  const shown = q ? options.filter((o) => colDisplay(colKey, o).toLowerCase().includes(q.toLowerCase())) : options;

  return (
    <div className="inline-flex items-center justify-center gap-1">
      <span>{label}</span>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (isOpen ? onClose() : handleOpen())}
        className={'rounded p-0.5 transition ' + (active ? 'text-[#447D9B]' : 'text-[#B0B0B0] hover:text-[#6B7280]')}
        aria-label={`${label} 필터`}
      >
        <ListFilter className="h-3 w-3" />
      </button>
      {isOpen && pos && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <div
            className="fixed z-50 w-52 rounded-[5px] border border-[#D7D7D7] bg-white p-1.5 text-left shadow-lg"
            style={{ left: Math.max(8, Math.min(pos.left, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 220)), top: pos.top }}
          >
            {options.length >= 8 && (
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="검색"
                className="mb-1 h-7 w-full rounded-[5px] border border-[#D7D7D7] px-2 text-[11px] font-normal outline-none focus:border-[#447D9B]"
              />
            )}
            <div className="mb-1 flex items-center justify-between px-1">
              <div className="flex gap-2">
                <button type="button" onClick={() => onChange(undefined)} className="text-[10px] text-[#447D9B] hover:underline">전체 선택</button>
                <button type="button" onClick={() => onChange(new Set())} className="text-[10px] text-[#6B7280] hover:underline">전체 해제</button>
              </div>
              {active && <span className="text-[10px] font-normal text-[#9CA3AF]">{selected?.size ?? 0}개</span>}
            </div>
            <div className="max-h-56 overflow-auto">
              {shown.length === 0 ? (
                <p className="px-1 py-2 text-center text-[10px] font-normal text-[#9CA3AF]">값 없음</p>
              ) : (
                shown.map((o) => {
                  const checked = selected === undefined || selected.has(o);
                  return (
                    <label key={o} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-[#F5F5F5]">
                      <input type="checkbox" checked={checked} onChange={() => toggle(o)} className="h-3.5 w-3.5 accent-[#447D9B]" />
                      <span className="truncate text-[11px] font-normal text-[#091413]">{colDisplay(colKey, o)}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function WorkersPage() {
  const [list, setList] = useState<Worker[] | null>(null);
  const [teamLeaders, setTeamLeaders] = useState<TeamLeaderOption[]>([]);
  const [trades, setTrades] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Worker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [colFilters, setColFilters] = useState<Record<string, Set<string>>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false); // 삭제(비활성) 작업자 보기
  const [downloading, setDownloading] = useState(false);
  const [savingLeaderId, setSavingLeaderId] = useState<string | null>(null);
  const [docsWorker, setDocsWorker] = useState<DocSubject | null>(null);

  const filtered = useMemo(() => {
    if (!list) return null;
    const raw = query.trim();
    const lower = raw.toLowerCase();
    const digits = raw.replace(/\D/g, '');
    return list.filter((w) => {
      // 컬럼 필터(선택된 값이 있으면 그 값만 통과)
      for (const c of FILTER_COLS) {
        const sel = colFilters[c.key];
        if (sel && !sel.has(colValue(c.key, w))) return false;
      }
      if (!raw) return true;
      if (w.name?.toLowerCase().includes(lower)) return true;
      if (w.name_english?.toLowerCase().includes(lower)) return true;
      if (digits.length > 0) {
        const phone = (w.phone ?? '').replace(/\D/g, '');
        if (phone && phone.includes(digits)) return true;
        const rrn = (w.rrn_plain ?? '').replace(/\D/g, '');
        if (rrn && rrn.includes(digits)) return true;
        if (w.rrn_prefix && w.rrn_prefix.includes(digits)) return true;
      }
      return false;
    });
  }, [list, query, colFilters]);

  // 각 컬럼의 고유값(필터 드롭다운 옵션) — 전체 목록 기준
  const facets = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const c of FILTER_COLS) {
      const s = new Set<string>();
      (list ?? []).forEach((w) => s.add(colValue(c.key, w)));
      out[c.key] = sortOptions(c.key, [...s]);
    }
    return out;
  }, [list]);

  const activeColCount = FILTER_COLS.filter((c) => colFilters[c.key] !== undefined).length;

  const fCol = (key: string, label: string) => (
    <HeaderFilter
      label={label}
      colKey={key}
      options={facets[key] ?? []}
      selected={colFilters[key]}
      onChange={(s) => setColFilters((p) => {
        if (s === undefined) { const n = { ...p }; delete n[key]; return n; }
        return { ...p, [key]: s };
      })}
      isOpen={openFilter === key}
      onOpen={() => setOpenFilter(key)}
      onClose={() => setOpenFilter(null)}
    />
  );

  async function load() {
    setError(null);
    const [wr, mr, tr] = await Promise.all([
      fetch(`/api/workers${showInactive ? '?status=inactive' : ''}`, { cache: 'no-store' }),
      fetch('/api/managers', { cache: 'no-store' }),
      fetch('/api/trades', { cache: 'no-store' }),
    ]);
    if (!wr.ok) {
      setError('목록을 불러오지 못했습니다');
      setList([]);
      return;
    }
    setList(await wr.json());
    if (tr.ok) {
      const ts = await tr.json();
      setTrades((Array.isArray(ts) ? ts : []).map((t: { name: string }) => t.name));
    }
    if (mr.ok) {
      const mgrs = await mr.json();
      setTeamLeaders(
        (Array.isArray(mgrs) ? mgrs : []).map((m: { id: string; name: string; phone: string | null }) => ({
          id: m.id, name: m.name, phone: m.phone,
        })),
      );
    }
  }

  useEffect(() => {
    setList(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

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
    const r = await fetch(`/api/workers/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '수정 실패');
    setEditing(null);
    load();
  }

  async function handleDelete(w: Worker) {
    if (!confirm(`"${w.name}" 작업자를 삭제하시겠습니까?`)) return;
    const r = await fetch(`/api/workers/${w.id}`, { method: 'DELETE' });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? '삭제 실패');
      return;
    }
    load();
  }

  async function handleReactivate(w: Worker) {
    if (!confirm(`"${w.name}" 작업자를 다시 활성화하시겠습니까?`)) return;
    const r = await fetch(`/api/workers/${w.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: true }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? '활성화 실패');
      return;
    }
    load();
  }

  // 테이블에서 팀장 직접 변경 — 낙관적 업데이트 후 PATCH, 실패 시 롤백
  async function handleLeaderChange(w: Worker, leaderId: string | null) {
    if (leaderId === (w.team_leader_id ?? null)) return;
    const prevId = w.team_leader_id ?? null;
    const prevName = w.team_leader_name ?? null;
    const newName = leaderId ? teamLeaders.find((t) => t.id === leaderId)?.name ?? prevName : null;
    setSavingLeaderId(w.id);
    setList((l) => l?.map((x) => (x.id === w.id ? { ...x, team_leader_id: leaderId, team_leader_name: newName } : x)) ?? null);
    const r = await fetch(`/api/workers/${w.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_leader_id: leaderId }),
    });
    setSavingLeaderId(null);
    if (!r.ok) {
      setList((l) => l?.map((x) => (x.id === w.id ? { ...x, team_leader_id: prevId, team_leader_name: prevName } : x)) ?? null);
      alert((await r.json().catch(() => ({}))).error ?? '팀장 변경 실패');
    }
  }

  return (
    <AdminShell>
      <div className="flex h-svh w-full flex-col p-6">
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">작업자 마스터</h1>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowAdd(true)}>
              <UserPlus className="h-4 w-4" />
              작업자 추가
            </Button>
            <Button
              variant="outline"
              disabled={downloading || !list?.length}
              onClick={async () => {
                setDownloading(true);
                try {
                  const res = await fetch('/api/workers/download');
                  if (!res.ok) throw new Error('다운로드 실패');
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  const cd = res.headers.get('Content-Disposition') ?? '';
                  const match = cd.match(/filename\*=UTF-8''(.+)/);
                  a.download = match ? decodeURIComponent(match[1]) : '작업자마스터.xlsx';
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                } catch {
                  alert('엑셀 다운로드에 실패했습니다');
                } finally {
                  setDownloading(false);
                }
              }}
            >
              <Download className="h-4 w-4" />
              {downloading ? '생성 중...' : '엑셀 다운로드'}
            </Button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative max-w-sm flex-1 min-w-[192px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 · 전화번호 · 주민번호로 검색"
              className="h-8 w-full rounded-[5px] border border-[#D7D7D7] bg-white pl-8 pr-8 text-xs outline-none focus:border-[#447D9B] focus:ring-2 focus:ring-[#447D9B]/20"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[#9CA3AF] hover:bg-[#F5F5F5] hover:text-[#091413]"
                aria-label="검색어 지우기"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {activeColCount > 0 && (
            <button
              type="button"
              onClick={() => { setColFilters({}); setOpenFilter(null); }}
              className="inline-flex items-center gap-1 rounded-[5px] border border-[#D7D7D7] bg-white px-2 py-1 text-xs text-[#6B7280] hover:bg-[#F5F5F5] hover:text-[#091413]"
              aria-label="컬럼 필터 초기화"
            >
              <X className="h-3 w-3" />
              필터 초기화 ({activeColCount})
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowInactive((v) => !v)}
            className={
              'ml-auto inline-flex items-center gap-1.5 rounded-[5px] border px-2.5 py-1.5 text-xs font-medium transition ' +
              (showInactive
                ? 'border-[#447D9B] bg-[#447D9B] text-white'
                : 'border-[#D7D7D7] bg-white text-[#6B7280] hover:bg-[#F5F5F5] hover:text-[#091413]')
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
            {showInactive ? '활성 작업자 보기' : '삭제된 작업자 보기'}
          </button>
        </div>

        {error && <p className="mb-4 rounded-[5px] bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <div className="flex-1 overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-[11px] whitespace-nowrap [&_th]:border-r [&_th]:border-r-[#EAEAEA] [&_td]:border-r [&_td]:border-r-[#EAEAEA] [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
              <thead className="sticky top-0 z-10 bg-[#F5F5F5] text-[#6B7280]">
                <tr className="text-center">
                  <th className="w-10 border-b border-[#D7D7D7] px-3 py-2.5 font-medium">#</th>
                  <th className="border-b border-[#D7D7D7] px-3 py-2.5 font-medium">{fCol('name', '성명')}</th>
                  <th className="border-b border-[#D7D7D7] px-3 py-2.5 font-medium">{fCol('leader', '팀장')}</th>
                  <th className="border-b border-[#D7D7D7] px-3 py-2.5 font-medium">{fCol('grade', '구분')}</th>
                  <th className="border-b border-[#D7D7D7] px-3 py-2.5 font-medium">{fCol('trade', '직종')}</th>
                  <th className="border-b border-[#D7D7D7] px-3 py-2.5 font-medium">연락처</th>
                  <th className="border-b border-[#D7D7D7] px-3 py-2.5 font-medium">주민번호</th>
                  <th className="border-b border-[#D7D7D7] px-3 py-2.5 font-medium">계좌</th>
                  <th className="border-b border-[#D7D7D7] px-3 py-2.5 font-medium">주소</th>
                  <th className="border-b border-[#D7D7D7] px-3 py-2.5 font-medium">{fCol('app', '앱')}</th>
                  <th className="border-b border-[#D7D7D7] px-3 py-2.5 font-medium">{fCol('defaultWage', '기본일당')}</th>
                  <th className="border-b border-[#D7D7D7] px-3 py-2.5 font-medium">{fCol('wageType', '급여형태')}</th>
                  <th className="w-20 border-b border-[#D7D7D7] px-3 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered === null ? (
                  <tr><td colSpan={13} className="py-12 text-center text-[#9CA3AF]">불러오는 중...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={13} className="py-12 text-center text-[#9CA3AF]">
                    {query ? '검색 결과가 없습니다.' : showInactive ? '삭제된 작업자가 없습니다.' : '등록된 작업자가 없습니다.'}
                  </td></tr>
                ) : (
                  filtered.map((w, i) => (
                    <tr key={w.id} className="group hover:bg-[#F5F5F5]">
                      <td className="border-b border-[#EAEAEA] px-3 py-2.5 text-center text-[#9CA3AF] tabular-nums">{i + 1}</td>
                      <td className="border-b border-[#EAEAEA] px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => setDocsWorker({ kind: 'worker', id: w.id, name: w.name })}
                          className="font-semibold text-[#091413] hover:underline focus:outline-none focus:underline"
                          title="서류 보기"
                        >
                          {w.name}
                        </button>
                        {w.name_english && <div className="text-[10px] text-[#9CA3AF]">{w.name_english}</div>}
                      </td>
                      <td className="border-b border-[#EAEAEA] px-3 py-2.5 text-center">
                        {w.skill_grade === '팀장' ? (
                          <span className="font-semibold text-emerald-600">팀장</span>
                        ) : (
                          <select
                            value={w.team_leader_id ?? ''}
                            disabled={savingLeaderId === w.id}
                            onChange={(e) => handleLeaderChange(w, e.target.value || null)}
                            aria-label="팀장 선택"
                            className="max-w-[110px] cursor-pointer rounded bg-transparent px-1.5 py-1 text-center text-[11px] text-[#091413] outline-none hover:bg-[#F5F5F5] focus:bg-[#F5F5F5] focus:ring-1 focus:ring-[#447D9B] disabled:opacity-50"
                          >
                            <option value="">없음</option>
                            {/* 현재 배정된 팀장이 활성 목록에 없으면 옵션에 살려서 유실 방지 */}
                            {w.team_leader_id && !teamLeaders.some((tl) => tl.id === w.team_leader_id) && (
                              <option value={w.team_leader_id}>{w.team_leader_name ?? '(현재 팀장)'}</option>
                            )}
                            {teamLeaders.map((tl) => (
                              <option key={tl.id} value={tl.id}>{tl.name}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="border-b border-[#EAEAEA] px-3 py-2.5 text-center text-[#4B5563]">{w.skill_grade ?? <span className="text-[#D7D7D7]">-</span>}</td>
                      <td className="border-b border-[#EAEAEA] px-3 py-2.5 text-center">
                        {w.default_trade ? (
                          trades.length > 0 && !trades.includes(w.default_trade) ? (
                            <span className="font-medium text-red-600" title="직종 마스터에 없는 비표준 값입니다. 수정에서 표준 직종으로 변경하세요.">
                              {w.default_trade}
                            </span>
                          ) : (
                            w.default_trade
                          )
                        ) : (
                          <span className="text-[#D7D7D7]">-</span>
                        )}
                      </td>
                      <td className="border-b border-[#EAEAEA] px-3 py-2.5 text-center font-mono text-[#4B5563]">{w.phone ? formatPhone(w.phone) : <span className="text-[#D7D7D7]">-</span>}</td>
                      <td className="border-b border-[#EAEAEA] px-3 py-2.5 text-center">
                        <span className="font-mono">{formatRrnDisplay(w.rrn_plain, w.rrn_prefix, w.rrn_gender_digit)}</span>
                      </td>
                      <td className="border-b border-[#EAEAEA] px-3 py-2.5">
                        {w.bank_name || w.account_number ? (
                          <div className="leading-tight">
                            <div className="font-mono text-[#091413]">
                              {w.bank_name && <span className="mr-1 text-[10px] text-[#6B7280]">{w.bank_name}</span>}
                              {w.account_number ?? ''}
                            </div>
                            {w.account_holder && <div className="text-[10px] text-[#9CA3AF]">{w.account_holder}</div>}
                          </div>
                        ) : <span className="text-[#D7D7D7]">-</span>}
                      </td>
                      <td className="max-w-[180px] border-b border-[#EAEAEA] px-3 py-2.5 align-top" title={w.address ?? undefined}>
                        {w.address ? (
                          <div className="line-clamp-2 whitespace-normal break-keep text-[10px] leading-tight text-[#4B5563]">
                            {w.address}
                          </div>
                        ) : <span className="text-[#D7D7D7]">-</span>}
                      </td>
                      <td className="border-b border-[#EAEAEA] px-3 py-2.5 text-center">
                        {w.auth_user_id ? (
                          <span className="font-semibold text-emerald-600" title="앱 가입 완료">가입</span>
                        ) : (
                          <span className="text-[#9CA3AF]" title="앱 미가입">미가입</span>
                        )}
                      </td>
                      <td className="border-b border-[#EAEAEA] px-3 py-2.5 text-center tabular-nums">
                        {w.default_wage ? (
                          <span><span className="font-medium text-[#091413]">{w.default_wage.toLocaleString()}</span><span className="ml-0.5 text-[10px] text-[#9CA3AF]">원</span></span>
                        ) : <span className="text-[#D7D7D7]">-</span>}
                      </td>
                      <td className="border-b border-[#EAEAEA] px-3 py-2.5 text-center">
                        {w.wage_type ? (
                          <span className={
                            w.wage_type === '월급/일급' ? 'font-medium text-blue-600'
                              : w.wage_type === '월급' ? 'font-medium text-red-600'
                                : 'text-[#091413]'
                          }>{w.wage_type}</span>
                        ) : <span className="text-[#D7D7D7]">-</span>}
                      </td>
                      <td className="border-b border-[#EAEAEA] px-3 py-2.5">
                        <div className="flex justify-center gap-0.5 opacity-60 transition group-hover:opacity-100">
                          <button
                            className="rounded-[5px] p-1 text-[#6B7280] hover:bg-white hover:text-[#447D9B]"
                            onClick={() => setEditing(w)}
                            aria-label="수정"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {showInactive ? (
                            <button
                              className="rounded-[5px] p-1 text-[#6B7280] hover:bg-emerald-50 hover:text-emerald-700"
                              onClick={() => handleReactivate(w)}
                              aria-label="재활성화"
                              title="다시 활성화"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              className="rounded-[5px] p-1 text-[#6B7280] hover:bg-red-50 hover:text-red-600"
                              onClick={() => handleDelete(w)}
                              aria-label="삭제"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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
        <WorkerForm
          title="작업자 추가"
          onSubmit={handleAdd}
          onCancel={() => setShowAdd(false)}
          existingBanks={list?.map((w) => w.bank_name).filter((b): b is string => !!b) ?? []}
          workers={list ?? []}
          teamLeaders={teamLeaders}
          trades={trades}
        />
      )}
      {editing && (
        <WorkerForm
          title={`${editing.name} 수정`}
          initial={editing}
          onSubmit={handleEdit}
          onCancel={() => setEditing(null)}
          existingBanks={list?.map((w) => w.bank_name).filter((b): b is string => !!b) ?? []}
          workers={list ?? []}
          teamLeaders={teamLeaders}
          trades={trades}
        />
      )}
      <WorkerDocumentsModal subject={docsWorker} onClose={() => setDocsWorker(null)} />
    </AdminShell>
  );
}
