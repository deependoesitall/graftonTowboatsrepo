// src/app/api/orders/[id]/invoice/route.ts
//
// RETIRED — September 2026.
//
// This generated a GTS invoice document with its own sequential number,
// starting from 1084 to continue after Jen's last QuickBooks invoice.
//
// WHY IT'S GONE.
// GTS invoices from QuickBooks and always has. That's the right call — it's
// where their accountant, their payment rails and their history already live,
// and nobody was going to be retrained onto a second invoicing system.
//
// An audit also found this endpoint was ALREADY ORPHANED: no screen in the
// admin panel ever called it. There was no button. The only visible trace was
// a "Next Invoice Number" field in Settings, which advertised a feature that
// didn't exist and invited someone to set a number that would eventually
// collide with QuickBooks' own sequence — two systems both certain they own
// invoice #1085.
//
// WHAT REPLACED IT: the QuickBooks entry queue in the Deliveries ledger
// (src/app/admin/deliveries/page.tsx). It hands Mary Karen the invoice lines
// and a single combined PDF of the supporting documents, and never assigns a
// number of its own — QuickBooks stays the system of record.
//
// The route is kept as an explicit 410 rather than deleted so that anything
// still pointing here gets a clear answer instead of a confusing 404, and so
// the reasoning survives in the repo.

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      error: 'Invoice generation has been retired.',
      detail:
        'GTS invoices from QuickBooks. Use the QuickBooks entry queue in the Deliveries ledger, '
        + 'which supplies the invoice lines and a combined PDF of the signed delivery log and '
        + "Sinclair's receipt.",
    },
    { status: 410 },
  );
}
