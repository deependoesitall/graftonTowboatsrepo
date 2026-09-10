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
 * EVERY PERSON'S TOTAL, GUARANTEED TO ADD UP TO THE ORDER TOTAL.
 *
 * ── THE BUG THIS EXISTS TO KILL ─────────────────────────────────────────
 *
 * Rounding each person independently — which is what this replaced — makes
 * the rows and the header disagree about a cent roughly a QUARTER of the
 * time. Real example, from an order placed Sept 10:
 *
 *     COD subtotal          $36.74
 *     5% handling fee        $1.84
 *     Header total          $38.58   <- codTotalWithFee()
 *       Amber  28.86 x 1.05 $30.30
 *       Andy    7.88 x 1.05  $8.27
 *       Rows add up to      $38.57   <- a penny short
 *
 * Nobody loses real money over it — but a crew member settling up at the dock
 * adds the rows, gets a different number to the one printed at the top, and now
 * doesn't trust any of it. On a document whose whole job is "here is what you
 * owe", being internally inconsistent is the expensive part.
 *
 * ── HOW ─────────────────────────────────────────────────────────────────
 *
 * Work in integer cents, floor everyone, then hand the leftover cents out one
 * at a time to whoever was rounded down hardest (largest fractional remainder).
 * That is the standard largest-remainder apportionment, and it guarantees the
 * parts equal the whole while keeping each person within a cent of their fair
 * share. Ties break by subtotal then name, so the same order always produces
 * the same answer — a total that shuffles between two renders of the same PDF
 * is its own support call.
 *
 * People whose only COD is a linked item are NOT passed in here: they have no
 * known price, so they have no share of a fee computed from known prices.
 */
export function allocateCodTotals(
  order: CodFeeSource | null | undefined,
  people: Array<{ name: string; subtotal: number }>,
  codSubtotal: number,
): Map<string, number> {
  const out = new Map<string, number>();
  if (people.length === 0) return out;

  const cents = (n: number) => Math.round((Number(n) || 0) * 100);
  const totalCents = cents(codTotalWithFee(order, codSubtotal));
  const subCents = people.map(p => cents(p.subtotal));
  const subSum = subCents.reduce((a, b) => a + b, 0);

  // Exact (fractional) share of the total, by spend — or evenly when nothing
  // has a known price yet.
  const exact = people.map((_, i) =>
    subSum > 0 ? (totalCents * subCents[i]) / subSum : totalCents / people.length);

  const floored = exact.map(Math.floor);
  let remainder = totalCents - floored.reduce((a, b) => a + b, 0);

  const order_ = people
    .map((p, i) => ({ i, frac: exact[i] - floored[i], sub: subCents[i], name: p.name }))
    .sort((a, b) => (b.frac - a.frac) || (b.sub - a.sub) || a.name.localeCompare(b.name));

  for (let k = 0; remainder > 0 && k < order_.length; k++, remainder--) {
    floored[order_[k].i] += 1;
  }
  // Defensive: a negative remainder can only come from a total smaller than the
  // floors, which shouldn't happen — but take it off the largest share rather
  // than silently printing rows that overshoot.
  for (let k = 0; remainder < 0 && k < order_.length; k++, remainder++) {
    floored[order_[order_.length - 1 - k].i] -= 1;
  }

  people.forEach((p, i) => out.set(p.name, floored[i] / 100));
  return out;
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
