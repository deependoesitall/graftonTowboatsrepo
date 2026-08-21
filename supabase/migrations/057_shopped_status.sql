-- Migration 057: a distinct SHOPPED state
--
-- The lifecycle conflated two different completions. 'fulfilled' was being used
-- to mean "Sinclair's finished shopping" — it's what feeds GTS's final-email
-- queue — but the plain reading of fulfilled is "the crew has their groceries".
-- Those are different moments, done by different companies, hours apart.
--
--   new         → order placed by the boat
--   in_progress → Sinclair's picked it up and is walking the store
--   shopped     → Sinclair's rang it up and confirmed the register total  (NEW)
--   fulfilled   → Grafton delivered it to the vessel
--   cancelled
--
-- 'shopped' is set when the register total is confirmed, because that IS the
-- end of Sinclair's involvement: the number is keyed, the receipt exists, and
-- everything downstream bills from it.
--
-- Nothing is migrated. Existing 'fulfilled' orders keep that status and stay in
-- the final-email queue, which reads both states — so nothing in flight is lost.

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('new', 'in_progress', 'shopped', 'fulfilled', 'cancelled'));

-- Current spread, for reference after deploying.
SELECT status, count(*) AS orders
  FROM orders
 GROUP BY status
 ORDER BY 1;
