'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Download, FileSignature, Loader2 } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { ContractDocument } from '@/components/contract/contract-document';
import { SignaturePad } from '@/components/contract/signature-pad';
import { downloadContractPdf } from '@/lib/contract/pdf';
import type { ContractSnapshot } from '@/lib/contract/context';

type Doc = {
  id: string;
  snapshot: ContractSnapshot;
  contract_date: string;
  contract_end_date: string | null;
  sign_date: string | null;
  rendered_body: string;
  signature_data_url: string | null;
  signed_at?: string;
};
type Resp = { state: 'none' | 'issued' | 'signed'; doc: Doc | null };

export default function WorkerContractPage() {
  const router = useRouter();
  const sb = getBrowserSupabase();
  const docRef = useRef<HTMLDivElement>(null);

  const [resp, setResp] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      router.replace('/m/signup');
      return;
    }
    try {
      const res = await fetch('/api/m/contract', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '불러오기 실패');
      setResp(json as Resp);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [sb, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSign(dataUrl: string) {
    if (!resp?.doc) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/m/contract/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract_id: resp.doc.id, signature_data_url: dataUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '서명 실패');
      setSigning(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handlePdf() {
    if (!docRef.current) return;
    setPdfBusy(true);
    try {
      const name = resp?.doc?.snapshot.worker_name ?? '근로계약서';
      await downloadContractPdf(docRef.current, `근로계약서_${name}_${resp?.doc?.contract_date ?? ''}.pdf`);
    } catch {
      setError('PDF 생성에 실패했습니다');
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <MobileShell>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-100 bg-white/90 px-4 py-3 backdrop-blur">
        <button type="button" onClick={() => router.back()} aria-label="뒤로" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 active:bg-zinc-100">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="text-lg font-bold text-zinc-900">근로계약서</h1>
      </div>

      <div className="px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {error && (
          <p className="mb-3 rounded-[8px] bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>
        )}

        {resp === null && !error && (
          <div className="flex h-40 items-center justify-center text-zinc-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 불러오는 중…
          </div>
        )}

        {resp?.state === 'none' && (
          <EmptyState text="배포된 근로계약서가 없습니다. 관리자가 계약서를 배포하면 여기에 표시됩니다." />
        )}

        {resp?.doc && (resp.state === 'issued' || resp.state === 'signed') && (
          <>
            {resp.state === 'signed' && (
              <div className="mb-3 flex items-center justify-between rounded-[8px] bg-emerald-50 px-4 py-3">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                  <FileSignature className="h-4 w-4" /> 서명 완료
                </span>
                <button
                  type="button"
                  onClick={handlePdf}
                  disabled={pdfBusy}
                  className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#1a237e] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  PDF 저장
                </button>
              </div>
            )}

            <div className="overflow-x-auto rounded-[8px] ring-1 ring-zinc-200">
              <ContractDocument
                ref={docRef}
                snapshot={resp.doc.snapshot}
                contractDate={resp.doc.contract_date}
                contractEndDate={resp.doc.contract_end_date}
                signDate={resp.doc.sign_date}
                renderedBody={resp.doc.rendered_body}
                signatureUrl={resp.doc.signature_data_url}
              />
            </div>

            {resp.state === 'issued' && !signing && (
              <button
                type="button"
                onClick={() => setSigning(true)}
                className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-[#1a237e] text-base font-semibold text-white"
              >
                <FileSignature className="h-5 w-5" /> 동의하고 서명하기
              </button>
            )}

            {resp.state === 'issued' && signing && (
              <div className="mt-4 space-y-2">
                <p className="text-center text-xs text-zinc-500">손가락으로 서명하세요</p>
                <SignaturePad onSave={handleSign} loading={saving} />
                <button
                  type="button"
                  onClick={() => setSigning(false)}
                  disabled={saving}
                  className="h-10 w-full text-sm text-zinc-500 disabled:opacity-50"
                >
                  취소
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </MobileShell>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-6 rounded-[8px] bg-zinc-50 px-6 py-12 text-center text-sm text-zinc-500 ring-1 ring-zinc-100">
      {text}
    </div>
  );
}
