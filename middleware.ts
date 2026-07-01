// middleware.ts — refresh Supabase session cookies on every page request.
// Uses getSession() (not getUser()) to avoid making a server-side network call
// on every request — getUser() was causing excessive auth API calls and rate-limit
// errors (429) that triggered spurious SIGNED_OUT events in the browser SDK.
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getSession() reads from cookies and only calls Supabase if the token needs
  // refreshing (i.e. it's expired). This is much cheaper than getUser() which
  // makes a server-side validation call on every single request.
  await supabase.auth.getSession();

  return response;
}

export const config = {
  matcher: [
    // Skip Next.js internals, static assets, and API routes.
    // API routes (/api/*) handle their own auth and don't need session refresh.
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
