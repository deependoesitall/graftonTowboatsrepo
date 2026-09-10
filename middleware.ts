// middleware.ts — refresh Supabase session cookies on every page request.
// Uses getSession() (not getUser()) to avoid making a server-side network call
// on every request — getUser() was causing excessive auth API calls and rate-limit
// errors (429) that triggered spurious SIGNED_OUT events in the browser SDK.
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * shop.graftontowboatservices.com → /shop, on the same Vercel project.
 *
 * WHY A SUBDOMAIN AND NOT A PATH.
 * Browsers scope installed web apps by ORIGIN, not path. Two manifests under
 * one hostname are not reliably two apps on iOS — the spec's `id` field exists
 * to disambiguate them, but Safari's handling of it isn't something anyone can
 * promise. Getting it wrong means Sinclair's staff install "Sinclair's Shop"
 * and get an icon that opens the GTS admin, discovered only after Dave's team
 * has already installed it.
 *
 * A separate origin removes the question entirely: separate icon, separate
 * push permission, separate storage, no shared state to collide.
 */
function shopHostRewrite(request: NextRequest): NextResponse | null {
  const host = (request.headers.get('host') || '').toLowerCase();
  if (!host.startsWith('shop.')) return null;

  const { pathname } = request.nextUrl;

  // Already inside the shop app, or a Next internal — leave it alone.
  if (pathname.startsWith('/shop') || pathname.startsWith('/_next')) return null;

  // ANY file request passes through untouched.
  //
  // The matcher below excludes common image extensions but NOT .webmanifest —
  // so without this, shop.host/shop.webmanifest would be rewritten to
  // /shop/shop.webmanifest, 404, and the install would silently fall back to a
  // default icon and name. The manifest is the one file this whole feature
  // depends on, and it was one regex away from never being served.
  if (pathname.includes('.')) return null;

  // The shop host does not serve the admin panel. Sending someone to the
  // canonical host rather than 404ing means a bookmarked/pasted admin link
  // still works — it just lands on the origin that owns that app.
  if (pathname.startsWith('/admin')) {
    const url = request.nextUrl.clone();
    url.hostname = host.replace(/^shop\./, '');
    return NextResponse.redirect(url);
  }

  // Everything else on this host is the shop app. Rewrite (not redirect) so
  // the address bar keeps saying shop.graftontowboatservices.com — which is
  // also what makes start_url "/" behave for the installed app.
  const url = request.nextUrl.clone();
  url.pathname = `/shop${pathname === '/' ? '' : pathname}`;
  return NextResponse.rewrite(url);
}

export async function middleware(request: NextRequest) {
  const shopped = shopHostRewrite(request);
  if (shopped) return shopped;

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
