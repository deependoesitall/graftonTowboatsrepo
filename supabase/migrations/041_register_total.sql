-- Migration 041: register_total on orders
-- Stores the actual total Sinclair's rang at the register after scanning the
-- pick sheet. Optional — if set, shown alongside the system-calculated subtotal
-- so GTS can spot discrepancies (price changes, weight variance, etc.) before
-- sending the final customer email.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS register_total numeric(10,2);
