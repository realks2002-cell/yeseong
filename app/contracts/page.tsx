'use client';
import { useEffect, useRef, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileSignature, Download, Trash2, Loader2, Check, Send } from 'lucide-react';
import { ContractDocument } from '@/components/contract/contract-document';
import { downloadContractPdf, contractPdfBlob, contractPdfFilename } from '@/lib/contract/pdf';
import type { ContractSnapshot } from '@/lib/contract/context';

type Status = 'issued' | 'signed';
type Row = {
  id: string;
  status: Status;
  worker_name: string;
  worksite: string;
  subcontractor: string;
  contract_date: string;
  signed_at: string | null;
  issued_at: string;
};
type Detail = {
  id: string;
  status: Status;
  snapshot: ContractSnapshot;
  rendered_body: string;
  contract_date: string;
  contract_end_date: string | null;
  sign_date: string | null;
  signed_at: string | null;
  issued_at: string;
  signature_data_url: string | null;
  pdf_path: string | null;
};
type Worksite = { id: string; name: string };

function fmtDateTime(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
function kstToday() {
  const now = new Date();
  const k = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60_000);
  return `${k.getFullYear()}-${String(k.getMonth() + 1).padStart(2, '0')}-${String(k.getDate()).padStart(2, '0')}`;
}

