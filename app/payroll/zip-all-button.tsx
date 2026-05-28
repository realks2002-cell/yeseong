'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileArchive, ChevronDown } from 'lucide-react';

type Kind = 'normal' | 'masonry';

const CONFIG: Record<Kind, { endpoint: string; label: string; zipPrefix: string }> = {
  normal: { endpoint: '/api/payroll/zip-all', label: '일반 노임대장 전체 ZIP', zipPrefix: '노임대장' },
  masonry: { endpoint: '/api/payroll/zip-all-masonry', label: '매사 노임대장 전체 ZIP', zipPrefix: '매사노임대장' },
};

export function ZipAllButton({
  yyyymm,
  kind = 'normal',
  subcontractors = [],
}: {
  yyyymm: string;
  kind?: Kind;
  subcontractors?: string[];
}) {
  const cfg = CONFIG[kind];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSub, setShowSub] = useState(false);

  const download = async (subcontractor?: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setShowSub(false);
    try {
      const params = new URLSearchParams({ yyyymm });
      if (subcontractor) params.set('subcontractor', subcontractor);
      const res = await fetch(`${cfg.endpoint}?${params}`, { cache: 'no-store' });
      if (!res.ok) {
        const t = await res.text();
        setError(t || '다운로드 실패');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') ?? '';
      const match = cd.match(/filename\*=UTF-8''(.+)/);
      a.download = match ? decodeURIComponent(match[1]) : `${cfg.zipPrefix}_${subcontractor ?? '전체'}_${yyyymm}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // 전문건설사별 ZIP — 현장↔전문건설사 1:1이라 일반·매사 모두 지원
  const showSubMenu = subcontractors.length > 0;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button onClick={() => download()} disabled={busy} variant="outline">
          <FileArchive className="h-4 w-4" />
          {busy ? '생성 중...' : cfg.label}
        </Button>
        {showSubMenu && (
          <div className="relative">
            <Button onClick={() => setShowSub(!showSub)} disabled={busy} variant="outline">
              <FileArchive className="h-4 w-4" />
              전문건설사별 ZIP
              <ChevronDown className="h-3.5 w-3.5 ml-1" />
            </Button>
            {showSub && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSub(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-[5px] border border-[#D7D7D7] bg-white py-1 shadow-lg">
                  {subcontractors.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => download(name)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-[#F5F5F5] text-left"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-600 max-w-xs text-right">{error}</p>}
    </div>
  );
}
