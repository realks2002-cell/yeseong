'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { SitePhotosSection } from '@/components/mobile/site-photo-uploader';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { getMirrorId } from '@/lib/manager/mirror';

export default function ManagerSitePhotosPage() {
  const router = useRouter();
  const sb = getBrowserSupabase();
  const [ready, setReady] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [mirrorId, setMirrorId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const mirror = getMirrorId();
      if (mirror) {
        setMirrorId(mirror);
        setReadOnly(true);
        setReady(true);
        return;
      }
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        router.replace('/m/manager/signup');
        return;
      }
      setReady(true);
    })();
  }, [sb, router]);

  return (
    <MobileShell showTabs activeTab="proofs" variant="manager">
      <div className="px-7 pt-14 pb-2">
        <h1 className="text-[34px] font-bold text-zinc-900">현장증빙 제출</h1>
      </div>

      {ready ? (
        <SitePhotosSection
          categories={['tbm', 'materials', 'expense']}
          readOnly={readOnly}
          mirrorId={mirrorId}
        />
      ) : (
        <div className="flex h-40 items-center justify-center text-zinc-400">로딩…</div>
      )}
    </MobileShell>
  );
}
