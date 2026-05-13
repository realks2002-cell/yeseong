'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileArchive } from 'lucide-react';

export function ZipAllButton({ yyyymm }: { yyyymm: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/payroll/zip-all?yyyymm=${yyyymm}`, { cache: 'no-store' });
      if (!res.ok) {
        const t = await res.text();
        setError(t || '다운로드 실패');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `노임대장_전체_${yyyymm}.zip`;
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

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={download} disabled={busy} variant="outline">
        <FileArchive className="h-4 w-4" />
        {busy ? '생성 중...' : `${yyyymm} 전체 ZIP`}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
