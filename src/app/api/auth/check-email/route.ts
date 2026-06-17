// src/app/api/auth/check-email/route.ts
// Returns { exists: boolean } for a given email.
// Uses the service role so it can query auth.users without exposing data.
// Only returns a boolean — never leaks user details to the client.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || !EMAIL_RE.test(email.trim())) {
      return NextResponse.json({ exists: false });
    }

    const supabase = createServiceClient();
    // listUsers is efficient enough for this user base;
    // filter client-side since the admin JS SDK doesn't support email filtering.
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) return NextResponse.json({ exists: false });

    const exists = data.users.some(
      u => u.email?.toLowerCase() === email.trim().toLowerCase()
    );
    return NextResponse.json({ exists });
  } catch {
    return NextResponse.json({ exists: false });
  }
}
