-- Migration 047: order billing documents
--
-- For orders where GTS bills the groceries (Ingram et al.), the FINAL email
-- cannot go out on our estimate — it must carry Sinclair's actual register
-- receipt (the itemized PDF with their real prices). That receipt's grand
-- total is the grocery figure; groceries + delivery fee = the final number the
-- captain signs onto the Ingram slip.
--
--   sinclairs_receipt_url — the uploaded Sinclair's register receipt PDF; its
--                           total lands in orders.register_total (migration 041)
--                           and the PDF is attached to the final email.
--   ingram_slip_url       — the signed Ingram Receipt Acknowledgement photo,
--                           stored so it can be pulled onto the QuickBooks bill.
--
-- Requires a Supabase storage bucket named 'order-documents' (create once in
-- the dashboard, same as 'product-images').

ALTER TABLE orders ADD COLUMN IF NOT EXISTS sinclairs_receipt_url text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ingram_slip_url text;
