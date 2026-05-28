'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, Calendar, ChevronRight, MapPin, FileSpreadsheet, Hammer } from 'lucide-react';
import { ZipAllButton } from './zip-all-button';

export type WorksiteCard = {
  id: string;
  name: string;
  address: string | null;
  subs: string[];
};

type Tab = 'normal' | 'masonry';

export function PayrollTabs({
  ym,
  normal,
  masonry,
  allSubs,
}: {
  ym: string;
  normal: WorksiteCard[];
  masonry: WorksiteCard[];
  allSubs: string[];
}) {
  // 일반이 비었고 매사만 있으면 매사 탭부터 (빈 탭 먼저 보이지 않게)
  const [tab, setTab] = useState<Tab>(normal.length === 0 && masonry.length > 0 ? 'masonry' : 'normal');
  const cards = tab === 'normal' ? normal : masonry;

  const tabButton = (key: Tab, label: string, Icon: typeof FileSpreadsheet, count: number) => {
    const active = tab === key;
    return (
      <button
        type="button"
        onClick={() => setTab(key)}
        className={`inline-flex h-[34px] items-center gap-1.5 rounded-[5px] px-3.5 text-[13px] font-semibold transition-colors ${
          active ? 'bg-[#447D9B] text-white' : 'text-[#6B7280] hover:bg-[#F5F5F5]'
        }`}
      >
        <Icon className="h-4 w-4" />
        {label}
        <span
          className={`ml-0.5 rounded-full px-1.5 text-[11px] tabular-nums ${
            active ? 'bg-white/20' : 'bg-[#D7D7D7] text-[#091413]'
          }`}
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="inline-flex rounded-[5px] border border-[#D7D7D7] bg-white p-0.5">
          {tabButton('normal', '일반 노임대장', FileSpreadsheet, normal.length)}
          {tabButton('masonry', '매사 노임대장', Hammer, masonry.length)}
        </div>
        {tab === 'normal' ? (
          <ZipAllButton yyyymm={ym} kind="normal" subcontractors={allSubs} />
        ) : (
          <ZipAllButton yyyymm={ym} kind="masonry" />
        )}
      </div>

      {cards.length === 0 ? (
        <p className="mt-10 text-center text-sm text-[#9CA3AF]">
          {ym} {tab === 'normal' ? '일반' : '매사'} 노임대장 데이터가 있는 현장이 없습니다.
        </p>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((ws) => (
            <Card key={ws.id}>
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-[#6B7280]">
                    <MapPin className="h-3.5 w-3.5" />
                    현장
                  </div>
                  {tab === 'masonry' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#FE7743]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FE7743]">
                      <Hammer className="h-3 w-3" />
                      매사
                    </span>
                  )}
                </div>
                <CardTitle className="text-base">{ws.name}</CardTitle>
                {ws.address && <p className="line-clamp-1 text-[11px] text-[#6B7280]">{ws.address}</p>}
                {tab === 'normal' && ws.subs.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <Building2 className="h-3 w-3 text-[#9CA3AF]" />
                    {ws.subs.map((name) => (
                      <span
                        key={name}
                        className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-blue-100"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <Link href={`/payroll/${ws.id}/${ym}`}>
                  <Button
                    size="sm"
                    variant={tab === 'masonry' ? 'outline' : 'default'}
                    className="w-full justify-between"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      {ym} {tab === 'masonry' ? '매사 노임대장' : '노임대장'} 열기
                    </span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
