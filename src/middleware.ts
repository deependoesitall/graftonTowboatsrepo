// src/middleware.ts
//
// ⚠️ THIS FILE MUST LIVE IN src/, NOT THE REPO ROOT. DO NOT MOVE IT.
//
// This project keeps its app under src/app. When a Next.js project uses a src
// directory, middleware must sit inside src/ alongside app/. A middleware.ts at
// the repo root is SILENTLY IGNORED — no warning at build time, no error in the
// logs, no hint in the Vercel dashboard. The build succeeds and the file simply
// never executes.
//
// It lived at the root until Sept 2026 and had never run in production. Two
// things were quietly broken the whole time and neither announced itself:
//
//   1. The shop.* host routing below did nothing, so the Sinclair's app
//      404'd while the domain, DNS and deploy all looked correct.
//   2. The Supabase session refresh underneath never ran either — which is a
//      slow, invisible failure: sessions expire earlier than they should and
//      the symptom is a user "randomly getting logged out".
//
// (2) predates the shop work and is the more valuable half of this fix.
//
// If you ever see middleware behaviour vanish after a refactor, check this
// file's path first. It is the one Next.js convention that fails without
// telling you.

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * shop.graftontowboatservices.com → canonical admin (apex), not the thin /shop
 * PWA.
 *
 * WHY THIS CHANGED.
 * The separate shop.* origin existed so Sinclair's could install a distinct
 * Home Screen app. In practice that app was a feature-lite "To shop" queue —
 * no Products, no Settings, no admin chrome — while the real fulfill UX
 * (ShoppingModeModal: barcode, line edits, weights, substitutions) already
 * lived inside /admin. Managers landed in the incomplete portal by accident.
 *
 * One admin experience: shop.* 307s to the apex /admin/orders (query string
 * preserved, including ?order=&shop=1 deep links into shopping mode). Staff
 * reinstall from /admin/install if they still have the old shop icon.
 *
 * Static assets (icons, .webmanifest) still pass through on shop.* so an
 * outdated install can at least update its manifest; start_url now points
 * staff at apex admin.
 */
function shopHostToAdmin(request: NextRequest): NextResponse | null {
  const host = (request.headers.get('host') || '').toLowerCase();
  if (!host.startsWith('shop.')) return null;

  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/_next')) return null;

  // Let real files through (icons, webmanifest, sw.js). Everything else is a
  // document navigation that should land on the full admin.
  if (pathname.includes('.') && !pathname.endsWith('/')) return null;

  const url = request.nextUrl.clone();
  url.hostname = host.replace(/^shop\./, '');

  if (pathname.startsWith('/admin')) {
    // Already an admin path — just move it to the origin that owns admin.
  } else if (
    pathname === '/install' ||
    pathname === '/shop/install' ||
    pathname.startsWith('/install/') ||
    pathname.startsWith('/shop/install/')
  ) {
    url.pathname = '/admin/install';
  } else {
    // /, /shop, /shop/…, and anything else → Orders (shopping lives here).
    url.pathname = '/admin/orders';
  }

  return NextResponse.redirect(url, 307);
}

/**
 * order.graftontowboatservices.com → the canonical host, same path.
 *
 * ⚠️ THIS IS A CORRECTNESS FIX, NOT TIDYING UP.
 *
 * While both hosts served the ordering app, they were two ORIGINS, and the
 * browser scopes almost everything the order flow depends on by origin:
 *
 *   · The cart, vessel info and saved services all live in localStorage
 *     (cart.ts). A customer who built a cart on order.* and then typed the
 *     bare domain saw an empty cart, with no way to get the first one back.
 *   · The Supabase session is a host-scoped cookie, so an account created on
 *     order.* was simply not signed in on the apex — the same person, the same
 *     password, silently logged out.
 *
 * Neither failure produces an error. The customer just sees an empty cart or a
 * sign-in screen and assumes the site lost their order, and nothing reaches
 * GTS to say it happened.
 *
 * 307, NOT 308, DELIBERATELY. A permanent redirect is cached by browsers and
 * is painful to walk back; during launch this needs to stay reversible.
 * Promote it to 308 once order.* has been quiet for a few weeks.
 *
 * NOTE: this does NOT move anyone's existing cart — localStorage cannot follow
 * a redirect. Carts sitting on order.* are lost the moment this deploys, which
 * is an argument for deploying it sooner, while few people have one.
 */
function orderHostRedirect(request: NextRequest): NextResponse | null {
  const host = (request.headers.get('host') || '').toLowerCase();
  if (!host.startsWith('order.')) return null;

  const url = request.nextUrl.clone();
  url.hostname = host.replace(/^order\./, '');
  return NextResponse.redirect(url, 307);
}

export async function middleware(request: NextRequest) {
  // Legacy host first: order.* should never reach the shop logic or the
  // session refresh below, it should just leave for the canonical origin.
  const legacy = orderHostRedirect(request);
  if (legacy) return legacy;

  const shopped = shopHostToAdmin(request);
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
  // refreshing (i.e. it's expired). This is much cheaper than getUser(), which
  // makes a server-side validation call on every single request and was causing
  // 429s and spurious SIGNED_OUT events in the browser SDK.
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
