-- 089: the rails follow Sinclair's automatically, and the admin switch still wins
--
-- THE TWO QUESTIONS A RAIL HAS TO ANSWER
-- --------------------------------------
-- There are two entirely different reasons a rail should not be on the page,
-- and 075 only had a column for one of them:
--
--   "Is GTS willing to show this?"     — admin_settings.show_sale_rail (075).
--                                        A person decided. Nothing automatic
--                                        may ever override it.
--
--   "Is Sinclair's running one?"       — this migration. Sinclair's drops the
--                                        sale row from their own storefront in
--                                        quiet weeks, and ours is supposed to
--                                        go with it. Nobody should have to
--                                        notice and flip a switch.
--
-- Until now the second question was guessed in the browser: CatalogRails hid
-- the sale rail when fewer than eight cards came back. That is a proxy for the
-- real question and it gets it wrong in both directions — it hides a genuine
-- seven-item sale week, and it happily shows a rail built from a stale
-- snapshot on a week Sinclair's has no sale at all, because the snapshot still
-- has rows in it.
--
-- The nightly job knows the real answer, because it is the thing that talks to
-- Freshop. It writes it here, and the read path shows a rail only when BOTH
-- answers are yes.
--
-- ⚠️ THESE COLUMNS BELONG TO THE CRON, NOT TO THE ADMIN PANEL. Nothing a person
-- clicks may write them, or the automatic behaviour becomes a setting that
-- silently disagrees with itself.

ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS sale_rail_available         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS best_sellers_rail_available boolean NOT NULL DEFAULT true,
  -- How many items Sinclair's was publishing at the last check. Kept so the
  -- admin panel can say WHY a rail is dark instead of just leaving it dark.
  ADD COLUMN IF NOT EXISTS sale_rail_upstream_count    integer,
  ADD COLUMN IF NOT EXISTS rails_checked_at            timestamptz;

COMMENT ON COLUMN admin_settings.sale_rail_available IS
  'Set by the nightly rail cron: is Sinclair''s running a sale week? ANDed with show_sale_rail. Never written by the admin panel (089).';
COMMENT ON COLUMN admin_settings.best_sellers_rail_available IS
  'Set by the nightly rail cron: did the best-seller build return a usable rail? ANDed with show_best_sellers_rail (089).';
COMMENT ON COLUMN admin_settings.sale_rail_upstream_count IS
  'Items in Sinclair''s own sale set at the last nightly check — shown in Settings so a dark rail has a stated reason (089).';
COMMENT ON COLUMN admin_settings.rails_checked_at IS
  'When the nightly rail cron last reached Freshop. A stale value means the cron is not running (089).';

-- Default TRUE on both: a database that has this migration but has not yet run
-- the cron behaves exactly as it did before, rather than going dark until
-- midnight.

-- Check after the next cron run:
-- SELECT show_sale_rail, sale_rail_available, sale_rail_upstream_count,
--        show_best_sellers_rail, best_sellers_rail_available, rails_checked_at
--   FROM admin_settings;
