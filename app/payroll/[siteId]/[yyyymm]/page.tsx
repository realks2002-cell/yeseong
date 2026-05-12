import { AdminShell } from '@/components/admin-shell';
import { getMockWorksite } from '@/lib/mock/store';
import { notFound } from 'next/navigation';
import { PayrollGrid } from './grid';

export default async function PayrollPage({
  params,
}: {
  params: Promise<{ siteId: string; yyyymm: string }>;
}) {
  const { siteId, yyyymm } = await params;

  const ws = getMockWorksite(siteId);
  if (!ws) notFound();
  if (!/^\d{4}-\d{2}$/.test(yyyymm)) notFound();

  return (
    <AdminShell>
      <PayrollGrid
        siteId={siteId}
        siteName={ws.name}
        yearMonth={yyyymm}
      />
    </AdminShell>
  );
}
