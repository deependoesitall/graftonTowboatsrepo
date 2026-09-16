// src/lib/service-charges.ts
//
// WHAT GTS IS CHARGING FOR ON ONE ORDER.
//
// ⚠️ ONE BOAT'S TRIP CAN CARRY SEVERAL CHARGES.
//
// The delivery ledger has always worked this way and the app did not. From
// GTS's own book, 5/8/2026, Coop Vanguard, one driver, one trip:
//
//     Daytime Grocery Delivery      Grafton   $350.00
//     Daytime Crew Change 1/2 off   Grafton   $150.00
//
// Two services, two prices, the second hand-discounted. An order could only
// hold one `delivery_fee` and one `delivery_service_type`, so that boat could
// be billed for one of the two and the final email could only name one.
//
// A different BOAT is a different order and gets its own full charge — that
// already worked and nothing here touches it. This is the same boat, same
// trip, more than one thing done for it.
//
// ⚠️ THE ARRAY IS THE TRUTH. Migration 091's trigger derives
// orders.delivery_fee (the sum) and orders.delivery_service_type (the first
// label) from it, so the ledger, the QuickBooks pack, the billing report and
// the CSV export keep reading the columns they always read and keep getting
// the right number. Nothing in this file should ever write those two columns
// directly.

export interface ServiceCharge {
  /**
   * The label as it will appear on the invoice, SNAPSHOTTED — not a foreign
   * key to service_types. Rate cards get renamed and retired; an invoice sent
   * in May must still say in November what it said in May.
   */
  service_type: string;
  amount: number;
  /** "1/2 off", "courtesy", "long run" — why this one is not the card rate. */
  note?: string;
}

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * Read charges off an order, whatever shape the column is in.
 *
 * Tolerant on purpose: this runs against rows written before 091 existed,
 * rows hand-edited in the Supabase console, and a jsonb column that is
 * `'[]'`, NULL, or a string that merely looks like an array. A billing screen
 * that throws on an odd row is worse than one that shows no charges.
 */
export function readServiceCharges(order: {
  service_charges?: unknown;
} | null | undefined): ServiceCharge[] {
  let raw = order?.service_charges;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(raw)) return [];

  const out: ServiceCharge[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const c = r as Record<string, unknown>;
    const label = String(c.service_type ?? '').trim();
    const amount = Number(c.amount);
    const hasMoney = Number.isFinite(amount) && amount !== 0;

    // ⚠️ A ROW WITH NO LABEL AND NO MONEY IS NOT A SERVICE. It is a line
    // somebody started in the send dialog and abandoned, and keeping it puts
    // "Delivery — $0.00" on a customer's bill and an empty line in QuickBooks.
    // Note the test is on the amount being NON-ZERO, not merely numeric:
    // Number(null) is 0, which is finite, so a half-filled row sails through a
    // plain isFinite check.
    //
    // A labelled $0 charge is kept, deliberately — a courtesy run billed at
    // nothing is a real line that the boat should see.
    if (!label && !hasMoney) continue;

    out.push({
      service_type: label || 'Delivery',
      amount: Number.isFinite(amount) ? money(amount) : 0,
      note: String(c.note ?? '').trim() || undefined,
    });
  }
  return out;
}

/** What GTS is owed for its own services on this order. */
export function serviceChargeTotal(charges: ServiceCharge[]): number {
  return money(charges.reduce((s, c) => s + (Number(c.amount) || 0), 0));
}

/**
 * The GTS total for an order, from whichever source it has.
 *
 * ⚠️ NOT `charges.length ? sum : delivery_fee` written out at each call site.
 * The two must never be added together — 091's trigger already makes
 * delivery_fee the sum, so doing that double-bills every multi-service order.
 */
export function orderServiceTotal(order: {
  service_charges?: unknown;
  delivery_fee?: number | string | null;
} | null | undefined): number {
  const charges = readServiceCharges(order);
  if (charges.length) return serviceChargeTotal(charges);
  return money(Number(order?.delivery_fee) || 0);
}

/**
 * The charges to show on a bill, for an order of either vintage.
 *
 * An order with no charges array is not chargeless — it is a single-charge
 * order from before 091, and its one fee still has to appear on the invoice.
 * Returning it in the same shape means the email, the PDF and the QuickBooks
 * pack each have exactly one code path instead of an old one and a new one.
 */
export function billableCharges(order: {
  service_charges?: unknown;
  delivery_fee?: number | string | null;
  delivery_service_type?: string | null;
}  | null | undefined): ServiceCharge[] {
  const charges = readServiceCharges(order);
  if (charges.length) return charges;

  const fee = Number(order?.delivery_fee) || 0;
  if (!fee) return [];
  return [{
    service_type: (order?.delivery_service_type || '').trim() || 'Delivery',
    amount: money(fee),
  }];
}

/** "Daytime Crew Change — 1/2 off", for one line of a bill. */
export function chargeLabel(c: ServiceCharge): string {
  return c.note ? `${c.service_type} — ${c.note}` : c.service_type;
}

export const EMPTY_CHARGE: ServiceCharge = { service_type: '', amount: 0 };
