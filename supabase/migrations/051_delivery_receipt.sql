-- Migration 051: Sinclair's receipt on a delivery ledger row
--
-- When a delivery is billed for groceries, staff can attach the Sinclair's
-- register receipt right on the delivery record — Mary Karen's billing backup,
-- stored alongside the fee and grocery total instead of hunting for it later.
-- Files live in the existing 'order-documents' storage bucket.

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS sinclairs_receipt_url text;
