'use client';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, AlertCircle, CheckCircle2, Clock, XCircle, MapPin } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { categoryTypes } from '@/lib/constants/masonry';

// 성과 입력 가능 카테고리 (조적 + 미장형). not_eligible/trade_unknown/no_worker_link 는 안내.
export type EligibleCategory = '조적' | '미장' | '방수' | '타일' | '석공사';
export type FormType = EligibleCategory | 'not_eligible' | 'trade_unknown' | 'no_worker_link';

export type PriceOption = {
  id: string;
  category: string;
  type_name: string | null;
  size_spec: string | null;
  unit: string;
  unit_price: number;
};

export type ExistingVolume = {
  id: string;
  category: string;
  type_name: string | null;
  size_spec: string | null;
  unit: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  note: string | null;
  approval_status?: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string | null;
};

// 현장별 성과 입력 섹션 (월중 이동 시 여러 현장이 올 수 있음)
export type WorksiteSection = {
  worksite_id: string;
  worksite_name: string;
  is_current: boolean;           // 현재 배정 현장
  is_input_open: boolean;        // 입력 가능 여부 (현재=월말창 / 떠난현장=상시)
  input_window: { start: string; end: string } | null;
  prices: PriceOption[];
  existing: ExistingVolume[];
};

export type VolumesMe = {
  form_type: FormType;
  worker?: { id: string; name: string; wage_type: string | null; default_trade: string | null };
  target_year_month: string | null;
  today?: string;
  worksites: WorksiteSection[];
};

type Row = { masonry_price_id: string; quantity: number };

function priceLabel(p: PriceOption): string {
  if (p.category === '조적') {
    return `${p.type_name ?? ''}${p.size_spec ? ` (${p.size_spec})` : ''}`;
  }
  if (categoryTypes(p.category)) {
    return `${p.type_name ?? ''} · ${p.unit}`;
  }
  return p.unit;
}

function matchPrice(e: ExistingVolume, prices: PriceOption[]): string | null {
  const m = prices.find((p) =>
    p.category === e.category &&
    (p.type_name ?? '') === (e.type_name ?? '') &&
    (p.size_spec ?? '') === (e.size_spec ?? '') &&
    (e.unit == null || p.unit === e.unit),
  );
  return m?.id ?? null;
}

function existingLabel(e: ExistingVolume): string {
  if (e.category === '조적') {
    return `${e.type_name ?? ''}${e.size_spec ? ` (${e.size_spec})` : ''}`;
  }
  if (categoryTypes(e.category)) {
    return `${e.category} ${e.type_name ?? ''}`;
  }
  return e.category;
}

