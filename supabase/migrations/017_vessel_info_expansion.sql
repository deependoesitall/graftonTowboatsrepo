-- ============================================================
-- 017: Vessel Information Expansion + Additional Services
-- Adds detailed vessel, delivery, and crew change fields to orders.
-- Adds item_type / service_type / service_details to order_items
-- for parts-pickup and package-delivery service line items.
-- ============================================================

-- ── ORDERS: vessel info ───────────────────────────────────────
ALTER TABLE orders
  -- Vessel details (split from company_name)
  ADD COLUMN IF NOT EXISTS vessel_name        TEXT,
  ADD COLUMN IF NOT EXISTS vessel_type        TEXT,  -- Towboat, Line Boat, etc.
  ADD COLUMN IF NOT EXISTS captain_name       TEXT,
  ADD COLUMN IF NOT EXISTS captain_phone      TEXT,
  ADD COLUMN IF NOT EXISTS vessel_email       TEXT,

  -- Primary delivery
  ADD COLUMN IF NOT EXISTS delivery_method    TEXT CHECK (delivery_method IN ('boat','van')),
  ADD COLUMN IF NOT EXISTS terminal_name      TEXT,
  ADD COLUMN IF NOT EXISTS arrival_date       TEXT,  -- free-text, e.g. "June 15"
  ADD COLUMN IF NOT EXISTS arrival_time       TEXT,  -- free-text, e.g. "6 AM"
  ADD COLUMN IF NOT EXISTS approach_side      TEXT CHECK (approach_side IN ('port','starboard','either')),
  ADD COLUMN IF NOT EXISTS vhf_channel        TEXT,

  -- Crew change
  ADD COLUMN IF NOT EXISTS crew_change        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS crew_arriving      INTEGER,
  ADD COLUMN IF NOT EXISTS crew_departing     INTEGER,

  -- Catch-all for: order contact, secondary delivery location, docking/security notes
  ADD COLUMN IF NOT EXISTS extended_info      JSONB;

-- ── ORDER_ITEMS: service line items ──────────────────────────
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS item_type       TEXT NOT NULL DEFAULT 'grocery'
    CHECK (item_type IN ('grocery','service')),
  ADD COLUMN IF NOT EXISTS service_type    TEXT
    CHECK (service_type IN ('parts_pickup','package_delivery')),
  ADD COLUMN IF NOT EXISTS service_details JSONB;

-- Index for filtering service items
CREATE INDEX IF NOT EXISTS idx_order_items_item_type ON order_items(item_type);
