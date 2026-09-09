-- 072_delivery_po_and_helper.sql
--
-- Four fields the ledger form asks for and the table couldn't store.
--
-- ── po_number ────────────────────────────────────────────────────────────
-- `orders` has had one since migration 001, but `deliveries` never did — so a
-- PO given over the phone had nowhere to live and ended up typed into the
-- issues/comments box, where the billing packet can't find it. Ingram's
-- accounts payable want the PO on the invoice; digging it out of a free-text
-- notes field is how it gets missed.
--
-- ── helper_* ─────────────────────────────────────────────────────────────
-- Some runs take two people. Until now the second person's hours and pay were
-- either folded into the driver's numbers — quietly overstating one person's
-- hours in the only record of who worked when — or written in the comments.
--
-- Nullable and unconstrained on purpose: this is a log of what happened, not a
-- form to be satisfied. Most deliveries have no helper and no PO, and neither
-- absence is an error.

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS po_number    text,
  ADD COLUMN IF NOT EXISTS helper_name  text,
  ADD COLUMN IF NOT EXISTS helper_hours numeric(6,2),
  ADD COLUMN IF NOT EXISTS helper_pay   numeric(10,2);

COMMENT ON COLUMN deliveries.po_number IS
  'Customer PO for this delivery. Separate from orders.po_number — a phone delivery has no order row. Carried onto the billing packet.';
COMMENT ON COLUMN deliveries.helper_name IS
  'Second crew member on the run, if any. Their hours/pay are helper_hours and helper_pay, kept apart from the driver''s.';

-- Rows with a PO are the ones AP will query, so make them findable.
CREATE INDEX IF NOT EXISTS idx_deliveries_po
  ON deliveries (po_number) WHERE po_number IS NOT NULL;

-- Check:
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'deliveries'
--    AND column_name IN ('po_number','helper_name','helper_hours','helper_pay');
-- -- expect 4 rows
