// src/lib/cod-payments.ts
//
// How each crew member settles their own COD total.
//
// ── WHY THIS LIVES IN extended_info AND NOT ITS OWN COLUMNS ──────────────
//
// It is read as a whole, always alongside the order it belongs to, and never
// queried across orders ("show me everyone paying by Venmo" is not a question
// anyone has asked). That is the shape a jsonb blob is honest about. Adding
// four more columns to `orders` would also have meant a migration, and 072–075
// are still unrun — a fifth pending migration in the queue is a launch risk for
// no benefit.
//
// ── WHY THE OLD COLUMNS ARE STILL POPULATED ─────────────────────────────
//
// orders.cod_payment_method / _handle / _preferred_phone / _contact_time are
// written from the FIRST person. Every order placed before this change has
// only those, and the readers here fall back to them. Do not delete them until
// no order in the table predates cod_payments.
//
// ⚠️ THIS IS CUSTOMER-SUPPLIED JSON. It is written by whatever version of the
// order form the crew had cached, parsed back out weeks later, and dropped
// straight into an email and a PDF. Everything below assumes it is malformed
// until proven otherwise, and every string it returns must still be escaped by
// the caller before it reaches HTML.

export type CodMethod = 'cash' | 'venmo' | 'cashapp' | 'credit_card' | '';

export interface CodPaymentRecord {
  name: string;
  /** Catalog COD lines only. Linked items have no price yet. */
  amount: number;
  /** Count of off-catalog items this person is paying for. */
  linked_items: number;
  method: CodMethod;
  handle: string;
  phone: string;
  contact_time: string;
}

const METHODS: CodMethod[] = ['cash', 'venmo', 'cashapp', 'credit_card', ''];

const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/**
 * Read the per-person payment list off an order's extended_info.
 *
 * Returns [] for every order placed before this existed, for malformed JSON,
 * and for anything that isn't an array of objects — callers treat an empty
 * result as "fall back to the order-level columns", so a bad parse degrades to
 * the old behavior instead of throwing inside an email send.
 */
export function readCodPayments(
  extendedInfo: Record<string, unknown> | null | undefined,
): CodPaymentRecord[] {
  const raw = extendedInfo?.cod_payments;
  if (!raw) return [];

  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry): CodPaymentRecord | null => {
      if (!entry || typeof entry !== 'object') return null;
      const e = entry as Record<string, unknown>;
      const name = str(e.name, 80);
      if (!name) return null;
      const method = METHODS.includes(e.method as CodMethod) ? (e.method as CodMethod) : '';
      return {
        name,
        amount: num(e.amount),
        linked_items: Math.floor(num(e.linked_items)),
        method,
        handle: str(e.handle, 80),
        phone: str(e.phone, 40),
        contact_time: str(e.contact_time, 80),
      };
    })
    .filter((p): p is CodPaymentRecord => p !== null);
}

/** "Venmo", "Credit Card" — for a heading or a column. */
export function codMethodShort(m: CodMethod): string {
  return m === 'credit_card' ? 'Credit Card'
    : m === 'cashapp' ? 'Cash App'
    : m === 'venmo' ? 'Venmo'
    : m === 'cash' ? 'Cash'
    : '';
}

/**
 * The whole instruction, in one line, aimed at whoever collects the money.
 *
 * Deliberately written as an action rather than a label: "Venmo" tells the
 * shopper nothing, "send a request to @amber-h" tells them what to do.
 */
export function codMethodSentence(p: CodPaymentRecord): string {
  if (p.method === 'credit_card') {
    const when = p.contact_time ? ` (around ${p.contact_time})` : '';
    return `Credit Card — call ${p.phone || 'the crew member'}${when} to collect`;
  }
  if (p.method === 'venmo' || p.method === 'cashapp') {
    const label = p.method === 'venmo' ? 'Venmo' : 'Cash App';
    return `${label} — send a request to ${p.handle || 'the account on file'} for the exact final amount once shopped. Never accept an inbound send.`;
  }
  if (p.method === 'cash') return 'Cash';
  return 'No payment method given — call the boat';
}

/**
 * What to print where a dollar amount would go.
 *
 * A person whose only COD is a linked item has no total: the price isn't known
 * until it's bought. Printing $0.00 there reads as "owes nothing", which is the
 * opposite of true, so it says so in words instead.
 */
export function codAmountText(
  p: Pick<CodPaymentRecord, 'amount' | 'linked_items'>,
  money: (n: number) => string,
): string {
  const linked = p.linked_items === 1 ? 'linked item' : `${p.linked_items} linked items`;
  if (p.amount <= 0 && p.linked_items > 0) return linked.charAt(0).toUpperCase() + linked.slice(1);
  if (p.linked_items > 0) return `${money(p.amount)} + ${linked}`;
  return money(p.amount);
}
