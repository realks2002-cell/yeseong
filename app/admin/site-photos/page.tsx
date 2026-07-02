'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PhotoViewer, type Photo } from '@/components/photo-viewer';
import { Badge, badgeVariants } from '@/components/ui/badge';
import type { VariantProps } from 'class-variance-authority';
import { Camera, Package, Receipt, Filter, Download, Trash2, RefreshCw } from 'lucide-react';

type Category = 'tbm' | 'materials' | 'expense';
type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

const CATEGORY_META: Record<Category, { label: string; icon: typeof Camera; variant: BadgeVariant }> = {
  tbm: { label: '안전 및 공사사진', icon: Camera, variant: 'success' },
  materials: { label: '자재·송장', icon: Package, variant: 'warning' },
  expense: { label: '비용·영수증', icon: Receipt, variant: 'destructive' },
};
// expense(비용·영수증)는 /expenses 전용 — 이 화면 그룹에는 나타나지 않음
const CATEGORY_ORDER: Category[] = ['tbm', 'materials'];

type ApiPhoto = {
  id: string;
  worker_id: string;
  worker_name: string;
  worksite_id: string;
  worksite_name: string;
  photo_date: string;
  category: Category;
  memo: string | null;
  uploaded_at: string;
  signed_url: string | null;
};

type Option = { id: string; name: string };

