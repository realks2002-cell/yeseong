import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isAdminEmail } from '@/lib/auth/admin-guard';

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/workers',
  '/managers',
  '/worksites',
  '/clients',
  '/subcontractors',
  '/payroll',
  '/attendance',
  '/equipment',
  '/expenses',
  '/orders',
  '/monitoring',
  '/settings',
  '/vendors',
  '/items',
  '/trades',
  '/masonry-prices',
  '/notifications',
  '/announcements',
];

export async function proxy(req: NextRequest) {
  const res = NextResponse.next({ request: req });

  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data: { user } } = await sb.auth.getUser();
  const path = req.nextUrl.pathname;
  // /admin 자체는 로그인 페이지, /admin/* 하위(현장증빙·팀장 화면 보기 등)는 보호
  const isProtected =
    PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + '/')) ||
    path.startsWith('/admin/');

  if (isProtected && !user) {
    const url = req.nextUrl.clone();
    url.pathname = '/admin';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  // 작업자/팀장 세션이 관리자 페이지에 접근하면 모바일 앱으로 (같은 도메인 세션 공유 대비)
  if (isProtected && user && !isAdminEmail(user.email)) {
    return NextResponse.redirect(new URL('/m', req.url));
  }

  if (path === '/admin' && user && isAdminEmail(user.email)) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return res;
}

export const config = {
  // 정적 자원 / 모바일(/m/*) / API / 이미지 제외 — 그 외 경로에서만 인증 체크
  matcher: ['/((?!_next/static|_next/image|favicon.ico|m/|api/|landing/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
