// Pulls Jen's Google delivery spreadsheet into /admin/deliveries.
// Supabase pg_cron calls this every 15 minutes with x-ledger-sync-secret;
// the dashboard Sync button uses the same route with the admin session.
// ?dry=1 previews without writing.

import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, isGtsRole } from '@/lib/admin-auth-server';
import { googleSheetsConfigured } from '@/lib/google-sheets';
import { getLedgerSyncStatus, syncDeliveryLedgerFromGoogle } from '@/lib/delivery-ledger-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function same(a: string | null, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function authorised(req: NextRequest): boolean {
  const session = getAdminSession(req);
  if (session && isGtsRole(session.role)) return true;
  if (same(req.headers.get('x-ledger-sync-secret'), process.env.LEDGER_SYNC_SECRET)) return true;
  const cron = process.env.CRON_SECRET;
  return same(req.headers.get('authorization'), cron ? `Bearer ${cron}` : undefined);
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
    return NextResponse.json({ ok: true, skipped: true, configured: false, error: 'Google Sheets is not configured' });
  }
  try {
    const run = await syncDeliveryLedgerFromGoogle({ dryRun: req.nextUrl.searchParams.get('dry') === '1' });
    return NextResponse.json(run);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
