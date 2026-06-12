'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PhotoViewer, type Photo } from '@/components/photo-viewer';
import { CreditCard, Wallet, Award, ImageOff, Trash2, Loader2, Download } from 'lucide-react';
import { downloadFile } from '@/lib/utils/download';

type DocType = 'id_card' | 'bankbook' | 'certificate';

type ApiDoc = {
  id: string;
  doc_type: DocType;
  mime_type: string;
  file_size: number;
  uploaded_by: 'self' | 'admin';
  created_at: string;
  signed_url: string | null;
};

type InternalDoc = Photo & { id: string };
type DocSet = { id_card: InternalDoc | null; bankbook: InternalDoc | null; certificates: InternalDoc[] };

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function groupDocs(rows: ApiDoc[]): DocSet {
  const idCard = rows.find((r) => r.doc_type === 'id_card');
  const bankbook = rows.find((r) => r.doc_type === 'bankbook');
  const certs = rows.filter((r) => r.doc_type === 'certificate');
  const toDoc = (r: ApiDoc, label: string): InternalDoc => ({
    id: r.id,
    url: r.signed_url ?? '',
    label,
    uploadedAt: r.created_at,
  });
  return {
    id_card: idCard ? toDoc(idCard, '신분증') : null,
    bankbook: bankbook ? toDoc(bankbook, '통장사본') : null,
    certificates: certs.map((r, i) => toDoc(r, `자격증 ${i + 1}`)),
  };
}

export type DocSubject = { kind: 'worker' | 'manager'; id: string; name: string };

function endpointBase(s: DocSubject): string {
  return s.kind === 'manager' ? `/api/managers/${s.id}/documents` : `/api/workers/${s.id}/documents`;
}

