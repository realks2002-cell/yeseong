import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

// 사용자 컨텍스트 (RLS 적용) - Server Component / Route Handler에서 사용
export async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          // Server Component에서는 cookies.set이 throw — middleware가 토큰 갱신 처리
          // 토큰 만료 시점에 set 호출이 page render를 죽이지 않도록 swallow
          try {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component context: ignore (middleware/route handler에서는 정상 동작)
          }
        },
      },
    }
  );
}

// 서비스 롤 (RLS 우회) - 시드/임포트 스크립트, 주민번호 복호화 라우트에서만 사용
export function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}
