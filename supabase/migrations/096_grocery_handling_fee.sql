-- 096: optional grocery handling fee (GTS), distinct from COD handling fee
--
-- Sinclair's register_total stays the pure register ring. This column is an
-- optional flat fee Dave often keys at $50 for grocery runs — blank / 0 means
-- no fee. Never confuse with cod_fee_percent / cod_fee_amount (crew COD).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS grocery_handling_fee numeric NULL;

COMMENT ON COLUMN orders.grocery_handling_fee IS
  'Optional GTS grocery handling fee in dollars (flat). NULL or 0 = no fee. Distinct from COD handling (cod_fee_*). Does not alter register_total — billable grocery = register_total + COALESCE(grocery_handling_fee, 0).';
