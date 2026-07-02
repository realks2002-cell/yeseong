'use client';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileText, Eye, Trash2 } from 'lucide-react';
import { samplePreviewDoc } from '@/lib/contract/variables';
import { ContractDocument } from '@/components/contract/contract-document';

type Template = {
  id: string;
  title: string;
  body: string;
  wage_type: string | null;
  is_active: boolean;
  updated_at: string;
};

const WAGE_OPTIONS = [
  { value: '', label: '공통 (모든 급여형태)' },
  { value: '일급', label: '일급 (매사 포함)' },
  { value: '월급', label: '월급' },
];
function wageLabel(wt: string | null) {
  return wt ?? '공통';
}

export default function ContractTemplatesPage() {
  const [list, setList] = useState<Template[] | null>(null);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const r = await fetch('/api/contract-templates', { cache: 'no-store' });
    if (!r.ok) {
      setError('양식을 불러오지 못했습니다');
      setList([]);
      return;
    }
    setList(await r.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(t: Template) {
    if (!confirm(`'${t.title}' 양식을 삭제할까요?`)) return;
    const r = await fetch(`/api/contract-templates/${t.id}`, { method: 'DELETE' });
    if (!r.ok) {
      alert((await r.json().catch(() => ({}))).error ?? '삭제 실패');
      return;
    }
    load();
  }

  return (
    <AdminShell>
      <div className="max-w-5xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#091413]">계약서 양식</h1>
            <p className="mt-1 text-sm text-[#6B7280]">
              작업자 급여형태(일급/월급)에 맞는 표준 양식이 ‘계약 현황’ 배포 시 자동 적용됩니다. 양식은 보기 전용입니다.
            </p>
          </div>
        </div>

        {error && (
          <p className="rounded-[5px] bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>
        )}

        {list === null ? (
          <p className="text-sm text-[#6B7280]">불러오는 중…</p>
        ) : list.length === 0 ? (
          <Card className="py-16 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#F5F5F5]">
              <FileText className="h-6 w-6 text-[#9CA3AF]" />
            </div>
            <p className="text-sm font-medium text-[#091413]">등록된 양식이 없습니다.</p>
            <p className="mt-1 text-xs text-[#6B7280]">표준 양식(일당직·월급제)이 필요하면 관리자에게 문의하세요.</p>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {list.map((t) => (
              <Card key={t.id} className="flex items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-[#091413]">{t.title}</p>
                    <span className="rounded bg-[#EDF1F4] px-1.5 py-0.5 text-[10px] font-semibold text-[#273F4F]">
                      {wageLabel(t.wage_type)}
                    </span>
                    {!t.is_active && (
                      <span className="rounded bg-[#F5F5F5] px-1.5 py-0.5 text-[10px] font-semibold text-[#6B7280]">
                        비활성
                      </span>
                    )}
                    {!t.body && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        본문 비어있음
                      </span>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEditing(t)}>
                  <Eye className="h-3.5 w-3.5" /> 보기
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(t)} aria-label="삭제">
                  <Trash2 className="h-3.5 w-3.5 text-red-600" />
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <TemplateEditor
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </AdminShell>
  );
}

// ───────────────────────── 양식 편집 모달 ─────────────────────────
function TemplateEditor({
  template,
  onClose,
  onSaved,
}: {
  template: Template | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  // 기존 양식은 보기 전용 — 본문의 서명/이름 토큰이 깨지지 않도록 편집 차단. 새 양식만 편집 가능.
  const readOnly = template !== null;
  const [title, setTitle] = useState(template?.title ?? '');
  const [wageType, setWageType] = useState(template?.wage_type ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(readOnly);

  async function handleSave() {
    if (!title.trim()) {
      setErr('양식 제목을 입력하세요');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      if (template?.id) {
        const r = await fetch(`/api/contract-templates/${template.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim(), body, wage_type: wageType }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '저장 실패');
      } else {
        const r = await fetch('/api/contract-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim(), body, wage_type: wageType }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '생성 실패');
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[92vw] max-w-3xl max-h-[96vh] min-h-[80vh] overflow-y-auto" showClose={false}>
        <DialogHeader>
          <DialogTitle>{template ? '양식 보기' : '새 양식'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 px-5 pb-5">
          {err && (
            <p className="rounded-[5px] bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{err}</p>
          )}

          {!showPreview &&
            (template ? (
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-[#091413]">{title}</span>
                <span className="rounded bg-[#F5F5F5] px-2 py-0.5 text-xs font-medium text-[#6B7280]">
                  {wageLabel(wageType)}
                </span>
              </div>
            ) : (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm font-medium text-[#091413]">양식 제목</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="예) 일당직 표준 근로계약서"
                  />
                </div>
                <div className="w-[180px]">
                  <label className="mb-1.5 block text-sm font-medium text-[#091413]">급여형태</label>
                  <select
                    value={wageType}
                    onChange={(e) => setWageType(e.target.value)}
                    className="h-10 w-full rounded-[5px] border border-[#D7D7D7] bg-white px-3 text-sm text-[#091413] focus:outline-none focus:ring-2 focus:ring-[#447D9B]"
                  >
                    {WAGE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-[#091413]">
                {showPreview ? '미리보기 (샘플 근로자 · 서명 전 완성본)' : '계약 조건 본문'}
              </label>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setShowPreview((v) => !v)}
                  className="text-xs text-[#447D9B] hover:underline"
                >
                  {showPreview ? '편집으로' : '미리보기'}
                </button>
              )}
            </div>

            {showPreview ? (
              (() => {
                const p = samplePreviewDoc(body, wageType);
                return (
                  <div className="overflow-x-auto rounded-[5px] border border-[#D7D7D7]">
                    <ContractDocument
                      snapshot={p.snapshot}
                      contractDate={p.contractDate}
                      contractEndDate={p.contractEndDate}
                      signDate={p.signDate}
                      renderedBody={p.renderedBody}
                      signatureUrl={null}
                    />
                  </div>
                );
              })()
            ) : (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={24}
                placeholder="계약 조건 내용을 입력하세요"
                className="min-h-[55vh] w-full rounded-[5px] border border-[#D7D7D7] bg-white px-3 py-2 text-sm leading-relaxed text-[#091413] focus:outline-none focus:ring-2 focus:ring-[#447D9B] focus:ring-offset-1"
              />
            )}
          </div>

          {readOnly ? (
            <div className="flex justify-end pt-1">
              <Button variant="outline" onClick={onClose}>닫기</Button>
            </div>
          ) : (
            !showPreview && (
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={onClose} disabled={saving}>
                  취소
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? '저장 중…' : '저장'}
                </Button>
              </div>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