function fmtDate(s: string): string {
  const d = new Date(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function VolumesForm({ data, onSaved, readOnly = false }: { data: VolumesMe; onSaved: () => void; readOnly?: boolean }) {
  if (data.form_type === 'no_worker_link') {
    return <InfoBox kind="error" title="작업자 정보 미연결" desc="관리자가 본인 계정과 작업자 정보를 연결해야 합니다." />;
  }
  if (data.form_type === 'not_eligible') {
    return (
      <InfoBox
        kind="info"
        title="해당 없음"
        desc="성과(매사) 입력은 월급/일급 작업자만 가능합니다. 출역만 제출해 주세요."
      />
    );
  }
  if (data.form_type === 'trade_unknown') {
    return (
      <InfoBox
        kind="warn"
        title="직종 확인 필요"
        desc={`현재 직종(${data.worker?.default_trade ?? '미설정'})은 매사 성과 입력 대상이 아닙니다. 관리자에게 확인 요청하세요.`}
      />
    );
  }

  const catName = data.form_type as EligibleCategory;
  const sections = data.worksites ?? [];

  if (sections.length === 0) {
    return <InfoBox kind="warn" title="현장 미설정" desc="배정된 현장이 없습니다. 관리자에게 현장 배정을 요청하세요." />;
  }

  const multi = sections.length > 1;

  return (
    <div className="space-y-5">
      {multi && (
        <div className="rounded-[10px] bg-amber-50 p-3 text-xs text-amber-800">
          이번 달 두 곳 이상에서 작업하셨습니다. <b>현장별로 따로</b> 성과를 입력하세요.
        </div>
      )}
      {sections.map((s) => (
        <div key={s.worksite_id}>
          {multi && (
            <div className="mb-2 flex items-center gap-1.5 text-sm font-bold text-zinc-800">
              <MapPin className="h-4 w-4 text-zinc-400" />
              {s.worksite_name}
              {!s.is_current && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                  이전 현장
                </span>
              )}
            </div>
          )}
          <WorksiteSectionForm
            section={s}
            catName={catName}
            yearMonth={data.target_year_month}
            onSaved={onSaved}
            readOnly={readOnly}
          />
        </div>
      ))}
    </div>
  );
}

function WorksiteSectionForm({
  section,
  catName,
  yearMonth,
  onSaved,
  readOnly,
}: {
  section: WorksiteSection;
  catName: EligibleCategory;
  yearMonth: string | null;
  onSaved: () => void;
  readOnly: boolean;
}) {
  const sb = getBrowserSupabase();

  const initialRows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const e of section.existing) {
      const pid = matchPrice(e, section.prices);
      if (!pid) continue;
      out.push({ masonry_price_id: pid, quantity: Number(e.quantity) });
    }
    return out;
  }, [section.existing, section.prices]);

  const [rows, setRows] = useState<Row[]>(initialRows);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => setRows(initialRows), [initialRows]);

  const priceMap = useMemo(() => new Map(section.prices.map((p) => [p.id, p])), [section.prices]);

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    if (section.prices.length === 0) return;
    setRows((prev) => [...prev, { masonry_price_id: section.prices[0].id, quantity: 0 }]);
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  const total = rows.reduce((s, r) => {
    const p = priceMap.get(r.masonry_price_id);
    if (!p) return s;
    return s + Math.round(r.quantity * p.unit_price);
  }, 0);

  async function save() {
    if (readOnly || busy) return;
    if (!yearMonth) return;
    setBusy(true);
    setErr(null);
    setOkMsg(null);
    const { error } = await sb.rpc('yeseong_mobile_replace_volumes_me', {
      p_year_month: yearMonth,
      p_worksite_id: section.worksite_id,
      p_items: rows
        .filter((r) => r.quantity > 0)
        .map((r) => ({ masonry_price_id: r.masonry_price_id, quantity: r.quantity })),
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setOkMsg('저장되었습니다. 관리자 승인 후 급여에 반영됩니다.');
    onSaved();
  }

  // 단가 미등록
  if (section.prices.length === 0) {
    return (
      <InfoBox
        kind="warn"
        title="단가 미등록"
        desc={`이 현장에 ${catName} 단가가 등록되지 않았습니다. 관리자에게 단가 등록을 요청하세요.`}
      />
    );
  }

  // 입력 불가(현재 현장인데 입력 기간 외) — 제출 내역만 표시
  if (!section.is_input_open) {
    return (
      <div className="space-y-3">
        <InfoBox
          kind="info"
          title="입력 기간이 아닙니다"
          desc={
            section.input_window
              ? `${fmtDate(section.input_window.start)} ~ ${fmtDate(section.input_window.end)}에 입력 가능합니다.`
              : '매월 말일~다음달 10일에 입력 가능합니다.'
          }
        />
        {section.existing.length > 0 && <ExistingList existing={section.existing} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[10px] bg-blue-50 p-3 text-sm">
        <p className="font-semibold text-blue-900">
          {yearMonth?.replace('-', '년 ')}월 {catName} 성과 입력
        </p>
        <p className="text-xs text-blue-700 mt-1">
          {section.is_current
            ? section.input_window
              ? `입력 기간: ${fmtDate(section.input_window.start)} ~ ${fmtDate(section.input_window.end)}`
              : ''
            : '이전 현장 — 지금 입력해 마감할 수 있습니다.'}
        </p>
      </div>

      {section.existing.some((e) => e.approval_status === 'rejected') && (
        <InfoBox
          kind="warn"
          title="반려된 성과가 있습니다"
          desc={section.existing.find((e) => e.approval_status === 'rejected')?.rejection_reason
            ? `사유: ${section.existing.find((e) => e.approval_status === 'rejected')?.rejection_reason}`
            : '관리자가 반려했습니다. 다시 입력 후 저장해 주세요.'}
        />
      )}

      <div className="space-y-2.5">
        {rows.length === 0 ? (
          <p className="rounded-[10px] bg-zinc-50 p-4 text-center text-sm text-zinc-500">
            아래 + 버튼으로 항목을 추가하세요.
          </p>
        ) : (
          rows.map((r, i) => {
            const p = priceMap.get(r.masonry_price_id);
            return (
              <div key={i} className="rounded-[10px] border border-zinc-200 bg-white p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={r.masonry_price_id}
                    onChange={(e) => update(i, { masonry_price_id: e.target.value })}
                    disabled={busy}
                    className="flex-1 h-10 rounded-[8px] border border-zinc-300 bg-white px-2.5 text-sm"
                  >
                    {section.prices.map((opt) => (
                      <option key={opt.id} value={opt.id}>{priceLabel(opt)}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeRow(i)}
                    disabled={busy}
                    className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={r.quantity || ''}
                    onChange={(e) => update(i, { quantity: e.target.value === '' ? 0 : Number(e.target.value) })}
                    placeholder="0"
                    min={0}
                    step={p?.unit === '㎡' ? '0.01' : '1'}
                    disabled={busy}
                    inputMode="decimal"
                    className="flex-1 h-12 rounded-[8px] border border-zinc-300 bg-white px-3 text-right text-lg font-semibold tabular-nums"
                  />
                  <span className="w-12 text-center text-sm text-zinc-500">{p?.unit ?? ''}</span>
                  <span className="w-28 text-right text-sm tabular-nums text-zinc-700">
                    {p ? `${Math.round(r.quantity * p.unit_price).toLocaleString()}원` : '-'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <button
        type="button"
        onClick={addRow}
        disabled={busy}
        className="flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-zinc-300 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
      >
        <Plus className="h-4 w-4" />
        항목 추가
      </button>

      <div className="flex items-center justify-between rounded-[10px] bg-zinc-50 px-4 py-3">
        <span className="text-sm font-semibold text-zinc-700">이 현장 성과 합계</span>
        <span className="text-xl font-bold tabular-nums text-blue-900">{total.toLocaleString()}원</span>
      </div>

      {err && (
        <div className="flex items-start gap-2 rounded-[10px] bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{err}</span>
        </div>
      )}
      {okMsg && (
        <div className="flex items-center gap-2 rounded-[10px] bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{okMsg}</span>
        </div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={busy || readOnly}
        className="h-[68px] w-full rounded-[12px] bg-blue-900 text-lg font-bold text-white disabled:bg-zinc-300"
      >
        {readOnly ? '보기 전용' : busy ? '저장 중...' : '저장'}
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status?: ExistingVolume['approval_status'] }) {
  if (status === 'approved') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> 승인
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
        <XCircle className="h-3 w-3" /> 반려
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
      <Clock className="h-3 w-3" /> 검토 중
    </span>
  );
}

function ExistingList({ existing }: { existing: ExistingVolume[] }) {
  const total = existing.reduce((s, e) => s + e.amount, 0);
  return (
    <div className="rounded-[10px] border border-zinc-200 bg-white p-3 space-y-2">
      <p className="text-sm font-semibold text-zinc-700">제출된 성과</p>
      {existing.map((e) => (
        <div key={e.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-1.5 text-zinc-700">
            {existingLabel(e)} × {e.quantity}{e.unit ?? ''}
            <StatusBadge status={e.approval_status} />
          </span>
          <span className="tabular-nums font-semibold">{e.amount.toLocaleString()}원</span>
        </div>
      ))}
      <div className="border-t border-zinc-200 pt-2 flex items-center justify-between">
        <span className="text-sm font-semibold">합계</span>
        <span className="text-base font-bold tabular-nums text-blue-900">{total.toLocaleString()}원</span>
      </div>
    </div>
  );
}

function InfoBox({ kind, title, desc }: { kind: 'info' | 'warn' | 'error'; title: string; desc: string }) {
  const bg =
    kind === 'error' ? 'bg-red-50 text-red-700 border-red-100' :
    kind === 'warn' ? 'bg-amber-50 text-amber-800 border-amber-100' :
    'bg-zinc-50 text-zinc-600 border-zinc-200';
  return (
    <div className={`rounded-[12px] border p-5 ${bg}`}>
      <p className="text-base font-bold">{title}</p>
      <p className="text-sm mt-1.5">{desc}</p>
    </div>
  );
}
