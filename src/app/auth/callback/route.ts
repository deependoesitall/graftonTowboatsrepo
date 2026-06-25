// src/app/auth/callback/route.ts
// Handles two flows:
//   1. Google OAuth redirect — exchanges ?code for a session, sends user to /account
//   2. Password reset link — exchanges ?code for a session, sends user to /auth/reset-password
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const type = searchParams.get('type'); // 'recovery' for password reset
  const next = searchParams.get('next') ?? '/account';

  if (!code) {
    return NextResponse.redirect(`${origin}/`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('Auth callback error:', error.message);
    return NextResponse.redirect(`${origin}/?auth_error=true`);
  }

  // Password reset: send to the reset form
  if (type === 'recovery') {
    return NextResponse.redirect(`${origin}/auth/reset-password`);
  }

  // OAuth or magic link: send to account page (or wherever next points)
  return NextResponse.redirect(`${origin}${next}`);
}
