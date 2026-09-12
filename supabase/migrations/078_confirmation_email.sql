-- 078: staff-built orders can skip the boat confirmation email.
--
-- Sinclair's/GTS will type paper Sinclair's forms into Build an order.
-- Emailing the boat a "new order" they already placed on paper confuses them,
-- so staff choose at place-time. These columns are the audit: was a
-- confirmation ever sent, and was the FINAL shopped email ever sent
-- (shopped_email_* already exists from 038).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_by TEXT;

COMMENT ON COLUMN orders.confirmation_email_sent_at IS
  'When the boat confirmation email actually went out. NULL = never sent.';
COMMENT ON COLUMN orders.confirmation_email_sent_by IS
  'Who sent it, or "skipped — {staff}" when they opted out at place-time.';
