// src/app/api/admin/invoice-number/route.ts
//
// RETIRED — September 2026. See src/app/api/orders/[id]/invoice/route.ts.
//
// This read and set the sequential counter for the in-app invoice generator.
// With that generator retired, allocating numbers is actively harmful: any
// number handed out here would eventually collide with the one QuickBooks
// assigns, and two documents sharing an invoice number is the kind of thing
// accounts payable notices and a bookkeeper spends a morning unpicking.
//
// The `next_invoice_number()` function from migration 048 is left in the
// database deliberately. Dropping it would break the historical record of
// orders that already carry an `invoice_number`, and it costs nothing to leave
// an unused function in place. It simply has no caller now.

import { NextResponse } from 'next/server';

const gone = () =>
  NextResponse.json(
    {
      error: 'Invoice numbering has been retired.',
      detail:
        'QuickBooks assigns invoice numbers. The app no longer keeps a counter, so the two '
        + 'systems cannot collide.',
    },
    { status: 410 },
  );

export async function GET() { return gone(); }
export async function PATCH() { return gone(); }
