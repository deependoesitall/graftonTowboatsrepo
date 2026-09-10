// src/lib/quickbooks-pack.ts
//
// Turns one delivery row into everything Mary Karen needs to type one invoice
// into QuickBooks Online Plus.
//
// ⚠️ WE DO NOT INVOICE. No invoice numbers, no PDFs that compete with Plus, no
// emails to accounts payable, no QBO API. Plus is the system of record and
// stays that way. This file's entire job is to remove the hunting: which fee,
// which grocery total, and — the one that actually costs money — which lines
// QuickBooks is allowed to add sales tax to.
//
// ── THE TAX RULE, WHICH IS THE WHOLE POINT ───────────────────────────────
//
//   SINCLAIR COURTESY  → TAX: No
//     GTS fronts a Sinclair's grocery bill and passes it through at cost. The
//     register total ALREADY INCLUDES SINCLAIR'S SALES TAX. If Plus taxes it
//     again, the barge line pays tax twice and GTS remits tax it never
//     collected. This is a real liability, not a tidiness issue.
//
//   GTS PURCHASED      → TAX: Yes
//     Bought separately on GTS's own exemption certificate (Ruler Foods,
//     Walmart, ice melt, a fridge, lumber). No tax has been charged yet, so
//     Plus should charge it.
//
//   DELIVERY FEE       → TAX: No by default
//     A service, and nobody has told us Illinois wants it taxed here. Flagged
//     as an assumption rather than a fact — see FEE_TAXABLE below.
//
// Pure functions on purpose: no database, no fetch, no React. The tax decision
// is the highest-consequence logic in the app and it should be readable in one
// screen and testable without a browser.

import { formatCurrency } from '@/lib/utils';

export type GroceryMode = 'none' | 'sinclair_courtesy' | 'gts_purchased';

export interface SidePurchase {
  description: string;
  amount: number;
}

export interface PackDelivery {
  id: string;
  delivery_date: string | null;
  vessel_name: string | null;
  service_type: string | null;
  location_delivered: string | null;
  po_number: string | null;
  delivery_fee: number | null;
  grocery_mode: GroceryMode;
  sinclairs_grocery_total: number | null;
  side_purchases: SidePurchase[] | null;
  sinclairs_receipt_url: string | null;
  ingram_slip_image_url: string | null;
  company?: { name: string; requires_signed_receipt?: boolean } | null;
}

/**
 * DEFAULT: the delivery fee is NOT taxed.
 *
 * Deepen's instruction was "nontaxable until Mary says otherwise", so this is
 * an assumption with a name rather than a silent choice buried in a ternary.
 * If Mary confirms Illinois wants the service taxed, flip this one constant
 * and every pack changes at once.
 */
const FEE_TAXABLE = false;

export interface PackLine {
  /** What Mary types into the QBO line description. */
  description: string;
  amount: number;
  taxable: boolean;
  /** Why this line is or isn't taxed — shown next to it, not hidden. */
  note?: string;
}

export interface QbPack {
  deliveryId: string;
  /** The QBO customer. Always the barge line, never the vessel. */
  customer: string;
  /** Ready to paste into the QBO memo field. */
  memo: string;
  lines: PackLine[];
  total: number;
  attachments: {
    sinclairTapeUrl: string | null;
    signedSlipUrl: string | null;
  };
  warnings: PackWarning[];
}

export interface PackWarning {
  level: 'error' | 'warn';
  /** `error` = the invoice would be wrong. `warn` = it may be rejected by AP. */
  text: string;
}

const money = (n: number) => Math.round(n * 100) / 100;

