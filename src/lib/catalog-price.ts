// src/lib/catalog-price.ts
//
// Effective catalog price at READ time.
//
// products.price is supposed to be the charge price (sale while live, shelf
// otherwise), and regular_price is only populated during a live sale. That
// contract breaks the moment a sale ends and Freshop has not yet re-touched
// the row — price stays on the old sale number and regular_price lingers, so
// every cart/search/checkout path that trusts the raw columns keeps charging
// the expired sale until a sync happens to hit that SKU.
//
// This helper recomputes charge + sale display from the row's own dates using
// America/Chicago calendar dates (NOT UTC ISO). Wire it wherever catalog
// price is shown or charged.

export const CHICAGO_TZ = 'America/Chicago';

/** YYYY-MM-DD for America/Chicago — never UTC via toISOString. */
export function chicagoCalendarDate(now: Date = new Date()): string {
  // en-CA yields ISO-like YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CHICAGO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function dateOnly(v: string | null | undefined): string {
  if (!v) return '';
  return String(v).slice(0, 10);
}

export interface CatalogPriceFields {
  price?: number | null;
  regular_price?: number | null;
  sale_start_date?: string | null;
  sale_finish_date?: string | null;
}

export interface EffectiveCatalogPrice {
  /** What we charge right now. */
  price: number;
  /** Struck-through shelf price when on sale; null otherwise. */
  regular_price: number | null;
  sale_start_date: string | null;
  sale_finish_date: string | null;
  onSale: boolean;
}

/**
 * Is the catalog row on sale *today* in America/Chicago?
 * Requires a positive regular_price (the design's "on sale" flag) AND a live
 * start/finish window when those dates are present.
 */
export function catalogSaleIsActive(
  row: CatalogPriceFields,
  today: string = chicagoCalendarDate(),
): boolean {
  const regular = row.regular_price == null ? NaN : Number(row.regular_price);
  if (!Number.isFinite(regular) || regular <= 0) return false;

  const start = dateOnly(row.sale_start_date);
  const finish = dateOnly(row.sale_finish_date);
  if (start && today < start) return false;
  if (finish && today > finish) return false;
  return true;
}

/**
 * Effective charge price + sale display fields for a products row.
 *
 * - Expired finish (Chicago): charge = regular_price ?? price, clear sale display
 * - Future start: not on sale yet — charge = regular_price ?? price, clear display
 * - Active window + regular_price: charge = price (sale), keep strike regular
 */
export function effectiveCatalogPrice(
  row: CatalogPriceFields,
  today: string = chicagoCalendarDate(),
): EffectiveCatalogPrice {
  const rawPrice = Number(row.price);
  const price = Number.isFinite(rawPrice) ? rawPrice : 0;
  const regularRaw = row.regular_price == null ? null : Number(row.regular_price);
  const regular =
    regularRaw != null && Number.isFinite(regularRaw) && regularRaw > 0
      ? regularRaw
      : null;

  if (!catalogSaleIsActive(row, today)) {
    const charge = regular != null ? regular : price;
    return {
      price: charge,
      regular_price: null,
      sale_start_date: null,
      sale_finish_date: null,
      onSale: false,
    };
  }

  return {
    price,
    regular_price: regular,
    sale_start_date: dateOnly(row.sale_start_date) || null,
    sale_finish_date: dateOnly(row.sale_finish_date) || null,
    onSale: true,
  };
}

/** Overlay effective price/sale fields onto a product-shaped object. */
export function applyEffectiveCatalogPricing<T extends CatalogPriceFields>(
  row: T,
  today: string = chicagoCalendarDate(),
): T & EffectiveCatalogPrice {
  const eff = effectiveCatalogPrice(row, today);
  return {
    ...row,
    price: eff.price,
    regular_price: eff.regular_price,
    sale_start_date: eff.sale_start_date,
    sale_finish_date: eff.sale_finish_date,
    onSale: eff.onSale,
  };
}

export function applyEffectiveCatalogPricingList<T extends CatalogPriceFields>(
  rows: T[],
  today: string = chicagoCalendarDate(),
): Array<T & EffectiveCatalogPrice> {
  return rows.map(r => applyEffectiveCatalogPricing(r, today));
}
