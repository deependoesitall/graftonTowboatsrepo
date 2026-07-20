-- 038_manual_shopped_email.sql
-- The final "Order Shopped" email is no longer automatic. Sinclair's marking
-- an order fulfilled often ISN'T the end of the job — CODs still get settled,
-- crew changes run, pickups happen. A GTS owner now fires the final email
-- manually from the admin dashboard (with a confirm + preview step that helps
-- catch errors like unrecorded substitutions before the customer sees them).
--
--   shopped_email_sent_at — when the final email went out (NULL = not yet).
--   shopped_email_sent_by — which admin fired it.
--
-- APPLY THIS BEFORE DEPLOYING THE MATCHING CODE CHANGES (after 026–037).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shopped_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shopped_email_sent_by TEXT;
