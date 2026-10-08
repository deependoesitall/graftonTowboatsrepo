// Pulls Jen's Google delivery spreadsheet into /admin/deliveries.
// Vercel cron every 15 minutes; dashboard Sync now uses the same route.

import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, isGtsRole } from '@/lib/admin-auth-server';
import { googleSheetsConfigured } from '@/lib/google-sheets';
import { getLedgerSyncStatus, syncDeliveryLedgerFromGoogle } from '@/lib/delivery-ledger-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorised(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true;
  const session = getAdminSession(req);
  if (session && isGtsRole(session.role)) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (req.nextUrl.searchParams.get('status') === '1') {
    const status = await getLedgerSyncStatus();
    return NextResponse.json(status);
  }
  if (!googleSheetsConfigured()) {
    // Cron should not fail every 15 minutes before env is set.
    return NextResponse.json({ ok: true, skipped: true, configured: false, error: 'Google Sheets is not configured' });
  }
  try {
    const run = await syncDeliveryLedgerFromGoogle();
    return NextResponse.json(run);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
