// src/app/api/admin/deliveries/packet/route.ts
//
// GET /api/admin/deliveries/packet?ids=<uuid,uuid,…>
//   → one PDF containing the invoice lines, the signed delivery logs and
//     Sinclair's register receipts for those deliveries.
//
// The ids are ONE INVOICE'S worth of deliveries — in practice one boat's, which
// is how the QuickBooks queue groups them and how GTS actually bills. Mary Karen
// downloads one file per invoice and attaches one file per invoice.
//
// GTS-only: the packet carries GTS's delivery fees and the barge line's billing
// detail. Sinclair's staff must never see it.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin-auth-server';
import { buildQbHandoff, BillableDelivery } from '@/lib/quickbooks-handoff';
import { buildBillingPacket, packetFilename } from '@/lib/billing-packet';
import { canonicalVesselName } from '@/lib/vessel';

// Fetching and merging a 23-page receipt takes longer than the default.
export const maxDuration = 60;
// Never cache: documents get uploaded after the fact, and a stale packet is a
// packet that's missing the receipt someone just added.
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** One invoice, not a whole month — a bound keeps a stray request from
 *  assembling hundreds of receipts and timing out. */
const MAX_IDS = 40;

interface DeliveryRow {
  id: string;
  delivery_date: string | null;
  vessel_name: string | null;
  service_type: string | null;
  location_delivered: string | null;
  delivery_fee: number | null;
  bill_for_groceries: boolean | null;
  sinclairs_grocery_total: number | null;
  sinclairs_receipt_url: string | null;
  /** NOTE THE COLUMN NAME: the ledger calls it ingram_slip_IMAGE_url
   *  (migration 044). Only `orders` uses ingram_slip_url. Getting this wrong
   *  is silent — the field reads undefined and every Ingram row looks like it
   *  has no signed log. */
  ingram_slip_image_url: string | null;
  company: { id: string; name: string } | null;
  order: { po_number: string | null } | null;
}

export async function GET(req: NextRequest) {
  const session = requireAdmin(req, { area: 'reports', gtsOnly: true });
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(req.url);
  const ids = (searchParams.get('ids') || '')
    .split(',')
    .map(s => s.trim())
    .filter(s => UUID.test(s));

  if (!ids.length) {
    return NextResponse.json({ error: 'No deliveries requested.' }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json(
      { error: `Too many deliveries for one packet (${ids.length}). A packet is one invoice — download them a boat at a time.` },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('deliveries')
    .select('*, company:companies(id, name), order:orders(po_number)')
    .in('id', ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data || []) as unknown as DeliveryRow[];
  if (!rows.length) {
    return NextResponse.json({ error: 'Those deliveries no longer exist.' }, { status: 404 });
  }

  const billable: BillableDelivery[] = rows.map(r => ({
    id: r.id,
    deliveryDate: r.delivery_date,
    vesselName: r.vessel_name,
    companyName: r.company?.name || null,
    serviceType: r.service_type,
    deliveryFee: r.delivery_fee,
    billForGroceries: r.bill_for_groceries,
    groceryTotal: r.sinclairs_grocery_total,
    poNumber: r.order?.po_number || null,
    locationDelivered: r.location_delivered,
    receiptUrl: r.sinclairs_receipt_url,
    slipUrl: r.ingram_slip_image_url,
  }));

  // "W. Scott Noble" and "Scott Noble" are one boat and one invoice; label the
  // packet with the fullest spelling actually used on these records.
  const handoff = buildQbHandoff(billable, {
    vesselLabel: canonicalVesselName(rows.map(r => r.vessel_name)) || undefined,
    companyLabel: rows.find(r => r.company?.name)?.company?.name || undefined,
  });

  let pdf: Uint8Array;
  try {
    pdf = await buildBillingPacket(handoff);
  } catch (e) {
    console.error('Billing packet failed:', e);
    return NextResponse.json(
      { error: 'The packet could not be built. The receipt or signed log may be corrupt — open them individually to check.' },
      { status: 500 },
    );
  }

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${packetFilename(handoff)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
