import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/workers',
  '/managers',
  '/worksites',
  '/subcontractors',
  '/payroll',
  '/attendance',
  '/equipment',
  '/expenses',
  '/orders',
  '/monitoring',
  '/settings',
  '/vendors',
];

export async function middleware(req: NextRequest) {
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
  const isProtected = PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));

  if (isProtected && !user) {
    const url = req.nextUrl.clone();
    url.pathname = '/admin';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  if (path === '/admin' && user) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return res;
}

export const config = {
  // 정적 자원 / 모바일(/m/*) / API / 이미지 제외 — 그 외 경로에서만 인증 체크
  matcher: ['/((?!_next/static|_next/image|favicon.ico|m/|api/|landing/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
