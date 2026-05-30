'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { SitePhotosSection } from '@/components/mobile/site-photo-uploader';
import { getBrowserSupabase } from '@/lib/supabase/client';

export default function WorkerSitePhotosPage() {
  const router = useRouter();
  const sb = getBrowserSupabase();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        router.replace('/m/signup');
        return;
      }
      setReady(true);
    })();
  }, [sb, router]);

  return (
    <MobileShell showTabs activeTab="proofs" variant="worker">
      <div className="px-7 pt-10 pb-2">
        <h1 className="text-[34px] font-bold text-zinc-900">증빙 제출</h1>
        <p className="mt-1 text-sm text-zinc-500">
          TBM·자재·일반 사진을 올리면 관리자가 바로 확인합니다.
        </p>
      </div>

      {ready ? (
        <SitePhotosSection categories={['tbm', 'materials', 'general']} />
      ) : (
        <div className="flex h-40 items-center justify-center text-zinc-400">로딩…</div>
      )}
    </MobileShell>
  );
}
