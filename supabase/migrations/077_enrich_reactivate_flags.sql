-- 077: apply_enrich_updates must accept is_active / is_available / popularity / image_source
--
-- Nightly catalog-sync already pushes these through apply_enrich_updates when
-- Freshop still sells a previously delisted or OOS row (Wright's bacon-class
-- bugs: is_active=false while is_available=true, or OOS flipped back on contact).
-- The RPC enumerates every column it will write — anything unnamed is silently
-- discarded. Sale fields were added in 060; these three never were, so "revived"
-- updates reported success while the hide flags stayed stuck.
--
-- popularity rides the same path (always-sync rank) and was also dropped.
--
-- Redefine the whole function (same pattern as 060). Boolean cast via
-- (fields->>'x')::boolean — jsonb true/false stringify cleanly.

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
    image_source        = CASE WHEN x.fields ? 'image_source'        THEN x.fields->>'image_source'                          ELSE p.image_source END,
    billed_by_weight    = CASE WHEN x.fields ? 'billed_by_weight'    THEN (x.fields->>'billed_by_weight')::boolean          ELSE p.billed_by_weight END,
    location            = CASE WHEN x.fields ? 'location'            THEN x.fields->>'location'                             ELSE p.location END,
    location_seq        = CASE WHEN x.fields ? 'location_seq'        THEN (x.fields->>'location_seq')::smallint             ELSE p.location_seq END,
    price               = CASE WHEN x.fields ? 'price'               THEN (x.fields->>'price')::numeric                     ELSE p.price END,
    quantity_step       = CASE WHEN x.fields ? 'quantity_step'       THEN (x.fields->>'quantity_step')::numeric             ELSE p.quantity_step END,
    quantity_label      = CASE WHEN x.fields ? 'quantity_label'      THEN x.fields->>'quantity_label'                       ELSE p.quantity_label END,
    quantity_size_ratio = CASE WHEN x.fields ? 'quantity_size_ratio' THEN (x.fields->>'quantity_size_ratio')::numeric       ELSE p.quantity_size_ratio END,
    freshop_id          = CASE WHEN x.fields ? 'freshop_id'          THEN x.fields->>'freshop_id'                           ELSE p.freshop_id END,
    regular_price       = CASE WHEN x.fields ? 'regular_price'       THEN (x.fields->>'regular_price')::numeric             ELSE p.regular_price END,
    sale_start_date     = CASE WHEN x.fields ? 'sale_start_date'     THEN (x.fields->>'sale_start_date')::date              ELSE p.sale_start_date END,
    sale_finish_date    = CASE WHEN x.fields ? 'sale_finish_date'    THEN (x.fields->>'sale_finish_date')::date             ELSE p.sale_finish_date END,
    popularity          = CASE WHEN x.fields ? 'popularity'          THEN (x.fields->>'popularity')::integer                ELSE p.popularity END,
    is_active           = CASE WHEN x.fields ? 'is_active'           THEN (x.fields->>'is_active')::boolean                 ELSE p.is_active END,
    is_available        = CASE WHEN x.fields ? 'is_available'        THEN (x.fields->>'is_available')::boolean              ELSE p.is_available END
  FROM jsonb_to_recordset(items) AS x(id uuid, fields jsonb)
  WHERE p.id = x.id;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;
