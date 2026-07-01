// src/app/auth/callback/route.ts
// Handles two flows:
//   1. Google OAuth redirect — exchanges ?code for a session, sends user to /account
//   2. Password reset link — exchanges ?code for a session, sends user to /auth/reset-password
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const type = searchParams.get('type'); // 'recovery' for password reset
  const next = searchParams.get('next') ?? '/account';

  if (!code) {
    return NextResponse.redirect(`${origin}/`);
  }

  // Build the redirect response FIRST, then set cookies ON IT.
  // Using cookies() from next/headers + NextResponse.redirect() loses the
  // Set-Cookie headers — the browser never receives the session cookies.
  const redirectUrl = type === 'recovery'
    ? `${origin}/auth/reset-password`
    : `${origin}${next}`;

  const response = NextResponse.redirect(redirectUrl);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Write to request so downstream server code sees them,
            // and to response so the browser receives the Set-Cookie headers.
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('Auth callback error:', error.message);
    return NextResponse.redirect(`${origin}/?auth_error=true`);
  }

  return response;
}
