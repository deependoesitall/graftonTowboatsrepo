-- 033_cod_payment_rework.sql
-- Round 8 COD payment rework (July 10 in-person demo + Dave's follow-up texts).
--
--   1. cod_payment_method gains 'cashapp'. Cash is NO LONGER selectable in the
--      UI (Dave: "cash is never going to be an option") but stays valid in the
--      CHECK for legacy rows.
--   2. orders.cod_payment_handle — the crew member's OWN @venmo / $cashtag.
--      Sinclair's/GTS sends a payment REQUEST to it for the exact final amount.
--      We never publish our handles or accept inbound sends.
--   3. orders.cod_fee_percent — COD handling fee (default 5%, offsets
--      Venmo/Cash App/credit-card processing). Admin-editable per order
--      ("default 5%, but we can edit it ourselves — up for big-ticket items").
--   4. Future-proofing: order_items.paid_by CHECK gains 'deck' for Dave's
--      deck-order type (company-billed, listed separately, doesn't count
--      against the boat's grocery allowance). UI ships in a later wave.
--
-- APPLY THIS BEFORE DEPLOYING THE MATCHING CODE CHANGES.
-- (And make sure 026–032 are applied first — the July 19 coupon-toggle error
-- proved at least 026 was missing in production.)

-- 1. Payment method: recreate CHECK with cashapp
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_cod_payment_method_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_cod_payment_method_check
  CHECK (cod_payment_method IS NULL OR cod_payment_method IN ('cash', 'venmo', 'cashapp', 'credit_card'));

-- 2. Crew member's payment handle (request-based flow)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cod_payment_handle TEXT;

-- 3. COD handling fee percent (default 5, per-order editable)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cod_fee_percent NUMERIC(5,2);

-- 4. Deck charge type (schema only — UI in a later wave)
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_paid_by_check;
ALTER TABLE order_items
  ADD CONSTRAINT order_items_paid_by_check
  CHECK (paid_by IN ('vessel', 'cod', 'deck'));
