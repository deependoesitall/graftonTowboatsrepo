// src/lib/schema-health.ts
//
// MIGRATION DRIFT DETECTOR.
//
// Why this exists: a migration was applied out of order and the deployed code
// went on calling a table that didn't exist. The write was unchecked, so every
// nightly sync reported success while the store reconcile silently never ran.
// It was found by a human reading SQL, which is exactly the wrong way to find
// it — the application knew, on every single run, and said nothing.
//
// So: the app checks its own assumptions and reports them somewhere visible.
// Every object the code depends on is listed here with the migration that
// creates it, and the check runs cheaply on the admin sync-status page.
//
// WHEN YOU ADD A MIGRATION that introduces a table or column the code reads,
// add it to REQUIRED below. That list is the contract between the code and the
// database, written down in one place instead of implied across twenty files.

import type { createServiceClient } from '@/lib/supabase/server';

interface Requirement {
  table: string;
  /** Columns the code reads/writes. Empty = only the table itself matters. */
  columns?: string[];
  migration: string;
  /** What breaks, in operator language — not "column missing". */
  breaks: string;
}

const REQUIRED: Requirement[] = [
  {
    table: 'catalog_sync_seen',
    migration: '055_store_reconcile.sql',
    breaks: 'Delisted Sinclair’s items are never removed from the catalog.',
  },
  {
    table: 'products',
    columns: ['proposed_image_borrowed', 'regular_price', 'sale_start_date', 'sale_finish_date'],
    migration: '055_store_reconcile.sql / 060_sale_prices.sql',
    breaks: 'Photo review and sale prices stop updating during the nightly sync.',
  },
  {
    table: 'products',
    columns: ['variant_group', 'variant_label', 'variant_rank'],
    migration: '061_variant_groups.sql',
    breaks: 'Repeated meat sizes show as separate cards instead of one card with a size chooser.',
  },
  {
    table: 'orders',
    columns: ['register_total', 'deck_register_total', 'cod_fee_percent', 'cod_fee_amount'],
    migration: '058_cod_fee_amount.sql / 059_deck_register_total.sql',
    breaks: 'Register totals and the COD handling fee cannot be saved.',
  },
  {
    table: 'order_items',
    columns: ['regular_price', 'sale_finish_date', 'paid_by', 'cod_name', 'service_details'],
    migration: '060_sale_prices.sql',
    breaks: 'Orders fail to save, or save with no items.',
  },
];

export interface SchemaIssue {
  table: string;
  missing: string[];
  migration: string;
  breaks: string;
}

/**
 * Probe every required object. Cheap: `limit(0)` fetches no rows, and asking
 * for a column that doesn't exist is an immediate PostgREST error — which is
 * precisely the signal we want.
 *
 * Deliberately NOT a SQL function: if migrations are behind, a health-check
 * function would be missing too. The probe has to work from outside.
 */
export async function checkSchemaHealth(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ ok: boolean; issues: SchemaIssue[] }> {
  const issues: SchemaIssue[] = [];

  for (const req of REQUIRED) {
    // Does the table exist at all?
    const { error: tableErr } = await supabase.from(req.table).select('*', { head: true }).limit(0);
    if (tableErr) {
      issues.push({ table: req.table, missing: ['(entire table)'], migration: req.migration, breaks: req.breaks });
      continue;
    }
    if (!req.columns?.length) continue;

    // One request for all columns; on failure, fall back to per-column probes
    // so the report names exactly what's missing rather than the whole set.
    const { error: colsErr } = await supabase
      .from(req.table).select(req.columns.join(','), { head: true }).limit(0);
    if (!colsErr) continue;

    const missing: string[] = [];
    for (const col of req.columns) {
      const { error } = await supabase.from(req.table).select(col, { head: true }).limit(0);
      if (error) missing.push(col);
    }
    if (missing.length) {
      issues.push({ table: req.table, missing, migration: req.migration, breaks: req.breaks });
    }
  }

  return { ok: issues.length === 0, issues };
}
