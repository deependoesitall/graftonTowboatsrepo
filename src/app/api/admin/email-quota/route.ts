// src/app/api/admin/email-quota/route.ts
//
// GET → what Resend says is left to send today and this month. GTS only,
// same as the customer emails it is shown next to.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { getEmailQuota } from '@/lib/email-quota-server';

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { gtsOnly: true });
  if (session instanceof NextResponse) return session;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'RESEND_API_KEY is not set.' }, { status: 500 });

  try {
    return NextResponse.json(await getEmailQuota(apiKey), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not read the email quota.' },
      { status: 502 },
    );
  }
}
