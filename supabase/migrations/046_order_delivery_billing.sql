-- Migration 046: GTS delivery billing on the order
--
-- Lets the GTS delivery fee ride on the FINAL customer email as a line item
-- next to the Sinclair's grocery total — so Ingram (and anyone who wants it)
-- gets one document with everything on it, instead of GTS's fee arriving
-- separately or being questioned ("why isn't your fee on Sinclair's bill?").
--
--   delivery_fee         — GTS's charge for this delivery (final, not estimated)
--   delivery_service_type — the service label (Daytime Van Delivery, etc.)
--   delivery_company_id   — barge line used to auto-fill the rate from its card
--   bill_for_groceries    — TRUE: GTS bills groceries + delivery as one total.
--                           FALSE: customer pays Sinclair's directly, so the
--                           final email shows ONLY the GTS delivery charge.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee numeric(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_service_type text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_company_id uuid REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bill_for_groceries boolean NOT NULL DEFAULT true;
