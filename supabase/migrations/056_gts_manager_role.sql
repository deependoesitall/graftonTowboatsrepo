-- Migration 056: separate GTS Manager from Sinclair's Manager
--
-- The admin roles serve TWO BUSINESSES, and the old three-role ladder couldn't
-- express that. 'manager' is already the SINCLAIR'S manager — the Settings
-- screen labels it "Sinclair's Manager — products, orders, weekly ad, coupons"
-- and Dave's team uses it. But the Dashboard's final-email dialog also carries
-- GTS's delivery rate cards, barge lines and customer billing terms, and the
-- Dashboard is visible to every role.
--
-- That means Sinclair's could see what Grafton Towboat charges its own
-- customers to deliver. That's a confidentiality boundary between two separate
-- companies, not a seniority difference, so it needs its own role rather than
-- another permission tweak.
--
--   owner        — GTS. Everything.
--   gts_manager  — GTS. Orders, products, settings + delivery/billing terms.  (NEW)
--   manager      — Sinclair's Manager. UNCHANGED.
--   staff        — Sinclair's floor staff. Orders only. UNCHANGED.
--
-- No existing user changes role here. Promote the GTS people by hand afterwards
-- (Settings → Admin Users), so nobody silently gains access.

ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;

ALTER TABLE admin_users
  ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('owner', 'gts_manager', 'manager', 'staff'));

-- Who is currently what — run this and promote the GTS staff deliberately.
-- Anyone on 'manager' is treated as SINCLAIR'S and will no longer see GTS
-- delivery terms.
SELECT role, count(*) AS users, string_agg(username, ', ' ORDER BY username) AS who
  FROM admin_users
 GROUP BY role
 ORDER BY role;
