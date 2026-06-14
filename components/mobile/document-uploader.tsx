'use client';

// 모바일 본인 서류 업로드/조회/삭제 통합 컴포넌트.
//   - 3개 doc_type을 한 컴포넌트가 다 다룸: docType prop으로 분기
//   - 사진 클릭 → 큰 사진 모달 (PhotoViewer 재사용)
//   - 호버 없는 모바일이라 삭제 X 아이콘은 항상 표시

import { useCallback, useEffect, useState } from 'react';
import { Camera, Image as ImageIcon, Plus, RefreshCw, Loader2, X, ImageOff } from 'lucide-react';
import { ActionSheet } from '@/components/mobile/action-sheet';
import { PhotoViewer, type Photo } from '@/components/photo-viewer';
import { pickPhoto } from '@/lib/capacitor/photo-picker';
import { compressImage } from '@/lib/image/compress';
import { getBrowserSupabase } from '@/lib/supabase/client';

export type DocType = 'id_card' | 'bankbook' | 'certificate';

type ApiDoc = {
  id: string;
  doc_type: DocType;
  mime_type: string;
  file_size: number;
  created_at: string;
  signed_url: string | null;
};

type ViewDoc = Photo & { id: string };

const BUCKET = 'worker-documents';

export function DocumentsSection({ readOnly = false }: { readOnly?: boolean }) {
  const [docs, setDocs] = useState<ApiDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Photo | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/m/documents', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '불러오기 실패');
      setDocs(json.documents ?? []);
    } catch (e) {
      setError((e as Error).message);
      setDocs([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (docs === null && !error) {
    return (
      <section className="px-7 pb-10">
        <h2 className="text-lg font-bold text-zinc-900">내 서류</h2>
        <div className="mt-3 flex items-center justify-center rounded-[5px] bg-zinc-50 py-10 text-sm text-zinc-400 ring-1 ring-zinc-100">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          불러오는 중…
        </div>
      </section>
    );
  }

  const byType = (t: DocType) => (docs ?? []).filter((d) => d.doc_type === t);
  const single = (t: 'id_card' | 'bankbook'): ApiDoc | undefined => byType(t)[0];

  return (
    <>
      <section className="px-7 pb-10">
        <h2 className="text-lg font-bold text-zinc-900">내 서류</h2>

        {error && (
          <p className="mt-3 rounded-[5px] bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        <div className="mt-4 space-y-4">
          <SingleSlot
            docType="id_card"
            title="신분증"
            current={single('id_card')}
            readOnly={readOnly}
            onUploaded={load}
            onView={setViewing}
            aspect="aspect-[16/10]"
          />
          <SingleSlot
            docType="bankbook"
            title="통장사본"
            current={single('bankbook')}
            readOnly={readOnly}
            onUploaded={load}
            onView={setViewing}
            aspect="aspect-[3/4]"
            maxWidth="max-w-[200px]"
          />
          <MultiSlot
            docType="certificate"
            title="자격증"
            maxCount={5}
            current={byType('certificate')}
            readOnly={readOnly}
            onUploaded={load}
            onDeleted={load}
            onView={setViewing}
          />
        </div>
      </section>

      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

function SingleSlot({
  docType,
  title,
  current,
  readOnly,
  onUploaded,
  onView,
  aspect,
  maxWidth = '',
}: {
  docType: 'id_card' | 'bankbook';
  title: string;
  current: ApiDoc | undefined;
  readOnly: boolean;
  onUploaded: () => void;
  onView: (p: Photo) => void;
  aspect: string;
  maxWidth?: string;
}) {
  return (
    <Card title={title} count={current ? 1 : 0} max={1}>
      {current?.signed_url ? (
        // 신분증·통장사본은 삭제 불가 — 교체로만 갱신 (증빙 무결성 보호)
        <Thumb
          doc={toView(current, title)}
          onView={onView}
          aspect={aspect}
          maxWidth={maxWidth}
        />
      ) : (
        <Empty label="미등록" />
      )}
      {!readOnly && (
        <UploadButton
          label={current ? '교체' : '등록'}
          icon={current ? RefreshCw : Plus}
          docType={docType}
          existingId={current?.id ?? null}
          onUploaded={onUploaded}
        />
      )}
    </Card>
  );
}

function MultiSlot({
  docType,
  title,
  maxCount,
  current,
  readOnly,
  onUploaded,
  onDeleted,
  onView,
}: {
  docType: 'certificate';
  title: string;
  maxCount: number;
  current: ApiDoc[];
  readOnly: boolean;
  onUploaded: () => void;
  onDeleted: () => void;
  onView: (p: Photo) => void;
}) {
  const canAdd = current.length < maxCount;
  return (
    <Card title={title} count={current.length} max={maxCount}>
      {current.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {current.map((c, i) => (
            <Thumb
              key={c.id}
              doc={toView(c, `${title} ${i + 1}`)}
              onView={onView}
              onDelete={readOnly ? undefined : () => deleteDoc(c.id, onDeleted)}
              aspect="aspect-[4/3]"
            />
          ))}
        </div>
      ) : (
        <Empty label="등록된 자격증이 없어요" />
      )}
      {!readOnly && canAdd && (
        <UploadButton label="추가" icon={Plus} docType={docType} existingId={null} onUploaded={onUploaded} />
      )}
      {!readOnly && !canAdd && (
        <p className="text-xs text-zinc-400">최대 {maxCount}장까지 등록할 수 있어요</p>
      )}
    </Card>
  );
}

function UploadButton({
  label,
  icon: Icon,
  docType,
  existingId,
  onUploaded,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  docType: DocType;
  existingId: string | null;
  onUploaded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handle = async (source: 'camera' | 'gallery') => {
    setErr(null);
    setBusy(true);
    try {
      const raw = await pickPhoto(source);
      if (!raw) return;
      const compressed = await compressImage(raw, { maxSide: 1600, quality: 0.8 });

      // 1) signed upload URL
      const urlRes = await fetch('/api/m/documents/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_type: docType, mime_type: 'image/jpeg' }),
      });
      const urlJson = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlJson.error || '업로드 URL 발급 실패');

      // 2) Supabase JS로 PUT (token 헤더 처리)
      const sb = getBrowserSupabase();
      const { error: putErr } = await sb.storage
        .from(BUCKET)
        .uploadToSignedUrl(urlJson.storage_path, urlJson.token, compressed, {
          contentType: 'image/jpeg',
        });
      if (putErr) throw new Error(putErr.message);

      // 3) finalize
      const finRes = await fetch('/api/m/documents/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_type: docType,
          storage_path: urlJson.storage_path,
          mime_type: 'image/jpeg',
          file_size: compressed.size,
        }),
      });
      if (!finRes.ok) {
        const j = await finRes.json().catch(() => ({}));
        throw new Error(j.error || '저장 실패');
      }
      onUploaded();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-[5px] bg-navy text-base font-bold text-white disabled:bg-zinc-300"
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            업로드 중…
          </>
        ) : (
          <>
            <Icon className="h-4 w-4" />
            {label}{existingId ? ' (현재 사진 대체)' : ''}
          </>
        )}
      </button>
      {err && (
        <p className="mt-1 rounded-[5px] bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{err}</p>
      )}
      <ActionSheet
        open={open}
        onClose={() => setOpen(false)}
        title="사진 가져오기"
        items={[
          { label: '카메라로 촬영', icon: Camera, onClick: () => handle('camera') },
          { label: '사진 보관함에서 선택', icon: ImageIcon, onClick: () => handle('gallery') },
        ]}
      />
    </>
  );
}

