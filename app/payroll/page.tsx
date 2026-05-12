import Link from 'next/link';
import { AdminShell } from '@/components/admin-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MOCK_WORKSITES } from '@/lib/mock/store';
import { Calendar, ChevronRight, MapPin } from 'lucide-react';

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function PayrollIndexPage() {
  const ym = currentYearMonth();
  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl p-6">
        <h1 className="text-2xl font-bold tracking-tight">노임대장</h1>
        <p className="text-sm text-zinc-500 mt-1">현장을 선택하여 월별 노임대장을 관리하세요.</p>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {MOCK_WORKSITES.map(ws => (
            <Card key={ws.id}>
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
                  <MapPin className="h-3.5 w-3.5" />
                  현장
                </div>
                <CardTitle className="text-base">{ws.name}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <Link href={`/payroll/${ws.id}/${ym}`}>
                  <Button size="sm" className="w-full justify-between">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      {ym} 노임대장 열기
                    </span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
