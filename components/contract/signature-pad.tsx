'use client';
// 전자서명 캔버스 (signature_pad 이식). 손가락/마우스로 서명 → PNG dataURL 콜백.
//   - devicePixelRatio 보정으로 고해상도 디스플레이 선명도 유지
import { useRef, useEffect } from 'react';
import SignaturePadLib from 'signature_pad';
import { Eraser } from 'lucide-react';

export function SignaturePad({
  onSave,
  loading,
}: {
  onSave: (dataUrl: string) => void;
  loading?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d')?.scale(ratio, ratio);

    padRef.current = new SignaturePadLib(canvas, {
      backgroundColor: 'rgb(255,255,255)',
      penColor: 'rgb(0,0,0)',
    });

    return () => {
      padRef.current?.off();
    };
  }, []);

  function handleClear() {
    padRef.current?.clear();
  }

  function handleSave() {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      alert('서명을 입력해주세요.');
      return;
    }
    onSave(pad.toDataURL('image/png'));
  }

  return (
    <div className="space-y-3">
      <div className="rounded-[8px] border border-zinc-300 bg-white">
        <canvas
          ref={canvasRef}
          className="h-48 w-full cursor-crosshair touch-none"
          style={{ touchAction: 'none' }}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleClear}
          disabled={loading}
          className="inline-flex h-11 items-center gap-1.5 rounded-[8px] border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 disabled:opacity-50"
        >
          <Eraser className="h-4 w-4" />
          지우기
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="inline-flex h-11 flex-1 items-center justify-center rounded-[8px] bg-[#1a237e] px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? '저장 중…' : '서명 완료'}
        </button>
      </div>
    </div>
  );
}
