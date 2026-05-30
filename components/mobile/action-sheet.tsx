'use client';

// 모바일 BottomSheet — 옵션 리스트 + 취소.
// 백드롭 클릭/취소 버튼/ESC로 닫힘. iOS safe-area 고려.

import { useEffect } from 'react';

export type ActionSheetItem = {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  destructive?: boolean;
};

export function ActionSheet({
  open,
  onClose,
  title,
  items,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  items: ActionSheetItem[];
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white shadow-2xl pb-[env(safe-area-inset-bottom)]">
        {title && (
          <div className="px-5 pt-4 pb-2 text-center text-xs font-medium text-zinc-500">{title}</div>
        )}
        <div className="divide-y divide-zinc-100">
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  item.onClick();
                  onClose();
                }}
                className={`flex w-full items-center gap-3 px-5 py-4 text-base font-semibold active:bg-zinc-100 ${
                  item.destructive ? 'text-red-600' : 'text-zinc-900'
                }`}
              >
                {Icon && <Icon className="h-5 w-5" />}
                {item.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex w-full items-center justify-center border-t border-zinc-100 px-5 py-4 text-base font-bold text-zinc-600 active:bg-zinc-100"
        >
          취소
        </button>
      </div>
    </div>
  );
}
