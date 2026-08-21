-- Migration 058: hand-keyed COD handling fee
--
-- The fee has been a PERCENTAGE of the COD subtotal, which works fine when the
-- price is known at order time. It does not work for off-catalog requests.
--
-- A crew member links a Walmart TV. Nobody knows what it costs until Sinclair's
-- has driven there and bought it, so at order time the line is $0 and 5% of $0
-- is $0. Sinclair's ends up absorbing the real handling cost of the trip.
--
-- So: the percentage stays as the default, and this column is a manual override
-- Sinclair's sets once the run is done and the real cost is known.
--
--   NULL  → derive the fee from cod_fee_percent (existing behaviour, unchanged)
--   0     → deliberately no fee (a decision, not an absence — hence NOT NULL-ing)
--   > 0   → this exact dollar amount IS the fee
--
-- Every existing order keeps NULL and behaves exactly as before.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cod_fee_amount NUMERIC(10, 2);

COMMENT ON COLUMN orders.cod_fee_amount IS
  'Hand-keyed COD handling fee in dollars. NULL = derive from cod_fee_percent. Overrides the percentage when set, including a deliberate 0.';

-- Orders currently carrying a COD fee, for reference after deploying.
SELECT count(*) FILTER (WHERE cod_fee_percent IS NOT NULL) AS with_percent,
       count(*) FILTER (WHERE cod_fee_amount  IS NOT NULL) AS with_manual_amount
  FROM orders;
