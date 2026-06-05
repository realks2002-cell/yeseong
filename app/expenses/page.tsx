'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { PhotoViewer, type Photo } from '@/components/photo-viewer';
import { Receipt, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';
import { downloadFile } from '@/lib/utils/download';

// 영수증 = 팀장앱 증빙의 '비용·영수증'(expense) 카테고리 사진
//   업로드는 팀장앱에서만 가능 — 여기는 모아보기 전용

type ApiPhoto = {
  id: string;
  worker_id: string;
  worker_name: string;
  worksite_id: string;
  worksite_name: string;
  photo_date: string;
  memo: string | null;
  uploaded_at: string;
  signed_url: string | null;
};

type Option = { id: string; name: string };

function currentYm(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60_000);
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, '0')}`;
}

function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
}

function fmtDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${dow})`;
}

export default function ExpensesPage() {
  const [ym, setYm] = useState(currentYm());
  const [siteId, setSiteId] = useState('');
  const [sites, setSites] = useState<Option[]>([]);
  const [photos, setPhotos] = useState<ApiPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/worksites?includeArchived=true', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Array<{ id: string; name: string }>) => setSites(list.map((w) => ({ id: w.id, name: w.name }))))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const { from, to } = monthRange(ym);
    const qs = new URLSearchParams({ category: 'expense', from, to });
    if (siteId) qs.set('worksite', siteId);
    const r = await fetch(`/api/admin/site-photos?${qs.toString()}`, { cache: 'no-store' });
    if (!r.ok) {
      setError('목록을 불러오지 못했습니다');
      setPhotos([]);
      return;
    }
    const json = await r.json();
    setPhotos((json.photos ?? []) as ApiPhoto[]);
  }, [ym, siteId]);

  useEffect(() => { load(); }, [load]);

  // 날짜별 그룹
  const groups = useMemo(() => {
    const map = new Map<string, ApiPhoto[]>();
    for (const p of photos ?? []) {
      if (!map.has(p.photo_date)) map.set(p.photo_date, []);
      map.get(p.photo_date)!.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [photos]);

  const handleDownload = async (p: ApiPhoto) => {
    if (!p.signed_url || downloadingId) return;
    setDownloadingId(p.id);
    try {
      await downloadFile(p.signed_url, `영수증_${p.photo_date}_${p.worker_name}`);
    } catch {
      alert('다운로드에 실패했습니다.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <AdminShell>
      <div className="max-w-5xl p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-[#447D9B]" />
            영수증
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            팀장이 앱(현장증빙 → 비용·영수증)으로 올린 영수증 사진입니다. 업로드는 팀장앱에서만 가능합니다.
          </p>
        </div>

        {/* 필터 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-[5px] border border-[#D7D7D7] bg-white px-1 py-1">
            <button onClick={() => setYm(shiftYm(ym, -1))} className="rounded p-1 hover:bg-[#F5F5F5]">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-sm font-bold tabular-nums">
              {ym.replace('-', '년 ')}월
            </span>
            <button onClick={() => setYm(shiftYm(ym, 1))} className="rounded p-1 hover:bg-[#F5F5F5]">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="h-9 rounded-[5px] border border-[#D7D7D7] bg-white px-2 text-sm"
          >
            <option value="">전체 현장</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {photos !== null && (
            <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
              {photos.length}건
            </span>
          )}
        </div>

        {error && <p className="rounded-[5px] bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        {/* 목록 */}
        {photos === null ? (
          <p className="py-10 text-center text-sm text-[#9CA3AF]">불러오는 중...</p>
        ) : groups.length === 0 ? (
          <Card className="py-12 text-center text-sm text-[#9CA3AF]">
            이 달에 등록된 영수증이 없습니다. 팀장앱 현장증빙에서 비용·영수증으로 올리면 표시됩니다.
          </Card>
        ) : (
          <div className="space-y-5">
            {groups.map(([date, list]) => (
              <div key={date}>
                <h2 className="mb-2 text-sm font-bold text-[#091413]">
                  {fmtDay(date)}
                  <span className="ml-2 text-xs font-semibold text-[#9CA3AF]">{list.length}건</span>
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {list.map((p) => (
                    <Card key={p.id} className="overflow-hidden p-0">
                      <button
                        type="button"
                        onClick={() =>
                          p.signed_url &&
                          setViewing({
                            url: p.signed_url,
                            label: `영수증 · ${p.worker_name} · ${p.worksite_name}`,
                            uploadedAt: p.uploaded_at,
                            memo: p.memo ?? undefined,
                          })
                        }
                        className="block aspect-[4/3] w-full bg-[#F5F5F5]"
                      >
                        {p.signed_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.signed_url} alt="영수증" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <span className="flex h-full items-center justify-center text-xs text-[#9CA3AF]">미리보기 불가</span>
                        )}
                      </button>
                      <div className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-[#091413]">{p.worker_name} 팀장</p>
                          <p className="truncate text-[11px] text-[#6B7280]">{p.worksite_name}</p>
                          {p.memo && <p className="truncate text-[11px] text-[#4B5563]">{p.memo}</p>}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownload(p)}
                          disabled={!p.signed_url || downloadingId === p.id}
                          className="shrink-0 rounded p-1.5 text-[#447D9B] hover:bg-[#F5F5F5] disabled:opacity-40"
                          title="다운로드"
                        >
                          {downloadingId === p.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
    </AdminShell>
  );
}
