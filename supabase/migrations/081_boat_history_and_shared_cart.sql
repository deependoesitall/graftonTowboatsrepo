-- 081_boat_history_and_shared_cart.sql
--
-- 1) A cook added to Scott Noble must see THAT boat's past orders, even when
--    older rows have vessel_id NULL (guest/staff orders before membership).
-- 2) Shared cart per boat so two cooks can build one grocery list together.

-- Same flattening as src/lib/vessel.ts vesselKey(), minus leading initials
-- (those are rare on stored vessel_name). Used to match free-text orders
-- onto onboarded vessels.
CREATE OR REPLACE FUNCTION public.vessel_name_key(name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(trim(coalesce(name, ''))), '[.,''"`]', '', 'g'),
          '[-_/]+', ' ', 'g'
        ),
        '\s+', ' ', 'g'
      ),
      '^(m/?v|mv|m/?t|mt|tug|towboat|the) ', ''
    ),
    '\s+', '', 'g'
  );
$$;

CREATE OR REPLACE FUNCTION public.company_name_key(name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(lower(coalesce(name, '')), '[^a-z0-9]', '', 'g');
$$;

-- Stamp vessel_id on historical orders that already match an onboarded boat.
UPDATE orders o
SET vessel_id = v.id
FROM vessels v
JOIN companies c ON c.id = v.company_id
WHERE o.vessel_id IS NULL
  AND public.vessel_name_key(o.vessel_name) = v.name_key
  AND public.company_name_key(o.company_name) = public.company_name_key(c.name)
  AND public.vessel_name_key(o.vessel_name) <> '';

DROP POLICY IF EXISTS orders_customer_select ON orders;
CREATE POLICY orders_customer_select ON orders
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR vessel_id IN (SELECT vessel_id FROM vessel_members WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM vessel_members m
      JOIN vessels v ON v.id = m.vessel_id
      JOIN companies c ON c.id = v.company_id
      WHERE m.user_id = auth.uid()
        AND public.vessel_name_key(orders.vessel_name) = v.name_key
        AND public.company_name_key(orders.company_name) = public.company_name_key(c.name)
    )
  );

DROP POLICY IF EXISTS order_items_customer_select ON order_items;
CREATE POLICY order_items_customer_select ON order_items
  FOR SELECT TO authenticated
  USING (
    order_id IN (SELECT id FROM orders)
  );

CREATE TABLE IF NOT EXISTS vessel_carts (
  vessel_id    uuid PRIMARY KEY REFERENCES vessels(id) ON DELETE CASCADE,
  items        jsonb NOT NULL DEFAULT '[]'::jsonb,
  services     jsonb,
  vessel_info  jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid
);

ALTER TABLE vessel_carts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vessel_carts_service_all ON vessel_carts;
CREATE POLICY vessel_carts_service_all ON vessel_carts
  FOR ALL USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

DROP POLICY IF EXISTS vessel_carts_member_all ON vessel_carts;
CREATE POLICY vessel_carts_member_all ON vessel_carts
  FOR ALL TO authenticated
  USING (
    vessel_id IN (SELECT vessel_id FROM vessel_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    vessel_id IN (SELECT vessel_id FROM vessel_members WHERE user_id = auth.uid())
  );

COMMENT ON TABLE vessel_carts IS
  'One shared grocery cart per boat. Cooks on the same vessel build the same order.';