async function deleteDoc(docId: string, onDeleted: () => void) {
  if (!confirm('이 사진을 삭제하시겠습니까?')) return;
  const res = await fetch(`/api/m/documents/${docId}`, { method: 'DELETE' });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    alert(j.error || '삭제 실패');
    return;
  }
  onDeleted();
}

function toView(d: ApiDoc, label: string): ViewDoc {
  return { id: d.id, url: d.signed_url ?? '', label, uploadedAt: d.created_at };
}

function Card({
  title,
  count,
  max,
  children,
}: {
  title: string;
  count: number;
  max: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[5px] bg-white p-4 ring-1 ring-zinc-200">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-bold text-zinc-900">{title}</h3>
        <span className="text-xs font-semibold text-zinc-500 tabular-nums">
          {count}/{max}
        </span>
      </div>
      {children}
    </div>
  );
}

function Thumb({
  doc,
  onView,
  onDelete,
  aspect,
  maxWidth = '',
}: {
  doc: ViewDoc;
  onView: (p: Photo) => void;
  onDelete?: () => void;
  aspect: string;
  maxWidth?: string;
}) {
  return (
    <div className={`relative ${aspect} ${maxWidth} w-full`}>
      <button
        type="button"
        onClick={() => onView(doc)}
        className="block h-full w-full overflow-hidden rounded-[5px] border border-zinc-200 bg-zinc-100 active:opacity-80"
      >
        {/* signed URL — next/image 미사용 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={doc.url} alt={doc.label} className="h-full w-full object-cover" loading="lazy" />
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="absolute right-1 top-1 rounded-full bg-black/60 p-1.5 text-white active:bg-black/80"
          title="삭제"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-[5px] border border-dashed border-zinc-300 bg-zinc-50 text-sm text-zinc-400">
      <ImageOff className="mr-1.5 h-4 w-4" />
      {label}
    </div>
  );
}
