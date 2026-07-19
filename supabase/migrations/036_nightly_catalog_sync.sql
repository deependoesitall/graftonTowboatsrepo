-- 036_nightly_catalog_sync.sql
-- Fully automated nightly catalog sync — no more clicking "Enrich from
-- Sinclair's" or "Apply Order-Form Layout" in the admin panel.
--
-- NCR/Freshop rate-limits datacenter IPs hard (the old server-side enrich was
-- abandoned for exactly that reason), so the cron works in SMALL CHUNKS:
-- each invocation downloads a few catalog pages, applies the updates, and
-- saves a checkpoint here. Repeated invocations overnight finish the whole
-- catalog, then the order-form layout re-applies automatically.
--
--   catalog_sync_state      — single-row checkpoint for the chunked sync
--   apply_enrich_updates()  — bulk field update in ONE call per chunk
--                             (per-key presence checks so null-able fields
--                             like quantity_step can be explicitly cleared)
--
-- APPLY THIS BEFORE DEPLOYING THE MATCHING CODE CHANGES (after 026–035).

CREATE TABLE IF NOT EXISTS catalog_sync_state (
  id         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  state      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO catalog_sync_state (id, state) VALUES (1, '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION apply_enrich_updates(items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated integer;
BEGIN
  UPDATE products p SET
    details             = CASE WHEN x.fields ? 'details'             THEN x.fields->>'details'                              ELSE p.details END,
    image_url           = CASE WHEN x.fields ? 'image_url'           THEN x.fields->>'image_url'                            ELSE p.image_url END,
    billed_by_weight    = CASE WHEN x.fields ? 'billed_by_weight'    THEN (x.fields->>'billed_by_weight')::boolean          ELSE p.billed_by_weight END,
    location            = CASE WHEN x.fields ? 'location'            THEN x.fields->>'location'                             ELSE p.location END,
    location_seq        = CASE WHEN x.fields ? 'location_seq'        THEN (x.fields->>'location_seq')::smallint             ELSE p.location_seq END,
    price               = CASE WHEN x.fields ? 'price'               THEN (x.fields->>'price')::numeric                     ELSE p.price END,
    quantity_step       = CASE WHEN x.fields ? 'quantity_step'       THEN (x.fields->>'quantity_step')::numeric             ELSE p.quantity_step END,
    quantity_label      = CASE WHEN x.fields ? 'quantity_label'      THEN x.fields->>'quantity_label'                       ELSE p.quantity_label END,
    quantity_size_ratio = CASE WHEN x.fields ? 'quantity_size_ratio' THEN (x.fields->>'quantity_size_ratio')::numeric       ELSE p.quantity_size_ratio END,
    freshop_id          = CASE WHEN x.fields ? 'freshop_id'          THEN x.fields->>'freshop_id'                           ELSE p.freshop_id END
  FROM jsonb_to_recordset(items) AS x(id uuid, fields jsonb)
  WHERE p.id = x.id;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;