export function WorkerDocumentsModal({
  subject,
  onClose,
}: {
  subject: DocSubject | null;
  onClose: () => void;
}) {
  const [docs, setDocs] = useState<DocSet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = async (doc: InternalDoc) => {
    if (!subject || downloadingId) return;
    setDownloadingId(doc.id);
    try {
      await downloadFile(doc.url, `${subject.name}_${doc.label}`);
    } catch {
      alert('다운로드에 실패했습니다.');
    } finally {
      setDownloadingId(null);
    }
  };

  const load = useCallback(async (s: DocSubject) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpointBase(s), { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '불러오기 실패');
      setDocs(groupDocs(json.documents ?? []));
    } catch (e) {
      setError((e as Error).message);
      setDocs(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!subject) {
      setDocs(null);
      setError(null);
      return;
    }
    load(subject);
  }, [subject, load]);

  const handleDelete = async (doc: InternalDoc) => {
    if (!subject) return;
    if (!confirm(`"${doc.label}" 사진을 삭제하시겠습니까?`)) return;
    setDeletingId(doc.id);
    try {
      const res = await fetch(`${endpointBase(subject)}/${doc.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || '삭제 실패');
        return;
      }
      if (viewing && viewing.url === doc.url) setViewing(null);
      await load(subject);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <Dialog open={!!subject} onOpenChange={(o) => !o && onClose()}>
        {subject && (
          <DialogContent className="flex max-h-[85vh] w-[720px] max-w-[95vw] flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>{subject.name} 서류</DialogTitle>
              <DialogDescription>
                업로드된 신분증·통장사본·자격증 사본입니다. 사진을 클릭하면 크게 볼 수 있습니다.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-5">
              {loading && (
                <div className="flex items-center justify-center py-10 text-sm text-[#6B7280]">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  불러오는 중…
                </div>
              )}
              {error && (
                <div className="rounded-[5px] bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
              )}
              {!loading && !error && docs && (
                <DocsContent
                  docs={docs}
                  onView={setViewing}
                  onDelete={handleDelete}
                  onDownload={handleDownload}
                  deletingId={deletingId}
                  downloadingId={downloadingId}
                />
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>

      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

function DocsContent({
  docs,
  onView,
  onDelete,
  onDownload,
  deletingId,
  downloadingId,
}: {
  docs: DocSet;
  onView: (p: Photo) => void;
  onDelete: (d: InternalDoc) => void;
  onDownload: (d: InternalDoc) => void;
  deletingId: string | null;
  downloadingId: string | null;
}) {
  return (
    <>
      <Section icon={CreditCard} title="신분증" count={docs.id_card ? 1 : 0} max={1}>
        {docs.id_card ? (
          <Thumb
            doc={docs.id_card}
            onClick={() => onView(docs.id_card!)}
            onDelete={() => onDelete(docs.id_card!)}
            onDownload={() => onDownload(docs.id_card!)}
            deleting={deletingId === docs.id_card.id}
            downloading={downloadingId === docs.id_card.id}
            aspect="aspect-[4/3]"
            maxWidth="max-w-[200px]"
          />
        ) : (
          <EmptyPlaceholder label="미등록" />
        )}
      </Section>

      <Section icon={Wallet} title="통장사본" count={docs.bankbook ? 1 : 0} max={1}>
        {docs.bankbook ? (
          <Thumb
            doc={docs.bankbook}
            onClick={() => onView(docs.bankbook!)}
            onDelete={() => onDelete(docs.bankbook!)}
            onDownload={() => onDownload(docs.bankbook!)}
            deleting={deletingId === docs.bankbook.id}
            downloading={downloadingId === docs.bankbook.id}
            aspect="aspect-[4/3]"
            maxWidth="max-w-[200px]"
          />
        ) : (
          <EmptyPlaceholder label="미등록" />
        )}
      </Section>

      <Section icon={Award} title="자격증" count={docs.certificates.length} max={5}>
        {docs.certificates.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,200px)] gap-2">
            {docs.certificates.map((c) => (
              <Thumb
                key={c.id}
                doc={c}
                onClick={() => onView(c)}
                onDelete={() => onDelete(c)}
                onDownload={() => onDownload(c)}
                deleting={deletingId === c.id}
                downloading={downloadingId === c.id}
                aspect="aspect-[4/3]"
              />
            ))}
          </div>
        ) : (
          <EmptyPlaceholder label="등록된 자격증이 없습니다" />
        )}
      </Section>
    </>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  max,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  max: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#447D9B]" />
        <h3 className="text-sm font-bold text-[#091413]">{title}</h3>
        <span className="text-[11px] tabular-nums text-[#6B7280]">
          {count}/{max}
        </span>
      </div>
      {children}
    </div>
  );
}

function Thumb({
  doc,
  onClick,
  onDelete,
  onDownload,
  deleting,
  downloading,
  aspect,
  maxWidth = '',
}: {
  doc: InternalDoc;
  onClick: () => void;
  onDelete: () => void;
  onDownload: () => void;
  deleting: boolean;
  downloading: boolean;
  aspect: string;
  maxWidth?: string;
}) {
  return (
    <div className={`group relative ${aspect} ${maxWidth} w-full`}>
      <button
        type="button"
        onClick={onClick}
        className="block h-full w-full overflow-hidden rounded-[5px] border border-[#D7D7D7] bg-[#F5F5F5] transition-colors hover:border-[#447D9B] focus:outline-none focus:ring-2 focus:ring-[#447D9B]"
      >
        {/* signed URL — 토큰 쿼리스트링 때문에 next/image 미사용 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={doc.url}
          alt={doc.label}
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1 text-left text-[10px] font-medium text-white">
          {fmtDate(doc.uploadedAt)}
        </div>
      </button>
      <div className="absolute right-1 top-1 hidden gap-1 opacity-0 transition-opacity group-hover:flex group-hover:opacity-100">
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          className="rounded p-1 text-white bg-[#273F4F]/80 hover:bg-[#273F4F] disabled:opacity-50"
          title="다운로드"
        >
          {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="rounded p-1 text-white bg-red-600/80 hover:bg-red-600 disabled:opacity-50"
          title="삭제"
        >
          {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}

function EmptyPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-20 items-center justify-center rounded-[5px] border border-dashed border-[#D7D7D7] bg-[#FAFAFA] text-xs text-[#9CA3AF]">
      <ImageOff className="mr-1.5 h-3.5 w-3.5" />
      {label}
    </div>
  );
}
