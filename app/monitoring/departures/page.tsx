'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { LogOut, ChevronLeft, ChevronRight, ExternalLink, MapPin, Users } from 'lucide-react';

type DepartureRow = {
  id: string;
  worker_id: string;
  worker_name: string;
  worker_phone: string | null;
  worksite_name: string;
  latitude: number;
  longitude: number;
  distance_m: number | null;
  created_at: string;
};

type ApiResponse = {
  items: DepartureRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: { totalEvents: number; workerCount: number };
};

const TODAY_ISO = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mi}`;
}

function fmtDistance(m: number | null): string {
  if (m === null) return '-';
  if (m >= 1000) return `${(m / 1000).toFixed(1)}km`;
  return `${m}m`;
}

export default function DeparturesPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(TODAY_ISO);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ date, page: String(page), pageSize: String(pageSize) });
    const r = await fetch(`/api/admin/departures?${params}`, { cache: 'no-store' });
    if (!r.ok) {
      setError(`불러오기 실패: ${r.status}`);
      setLoading(false);
      return;
    }
    setData(await r.json());
    setLoading(false);
  }, [date, page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <AdminShell>
      <div className="max-w-7xl p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <LogOut className="h-6 w-6 text-[#447D9B]" />
            이탈 기록
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            근무 시간 중 현장 반경(geofence)을 벗어난 GPS 기록입니다. 50m 이동마다 수집됩니다.
          </p>
        </div>

        {/* 필터 + 요약 */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-xs font-medium text-[#4B5563] block mb-1">날짜</label>
            <input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setPage(1); }}
              className="h-9 rounded-[5px] border border-[#D7D7D7] bg-white px-2.5 text-sm"
            />
          </div>
          {data && (
            <div className="flex gap-3 ml-auto">
              <div className="flex items-center gap-2 rounded-[5px] bg-red-50 px-3 py-2">
                <MapPin className="h-4 w-4 text-red-600" />
                <span className="text-sm font-bold text-red-700">{data.summary.totalEvents}건 이탈</span>
              </div>
              <div className="flex items-center gap-2 rounded-[5px] bg-amber-50 px-3 py-2">
                <Users className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-bold text-amber-700">{data.summary.workerCount}명</span>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-[5px] bg-red-50 p-3 text-sm text-red-600">{error}</p>
        )}

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] [&_th]:border-r [&_th]:border-r-[#EAEAEA] [&_td]:border-r [&_td]:border-r-[#EAEAEA] [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
              <thead className="bg-[#F5F5F5] text-[#4B5563]">
                <tr className="text-center text-[11px]">
                  <th className="px-3 py-2 font-medium w-16">시간</th>
                  <th className="px-3 py-2 font-medium">작업자</th>
                  <th className="px-3 py-2 font-medium">연락처</th>
                  <th className="px-3 py-2 font-medium">현장</th>
                  <th className="px-3 py-2 font-medium w-24">현장과 거리</th>
                  <th className="px-3 py-2 font-medium w-20">위치</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D7D7D7]">
                {loading && !data ? (
                  <tr><td colSpan={6} className="py-10 text-center text-[#9CA3AF]">불러오는 중...</td></tr>
                ) : !data || data.items.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-[#9CA3AF]">이탈 기록이 없습니다.</td></tr>
                ) : (
                  data.items.map((row) => (
                    <tr key={row.id} className="hover:bg-[#F5F5F5]">
                      <td className="px-3 py-2 text-center tabular-nums text-[#4B5563]">{fmtTime(row.created_at)}</td>
                      <td className="px-3 py-2 font-medium">{row.worker_name}</td>
                      <td className="px-3 py-2 text-[#4B5563]">{row.worker_phone ?? '-'}</td>
                      <td className="px-3 py-2 text-[#4B5563]">{row.worksite_name}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`font-semibold ${
                          row.distance_m !== null && row.distance_m >= 1000 ? 'text-red-600' : 'text-amber-600'
                        }`}>
                          {fmtDistance(row.distance_m)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <a
                          href={`https://maps.google.com/?q=${row.latitude},${row.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-[#447D9B] hover:underline"
                        >
                          지도
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* 페이지네이션 */}
        {data && totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded p-1.5 text-[#6B7280] hover:bg-[#F5F5F5] disabled:opacity-40"
              aria-label="이전 페이지"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-[#4B5563] tabular-nums">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded p-1.5 text-[#6B7280] hover:bg-[#F5F5F5] disabled:opacity-40"
              aria-label="다음 페이지"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
