// src/lib/quickbooks-handoff.ts
//
// QUICKBOOKS HANDOFF — everything Mary Karen needs to raise the real invoice.
//
// DECISION (Deepen, Sept 6): GTS keeps invoicing through QuickBooks. Nobody is
// getting retrained onto an invoicing screen inside this app, and that's the
// right call — QuickBooks is where their accountant, their payment rails and
// their history already live.
//
// So this app deliberately does NOT send invoices. What it does instead is
// remove the retyping and the hunting: it already knows the vessel, the date,
// the service, the delivery rate and Sinclair's register total, and it's
// holding the two documents the barge line's AP department requires.
//
// THE UNIT OF WORK IS THE BOAT, NOT THE DELIVERY.
// Ingram alone runs 15+ boats and each one is invoiced separately, so a week
// of work is "one invoice per boat", not "one invoice per delivery". Every
// function here therefore takes a LIST of deliveries — the ones going onto a
// single invoice — and returns the lines and the document set for that one
// invoice. That is what gets Mary to three actions per invoice instead of
// three per delivery.
//
// Modelled on Jen's real invoice 1083 (Scott Noble, 6/30/26), which billed:
//
//   1. Land Daytime Delivery │ 6/30/26 Scott Noble Day Land Grocery Delivery │ 1 │ $225.00
//   2. Sinclair's            │ 6/30/26 Scott Noble Grocery Order             │ 1 │ $4,347.13
//                                                                    Total    $4,572.13
//
// …sent to accounts.payable@ingrambarge.com with the signed clipboard photo
// and Sinclair's 23-page register receipt attached.

/**
 * One delivery, in the shape this module needs, independent of whether it came
 * from an `orders` row or a hand-typed `deliveries` row. Both feed the same
 * invoice, so both must produce identical lines — hence one shared shape and
 * two thin adapters, rather than two near-copies that drift apart.
 */
export interface BillableDelivery {
  id: string;
  /** ISO yyyy-mm-dd. */
  deliveryDate: string | null;
  vesselName: string | null;
  /** The barge line being invoiced. */
  companyName: string | null;
  /** Becomes the QuickBooks "Product or service" on the delivery line. */
  serviceType: string | null;
  deliveryFee: number | null;
  billForGroceries: boolean | null;
  /** Sinclair's ACTUAL register total. Never our estimate. */
  groceryTotal: number | null;
  poNumber: string | null;
  locationDelivered: string | null;
  receiptUrl: string | null;
  slipUrl: string | null;
}

export interface QbLine {
  /** QuickBooks "Product or service" column. */
  item: string;
  /** QuickBooks "Description" column. */
  description: string;
  qty: number;
  rate: number;
}

export interface QbDocument {
  label: string;
  url: string;
  /** Which delivery it belongs to — the packet labels its pages with this. */
  forDate: string | null;
}

export interface QbHandoff {
  /** QuickBooks customer. */
  billTo: string;
  vessel: string;
  /** Latest delivery date in the group — what Jen dates the invoice. */
  invoiceDate: string | null;
  poNumbers: string[];
  lines: QbLine[];
  total: number;
  documents: QbDocument[];
  /** Anything that would hold this invoice up in accounts payable. */
  warnings: string[];
}

const money = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

/** m/d/yy — how the descriptions on Jen's invoices are written. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return '';
  return `${Number(m)}/${Number(d)}/${y.slice(2)}`;
}

/**
 * Build the whole invoice for one boat.
 *
 * Deliveries are sorted oldest-first so the invoice reads chronologically, the
 * way Mary keys it and the way AP reads it.
 */
export function buildQbHandoff(
  deliveries: BillableDelivery[],
  opts?: { vesselLabel?: string; companyLabel?: string },
): QbHandoff {
  const ds = [...deliveries].sort((a, b) =>
    (a.deliveryDate || '').localeCompare(b.deliveryDate || ''),
  );

  const lines: QbLine[] = [];
  const documents: QbDocument[] = [];
  const warnings: string[] = [];
  const poNumbers: string[] = [];

  const company =
    opts?.companyLabel || ds.find(d => d.companyName)?.companyName || '';
  const vessel = opts?.vesselLabel || ds.find(d => d.vesselName)?.vesselName || '';

  for (const d of ds) {
    const date = shortDate(d.deliveryDate);
    const who = d.vesselName || vessel;

    // 1 — GTS delivery. The service type IS the QuickBooks item name; Jen's
    //     invoice reads "Land Daytime Delivery", which is our service type.
    const fee = Number(d.deliveryFee ?? 0);
    if (fee > 0) {
      lines.push({
        item: d.serviceType || 'Delivery',
        description: [date, who, d.serviceType].filter(Boolean).join(' '),
        qty: 1,
        rate: money(fee),
      });
    }

    // 2 — Groceries, at Sinclair's ACTUAL register total.
    if (d.billForGroceries !== false) {
      const groceries = Number(d.groceryTotal ?? 0);
      if (groceries > 0) {
        lines.push({
          item: "Sinclair's",
          description: [date, who, 'Grocery Order'].filter(Boolean).join(' '),
          qty: 1,
          rate: money(groceries),
        });
      } else {
        warnings.push(`${date}: Sinclair's register total is missing.`);
      }
    }

    if (fee <= 0 && d.billForGroceries === false) {
      warnings.push(`${date}: no delivery fee and groceries not billed — nothing to invoice.`);
    }

    if (d.receiptUrl) {
      documents.push({ label: "Sinclair's register receipt", url: d.receiptUrl, forDate: d.deliveryDate });
    } else if (d.billForGroceries !== false) {
      warnings.push(`${date}: Sinclair's receipt not uploaded — AP will want the itemisation.`);
    }

    if (d.slipUrl) {
      documents.push({ label: 'Signed delivery log', url: d.slipUrl, forDate: d.deliveryDate });
    } else if (/ingram/i.test(company)) {
      // Only Ingram is known to hard-require it; saying so for everyone would
      // cry wolf on lines that pay without it.
      warnings.push(`${date}: signed delivery log missing — Ingram will not pay without it.`);
    }

    if (d.poNumber && !poNumbers.includes(d.poNumber)) poNumbers.push(d.poNumber);
  }

  return {
    billTo: company,
    vessel,
    invoiceDate: ds.length ? ds[ds.length - 1].deliveryDate : null,
    poNumbers,
    lines,
    total: money(lines.reduce((s, l) => s + l.rate * l.qty, 0)),
    documents,
    warnings,
  };
}

/**
 * Tab-separated, one row per line — pastes straight down a QuickBooks invoice
 * line grid. Columns are in QuickBooks' own order:
 *   Product/service ⇥ Description ⇥ Qty ⇥ Rate
 *
 * No header row: QuickBooks would read it as a line item.
 */
export function qbLinesAsTsv(h: QbHandoff): string {
  return h.lines
    .map(l => [l.item, l.description, String(l.qty), l.rate.toFixed(2)].join('\t'))
    .join('\n');
}
