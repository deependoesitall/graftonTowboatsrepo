-- 032_coupon_engine.sql
-- Digital coupon engine: coupons auto-apply at checkout exactly like
-- Sinclair's own site (rule evaluation from their structured offer data —
-- product lists, minimum quantities, per-transaction limits).
--
--   1. products.freshop_id — Sinclair's internal product id, captured by
--      enrich; offers reference products by this id.
--   2. orders.discount_total — snapshot of total estimated coupon savings.
--   3. order_discounts — one row per applied coupon (name, amount, the
--      qualifying quantity) so receipts/reports can show the rundown.
--
-- Savings are ESTIMATES until Sinclair's rings the order; the engine is
-- gated on admin_settings.show_digital_coupons (managers can kill it).
--
-- APPLY BEFORE DEPLOYING THE MATCHING CODE CHANGES.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS freshop_id TEXT;

CREATE INDEX IF NOT EXISTS idx_products_freshop_id ON products (freshop_id)
  WHERE freshop_id IS NOT NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_total NUMERIC(10, 2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS order_discounts (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  offer_ref      TEXT,                 -- Sinclair's offer id (for audit)
  name           TEXT NOT NULL,        -- "SAVE $3.00"
  description    TEXT,                 -- "…ANY FOUR (4) PARTICIPATING PEPSI…"
  amount         NUMERIC(10, 2) NOT NULL,
  qualifying_qty NUMERIC(7, 2),        -- how many qualifying units were in the cart
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_discounts_order_id ON order_discounts (order_id);

-- Service-role access only (admin routes, PDFs, emails). No public policies.
ALTER TABLE order_discounts ENABLE ROW LEVEL SECURITY;
