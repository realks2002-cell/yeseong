import { Nav } from '@/components/nav';
import { getMockWorksite } from '@/lib/mock/store';
import { notFound } from 'next/navigation';
import { UploadFlow } from './flow';

export default async function UploadPage({
  params,
}: {
  params: Promise<{ siteId: string; yyyymm: string }>;
}) {
  const { siteId, yyyymm } = await params;
  const ws = getMockWorksite(siteId);
  if (!ws) notFound();
  if (!/^\d{4}-\d{2}$/.test(yyyymm)) notFound();
  return (
    <div className="min-h-svh">
      <Nav />
      <UploadFlow siteId={siteId} siteName={ws.name} yearMonth={yyyymm} />
    </div>
  );
}