/** US format, because that's what QBO and the barge lines use. */
function formatDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${Number(m)}/${Number(d)}/${y}`;
}

/**
 * The memo line.
 *
 * Vessel goes FIRST and the customer does not appear at all — the invoice is
 * already addressed to the barge line, so repeating "Ingram" in the memo wastes
 * the only field AP actually reads to work out which boat this was.
 */
export function buildMemo(d: PackDelivery): string {
  return [
    (d.vessel_name || '').toUpperCase().trim(),
    formatDate(d.delivery_date),
    d.service_type || '',
    d.location_delivered || '',
    d.po_number ? `PO ${d.po_number}` : '',
  ].filter(Boolean).join(' · ');
}

export function buildPack(d: PackDelivery): QbPack {
  const lines: PackLine[] = [];
  const warnings: PackWarning[] = [];

  // ── 1. The delivery itself ──────────────────────────────────────────────
  const fee = Number(d.delivery_fee) || 0;
  if (fee > 0) {
    lines.push({
      description: d.service_type || 'Delivery',
      amount: money(fee),
      taxable: FEE_TAXABLE,
    });
  } else {
    warnings.push({
      level: 'warn',
      text: 'No delivery fee on this row. If that’s deliberate, mark it not billable instead of invoicing $0.',
    });
  }

  // ── 2. Groceries ────────────────────────────────────────────────────────
  if (d.grocery_mode === 'sinclair_courtesy') {
    const total = Number(d.sinclairs_grocery_total) || 0;
    if (total > 0) {
      lines.push({
        description: "Sinclair's courtesy",
        amount: money(total),
        taxable: false,
        note: 'Sales tax already included in the Sinclair’s register total.',
      });
    } else {
      // Hard error: the courtesy line is usually the largest number on the
      // invoice. Sending it without the total means under-billing by
      // thousands, and nothing downstream would catch it.
      warnings.push({
        level: 'error',
        text: 'Sinclair’s courtesy is on, but no grocery total is recorded. Add the register total before invoicing.',
      });
    }

    if (!d.sinclairs_receipt_url) {
      warnings.push({
        level: 'error',
        text: 'Need the Sinclair’s tape. The register receipt is what proves the courtesy amount.',
      });
    }
  }

  // ── 3. Anything GTS bought separately — TAXABLE ─────────────────────────
  const side = Array.isArray(d.side_purchases) ? d.side_purchases : [];
  for (const s of side) {
    const amt = Number(s.amount) || 0;
    if (!s.description?.trim() && amt === 0) continue;
    lines.push({
      description: s.description?.trim() || 'GTS-purchased item',
      amount: money(amt),
      taxable: true,
      note: 'Bought on GTS’s exemption — tax applies here.',
    });
  }

  // gts_purchased with nothing itemised is a dead end: the mode says GTS
  // bought something taxable, and there's no line to tax.
  if (d.grocery_mode === 'gts_purchased' && side.length === 0) {
    warnings.push({
      level: 'error',
      text: 'Marked as GTS-purchased but nothing is itemised. Add the items and amounts so they can be taxed correctly.',
    });
  }

  // ── 4. Signed slip, only where the customer demands one ─────────────────
  //
  // Ingram won't pay without it. Reliant, ARTCO and Kirby don't ask. Warning
  // on every row would train Mary to ignore the warning — which is precisely
  // how it gets missed on the one customer that cares.
  if (d.company?.requires_signed_receipt && !d.ingram_slip_image_url) {
    warnings.push({
      level: 'warn',
      text: `${d.company.name} requires the signed delivery log. Don’t send this to AP without it.`,
    });
  }

  return {
    deliveryId: d.id,
    customer: d.company?.name || '',
    memo: buildMemo(d),
    lines,
    total: money(lines.reduce((s, l) => s + l.amount, 0)),
    attachments: {
      sinclairTapeUrl: d.sinclairs_receipt_url,
      signedSlipUrl: d.ingram_slip_image_url,
    },
    warnings,
  };
}

/**
 * The lines as plain text, for the copy button.
 *
 * Not TSV. QuickBooks Online cannot paste multiple rows into the invoice line
 * grid — Intuit's own support says there is no way to do it — so a tab-
 * separated blob would look useful and silently do nothing, which is worse
 * than no button. This is a human-readable crib to type from, and each line is
 * individually copyable in the UI.
 */
export function linesAsText(pack: QbPack): string {
  return pack.lines
    .map(l => `${l.description}  ${formatCurrency(l.amount)}  TAX: ${l.taxable ? 'Yes' : 'No'}`)
    .join('\n');
}

/** True when the pack is safe to enter as-is. */
export function packIsClean(pack: QbPack): boolean {
  return !pack.warnings.some(w => w.level === 'error');
}
