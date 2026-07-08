-- 027_cod_rework_and_fleet_cta.sql
-- Demo 2 (July 7) follow-ups — structural COD rework + fleet pricing CTA.
--
--   1. order_items.paid_by      — every cart line is paid by the vessel account
--                                 OR by an individual crew member (COD).
--                                 Replaces the free-text extended_info.personal_cod_notes.
--   2. order_items.cod_name     — crew member's name for COD lines.
--   3. order_items.image_url    — product image snapshot so thumbnails carry
--                                 through to checkout review / order history.
--   4. orders.cod_payment_method / cod_preferred_phone / cod_contact_time
--                               — how the COD portion gets settled. Credit card
--                                 means Sinclair's calls the crew member, so we
--                                 capture a preferred number + time to call.
--   5. admin_settings.fleet_cta_enabled — toggleable B2B fleet-pricing banner
--                                 on the catalog (off until Jen approves wording).
--
-- APPLY THIS BEFORE DEPLOYING THE MATCHING CODE CHANGES.

-- ============================================================
-- 1–3. order_items: paid_by / cod_name / image_url
-- ============================================================
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS paid_by TEXT NOT NULL DEFAULT 'vessel'
    CHECK (paid_by IN ('vessel', 'cod')),
  ADD COLUMN IF NOT EXISTS cod_name  TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Billing reports filter on this constantly (COD excluded from invoicing).
CREATE INDEX IF NOT EXISTS idx_order_items_paid_by ON order_items (paid_by)
  WHERE paid_by = 'cod';

-- ============================================================
-- 4. orders: COD payment settlement details
-- ============================================================
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cod_payment_method TEXT
    CHECK (cod_payment_method IN ('cash', 'venmo', 'credit_card')),
  ADD COLUMN IF NOT EXISTS cod_preferred_phone TEXT,
  ADD COLUMN IF NOT EXISTS cod_contact_time    TEXT;

-- ============================================================
-- 5. admin_settings: fleet pricing CTA toggle (default OFF —
--    Jen is still workshopping the wording)
-- ============================================================
ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS fleet_cta_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- Housekeeping: service_type check predates 'other_pickup'
-- (017 only allowed parts_pickup / package_delivery). Re-create
-- it so all three service types are valid.
-- ============================================================
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_service_type_check;
ALTER TABLE order_items
  ADD CONSTRAINT order_items_service_type_check
  CHECK (service_type IS NULL OR service_type IN ('parts_pickup', 'package_delivery', 'other_pickup'));
