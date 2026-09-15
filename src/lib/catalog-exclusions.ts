// src/lib/catalog-exclusions.ts
//
// Customer-facing hide for goods a vessel cannot take. The nightly sync
// skips these on INSERT (isExcludedFromVesselCatalog) and now deactivates
// them on UPDATE, but already-imported rows stay live until that runs —
// and a browse that only checks is_active would keep serving fried chicken
// in the meantime.
//
// Signal is Sinclair's taxonomy, pretty-printed into products.sub_category:
//   /shop/deli/hot_food_and_prepared/chicken/breast  →  "Hot Food And Prepared"
// Cold deli (sliced meat, cheese, lunch meat) is a sibling department and
// does NOT match this prefix.

/** PostgREST `.or()` — keeps NULL sub_category (SQL `NOT ILIKE` would drop them). */
export const HOT_PREPARED_OR =
  'sub_category.is.null,sub_category.not.ilike."Hot Food%"';

export function excludeHotPrepared<T>(query: T): T {
  return (query as { or: (filters: string) => T }).or(HOT_PREPARED_OR);
}

export function isHotPreparedSubCategory(sub: string | null | undefined): boolean {
  return /^hot food/i.test((sub || '').trim());
}
