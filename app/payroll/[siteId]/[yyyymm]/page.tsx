import { AdminShell } from '@/components/admin-shell';
import { getServerSupabase } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PayrollGrid } from './grid';

export default async function PayrollPage({
  params,
}: {
  params: Promise<{ siteId: string; yyyymm: string }>;
}) {
  const { siteId, yyyymm } = await params;
  if (!/^\d{4}-\d{2}$/.test(yyyymm)) notFound();

  const sb = await getServerSupabase();
  const { data: ws } = await sb
    .from('yeseong_worksites')
    .select('id, name')
    .eq('id', siteId)
    .single();
  if (!ws) notFound();

  return (
    <AdminShell>
      <PayrollGrid siteId={siteId} siteName={ws.name} yearMonth={yyyymm} />
    </AdminShell>
  );
}
