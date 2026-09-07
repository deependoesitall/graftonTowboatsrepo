-- 064_link_deliveries_to_orders.sql
--
-- CONNECT THE ORDERING SITE TO THE DELIVERIES LEDGER.
--
-- Jen was told on the Aug 25 call: "you won't really have to use this Add
-- Delivery button hardly ever, because everything is just coming in from your
-- dashboard, like as orders come in."
--
-- That was not true. The deliveries table had no link to orders and nothing
-- outside the ledger screen ever wrote to it, so every delivery still had to be
-- typed in by hand — including ones the app already knew everything about.
--
-- This adds the link. Migration 065's trigger does the writing.
--
-- ON DELETE CASCADE is the second half of the ask: delete an order and its
-- ledger row goes with it. Deliberately CASCADE rather than SET NULL — an
-- orphaned ledger row with no order behind it is worse than no row, because it
-- would sit in the month's totals and get invoiced with nothing to check it
-- against.
--
-- Hand-typed rows are untouched by all of this: they simply have order_id NULL,
-- and nothing in the automation ever looks at them.

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders(id) ON DELETE CASCADE;

-- One order can only ever produce one ledger row. This is what makes the
-- upsert safe to run on every status change and every billing save — the
-- second run updates instead of adding a duplicate delivery to the month.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_deliveries_order
  ON deliveries (order_id) WHERE order_id IS NOT NULL;

-- (No separate lookup index — the unique index above already serves it.)

COMMENT ON COLUMN deliveries.order_id IS
  'The web order this delivery came from. NULL = typed in by hand (phone/paper order). Deleting the order deletes this row.';

-- Nothing to backfill: no delivery in the table today came from an order.
-- The 171 imported 2026 rows are historical, pre-date the ordering site, and
-- correctly keep order_id NULL.

-- Check:
-- SELECT count(*) FILTER (WHERE order_id IS NOT NULL) AS from_the_site,
--        count(*) FILTER (WHERE order_id IS NULL)     AS typed_by_hand
--   FROM deliveries;
