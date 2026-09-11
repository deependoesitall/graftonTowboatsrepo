-- 076_vessel_membership.sql
--
-- Company → boat → cook logins.
--
-- Barges often have two cooks who both need to sign in and see the SAME
-- order history for that boat, while billing still goes to the company
-- (Ingram, Artco, …). Until now a login only saw orders tied to its own
-- user_id / email. Staff already looked history up BY BOAT
-- (/api/admin/vessel-orders); this brings that model to the customer side.
--
--   companies          — already exists (044). Bill here.
--   vessels            — one row per boat under a company.
--   vessel_members     — auth users who can act for that boat.
--   orders.vessel_id   — optional FK; new/onboarded orders set it.
--   orders.user_id     — who submitted (may already exist in prod).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS vessel_id uuid;

CREATE TABLE IF NOT EXISTS vessels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  name_key    text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name_key)
);

CREATE INDEX IF NOT EXISTS idx_vessels_company ON vessels (company_id);

CREATE TABLE IF NOT EXISTS vessel_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id     uuid NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  role          text NOT NULL DEFAULT 'cook'
                  CHECK (role IN ('cook', 'captain', 'other')),
  display_name  text,
  email         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vessel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_vessel_members_user ON vessel_members (user_id);
CREATE INDEX IF NOT EXISTS idx_vessel_members_vessel ON vessel_members (vessel_id);

-- FK for orders.vessel_id (added separately so ADD COLUMN above stays simple)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_vessel_id_fkey'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_vessel_id_fkey
      FOREIGN KEY (vessel_id) REFERENCES vessels(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_vessel_id ON orders (vessel_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders (user_id);

ALTER TABLE vessels ENABLE ROW LEVEL SECURITY;
ALTER TABLE vessel_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vessels_service_all ON vessels;
CREATE POLICY vessels_service_all ON vessels
  FOR ALL USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS vessels_member_select ON vessels;
CREATE POLICY vessels_member_select ON vessels
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT vessel_id FROM vessel_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS vessel_members_service_all ON vessel_members;
CREATE POLICY vessel_members_service_all ON vessel_members
  FOR ALL USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS vessel_members_self_select ON vessel_members;
CREATE POLICY vessel_members_self_select ON vessel_members
  FOR SELECT TO authenticated
  USING (
    vessel_id IN (SELECT vessel_id FROM vessel_members WHERE user_id = auth.uid())
  );

-- Customer past orders: own submissions OR any order on a boat they belong to.
DROP POLICY IF EXISTS orders_customer_select ON orders;
CREATE POLICY orders_customer_select ON orders
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR vessel_id IN (SELECT vessel_id FROM vessel_members WHERE user_id = auth.uid())
  );

COMMENT ON TABLE vessels IS
  'Boats under a barge-line company. Shared order history for vessel_members.';
COMMENT ON TABLE vessel_members IS
  'Cook/captain logins linked to a vessel. Separate auth users, shared boat history.';