function todayIso(): string {
  // KST 기준 오늘
  const now = new Date();
  const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60_000);
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, '0')}-${String(kst.getDate()).padStart(2, '0')}`;
}

function shiftIso(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function SitePhotosPage() {
  const today = todayIso();
  const weekAgo = shiftIso(today, -6);

  const [fromDate, setFromDate] = useState(weekAgo);
  const [toDate, setToDate] = useState(today);
  const [siteId, setSiteId] = useState<string>('');
  const [category, setCategory] = useState<Category | ''>('');

  const [photos, setPhotos] = useState<ApiPhoto[] | null>(null);
  const [worksiteOptions, setWorksiteOptions] = useState<Option[]>([]);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zipping, setZipping] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    qs.set('from', fromDate);
    qs.set('to', toDate);
    if (siteId) qs.set('worksite', siteId);
    if (category) qs.set('category', category);
    try {
      const r = await fetch(`/api/admin/site-photos?${qs.toString()}`, { cache: 'no-store' });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${r.status}`);
      }
      const { photos } = (await r.json()) as { photos: ApiPhoto[] };
      setPhotos(photos);
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패');
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, siteId, category]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // 필터용 마스터 데이터 (현장)
    (async () => {
      const wsRes = await fetch('/api/worksites?includeArchived=true', { cache: 'no-store' });
      if (wsRes.ok) {
        const wss: { id: string; name: string }[] = await wsRes.json();
        setWorksiteOptions(wss.map((w) => ({ id: w.id, name: w.name })));
      }
    })();
  }, []);

  type Group = {
    date: string;
    siteId: string;
    siteName: string;
    category: Category;
    photos: ApiPhoto[];
  };

  const groups: Group[] = useMemo(() => {
    if (!photos) return [];
    const map = new Map<string, Group>();
    for (const p of photos) {
      const key = `${p.photo_date}__${p.worksite_id}__${p.category}`;
      if (!map.has(key)) {
        map.set(key, {
          date: p.photo_date,
          siteId: p.worksite_id,
          siteName: p.worksite_name,
          category: p.category,
          photos: [],
        });
      }
      map.get(key)!.photos.push(p);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      if (a.siteName !== b.siteName) return a.siteName.localeCompare(b.siteName);
      return CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    });
  }, [photos]);

  const totalCount = photos?.length ?? 0;

  function openViewer(p: ApiPhoto) {
    if (!p.signed_url) return;
    setViewing({
      url: p.signed_url,
      label: `${CATEGORY_META[p.category].label} · ${p.worker_name} · ${p.worksite_name}`,
      uploadedAt: `${p.photo_date} ${shortTime(p.uploaded_at)}`,
      memo: p.memo ?? undefined,
    });
  }

  async function handleDelete(p: ApiPhoto) {
    if (!confirm(`사진을 삭제할까요?\n업로더: ${p.worker_name}\n메모: ${p.memo || '(없음)'}`)) return;
    const r = await fetch(`/api/admin/site-photos/${p.id}`, { method: 'DELETE' });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      alert(e.error || '삭제 실패');
      return;
    }
    load();
  }

  async function downloadZip() {
    if (zipping) return;
    setZipping(true);
    try {
      const qs = new URLSearchParams();
      qs.set('from', fromDate);
      qs.set('to', toDate);
      if (siteId) qs.set('worksite', siteId);
      if (category) qs.set('category', category);
      const r = await fetch(`/api/admin/site-photos/zip?${qs.toString()}`);
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        alert(e.error || 'ZIP 다운로드 실패');
        return;
      }
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `현장증빙_${fromDate}_${toDate}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setZipping(false);
    }
  }

  function resetFilters() {
    setFromDate(weekAgo);
    setToDate(today);
    setSiteId('');
    setCategory('');
  }

  return (
    <AdminShell>
      <div className="max-w-7xl p-5 space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#091413]">현장증빙</h1>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </header>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#6B7280]">
            <Filter className="h-3.5 w-3.5" />
            필터
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
            <FieldDateRange from={fromDate} to={toDate} onFromChange={setFromDate} onToChange={setToDate} />
            <FieldSelect
              label="현장"
              value={siteId}
              onChange={setSiteId}
              options={[{ value: '', label: '전체' }, ...worksiteOptions.map((s) => ({ value: s.id, label: s.name }))]}
            />
            <FieldSelect
              label="카테고리"
              value={category}
              onChange={(v) => setCategory(v as Category | '')}
              options={[
                // 비용·영수증은 별도 [영수증] 메뉴(/expenses)에서 — 여기서는 제외
                { value: '', label: '전체' },
                { value: 'tbm', label: '안전 및 공사사진' },
                { value: 'materials', label: '자재·송장' },
              ]}
            />
            <div className="flex items-end gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={resetFilters}>
                초기화
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={zipping || totalCount === 0}
                onClick={downloadZip}
                className="flex-1 gap-1"
                title="현재 필터 조건의 사진을 ZIP으로 내려받기"
              >
                <Download className={`h-3.5 w-3.5 ${zipping ? 'animate-bounce' : ''}`} />
                {zipping ? '생성 중...' : 'ZIP'}
              </Button>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-[#9CA3AF]">
            총 <span className="font-semibold text-[#091413]">{totalCount}</span>장 · {groups.length}개 그룹
          </p>
        </Card>

        {error && (
          <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">
            조회 실패: {error}
          </Card>
        )}

        {loading && photos === null ? (
          <Card className="p-12 text-center text-sm text-[#6B7280]">불러오는 중...</Card>
        ) : groups.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-sm text-[#6B7280]">조건에 맞는 사진이 없습니다</p>
            <p className="mt-1 text-[11px] text-[#9CA3AF]">
              작업자·팀장이 앱에서 사진을 올리면 여기에 표시됩니다.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => {
              const meta = CATEGORY_META[g.category];
              const Icon = meta.icon;
              return (
                <Card key={`${g.date}-${g.siteId}-${g.category}`} className="overflow-hidden">
                  <div className="flex items-center justify-between gap-3 border-b border-[#D7D7D7] bg-[#F5F5F5] px-4 py-2.5">
                    <div className="flex items-center gap-2.5 text-[13px]">
                      <Badge variant={meta.variant} appearance="default" size="lg" className="font-semibold">
                        <Icon />
                        {meta.label}
                      </Badge>
                      <span className="font-mono font-semibold text-[#091413]">{g.date}</span>
                      <span className="text-[#9CA3AF]">·</span>
                      <span className="font-semibold text-[#091413]">{g.siteName}</span>
                    </div>
                    <span className="text-[11px] text-[#6B7280]">{g.photos.length}장</span>
                  </div>
                  <div className="p-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                      {g.photos.map((p) => (
                        <PhotoCard key={p.id} photo={p} onOpen={() => openViewer(p)} onDelete={() => handleDelete(p)} />
                      ))}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
      </div>
    </AdminShell>
  );
}

function FieldDateRange({
  from,
  to,
  onFromChange,
  onToChange,
}: {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-[#6B7280]">기간</label>
      <div className="mt-1 flex items-center gap-1.5">
        <input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className="h-9 w-full rounded-[5px] border border-[#D7D7D7] bg-white px-2 text-xs text-[#091413] focus:outline-none focus:ring-2 focus:ring-[#447D9B]"
        />
        <span className="text-[#9CA3AF]">~</span>
        <input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className="h-9 w-full rounded-[5px] border border-[#D7D7D7] bg-white px-2 text-xs text-[#091413] focus:outline-none focus:ring-2 focus:ring-[#447D9B]"
        />
      </div>
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-[#6B7280]">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 w-full rounded-[5px] border border-[#D7D7D7] bg-white px-2 text-xs text-[#091413] focus:outline-none focus:ring-2 focus:ring-[#447D9B]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function PhotoCard({
  photo,
  onOpen,
  onDelete,
}: {
  photo: ApiPhoto;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative overflow-hidden rounded-[5px] border border-[#D7D7D7] bg-white">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F5F5F5]">
          {photo.signed_url ? (
            <img
              src={photo.signed_url}
              alt={photo.memo || photo.category}
              loading="lazy"
              className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-[#9CA3AF]">
              URL 만료
            </div>
          )}
        </div>
        <div className="space-y-1 px-2.5 py-2">
          <div className="flex items-center justify-between text-[11px] text-[#091413]">
            <span className="font-semibold">{photo.worker_name}</span>
            <span className="font-mono text-[#6B7280]">{shortTime(photo.uploaded_at)}</span>
          </div>
          {photo.memo ? (
            <p className="line-clamp-2 text-[11px] leading-tight text-[#4B5563]">{photo.memo}</p>
          ) : (
            <p className="text-[11px] text-[#9CA3AF]">메모 없음</p>
          )}
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
        aria-label="삭제"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
