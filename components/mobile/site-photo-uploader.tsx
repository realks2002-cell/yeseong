'use client';

// 작업자/팀장 앱의 '현장증빙' 섹션 — TBM·자재·일반·(팀장만)영수증.
//   - 카테고리는 categories prop으로 동적 (작업자 3, 팀장 4)
//   - 사진 선택 → 압축 → 메모 시트 → 업로드 → finalize
//   - 오늘 본인 사진만 표시 (?date=today)

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, Plus, Loader2, ImageOff, CheckCircle2 } from 'lucide-react';
import { ActionSheet } from '@/components/mobile/action-sheet';
import { MemoInputSheet } from '@/components/mobile/memo-input-sheet';
import { PhotoViewer, type Photo } from '@/components/photo-viewer';
import { pickPhotos } from '@/lib/capacitor/photo-picker';
import { compressImage } from '@/lib/image/compress';
import { getBrowserSupabase } from '@/lib/supabase/client';

export type Category = 'tbm' | 'materials' | 'expense';

const BUCKET = 'site-photos';

export const CATEGORY_LABEL: Record<Category, string> = {
  tbm: '안전 및 공사사진',
  materials: '자재·송장',
  expense: '비용·영수증',
};

const CATEGORY_DESC: Record<Category, string> = {
  tbm: '안전점검·공사 현장 사진',
  materials: '자재 입고·송장 사진',
  expense: '식대·부자재·운영 영수증',
};

const CATEGORY_PLACEHOLDER: Record<Category, string> = {
  tbm: '예) 오늘 안전점검 5명 참석, 추락방지대 점검 완료',
  materials: '예) 시멘트 50포대 입고, 자재 송장 #20260530-014',
  expense: '예) 점심 식대 5인분, 신한카드',
};

type ApiPhoto = {
  id: string;
  worksite_id: string;
  photo_date: string;
  category: Category;
  memo: string | null;
  uploaded_at: string;
  signed_url: string | null;
};

function todayIso(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60_000);
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, '0')}-${String(kst.getDate()).padStart(2, '0')}`;
}

export function SitePhotosSection({
  categories,
  readOnly = false,
  mirrorId = null,
}: {
  categories: Category[];
  readOnly?: boolean;
  mirrorId?: string | null;
}) {
  const today = todayIso();
  const [photos, setPhotos] = useState<ApiPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Photo | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const qs = new URLSearchParams({ date: today });
      if (mirrorId) qs.set('managerId', mirrorId);
      const res = await fetch(`/api/m/site-photos?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '불러오기 실패');
      setPhotos((json.photos ?? []) as ApiPhoto[]);
    } catch (e) {
      setError((e as Error).message);
      setPhotos([]);
    }
  }, [today, mirrorId]);

  useEffect(() => {
    load();
  }, [load]);

  if (photos === null && !error) {
    return (
      <section className="px-7 pb-10">
        <div className="mt-3 flex items-center justify-center rounded-[5px] bg-zinc-50 py-10 text-sm text-zinc-400 ring-1 ring-zinc-100">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          불러오는 중…
        </div>
      </section>
    );
  }

  const byCategory = (c: Category) => (photos ?? []).filter((p) => p.category === c);

  return (
    <>
      <section className="px-7 pb-10">
        {error && (
          <p className="mt-3 rounded-[5px] bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        <div className="mt-4 space-y-4">
          {categories.map((c) => (
            <CategoryCard
              key={c}
              category={c}
              photos={byCategory(c)}
              readOnly={readOnly}
              onUploaded={load}
              onView={setViewing}
            />
          ))}
        </div>
      </section>

      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

function CategoryCard({
  category,
  photos,
  readOnly,
  onUploaded,
  onView,
}: {
  category: Category;
  photos: ApiPhoto[];
  readOnly: boolean;
  onUploaded: () => void;
  onView: (p: Photo) => void;
}) {
  return (
    <div className="rounded-[5px] bg-white p-4 ring-1 ring-zinc-200">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-base font-bold text-zinc-900">{CATEGORY_LABEL[category]}</h3>
        <span className="text-xs font-semibold text-zinc-500 tabular-nums">{photos.length}장</span>
      </div>
      <p className="mb-3 text-xs text-zinc-500">{CATEGORY_DESC[category]}</p>

      {photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <Thumb key={p.id} photo={p} onView={onView} />
          ))}
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center rounded-[5px] border border-dashed border-zinc-300 bg-zinc-50 text-sm text-zinc-400">
          <ImageOff className="mr-1.5 h-4 w-4" />
          오늘 등록된 사진이 없어요
        </div>
      )}

      {!readOnly && <UploadButton category={category} onUploaded={onUploaded} />}
    </div>
  );
}

// 영수증(expense)만 한 번에 여러 장 허용. 안전·자재 사진은 기존대로 1장씩.
//   보관함 다중 선택만 여러 장, 카메라 촬영은 1장씩.
const MAX_BATCH = 3;

