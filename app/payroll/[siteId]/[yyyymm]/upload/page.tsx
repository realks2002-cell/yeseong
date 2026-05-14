import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Nav } from '@/components/nav';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Camera } from 'lucide-react';
import { getServerSupabase } from '@/lib/supabase/server';

export default async function UploadPage({
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
    <div className="min-h-svh">
      <Nav />
      <main className="mx-auto max-w-3xl p-6">
        <Link href={`/payroll/${siteId}/${yyyymm}`} className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
          <ArrowLeft className="h-4 w-4" />
          노임대장으로
        </Link>
        <div className="mt-6 rounded-[5px] border border-dashed border-zinc-300 bg-white p-12 text-center">
          <Camera className="mx-auto h-10 w-10 text-zinc-300" />
          <h1 className="mt-4 text-lg font-semibold">출역부 사진 업로드</h1>
          <p className="mt-2 text-sm text-zinc-500">
            {ws.name} · {yyyymm}
          </p>
          <p className="mt-6 text-sm text-zinc-500">
            Vision 자동 입력 기능은 준비 중입니다.<br />
            현재는 노임대장 그리드에서 직접 입력해주세요.
          </p>
          <Link href={`/payroll/${siteId}/${yyyymm}`}>
            <Button className="mt-8">노임대장 그리드로 이동</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
