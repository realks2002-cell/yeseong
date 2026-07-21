'use client';
import { useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShieldAlert, Plus, X, Sparkles, Check, Info, Loader2 } from 'lucide-react';

type SiteOpt = { id: string; name: string; client: string; subcontractor: string };
type TradeOpt = { trade: string; actor: string };
type Participant = { trade: string; name: string };
type Task = { trade: string; task: string; start: string; end: string };

const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s: string, n: number) => { const d = new Date(s); d.setDate(d.getDate() + n); return fmt(d); };

export default function RiskAssessmentPage() {
  const [sites, setSites] = useState<SiteOpt[]>([]);
  const [siteId, setSiteId] = useState('');
  const [site, setSite] = useState<SiteOpt | null>(null);
  const [trades, setTrades] = useState<TradeOpt[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chasu, setChasu] = useState(1);
  const [periodStart, setPeriodStart] = useState(fmt(new Date()));
  const [periodEnd, setPeriodEnd] = useState(addDays(fmt(new Date()), 14));
  const [writeDate, setWriteDate] = useState(fmt(new Date()));
  const [meetDate, setMeetDate] = useState(fmt(new Date()));
  const [bigTrade, setBigTrade] = useState('건축');
  const [midTrade, setMidTrade] = useState('습식공사');
  const [schedule, setSchedule] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/risk-assessment/init').then((r) => r.json()).then((d) => setSites(d.sites ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!siteId) return;
    setLoading(true); setError(null);
    fetch(`/api/risk-assessment/init?siteId=${siteId}`)
      .then((r) => r.json())
      .then((d) => {
        setSite(d.site);
        setTrades(d.trades ?? []);
        setParticipants(d.participants ?? []);
        const first2 = (d.trades ?? []).slice(0, 2).map((t: TradeOpt) => t.trade);
        setSelected(new Set(first2));
        setSchedule(first2.map((tr: string) => ({ trade: tr, task: '', start: periodStart, end: periodEnd })));
      })
      .catch(() => setError('현장 정보를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedTrades = useMemo(
    () => trades.filter((t) => selected.has(t.trade)),
    [trades, selected],
  );
  const overCap = selectedTrades.length > 2;

  function toggleTrade(tr: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(tr)) n.delete(tr); else n.add(tr);
      return n;
    });
  }
  function addTask() {
    const tr = selectedTrades[0]?.trade ?? '';
    setSchedule((s) => [...s, { trade: tr, task: '', start: periodStart, end: periodEnd }]);
  }

  async function generate() {
    setBusy(true); setError(null);
    try {
      const body = {
        chasu, periodStart, periodEnd, writeDate, meetDate,
        worksiteName: site?.name ?? '',
        clientName: site?.client || '원청',
        subcontractorName: site?.subcontractor ?? '(주)예성건축',
        bigTrade, midTrade,
        trades: selectedTrades.slice(0, 2),
        participants,
        schedule,
      };
      const res = await fetch('/api/risk-assessment/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename\*=UTF-8''(.+)$/);
      const name = m ? decodeURIComponent(m[1]) : '위험성평가.xlsx';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError('생성 실패: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const label = 'block text-xs font-medium mb-1.5 text-[#091413]';
  const facts = site ? [
    ['원청사', site.client || '—'], ['협력사', site.subcontractor],
  ] : [];

  return (
    <AdminShell>
      <div className="mx-auto max-w-4xl p-6 space-y-5">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-[#091413]">
            <ShieldAlert className="h-5 w-5 text-[#447D9B]" />위험성평가 생성
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">현장을 선택하면 공종·참석자가 자동으로 채워집니다. 위험도·서명은 생성 후 관리자가 확정합니다.</p>
        </div>

        {error && <div className="rounded-[5px] border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}

        {/* 현장 */}
        <Card className="p-4">
          <label className={label}>현장 선택 <span className="text-[#FE7743]">*</span></label>
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="h-10 w-full rounded-[5px] border border-[#D7D7D7] bg-white px-3 text-sm text-[#091413] outline-none focus:ring-2 focus:ring-[#447D9B]"
          >
            <option value="">현장을 선택하세요</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {loading && <p className="mt-2 flex items-center gap-1.5 text-xs text-[#6B7280]"><Loader2 className="h-3 w-3 animate-spin" />불러오는 중…</p>}
          {site && (
            <div className="mt-3 flex flex-wrap gap-2">
              {facts.map(([k, v]) => (
                <div key={k} className="rounded-[5px] border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs">
                  <span className="text-[#6B7280]">{k} </span><span className="font-semibold text-emerald-800">{v}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {site && (
          <>
            {/* 공종 */}
            <Card className="p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <label className={label + ' mb-0'}>대상 공종</label>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><Check className="h-2.5 w-2.5" />배정 작업자 기준 자동</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {trades.map((t) => {
                  const on = selected.has(t.trade);
                  return (
                    <button key={t.trade} type="button" onClick={() => toggleTrade(t.trade)}
                      className={'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ' +
                        (on ? 'border-[#447D9B] bg-[#447D9B] font-semibold text-white' : 'border-[#D7D7D7] bg-white text-[#091413] hover:bg-[#F5F5F5]')}>
                      {on && <Check className="h-3 w-3" />}{t.trade} <span className={on ? 'text-white/70' : 'text-[#9CA3AF]'}>· {t.actor}</span>
                    </button>
                  );
                })}
                {trades.length === 0 && <span className="text-xs text-[#9CA3AF]">이 현장에 배정된 작업자의 공종이 없습니다.</span>}
              </div>
              {overCap && (
                <p className="mt-2 flex items-center gap-1.5 rounded-[5px] bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700">
                  <Info className="h-3 w-3" />오창 원청 서식은 공종 2블록 한도 — 선택한 <b>{selectedTrades.slice(0, 2).map((t) => t.trade).join('·')}</b>만 표에 들어가고 나머지는 별도 차수로 만드세요.
                </p>
              )}
            </Card>

            {/* 차수·일정 */}
            <Card className="p-4">
              <label className={label}>차수 · 일정</label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div><span className="text-[11px] text-[#6B7280]">평가 차수</span><Input type="number" value={chasu} onChange={(e) => setChasu(Number(e.target.value))} /></div>
                <div><span className="text-[11px] text-[#6B7280]">평가기간 시작</span><Input type="date" value={periodStart} onChange={(e) => { setPeriodStart(e.target.value); setPeriodEnd(addDays(e.target.value, 14)); }} /></div>
                <div><span className="text-[11px] text-[#6B7280]">평가기간 종료</span><Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></div>
                <div><span className="text-[11px] text-[#6B7280]">작성일</span><Input type="date" value={writeDate} onChange={(e) => setWriteDate(e.target.value)} /></div>
                <div><span className="text-[11px] text-[#6B7280]">근로자 참여 회의일</span><Input type="date" value={meetDate} onChange={(e) => setMeetDate(e.target.value)} /></div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div><span className="text-[11px] text-[#6B7280]">대공종</span><Input value={bigTrade} onChange={(e) => setBigTrade(e.target.value)} /></div>
                <div><span className="text-[11px] text-[#6B7280]">중공종</span><Input value={midTrade} onChange={(e) => setMidTrade(e.target.value)} /></div>
              </div>
            </Card>

            {/* 주간 공정 */}
            <Card className="p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <label className={label + ' mb-0'}>주간 공정 입력</label>
                <Button size="sm" variant="outline" onClick={addTask}><Plus className="h-3.5 w-3.5" />작업 추가</Button>
              </div>
              <div className="space-y-2">
                {schedule.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select value={t.trade} onChange={(e) => setSchedule((s) => s.map((x, j) => j === i ? { ...x, trade: e.target.value } : x))}
                      className="h-9 w-24 flex-none rounded-[5px] border border-[#D7D7D7] bg-white px-2 text-xs outline-none focus:ring-2 focus:ring-[#447D9B]">
                      {selectedTrades.map((st) => <option key={st.trade} value={st.trade}>{st.trade}</option>)}
                    </select>
                    <Input className="flex-1" placeholder="주요 작업 (예: 옥상 시트방수)" value={t.task} onChange={(e) => setSchedule((s) => s.map((x, j) => j === i ? { ...x, task: e.target.value } : x))} />
                    <Input type="date" className="w-36" value={t.start} onChange={(e) => setSchedule((s) => s.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} />
                    <Input type="date" className="w-36" value={t.end} onChange={(e) => setSchedule((s) => s.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} />
                    <button onClick={() => setSchedule((s) => s.filter((_, j) => j !== i))} className="text-[#9CA3AF] hover:text-red-600"><X className="h-4 w-4" /></button>
                  </div>
                ))}
                {schedule.length === 0 && <p className="text-xs text-[#9CA3AF]">공정을 추가하면 주간공정표 달력에 막대가 자동으로 그려집니다.</p>}
              </div>
            </Card>

            {/* 참석자 */}
            <Card className="p-0 overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#D7D7D7] px-4 py-2.5">
                <span className="text-xs font-semibold text-[#091413]">참석자 ({participants.length}명)</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><Check className="h-2.5 w-2.5" />배정 작업자 자동 · 서명은 회의 시</span>
              </div>
              <table className="w-full text-xs">
                <thead><tr className="bg-[#F5F5F5] text-[#6B7280]"><th className="px-4 py-2 text-left font-medium">직종</th><th className="px-4 py-2 text-left font-medium">성명</th><th className="px-4 py-2 text-left font-medium">서명</th></tr></thead>
                <tbody>
                  {participants.map((p, i) => (
                    <tr key={i} className="border-t border-[#F0F0F0]"><td className="px-4 py-2">{p.trade}</td><td className="px-4 py-2 font-medium">{p.name}</td><td className="px-4 py-2 text-[11px] italic text-[#9CA3AF]">회의 시 자필</td></tr>
                  ))}
                  {participants.length === 0 && <tr><td colSpan={3} className="px-4 py-3 text-center text-[#9CA3AF]">배정 작업자 없음</td></tr>}
                </tbody>
              </table>
            </Card>

            {/* 생성 */}
            <div className="flex items-center justify-between rounded-[5px] border border-[#D7D7D7] bg-white p-4">
              <div className="text-xs text-[#6B7280]">
                생성 문서: 위험성평가서 · 근로자 참여 회의록 · 참석자 명단 · 결재 (오창 원청 서식)
              </div>
              <Button onClick={generate} disabled={busy || selectedTrades.length === 0}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {busy ? '생성 중…' : 'AI 초안 생성 · 다운로드'}
              </Button>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
