'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Download, Loader2, X } from 'lucide-react';
import { downloadFile } from '@/lib/utils/download';

export type Photo = { url: string; label: string; uploadedAt: string; memo?: string };

export function PhotoViewer({ photo, onClose }: { photo: Photo | null; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!photo || downloading) return;
    setDownloading(true);
    try {
      await downloadFile(photo.url, photo.label);
    } catch {
      alert('다운로드에 실패했습니다.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={!!photo} onOpenChange={(o) => !o && onClose()}>
      {photo && (
        <DialogContent
          showClose={false}
          overlayClassName="z-[60]"
          className="z-[60] w-[92vw] max-w-5xl overflow-hidden bg-[#0a0a0a] p-0 text-white border-[#0a0a0a]"
        >
          <DialogTitle className="sr-only">{photo.label}</DialogTitle>
          <DialogDescription className="sr-only">확대된 사진</DialogDescription>
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
            <div className="text-sm font-semibold text-white">{photo.label}</div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                {downloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                다운로드
              </button>
              <DialogClose className="rounded p-1 text-white/80 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#447D9B]">
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </DialogClose>
            </div>
          </div>
          <div className="flex items-center justify-center bg-black p-3 sm:p-5">
            <img
              src={photo.url}
              alt={photo.label}
              className="max-h-[78vh] max-w-full object-contain"
            />
          </div>
          {photo.memo && (
            <div className="border-t border-white/10 bg-[#0a0a0a] px-4 py-3 text-[13px] leading-relaxed text-white/80">
              <span className="mr-2 text-[11px] font-semibold text-white/50">메모</span>
              {photo.memo}
            </div>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}
