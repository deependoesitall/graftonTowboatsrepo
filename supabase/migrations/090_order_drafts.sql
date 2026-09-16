-- 090: Drafted Orders — a half-built staff order that survives closing the tab
--
-- THE PROBLEM
-- -----------
-- Building an order for a boat is not a two-minute job. A 200-line reorder off
-- a paper form, with a parts pickup and a crew change on it, is twenty minutes
-- of work held entirely in one browser tab's React state. Clicking a
-- notification, following a link to check a price, a laptop going to sleep —
-- any of those and the whole thing is gone with nothing to show for it.
--
-- WHY THE SERVER AND NOT localStorage
-- -----------------------------------
-- localStorage would cover the click-out case and nothing else. This is a
-- counter with several people behind it: Sinclair's starts an order off the
-- morning's paper forms, GTS finishes it after the boat calls with a delivery
-- time. A draft has to be visible to whoever picks it up next, from whichever
-- machine they are sitting at, or it is a private note rather than a shared
-- tool.
--
-- ⚠️ A DRAFT IS NOT AN ORDER. Nothing here is a row in `orders`, nothing is
-- emailed, nothing is billed, nothing appears in any queue or report. The only
-- way an order comes into existence is still POST /api/orders — a draft is the
-- builder's state, parked. That separation is the whole safety property: a
-- half-finished draft can never accidentally become something Sinclair's
-- shops or a boat is invoiced for.

CREATE TABLE IF NOT EXISTS order_drafts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── what it is for ──────────────────────────────────────────────────────
  -- Denormalized so the drafts list can be drawn without unpacking `state`.
  -- They are a copy of what is inside it and are rewritten on every save.
  company_name text NOT NULL DEFAULT '',
  vessel_name  text NOT NULL DEFAULT '',
  line_count   integer NOT NULL DEFAULT 0,
  subtotal     numeric(10,2) NOT NULL DEFAULT 0,

  -- ── the builder's state, whole ──────────────────────────────────────────
  -- ⚠️ DELIBERATELY OPAQUE. This is one screen's working state, not a schema
  -- anything queries. Giving each of header / quantities / line payers / write
  -- ins / services its own column would mean a migration every time the
  -- builder grows a field, and a draft saved by an older tab would come back
  -- missing whatever was added since. A blob round-trips exactly what was
  -- saved, and the builder is the only thing that ever reads it.
  state        jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- ── who and when ────────────────────────────────────────────────────────
  -- Names, not ids: admin_users.id is absent for the legacy single-password
  -- login, and what the list needs to show is "Jen, 20 minutes ago".
  created_by   text NOT NULL DEFAULT '',
  updated_by   text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- ── life cycle ──────────────────────────────────────────────────────────
  -- 'placed' rows are kept rather than deleted: when two people have the same
  -- draft open, the second one needs to be told it has already gone out, and a
  -- deleted row cannot say anything at all.
  status       text NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'placed', 'discarded')),
  order_id     uuid REFERENCES orders(id) ON DELETE SET NULL,
  placed_at    timestamptz
);

-- The list is always "open drafts, most recently touched first".
CREATE INDEX IF NOT EXISTS idx_order_drafts_open
  ON order_drafts (updated_at DESC)
  WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS idx_order_drafts_vessel
  ON order_drafts (vessel_name, updated_at DESC)
  WHERE status = 'draft';

-- ⚠️ SERVICE ROLE ONLY, AND NO PUBLIC POLICY AT ALL.
--
-- A draft holds a boat's contact details, delivery plan and prices. Every
-- route that touches it goes through requireAdmin() and the service client, so
-- the admin session — not a Supabase JWT — is what authorizes a read. There is
-- deliberately no `authenticated` policy: a crew login must never be able to
-- read the counter's working notes about their own boat, let alone anyone
-- else's.
ALTER TABLE order_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_drafts_service_all ON order_drafts;
CREATE POLICY order_drafts_service_all ON order_drafts
  FOR ALL USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

COMMENT ON TABLE order_drafts IS
  'Parked state of the admin order builder. NOT an order — nothing here is emailed, billed or shopped; POST /api/orders remains the only way an order is created. Service-role only (090).';
COMMENT ON COLUMN order_drafts.state IS
  'Opaque builder state (header, quantities, line payers, write-ins, services). Only the builder reads it; kept as a blob so adding a field needs no migration.';

-- Housekeeping, run whenever you like:
-- DELETE FROM order_drafts
--  WHERE status <> 'draft' AND updated_at < now() - interval '90 days';
