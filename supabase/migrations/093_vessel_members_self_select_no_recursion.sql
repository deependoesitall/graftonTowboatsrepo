-- vessel_members_self_select used to subquery vessel_members itself → 42P17
-- infinite recursion, which broke Account boat links for signed-in users.
-- Self-select is own rows only; vessel/order policies still join via
-- `vessel_id IN (SELECT vessel_id FROM vessel_members WHERE user_id = auth.uid())`.

DROP POLICY IF EXISTS vessel_members_self_select ON vessel_members;
CREATE POLICY vessel_members_self_select ON vessel_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
