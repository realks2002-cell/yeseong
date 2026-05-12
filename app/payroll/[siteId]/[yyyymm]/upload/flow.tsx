'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MockWorker } from '@/lib/mock/store';
import { loadPayroll, savePayroll } from '@/lib/mock/storage';
import { useWorkers } from '@/lib/mock/use-workers';
import { matchWorkers, type MatchInput, type MatchResult } from '@/lib/matching/match-workers';
import type { VisionResult } from '@/lib/vision/gemini';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, ImagePlus, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

type Props = {
  siteId: string;
  siteName: string;
  yearMonth: string;
};

type DecisionState = {
  // input index → 사용자가 최종 매핑한 worker.id (또는 'skip')
  [inputIdx: number]: string | 'skip';
};

export function UploadFlow({ siteId, siteName, yearMonth }: Props) {
  const { workers: allWorkers } = useWorkers();
  const router = useRouter();
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingMock, setUsingMock] = useState(false);
  const [vision, setVision] = useState<VisionResult | null>(null);
  const [matches, setMatches] = useState<MatchResult[] | null>(null);
  const [decisions, setDecisions] = useState<DecisionState>({});

  function onFile(f: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(reader.result as string);
      setVision(null);
      setMatches(null);
      setError(null);
    };
    reader.readAsDataURL(f);
  }

  async function runVision() {
    if (!imageDataUrl) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/vision/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64DataUrl: imageDataUrl, yearMonth }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'failed');
      const v = json.visionResult as VisionResult;
      setVision(v);
      setUsingMock(json.usingMock);

      // 클라이언트의 최신 작업자 마스터(추가/편집 반영)로 매칭
      const inputs: MatchInput[] = v.workers.map(w => ({
        name: w.name,
        hoursByDay: w.hours_by_day,
        confidence: w.confidence,
      }));
      const m = matchWorkers(inputs, allWorkers);
      setMatches(m);

      const init: DecisionState = {};
      m.forEach((mm, i) => { init[i] = mm.topCandidateId ?? 'skip'; });
      setDecisions(init);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function commit() {
    if (!matches || !vision) return;
    const state = loadPayroll(siteId, yearMonth);
    let added = 0;
    let cellsApplied = 0;

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const decision = decisions[i];
      if (decision === 'skip' || !decision) continue;

      // 슬롯에 등록 (없으면 추가)
      if (!state.enrolledWorkerIds.includes(decision)) {
        if (state.enrolledWorkerIds.length >= 26) continue;
        state.enrolledWorkerIds.push(decision);
        added++;
      }

      // 출역 셀 적용
      for (const [dayStr, hours] of Object.entries(m.input.hoursByDay)) {
        const day = Number(dayStr);
        if (!Number.isFinite(day) || day < 1 || day > 31) continue;
        const idx = state.attendance.findIndex(a => a.workerId === decision && a.day === day);
        if (idx >= 0) state.attendance[idx] = { workerId: decision, day, hours };
        else state.attendance.push({ workerId: decision, day, hours });
        cellsApplied++;
      }
    }

    savePayroll(state);
    alert(`반영 완료: 신규 작업자 ${added}명 · 출역 ${cellsApplied}건`);
    router.push(`/payroll/${siteId}/${yearMonth}`);
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-4">
        <Link href={`/payroll/${siteId}/${yearMonth}`} className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900">
          <ArrowLeft className="h-4 w-4" />
          노임대장으로 돌아가기
        </Link>
      </div>

      <div className="mb-6">
        <p className="text-sm text-zinc-500">{siteName} · {yearMonth}</p>
        <h1 className="text-2xl font-bold tracking-tight">출역부 사진 업로드</h1>
        <p className="text-sm text-zinc-500 mt-1">사진을 올리면 AI가 작업자 이름과 출근일자를 추출합니다.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 좌측: 업로드 */}
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3">1. 사진 선택</h2>
          {!imageDataUrl ? (
            <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 p-12 cursor-pointer hover:bg-zinc-100">
              <ImagePlus className="h-8 w-8 text-zinc-400" />
              <span className="text-sm text-zinc-600">클릭하여 출역부 사진 선택</span>
              <span className="text-xs text-zinc-400">JPG, PNG, HEIC</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
            </label>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-zinc-200 overflow-hidden">
                <img src={imageDataUrl} alt="출역부" className="w-full max-h-[500px] object-contain bg-zinc-50" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setImageDataUrl(null); setVision(null); setMatches(null); }}>
                  다른 사진
                </Button>
                <Button size="sm" onClick={runVision} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  AI로 추출
                </Button>
              </div>
            </div>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </Card>

        {/* 우측: 매칭 결과 */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">2. 매칭 결과 검토</h2>
            {usingMock && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                Mock 응답 (Gemini 키 미설정)
              </span>
            )}
          </div>

          {!matches && (
            <p className="py-12 text-center text-sm text-zinc-400">
              사진 업로드 후 [AI로 추출]을 누르면 결과가 여기 표시됩니다.
            </p>
          )}

          {matches && (
            <div className="space-y-2">
              {matches.map((m, i) => (
                <MatchRow
                  key={i}
                  match={m}
                  allWorkers={allWorkers}
                  decision={decisions[i] ?? 'skip'}
                  onChange={(v) => setDecisions(d => ({ ...d, [i]: v }))}
                />
              ))}
              <div className="pt-3 flex justify-end gap-2">
                <Button variant="outline" onClick={() => router.push(`/payroll/${siteId}/${yearMonth}`)}>취소</Button>
                <Button onClick={commit}>출역에 반영</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}

function MatchRow({
  match,
  allWorkers,
  decision,
  onChange,
}: {
  match: MatchResult;
  allWorkers: MockWorker[];
  decision: string;
  onChange: (v: string) => void;
}) {
  const days = Object.keys(match.input.hoursByDay).map(Number).sort((a, b) => a - b);
  const totalHours = Object.values(match.input.hoursByDay).reduce((a, b) => a + b, 0);

  const icon =
    match.decision === 'auto' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> :
    match.decision === 'review' ? <AlertTriangle className="h-4 w-4 text-amber-600" /> :
    <XCircle className="h-4 w-4 text-red-500" />;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold">{match.input.name}</p>
            <span className="text-xs text-zinc-500">신뢰도 {match.input.confidence}</span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            {days.length}일 출근 (총 {totalHours} 공수): {days.join(', ')}일
          </p>
          <div className="mt-2 flex items-center gap-2">
            <label className="text-xs text-zinc-600">매칭:</label>
            <select
              className="text-sm border border-zinc-200 rounded-md px-2 py-1"
              value={decision}
              onChange={(e) => onChange(e.target.value)}
            >
              <option value="skip">건너뛰기</option>
              {match.candidates.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.defaultTrade ?? '-'}, 일당 {c.defaultWage.toLocaleString()})
                </option>
              ))}
              <optgroup label="다른 작업자에서 선택">
                {allWorkers
                  .filter(w => !match.candidates.find(c => c.id === w.id))
                  .map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.defaultTrade ?? '-'})
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
