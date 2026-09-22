-- 097_vessel_member_custom_role.sql
--
-- Crew role is free text (steward, engineer, mate, …). Cook / captain / other
-- stay as UI suggestions. Drop the old three-value check.

ALTER TABLE vessel_members DROP CONSTRAINT IF EXISTS vessel_members_role_check;

ALTER TABLE vessel_members
  ADD CONSTRAINT vessel_members_role_len
  CHECK (char_length(btrim(role)) BETWEEN 1 AND 40);
