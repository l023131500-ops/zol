import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Refreshes the Supabase session cookie and guards protected route prefixes.
 * Server route handlers re-check the role authoritatively; this is the first
 * gate that bounces anonymous users to /auth/login.
 */
const PROTECTED_PREFIXES = ['/admin', '/account'];

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p));

  // Without Supabase configured we cannot authenticate — fail closed on
  // protected routes, pass everything else through.
  if (!url || !anon) {
    if (isProtected) {
      const login = request.nextUrl.clone();
      login.pathname = '/auth/login';
      login.searchParams.set('next', path);
      return NextResponse.redirect(login);
    }
    return response;
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet: CookieToSet[]) => {
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtected && !user) {
    const login = request.nextUrl.clone();
    login.pathname = '/auth/login';
    login.searchParams.set('next', path);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)'],
};
