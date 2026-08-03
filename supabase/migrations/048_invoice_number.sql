-- Migration 048: GTS invoice numbers
--
-- Generated invoices now carry a real, sequential GTS invoice number instead
-- of the order number. A Postgres SEQUENCE gives race-free allocation (two
-- invoices generated at the same instant can never collide).
--
-- Starts at 1084 to continue right after Grafton's last QuickBooks invoice
-- (#1083). To re-align at any time: ALTER SEQUENCE gts_invoice_seq RESTART WITH <n>;
--
-- The number is assigned ONCE, the first time an order's invoice is generated,
-- and then stored on the order so it never changes on re-view.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_number integer;

CREATE SEQUENCE IF NOT EXISTS gts_invoice_seq START WITH 1084;

CREATE OR REPLACE FUNCTION next_invoice_number()
  RETURNS bigint
  LANGUAGE sql
  SECURITY DEFINER
AS $$ SELECT nextval('gts_invoice_seq'); $$;
