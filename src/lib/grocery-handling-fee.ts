// src/lib/grocery-handling-fee.ts
//
// Optional flat Sinclair's grocery handling fee (Dave's usual $50).
// Distinct from COD handling (src/lib/cod-fee.ts) and from Grafton's
// delivery fee. register_total stays the Sinclair register ring;
// billable grocery figures add this fee on top when present.

export interface GroceryHandlingFeeSource {
  register_total?: number | null;
  grocery_handling_fee?: number | null;
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Fee in dollars. Blank / null / NaN / ≤0 → 0 (no fee). */
export function groceryHandlingFeeAmount(
  order: GroceryHandlingFeeSource | null | undefined,
): number {
  const raw = order?.grocery_handling_fee;
  if (raw == null || raw === ('' as unknown)) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return round2(n);
}

/**
 * What grocery billing rolls up to: register (or fallback estimate) + fee.
 * When register_total is null and no fallback is given, returns only the fee
 * (callers that need estimate+fee should pass the estimate).
 */
export function groceryBilledTotal(
  order: GroceryHandlingFeeSource | null | undefined,
  fallbackRegister?: number | null,
): number {
  const reg =
    order?.register_total != null && Number.isFinite(Number(order.register_total))
      ? Number(order.register_total)
      : fallbackRegister != null && Number.isFinite(Number(fallbackRegister))
        ? Number(fallbackRegister)
        : 0;
  return round2(reg + groceryHandlingFeeAmount(order));
}

/** Parse a UI string into null (blank / zero) or a non-negative number. */
export function parseGroceryHandlingFeeInput(raw: string): number | null {
  const t = String(raw ?? '').trim();
  if (t === '') return null;
  const n = parseFloat(t.replace(/[^0-9.]/g, ''));
  if (Number.isNaN(n) || n < 0) return null;
  if (n === 0) return null;
  return round2(n);
}

/** API / form value → null (no fee) or a positive dollar amount. */
export function normalizeGroceryHandlingFee(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return round2(raw);
  }
  return parseGroceryHandlingFeeInput(String(raw));
}
