-- Migration 044: deliveries ledger + per-company delivery rate cards
--
-- Brings Mary/Jen's "2025_2026 DELIVERIES" spreadsheet into the admin panel:
--   companies              — the barge lines (Ingram, Artco, Reliant…), a
--                            managed list that replaces the free-text drift
--                            ("Artco/ARTCO/ARTco", "Reliant/Relient").
--   service_types          — delivery types with a DEFAULT rate (the shared,
--                            always-editable default table).
--   company_service_rates  — per-company rate OVERRIDES; when logging a
--                            delivery the fee auto-fills from the company's
--                            override, falling back to the service default.
--   deliveries             — the ledger itself, every column from the sheet.

-- ── Barge-line companies ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text UNIQUE NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Service types + shared default rate ───────────────────────────────────
CREATE TABLE IF NOT EXISTS service_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text UNIQUE NOT NULL,
  default_rate  numeric(10,2) NOT NULL DEFAULT 0,
  sort          int NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Per-company rate overrides ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_service_rates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  service_type_id  uuid NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
  rate             numeric(10,2) NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, service_type_id)
);

-- ── The delivery ledger (every column from the spreadsheet) ───────────────
CREATE TABLE IF NOT EXISTS deliveries (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_date         date,
  delivery_driver       text,
  hours_worked          numeric(6,2),
  amount_paid_driver    numeric(10,2),
  vessel_name           text,
  company_id            uuid REFERENCES companies(id) ON DELETE SET NULL,
  service_type          text,                 -- preserves the original label
  location_delivered    text,
  delivery_fee          numeric(10,2),
  bill_for_groceries    boolean DEFAULT false,
  sinclairs_grocery_total numeric(10,2),
  updated_quickbooks    boolean DEFAULT false,
  phone_number_used     text,
  ingram_slip_image_url text,                 -- photo of the signed Ingram slip
  issues_comments       text,
  gts_correspondent     text,
  invoice_sent          date,
  incentive             text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_date ON deliveries (delivery_date DESC);
CREATE INDEX IF NOT EXISTS idx_deliveries_company ON deliveries (company_id);

-- All four tables are admin-only — service-role access, same as admin_settings.
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_service_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY companies_service_all ON companies FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_types_service_all ON service_types FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY company_rates_service_all ON company_service_rates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY deliveries_service_all ON deliveries FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Seed the barge-line companies (normalized from the 2026 ledger) ───────
INSERT INTO companies (name) VALUES
  ('Ingram'), ('Artco'), ('Reliant'), ('ACBL'), ('Marquette'),
  ('Kirby'), ('Excel Marine'), ('Southern Devall'), ('Canal'),
  ('Florida Marine'), ('Magnolia'), ('Tennessee Valley Towing'),
  ('Hines Furlong')
ON CONFLICT (name) DO NOTHING;

-- ── Seed service types + the default rate table (day $350 / night $450 /
--    extended $500-550 pattern seen in the sheet). All editable in admin. ──
INSERT INTO service_types (name, default_rate, sort) VALUES
  ('Daytime Boat Delivery',      350, 10),
  ('Daytime Water Delivery',     350, 11),
  ('Daytime Van Delivery',       350, 12),
  ('Daytime Land Delivery',      350, 13),
  ('Daytime Crew Change',        350, 14),
  ('Daytime Grocery Delivery',   350, 15),
  ('Nighttime Boat Delivery',    450, 20),
  ('Nighttime Water Delivery',   450, 21),
  ('Nighttime Van Delivery',     450, 22),
  ('Nighttime Land Delivery',    550, 23),
  ('Nighttime Crew Change',      450, 24),
  ('Dusk to Dawn Delivery',      450, 25),
  ('Extended Van Delivery',      500, 30),
  ('Extended Land Delivery',     550, 31),
  ('Long Distance Delivery',     522, 32)
ON CONFLICT (name) DO NOTHING;