function UploadButton({ category, onUploaded }: { category: Category; onUploaded: () => void }) {
  const maxBatch = category === 'expense' ? MAX_BATCH : 1;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 이번 배치로 선택·압축된 사진들과 장별 메모 수집 진행 상태
  const [pending, setPending] = useState<Blob[]>([]);
  const [memoIdx, setMemoIdx] = useState(-1); // 메모를 받는 중인 사진 index(-1=없음)
  const [memos, setMemos] = useState<(string | null)[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [done, setDone] = useState(false);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (doneTimer.current) clearTimeout(doneTimer.current);
  }, []);

  const pick = async (source: 'camera' | 'gallery') => {
    setErr(null);
    try {
      const raws = await pickPhotos(source, maxBatch);
      if (raws.length === 0) return;
      setBusy(true);
      const compressed = await Promise.all(
        raws.map((r) => compressImage(r, { maxSide: 1600, quality: 0.8 })),
      );
      setPending(compressed);
      setMemos([]);
      setMemoIdx(0); // 첫 장 메모 입력 시작
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // 사진 1장 업로드(발급→PUT→finalize)
  const uploadOne = async (blob: Blob, memo: string | null) => {
    const urlRes = await fetch('/api/m/site-photos/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, mime_type: 'image/jpeg' }),
    });
    const urlJson = await urlRes.json();
    if (!urlRes.ok) throw new Error(urlJson.error || '업로드 URL 발급 실패');

    const sb = getBrowserSupabase();
    const { error: putErr } = await sb.storage
      .from(BUCKET)
      .uploadToSignedUrl(urlJson.storage_path, urlJson.token, blob, { contentType: 'image/jpeg' });
    if (putErr) throw new Error(putErr.message);

    const finRes = await fetch('/api/m/site-photos/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category,
        storage_path: urlJson.storage_path,
        mime_type: 'image/jpeg',
        file_size: blob.size,
        memo,
      }),
    });
    if (!finRes.ok) {
      const j = await finRes.json().catch(() => ({}));
      throw new Error(j.error || '저장 실패');
    }
  };

  const uploadAll = async (blobs: Blob[], memoList: (string | null)[]) => {
    setBusy(true);
    setErr(null);
    let uploaded = 0;
    try {
      for (let i = 0; i < blobs.length; i++) {
        setProgress({ done: i, total: blobs.length });
        await uploadOne(blobs[i], memoList[i] ?? null);
        uploaded++;
      }
      onUploaded();
      setDone(true);
      if (doneTimer.current) clearTimeout(doneTimer.current);
      doneTimer.current = setTimeout(() => setDone(false), 2500);
    } catch (e) {
      if (uploaded > 0) onUploaded(); // 일부라도 저장됐으면 목록 갱신
      setErr(
        `${(e as Error).message}${uploaded > 0 ? ` (${uploaded}/${blobs.length}장만 저장됨)` : ''}`,
      );
    } finally {
      setBusy(false);
      setProgress(null);
      setPending([]);
      setMemos([]);
    }
  };

  // 장별 메모 저장 → 다음 장으로, 마지막이면 일괄 업로드 시작
  const saveMemo = (memo: string | null) => {
    const collected = [...memos, memo];
    if (memoIdx + 1 < pending.length) {
      setMemos(collected);
      setMemoIdx(memoIdx + 1);
    } else {
      setMemoIdx(-1);
      void uploadAll(pending, collected);
    }
  };

  // 메모 시트 닫기 = 이번 배치 전체 취소(아직 업로드 전)
  const cancelMemo = () => {
    setMemoIdx(-1);
    setPending([]);
    setMemos([]);
  };

  const memoOpen = memoIdx >= 0 && memoIdx < pending.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        disabled={busy}
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[5px] bg-navy text-base font-bold text-white disabled:bg-zinc-300"
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            처리 중…{progress ? ` (${progress.done + 1}/${progress.total})` : ''}
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" />
            사진 추가
          </>
        )}
      </button>
      {err && (
        <p className="mt-1 rounded-[5px] bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{err}</p>
      )}

      {/* 제출 완료 토스트 — 2.5초 후 자동 사라짐 */}
      {done && (
        <div className="pointer-events-none fixed inset-x-0 top-8 z-[60] flex justify-center px-6">
          <div className="flex items-center gap-2 rounded-full bg-zinc-900/90 px-5 py-3 text-sm font-bold text-white shadow-[0_8px_30px_rgba(15,23,42,0.35)] backdrop-blur">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            제출되었습니다
          </div>
        </div>
      )}

      <ActionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="사진 가져오기"
        items={[
          { label: maxBatch > 1 ? '카메라로 촬영 (1장)' : '카메라로 촬영', icon: Camera, onClick: () => pick('camera') },
          {
            label: maxBatch > 1 ? `사진 보관함에서 선택 (최대 ${maxBatch}장)` : '사진 보관함에서 선택',
            icon: ImageIcon,
            onClick: () => pick('gallery'),
          },
        ]}
      />

      <MemoInputSheet
        key={memoIdx}
        open={memoOpen}
        thumbnailBlob={memoOpen ? pending[memoIdx] : null}
        placeholder={CATEGORY_PLACEHOLDER[category]}
        stepLabel={pending.length > 1 ? `${memoIdx + 1} / ${pending.length}` : undefined}
        onSave={saveMemo}
        onCancel={cancelMemo}
      />
    </>
  );
}

// 제출 후 삭제 불가 — 증빙 무결성 보호 (삭제 X 버튼 제거)
function Thumb({ photo, onView }: { photo: ApiPhoto; onView: (p: Photo) => void }) {
  return (
    <div className="relative aspect-[4/3] w-full">
      <button
        type="button"
        onClick={() =>
          photo.signed_url &&
          onView({
            url: photo.signed_url,
            label: CATEGORY_LABEL[photo.category],
            uploadedAt: photo.uploaded_at,
            memo: photo.memo ?? undefined,
          })
        }
        className="block h-full w-full overflow-hidden rounded-[5px] border border-zinc-200 bg-zinc-100 active:opacity-80"
      >
        {photo.signed_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photo.signed_url}
            alt={photo.memo || photo.category}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-zinc-400">URL 만료</div>
        )}
      </button>
    </div>
  );
}
