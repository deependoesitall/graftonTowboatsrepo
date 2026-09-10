// src/app/api/admin/deliveries/qb-status/route.ts
//
// Marks delivery rows as done in QuickBooks — or as not billable at all.
//
// Handles one row and a batch through the same path, because the batch case is
// the real one: Mary works a month-end queue, types a dozen invoices into Plus,
// then clears them together.
//
// ⚠️ THREE SEPARATE FLAGS, DELIBERATELY NOT ONE.
//   customer_invoiced_in_qb — the barge line has been invoiced
//   driver_paid_in_qb       — the driver has been paid
//   not_billable            — this row will never be invoiced (training, waived)
//
// The old `updated_quickbooks` conflated the first two. They happen on
// different days, sometimes by different people, and one shared flag meant
// finishing one job hid the row from the other.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';

export const dynamic = 'force-dynamic';

const Body = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  customer_invoiced_in_qb: z.boolean().optional(),
  driver_paid_in_qb: z.boolean().optional(),
  not_billable: z.boolean().optional(),
  not_billable_reason: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  // Reports area, edit rights — same gate as the rest of the ledger. gtsOnly
  // because Sinclair's staff must never see, let alone change, what GTS bills.
  const session = requireAdmin(req, { area: 'reports', editRequired: true, gtsOnly: true });
  if (session instanceof NextResponse) return session;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const { ids, customer_invoiced_in_qb, driver_paid_in_qb, not_billable, not_billable_reason } = parsed.data;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const now = new Date().toISOString();

  // Timestamps are set alongside their flag and CLEARED when it's unset, so a
  // row can never claim it was invoiced on a date while saying it wasn't
  // invoiced. Un-marking is a real action — Mary will occasionally tick the
  // wrong row and needs to put it back.
  if (customer_invoiced_in_qb !== undefined) {
    patch.customer_invoiced_in_qb = customer_invoiced_in_qb;
    patch.customer_invoiced_at = customer_invoiced_in_qb ? now : null;
    // Keep the legacy column agreeing with the new one — the old ledger UI and
    // the previous handoff still read it.
    patch.updated_quickbooks = customer_invoiced_in_qb;
  }

  if (driver_paid_in_qb !== undefined) {
    patch.driver_paid_in_qb = driver_paid_in_qb;
    patch.driver_paid_at = driver_paid_in_qb ? now : null;
  }

  if (not_billable !== undefined) {
    patch.not_billable = not_billable;
    patch.not_billable_reason = not_billable ? (not_billable_reason || null) : null;
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('deliveries')
    .update(patch)
    .in('id', ids)
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Returning the count lets the UI say "12 marked" rather than assuming every
  // id in the request matched a row.
  return NextResponse.json({ ok: true, updated: data?.length ?? 0 });
}