export default function AdminContractsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Detail | null>(null);
  const [worksites, setWorksites] = useState<Worksite[]>([]);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    const r = await fetch(`/api/contracts${qs}`, { cache: 'no-store' });
    if (!r.ok) {
      setError('목록을 불러오지 못했습니다');
      setRows([]);
      return;
    }
    setRows(await r.json());
  }

  useEffect(() => {
    fetch('/api/worksites', { cache: 'no-store' }).then(async (r) => {
      if (r.ok) {
        const d: Worksite[] = await r.json();
        setWorksites(d.map((w) => ({ id: w.id, name: w.name })));
      }
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function openDetail(id: string) {
    const r = await fetch(`/api/contracts/${id}`, { cache: 'no-store' });
    if (!r.ok) {
      alert('계약서를 불러오지 못했습니다');
      return;
    }
    setSelected(await r.json());
  }

  return (
    <AdminShell>
      <div className="max-w-6xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#091413]">계약 현황</h1>
            <p className="mt-1 text-sm text-[#6B7280]">계약서를 작업자에게 배포하고 서명 현황을 확인합니다.</p>
          </div>
          <Button onClick={() => setIssuing(true)}>
            <Send className="h-4 w-4" /> 계약서 배포
          </Button>
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-[#D7D7D7] px-4 py-3">
            <Input
              placeholder="작업자·현장 검색…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-[220px]"
            />
          </div>

          {error && <p className="px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

          {rows === null ? (
            <p className="px-4 py-10 text-center text-sm text-[#6B7280]">불러오는 중…</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-[#6B7280]">배포된 계약서가 없습니다. ‘계약서 배포’로 시작하세요.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#D7D7D7] bg-[#F5F5F5] text-left text-[11px] text-[#6B7280]">
                  <th className="px-4 py-2.5 font-semibold">작업자</th>
                  <th className="px-4 py-2.5 font-semibold">현장</th>
                  <th className="px-4 py-2.5 font-semibold">계약일</th>
                  <th className="px-4 py-2.5 font-semibold">상태</th>
                  <th className="px-4 py-2.5 font-semibold">서명일시</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D7D7D7]">
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => openDetail(r.id)} className="cursor-pointer hover:bg-[#F5F5F5]">
                    <td className="px-4 py-2.5 font-medium text-[#447D9B] hover:underline">{r.worker_name}</td>
                    <td className="px-4 py-2.5 text-[#091413]">{r.worksite}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[#091413]">{r.contract_date}</td>
                    <td className="px-4 py-2.5">
                      {r.status === 'signed' ? (
                        <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">서명완료</span>
                      ) : (
                        <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">배포됨·미서명</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-[#6B7280]">{fmtDateTime(r.signed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {issuing && (
        <IssueModal
          worksites={worksites}
          onClose={() => setIssuing(false)}
          onIssued={() => {
            setIssuing(false);
            load();
          }}
        />
      )}

      {selected && (
        <ContractDetailModal
          detail={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
          onLocal={(patch) => setSelected((s) => (s ? { ...s, ...patch } : s))}
        />
      )}
    </AdminShell>
  );
}

// ───────────────────────── 배포 모달 ─────────────────────────
type WorksiteCand = { id: string; name: string; wage_type?: string | null; status: 'none' | 'issued' | 'signed' | 'no_template' };
type PhoneRow = {
  phone: string;
  found: boolean;
  worker_id?: string;
  name?: string;
  worksite?: string | null;
  status: 'none' | 'issued' | 'signed' | 'no_worksite' | 'no_template' | 'not_found';
};

const PHONE_STATUS_LABEL: Record<PhoneRow['status'], { text: string; cls: string } | null> = {
  none: null,
  signed: { text: '재계약', cls: 'text-[#447D9B]' },
  issued: { text: '배포됨·미서명', cls: 'text-amber-700' },
  no_worksite: { text: '현장 미배정', cls: 'text-red-600' },
  no_template: { text: '양식 미지정', cls: 'text-red-600' },
  not_found: { text: '작업자 없음', cls: 'text-red-600' },
};

function IssueModal({
  worksites,
  onClose,
  onIssued,
}: {
  worksites: Worksite[];
  onClose: () => void;
  onIssued: () => void;
}) {
  const [mode, setMode] = useState<'worksite' | 'phone'>('worksite');
  const [employers, setEmployers] = useState<{ id: string; name: string }[]>([]);
  const [employerId, setEmployerId] = useState('');
  const [contractDate, setContractDate] = useState(kstToday());
  const [contractEndDate, setContractEndDate] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  // 현장별 모드
  const [worksiteId, setWorksiteId] = useState('');
  const [candidates, setCandidates] = useState<WorksiteCand[] | null>(null);
  const [hasTemplate, setHasTemplate] = useState(true);

  // 전화번호 모드
  const [phoneText, setPhoneText] = useState('');
  const [phoneRows, setPhoneRows] = useState<PhoneRow[] | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    fetch('/api/subcontractors', { cache: 'no-store' }).then(async (r) => {
      if (r.ok) {
        const d: { id: string; name: string }[] = await r.json();
        setEmployers(d.map((s) => ({ id: s.id, name: s.name })));
      }
    });
  }, []);

  function switchMode(m: 'worksite' | 'phone') {
    setMode(m);
    setChecked(new Set());
    setResult(null);
    setErr(null);
  }
  function toggle(id: string) {
    setChecked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function loadCandidates(wid: string) {
    setWorksiteId(wid);
    setCandidates(null);
    setChecked(new Set());
    setResult(null);
    if (!wid) return;
    const r = await fetch(`/api/contracts/candidates?worksite=${wid}`, { cache: 'no-store' });
    if (!r.ok) {
      setErr('대상을 불러오지 못했습니다');
      return;
    }
    const d = await r.json();
    setHasTemplate(d.has_template);
    setCandidates(d.workers);
    setChecked(new Set(d.workers.filter((w: WorksiteCand) => w.status === 'none').map((w: WorksiteCand) => w.id)));
  }

  async function resolvePhones() {
    setResolving(true);
    setErr(null);
    setResult(null);
    const r = await fetch('/api/contracts/candidates-by-phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: phoneText }),
    });
    setResolving(false);
    if (!r.ok) {
      setErr('조회 실패');
      return;
    }
    const d = await r.json();
    setPhoneRows(d.rows as PhoneRow[]);
    setChecked(
      new Set(
        (d.rows as PhoneRow[]).filter((x) => x.status === 'none' && x.worker_id).map((x) => x.worker_id!),
      ),
    );
  }

  // 선택 가능: 미배포(none)·서명완료(signed=재계약). 미서명·양식없음은 불가.
  const wsSelectable = (candidates ?? []).filter((w) => w.status === 'none' || w.status === 'signed');
  const phSelectable = (phoneRows ?? []).filter((r) => (r.status === 'none' || r.status === 'signed') && r.worker_id);
  const selectableIds = mode === 'worksite' ? wsSelectable.map((w) => w.id) : phSelectable.map((r) => r.worker_id!);
  const allChecked = selectableIds.length > 0 && selectableIds.every((id) => checked.has(id));
  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(selectableIds));
  }

  async function handleIssue() {
    if (checked.size === 0) {
      setErr('대상 작업자를 선택하세요');
      return;
    }
    setBusy(true);
    setErr(null);
    const payload: Record<string, unknown> = {
      worker_ids: Array.from(checked),
      contract_date: contractDate,
      employer_subcontractor_id: employerId,
    };
    if (contractEndDate) payload.contract_end_date = contractEndDate;
    if (mode === 'worksite') payload.worksite_id = worksiteId;
    const r = await fetch('/api/contracts/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(d.error ?? '배포 실패');
      return;
    }
    const skippedN = (d.skipped ?? []).length;
    setResult(`${d.issued}명에게 배포 완료${skippedN ? ` · ${skippedN}명 제외` : ''}`);
    setTimeout(onIssued, 900);
  }

  const canIssue =
    !busy && !!employerId && checked.size > 0 && (mode === 'phone' || (!!worksiteId && hasTemplate));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[92vw] max-w-xl max-h-[90vh] overflow-y-auto" showClose={false}>
        <DialogHeader>
          <DialogTitle>계약서 배포</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-5 pb-5">
          {/* 모드 탭 */}
          <div className="flex gap-1 rounded-[5px] bg-[#F5F5F5] p-1">
            {(['worksite', 'phone'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`flex-1 rounded-[4px] py-1.5 text-sm font-medium transition-colors ${
                  mode === m ? 'bg-white text-[#091413] shadow-sm' : 'text-[#6B7280]'
                }`}
              >
                {m === 'worksite' ? '현장별' : '전화번호'}
              </button>
            ))}
          </div>

          {err && <p className="rounded-[5px] bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{err}</p>}
          {result && <p className="rounded-[5px] bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{result}</p>}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#091413]">
              사용자 (갑) · 전문건설사 <span className="text-red-600">*</span>
            </label>
            <select
              value={employerId}
              onChange={(e) => setEmployerId(e.target.value)}
              className="h-10 w-full rounded-[5px] border border-[#D7D7D7] bg-white px-3 text-sm text-[#091413] focus:outline-none focus:ring-2 focus:ring-[#447D9B]"
            >
              <option value="">전문건설사 선택…</option>
              {employers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[#6B7280]">
              계약서 ‘갑(사용자)’으로 들어갈 전문건설사입니다. 대표자·소재지 등은 <b>전문건설사 마스터</b> 값이 그대로 동결됩니다.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#091413]">계약 시작일</label>
              <Input type="date" value={contractDate} onChange={(e) => setContractDate(e.target.value)} className="h-10 w-[180px]" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#091413]">계약 종료일 <span className="font-normal text-[#9CA3AF]">(선택)</span></label>
              <Input type="date" value={contractEndDate} min={contractDate} onChange={(e) => setContractEndDate(e.target.value)} className="h-10 w-[180px]" />
            </div>
          </div>

          {/* ── 현장별 ── */}
          {mode === 'worksite' && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#091413]">현장</label>
                <select
                  value={worksiteId}
                  onChange={(e) => loadCandidates(e.target.value)}
                  className="h-10 w-full rounded-[5px] border border-[#D7D7D7] bg-white px-3 text-sm text-[#091413] focus:outline-none focus:ring-2 focus:ring-[#447D9B]"
                >
                  <option value="">현장 선택…</option>
                  {worksites.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              {worksiteId && !hasTemplate && (
                <p className="rounded-[5px] bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
                  이 현장에 지정된 계약서 양식이 없습니다. ‘계약서 양식’에서 먼저 지정하세요.
                </p>
              )}

              {candidates && hasTemplate && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-sm font-medium text-[#091413]">대상 작업자</label>
                    {wsSelectable.length > 0 && (
                      <button type="button" onClick={toggleAll} className="text-xs text-[#447D9B] hover:underline">
                        {allChecked ? '전체 해제' : '전체 선택'}
                      </button>
                    )}
                  </div>
                  {candidates.length === 0 ? (
                    <p className="text-sm text-[#6B7280]">이 현장에 배정된 작업자가 없습니다.</p>
                  ) : (
                    <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-[5px] border border-[#D7D7D7] p-2">
                      {candidates.map((w) => {
                        const blocked = w.status === 'issued' || w.status === 'no_template';
                        return (
                          <label key={w.id} className={`flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-sm ${blocked ? 'opacity-60' : 'hover:bg-[#F5F5F5]'}`}>
                            <input type="checkbox" disabled={blocked} checked={checked.has(w.id)} onChange={() => toggle(w.id)} className="h-4 w-4 accent-[#447D9B]" />
                            <span className="flex-1 text-[#091413]">
                              {w.name}
                              {w.wage_type && <span className="ml-1 text-xs text-[#6B7280]">({w.wage_type})</span>}
                            </span>
                            {w.status === 'signed' && <span className="text-[11px] text-[#447D9B]">재계약</span>}
                            {w.status === 'issued' && <span className="text-[11px] text-amber-700">배포됨·미서명</span>}
                            {w.status === 'no_template' && <span className="text-[11px] text-red-600">양식 없음</span>}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── 전화번호 ── */}
          {mode === 'phone' && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#091413]">전화번호 (엑셀에서 복사·붙여넣기)</label>
                <textarea
                  value={phoneText}
                  onChange={(e) => setPhoneText(e.target.value)}
                  rows={5}
                  placeholder={'010-1234-5678\n01098765432\n... 줄바꿈·쉼표·탭 모두 인식'}
                  className="w-full rounded-[5px] border border-[#D7D7D7] bg-white px-3 py-2 text-sm text-[#091413] focus:outline-none focus:ring-2 focus:ring-[#447D9B]"
                />
                <div className="mt-2">
                  <Button variant="outline" size="sm" onClick={resolvePhones} disabled={resolving || !phoneText.trim()}>
                    {resolving ? '조회 중…' : '작업자 조회'}
                  </Button>
                </div>
              </div>

              {phoneRows && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-sm font-medium text-[#091413]">조회 결과 ({phoneRows.length}건)</label>
                    {phSelectable.length > 0 && (
                      <button type="button" onClick={toggleAll} className="text-xs text-[#447D9B] hover:underline">
                        {allChecked ? '전체 해제' : '전체 선택'}
                      </button>
                    )}
                  </div>
                  <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-[5px] border border-[#D7D7D7] p-2">
                    {phoneRows.map((r, i) => {
                      const lbl = PHONE_STATUS_LABEL[r.status];
                      const selectable = (r.status === 'none' || r.status === 'signed') && r.worker_id;
                      return (
                        <label key={`${r.phone}-${i}`} className={`flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-sm ${selectable ? 'hover:bg-[#F5F5F5]' : 'opacity-60'}`}>
                          <input
                            type="checkbox"
                            disabled={!selectable}
                            checked={r.worker_id ? checked.has(r.worker_id) : false}
                            onChange={() => r.worker_id && toggle(r.worker_id)}
                            className="h-4 w-4 accent-[#447D9B]"
                          />
                          <span className="w-28 shrink-0 font-mono text-xs text-[#6B7280]">{r.phone}</span>
                          <span className="flex-1 truncate text-[#091413]">
                            {r.name ?? '—'}
                            {r.worksite && <span className="ml-1 text-xs text-[#6B7280]">({r.worksite})</span>}
                          </span>
                          {lbl && <span className={`shrink-0 text-[11px] ${lbl.cls}`}>{lbl.text}</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={busy}>취소</Button>
            <Button onClick={handleIssue} disabled={!canIssue}>
              {busy ? '배포 중…' : `${checked.size}명에게 배포`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── 상세 모달 ─────────────────────────
function ContractDetailModal({
  detail,
  onClose,
  onChanged,
  onLocal,
}: {
  detail: Detail;
  onClose: () => void;
  onChanged: () => void;
  onLocal: (patch: Partial<Detail>) => void;
}) {
  const docRef = useRef<HTMLDivElement>(null);
  const [dateInput, setDateInput] = useState(detail.contract_date);
  const [endInput, setEndInput] = useState(detail.contract_end_date ?? '');
  const [signInput, setSignInput] = useState(detail.sign_date ?? '');
  const [bodyInput, setBodyInput] = useState(detail.rendered_body);
  const [savingDate, setSavingDate] = useState(false);
  const [savingSign, setSavingSign] = useState(false);
  const [savingBody, setSavingBody] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const issued = detail.status === 'issued';

  async function patch(payload: Record<string, unknown>) {
    const r = await fetch(`/api/contracts/${detail.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      alert((await r.json().catch(() => ({}))).error ?? '수정 실패');
      return false;
    }
    return true;
  }

  const periodDirty = dateInput !== detail.contract_date || endInput !== (detail.contract_end_date ?? '');
  async function saveDate() {
    if (!periodDirty) return;
    setSavingDate(true);
    const ok = await patch({ contract_date: dateInput, contract_end_date: endInput || null });
    setSavingDate(false);
    if (ok) {
      onLocal({ contract_date: dateInput, contract_end_date: endInput || null });
      onChanged();
    }
  }
  const signDirty = signInput !== (detail.sign_date ?? '');
  async function saveSign() {
    if (!signDirty) return;
    setSavingSign(true);
    const ok = await patch({ sign_date: signInput || null });
    setSavingSign(false);
    if (ok) {
      onLocal({ sign_date: signInput || null });
      onChanged();
    }
  }
  async function saveBody() {
    setSavingBody(true);
    const ok = await patch({ rendered_body: bodyInput });
    setSavingBody(false);
    if (ok) onLocal({ rendered_body: bodyInput });
  }
  function pdfFilename() {
    return contractPdfFilename(detail.snapshot.phone, detail.snapshot.worker_name, detail.sign_date ?? dateInput);
  }
  async function handlePdf() {
    if (!docRef.current) return;
    setPdfBusy(true);
    try {
      await downloadContractPdf(docRef.current, pdfFilename());
    } finally {
      setPdfBusy(false);
    }
  }
  async function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  }
  // 서버 보관 (서명 완료 계약서 — 구 계약서 백필/재보관)
  async function handleArchive() {
    if (!docRef.current) return;
    setArchiving(true);
    try {
      const dataUrl = await blobToDataUrl(await contractPdfBlob(docRef.current));
      const r = await fetch(`/api/contracts/${detail.id}/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf_base64: dataUrl }),
      });
      if (!r.ok) { alert((await r.json().catch(() => ({}))).error ?? '보관 실패'); return; }
      onLocal({ pdf_path: 'archived' });
    } finally {
      setArchiving(false);
    }
  }
  // 보관본 PDF 열기 (서명 URL)
  async function handleOpenArchived() {
    const r = await fetch(`/api/contracts/${detail.id}/pdf`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) { alert(j.error ?? '보관본을 찾을 수 없습니다'); return; }
    window.open(j.url, '_blank');
  }
  async function handleDelete() {
    if (!confirm(issued ? '배포를 취소(삭제)할까요?' : '이 계약서를 삭제할까요? 되돌릴 수 없습니다.')) return;
    const r = await fetch(`/api/contracts/${detail.id}`, { method: 'DELETE' });
    if (!r.ok) {
      alert('삭제 실패');
      return;
    }
    onChanged();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[92vw] max-w-3xl max-h-[92vh] overflow-y-auto" showClose>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            근로계약서
            {issued ? (
              <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">배포됨·미서명</span>
            ) : (
              <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">서명완료</span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-5 pb-5">
          {/* 컨트롤 */}
          <div className="flex flex-wrap items-end gap-3 rounded-[5px] bg-[#F5F5F5] p-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#6B7280]">계약기간</label>
              <div className="flex items-center gap-2">
                <Input type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} className="h-9 w-[150px]" />
                <span className="text-[#6B7280]">~</span>
                <Input type="date" value={endInput} min={dateInput} onChange={(e) => setEndInput(e.target.value)} className="h-9 w-[150px]" />
                <Button size="sm" onClick={saveDate} disabled={savingDate || !periodDirty}>
                  {savingDate ? '저장…' : '기간 저장'}
                </Button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#6B7280]">서명일 (계약일 · 서명란 날짜)</label>
              <div className="flex items-center gap-2">
                <Input type="date" value={signInput} onChange={(e) => setSignInput(e.target.value)} className="h-9 w-[150px]" />
                <Button size="sm" onClick={saveSign} disabled={savingSign || !signDirty}>
                  {savingSign ? '저장…' : '서명일 저장'}
                </Button>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePdf} disabled={pdfBusy}>
                {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PDF
              </Button>
              {!issued && detail.pdf_path && (
                <Button variant="outline" size="sm" onClick={handleOpenArchived}>
                  <FileSignature className="h-3.5 w-3.5" /> 보관본
                </Button>
              )}
              {!issued && !detail.pdf_path && (
                <Button variant="outline" size="sm" onClick={handleArchive} disabled={archiving}>
                  {archiving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} 서버 보관
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={handleDelete} aria-label="삭제">
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
              </Button>
            </div>
          </div>

          <p className="text-xs text-[#6B7280]">
            배포일시: {fmtDateTime(detail.issued_at)}
            {detail.signed_at && ` · 서명일시: ${fmtDateTime(detail.signed_at)}`}
          </p>

          {/* 미서명: 본문 편집 */}
          {issued && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-sm font-medium text-[#091413]">계약 조건 본문 (미서명 상태에서만 수정 가능)</label>
                <Button size="sm" onClick={saveBody} disabled={savingBody || bodyInput === detail.rendered_body}>
                  {savingBody ? '저장…' : '본문 저장'}
                </Button>
              </div>
              <textarea
                value={bodyInput}
                onChange={(e) => setBodyInput(e.target.value)}
                rows={10}
                className="w-full rounded-[5px] border border-[#D7D7D7] bg-white px-3 py-2 text-sm text-[#091413] focus:outline-none focus:ring-2 focus:ring-[#447D9B]"
              />
              <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
                <Check className="h-3.5 w-3.5" /> 본문 저장 후 아래 미리보기에 반영됩니다. 서명되면 본문은 동결됩니다.
              </p>
            </div>
          )}

          {/* 문서 미리보기 (서명본/미서명 공통) */}
          <div className="overflow-hidden rounded-[5px] border border-[#D7D7D7]">
            <ContractDocument
              ref={docRef}
              snapshot={detail.snapshot}
              contractDate={dateInput}
              contractEndDate={endInput || null}
              signDate={signInput || null}
              renderedBody={issued ? bodyInput : detail.rendered_body}
              signatureUrl={detail.signature_data_url}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
