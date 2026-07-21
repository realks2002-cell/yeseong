'use client';

// 모바일 BottomSheet — 사진 업로드 직전 메모 입력 (선택).
//   - 빈 메모는 null로 저장. ESC/백드롭/건너뛰기 동일하게 null 저장.
//   - 업로드 자체는 부모가 처리 — 본 컴포넌트는 메모만 수집.

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export function MemoInputSheet({
  open,
  thumbnailBlob,
  placeholder,
  stepLabel,
  onSave,
  onCancel,
}: {
  open: boolean;
  thumbnailBlob: Blob | null;
  placeholder?: string;
  stepLabel?: string;
  onSave: (memo: string | null) => void;
  onCancel: () => void;
}) {
  const [memo, setMemo] = useState('');
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setMemo('');
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  useEffect(() => {
    if (!thumbnailBlob) {
      setThumbUrl(null);
      return;
    }
    const url = URL.createObjectURL(thumbnailBlob);
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbnailBlob]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white shadow-2xl pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h3 className="flex items-center gap-2 text-base font-bold text-zinc-900">
            메모 (선택)
            {stepLabel && (
              <span className="rounded-full bg-navy/10 px-2 py-0.5 text-xs font-bold text-navy tabular-nums">
                {stepLabel}
              </span>
            )}
          </h3>
          <button type="button" onClick={onCancel} className="p-1" aria-label="닫기">
            <X className="h-5 w-5 text-zinc-500" />
          </button>
        </div>

        {thumbUrl && (
          <div className="px-5 pb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbUrl}
              alt=""
              className="h-32 w-full rounded-[5px] border border-zinc-200 object-cover"
            />
          </div>
        )}

        <div className="px-5 pb-3">
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value.slice(0, 500))}
            placeholder={placeholder ?? '예) 시멘트 50포대 입고, 자재 송장 #20260530-014'}
            rows={3}
            className="w-full resize-none rounded-[5px] border border-zinc-200 px-4 py-3 text-base text-zinc-900 placeholder-zinc-400 outline-none focus:border-navy"
          />
          <p className="mt-1 text-right text-xs text-zinc-400">{memo.length}/500</p>
        </div>

        <div className="grid grid-cols-2 gap-3 px-5 pb-5">
          <button
            type="button"
            onClick={() => onSave(null)}
            className="h-12 rounded-[5px] bg-zinc-100 text-base font-bold text-zinc-700 active:bg-zinc-200"
          >
            건너뛰기
          </button>
          <button
            type="button"
            onClick={() => onSave(memo.trim() === '' ? null : memo.trim())}
            className="h-12 rounded-[5px] bg-navy text-base font-bold text-white active:bg-blue-800"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
