// src/lib/cod-fee.ts
//
// ONE definition of the COD handling fee. It used to be computed inline as
// `subtotal * (1 + pct/100)` in six places — the order form, the admin modal,
// the customer email, the PDF, the PDF attachment and the billing view. Six
// copies of a money calculation is six chances to disagree, and any change had
// to be made identically in all of them.
//
// WHY A FLAT OVERRIDE EXISTS. The percentage works when we know the price.
// Off-catalog requests — a Walmart TV, a box of HDMI cables — have no price
// until Sinclair's has actually bought the thing, so a percentage of "unknown"
// is meaningless. Sinclair's needs to key the real handling fee once they know
// what the run cost them. So: percent by default, flat amount when set.

export interface CodFeeSource {
  /** Percentage snapshot taken when the order was placed (null = use default). */
  cod_fee_percent?: number | null;
  /** Flat fee keyed by hand. When set (including 0), it WINS over the percentage. */
  cod_fee_amount?: number | null;
}

const DEFAULT_PCT = 5;

/** Is a hand-keyed flat fee in force? A deliberate 0 counts — "no fee" is a decision. */
export function isManualCodFee(order: CodFeeSource | null | undefined): boolean {
  const amt = order?.cod_fee_amount;
  return amt != null && !Number.isNaN(Number(amt));
}

export function codFeePercent(order: CodFeeSource | null | undefined): number {
  const pct = Number(order?.cod_fee_percent ?? DEFAULT_PCT);
  return Number.isFinite(pct) && pct > 0 ? pct : 0;
}

/** The fee in dollars for the whole order. */
export function codFeeAmount(order: CodFeeSource | null | undefined, codSubtotal: number): number {
  if (isManualCodFee(order)) return Math.max(0, Number(order!.cod_fee_amount));
  return round2(codSubtotal * codFeePercent(order) / 100);
}

/** What the crew owes in total: goods + fee. */
export function codTotalWithFee(order: CodFeeSource | null | undefined, codSubtotal: number): number {
  return round2(codSubtotal + codFeeAmount(order, codSubtotal));
}

/**
 * One person's share when CODs are split per crew member.
 *
 * A percentage divides itself naturally. A FLAT fee does not — so it is
 * apportioned in proportion to what each person spent. Without this, showing
 * every person "+ $12 fee" would collect the fee several times over, and the
 * per-person figures wouldn't add up to the order total the customer was shown.
 *
 * Edge case: if the COD subtotal is 0 (everything out of stock, or an entirely
 * off-catalog order with no known prices), proportion is undefined — the fee is
 * split evenly across the people involved instead.
 */
export function codPersonTotal(
  order: CodFeeSource | null | undefined,
  personSubtotal: number,
  codSubtotal: number,
  personCount = 1,
): number {
  if (!isManualCodFee(order)) {
    return round2(personSubtotal * (1 + codFeePercent(order) / 100));
  }
  const fee = codFeeAmount(order, codSubtotal);
  const share = codSubtotal > 0
    ? fee * (personSubtotal / codSubtotal)
    : fee / Math.max(1, personCount);
  return round2(personSubtotal + share);
}

/** Short human label for the fee, e.g. "5% handling fee" or "$15.00 handling fee". */
export function codFeeLabel(order: CodFeeSource | null | undefined, codSubtotal: number): string {
  if (isManualCodFee(order)) {
    const amt = codFeeAmount(order, codSubtotal);
    return amt > 0 ? `$${amt.toFixed(2)} handling fee` : 'no handling fee';
  }
  const pct = codFeePercent(order);
  return pct > 0 ? `${pct}% handling fee` : 'no handling fee';
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
