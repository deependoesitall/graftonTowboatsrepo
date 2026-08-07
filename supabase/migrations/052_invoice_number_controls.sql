-- Migration 052: make the GTS invoice number admin-controlled
--
-- 048 seeded the sequence at 1084 as a guess at where QuickBooks left off.
-- Nobody actually knows the true next number until Mary Karen checks, so the
-- starting point must be editable from the admin panel — not baked into code.
--
--   peek_invoice_number() — what the NEXT invoice will be, without consuming it
--   set_invoice_number(n) — set the next invoice number (admin, owner-only API)
--
-- The sequence itself stays the allocator: two invoices generated at the same
-- instant can never collide, which a plain settings integer couldn't guarantee.

CREATE SEQUENCE IF NOT EXISTS gts_invoice_seq START WITH 1084;

CREATE OR REPLACE FUNCTION peek_invoice_number()
  RETURNS bigint
  LANGUAGE sql
  SECURITY DEFINER
AS $$
  SELECT CASE WHEN is_called THEN last_value + 1 ELSE last_value END
  FROM gts_invoice_seq;
$$;

CREATE OR REPLACE FUNCTION set_invoice_number(n bigint)
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  -- is_called = false → the very next nextval() returns exactly n
  PERFORM setval('gts_invoice_seq', GREATEST(n, 1), false);
  RETURN GREATEST(n, 1);
END;
$$;
