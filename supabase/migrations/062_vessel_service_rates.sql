-- 062_vessel_service_rates.sql
--
-- BOAT-LEVEL DELIVERY RATES.
--
-- Jen's spreadsheet carries this note in red at the top:
--
--     "Ingram $225 rate is for Mike Schmeng and Scott Noble Only"
--
-- The ledger proves it. Ingram's Daytime Van Delivery runs $350 for most of
-- their fleet, but Scott Noble (24 deliveries) and Mike Schmeng (10) are $225.
-- Until now that rule lived only in a red note and in Jen's head, so the app's
-- auto-fill quietly offered the wrong number on nearly every Ingram order.
--
-- It isn't only Ingram. The same pattern is in the history for:
--     Artco        Ardyce Randall / Coral Dawn / Crimson Glory  $450
--                  vs Coop Vanguard / Sierra Dawn               $350
--     Reliant      Susan K / Thomas K                           $450
--                  vs Coop Ambassador / Gregory David           $350
--     Excel Marine Oliver Shearer $450  vs  Rick Hay $350
--
-- So rates now resolve in three tiers:
--
--     boat rate  →  company rate  →  shared default
--
-- KEYED ON THE NORMALIZED VESSEL NAME, not the raw text. The ledger spells the
-- same boat "Scott Noble", "W Scott Noble" and "W. Scott Noble"; vesselKey() in
-- src/lib/vessel.ts already collapses those to one key, and billing has always
-- grouped on it. Rates use the same key so a boat can't get two prices because
-- a driver typed an initial. The original spelling is still shown to humans via
-- vessel_label — nothing is rewritten.

CREATE TABLE IF NOT EXISTS vessel_service_rates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id)     ON DELETE CASCADE,
  service_type_id  uuid NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
  -- Normalized key from vesselKey(): lowercased, punctuation and spacing
  -- flattened, "M/V" and leading initials dropped.
  vessel_key       text NOT NULL,
  -- The spelling to show in the UI. Display only.
  vessel_label     text NOT NULL,
  rate             numeric(10,2) NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, vessel_key, service_type_id)
);

CREATE INDEX IF NOT EXISTS idx_vessel_rates_lookup
  ON vessel_service_rates (company_id, vessel_key, service_type_id);

COMMENT ON TABLE vessel_service_rates IS
  'Per-boat delivery rates. Beats the company rate, which beats the service default.';
COMMENT ON COLUMN vessel_service_rates.vessel_key IS
  'Normalized name from vesselKey() — "W Scott Noble" and "Scott Noble" share one row.';

ALTER TABLE vessel_service_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vessel_rates_service_all ON vessel_service_rates;
CREATE POLICY vessel_rates_service_all ON vessel_service_rates
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── Seed the rules the ledger already demonstrates ─────────────────
--
-- Only where the history is unambiguous: the boat has 2+ deliveries of that
-- service at a single consistent price that differs from the company rate.
-- One-off and contradictory rows are deliberately left out — Jen should set
-- those herself rather than have the app guess from a single data point.

INSERT INTO vessel_service_rates (company_id, service_type_id, vessel_key, vessel_label, rate)
SELECT c.id, st.id, v.vessel_key, v.vessel_label, v.rate
  FROM (VALUES
    -- The red note, made real.
    ('Ingram',       'Daytime Van Delivery', 'scottnoble',      'Scott Noble',      225.00),
    ('Ingram',       'Daytime Van Delivery', 'mikeschmeng',     'Mike Schmeng',     225.00),
    -- Same pattern, other barge lines.
    ('Artco',        'Daytime Van Delivery', 'ardycerandall',   'Ardyce Randall',   450.00),
    ('Reliant',      'Daytime Van Delivery', 'gregorydavid',    'Gregory David',    350.00)
  ) AS v(company_name, service_name, vessel_key, vessel_label, rate)
  JOIN companies     c  ON lower(btrim(c.name))  = lower(btrim(v.company_name))
  JOIN service_types st ON lower(btrim(st.name)) = lower(btrim(v.service_name))
ON CONFLICT (company_id, vessel_key, service_type_id) DO NOTHING;


-- What got seeded:
-- SELECT c.name AS company, r.vessel_label, st.name AS service, r.rate
--   FROM vessel_service_rates r
--   JOIN companies c ON c.id = r.company_id
--   JOIN service_types st ON st.id = r.service_type_id
--  ORDER BY c.name, r.vessel_label, st.name;
