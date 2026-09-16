-- 088: the nightly sync must not die on uniq_store_match_key
--
-- THE BUG
-- -------
-- Nightly catalog-sync failed with:
--   apply_enrich_updates: duplicate key value violates unique
--   constraint "uniq_store_match_key"
--
-- That index (054) says: at most one store_only row per
-- (product_match_key(description, pkg_size), price). 054 enforced it by
-- MERGING the duplicates that existed that day and then blocking new ones.
--
-- What 054 did not anticipate is that duplicates do not only arrive by INSERT.
-- Two store_only rows can sit in the table quite legally with different prices
-- — the same cut of meat listed twice by Freshop under two ids — and then one
-- of them goes on sale and lands on the other's price. Now it is an UPDATE that
-- violates the index, and the update in question is the nightly price refresh.
--
-- apply_enrich_updates is ONE bulk UPDATE over the whole batch, so a single
-- colliding row aborted every other row with it, and the route returned 500.
-- One near-duplicate meat row stopped the entire catalog from syncing.
--
-- The insert side of the sync already handles exactly this: it catches 23505
-- and retries row by row so the good rows still land. The update side never
-- learned the same trick. This migration teaches it.
--
-- WHAT THIS DOES
-- --------------
--  1. Clears the duplicates sitting in the table right now (054's merge, re-run
--     — it is idempotent, and it now refuses to delete a row anything else
--     still points at).
--  2. Rewrites apply_enrich_updates so a collision costs one row, not the run:
--     fast bulk path first, and on unique_violation a per-row fallback that
--     resolves the collision where it safely can and skips it where it cannot.
--
-- ⚠️ SKIPPING IS NOT SILENT. Every skipped row raises a WARNING with its id, so
-- a row that keeps failing shows up in the Postgres log instead of quietly
-- never updating again.

-- ── 1. Clear what is already there ───────────────────────────────────────────
-- Keep the best row of each (match_key, price) set — one with a photo wins,
-- then the oldest, so hand-corrected images and locations survive.
--
-- ⚠️ order_items.product_id is ON DELETE SET NULL, but
-- order_items.preferred_sub_product_id (079) is a plain reference with no
-- action, so deleting a row a customer picked as their preferred substitute
-- would throw. Those rows are kept — a duplicate is cosmetic, losing a
-- customer's stated preference is not.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY public.product_match_key(description, pkg_size), price
           ORDER BY (image_url IS NULL), created_at
         ) AS rn
  FROM products
  WHERE store_only = TRUE
)
DELETE FROM products p
USING ranked r
WHERE p.id = r.id
  AND r.rn > 1
  AND NOT EXISTS (
    SELECT 1 FROM order_items oi WHERE oi.preferred_sub_product_id = p.id
  );

-- ── 2. A collision costs one row, not the sweep ──────────────────────────────
CREATE OR REPLACE FUNCTION apply_enrich_updates(items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated integer := 0;
  one     integer;
  skipped integer := 0;
  rec      record;
  keep_key text;
BEGIN
  -- Fast path: the whole batch in one statement, as before. This is what runs
  -- on every ordinary night.
  BEGIN
    UPDATE products p SET
      details             = CASE WHEN x.fields ? 'details'             THEN x.fields->>'details'                        ELSE p.details END,
      image_url           = CASE WHEN x.fields ? 'image_url'           THEN x.fields->>'image_url'                      ELSE p.image_url END,
      image_source        = CASE WHEN x.fields ? 'image_source'        THEN x.fields->>'image_source'                   ELSE p.image_source END,
      billed_by_weight    = CASE WHEN x.fields ? 'billed_by_weight'    THEN (x.fields->>'billed_by_weight')::boolean    ELSE p.billed_by_weight END,
      location            = CASE WHEN x.fields ? 'location'            THEN x.fields->>'location'                       ELSE p.location END,
      location_seq        = CASE WHEN x.fields ? 'location_seq'        THEN (x.fields->>'location_seq')::smallint       ELSE p.location_seq END,
      price               = CASE WHEN x.fields ? 'price'               THEN (x.fields->>'price')::numeric               ELSE p.price END,
      quantity_step       = CASE WHEN x.fields ? 'quantity_step'       THEN (x.fields->>'quantity_step')::numeric       ELSE p.quantity_step END,
      quantity_label      = CASE WHEN x.fields ? 'quantity_label'      THEN x.fields->>'quantity_label'                 ELSE p.quantity_label END,
      quantity_size_ratio = CASE WHEN x.fields ? 'quantity_size_ratio' THEN (x.fields->>'quantity_size_ratio')::numeric ELSE p.quantity_size_ratio END,
      freshop_id          = CASE WHEN x.fields ? 'freshop_id'          THEN x.fields->>'freshop_id'                     ELSE p.freshop_id END,
      regular_price       = CASE WHEN x.fields ? 'regular_price'       THEN (x.fields->>'regular_price')::numeric       ELSE p.regular_price END,
      sale_start_date     = CASE WHEN x.fields ? 'sale_start_date'     THEN (x.fields->>'sale_start_date')::date        ELSE p.sale_start_date END,
      sale_finish_date    = CASE WHEN x.fields ? 'sale_finish_date'    THEN (x.fields->>'sale_finish_date')::date       ELSE p.sale_finish_date END,
      popularity          = CASE WHEN x.fields ? 'popularity'          THEN (x.fields->>'popularity')::integer          ELSE p.popularity END,
      is_active           = CASE WHEN x.fields ? 'is_active'           THEN (x.fields->>'is_active')::boolean           ELSE p.is_active END,
      is_available        = CASE WHEN x.fields ? 'is_available'        THEN (x.fields->>'is_available')::boolean        ELSE p.is_available END
    FROM jsonb_to_recordset(items) AS x(id uuid, fields jsonb)
    WHERE p.id = x.id;
    GET DIAGNOSTICS updated = ROW_COUNT;
    RETURN updated;
  EXCEPTION WHEN unique_violation THEN
    -- Fall through. The bulk statement rolled back whole; nothing was written.
    NULL;
  END;

  -- Slow path, taken only after a collision. One row at a time so the batch's
  -- other few hundred rows still land.
  FOR rec IN SELECT * FROM jsonb_to_recordset(items) AS x(id uuid, fields jsonb)
  LOOP
    BEGIN
      -- If this row's new price would land it on top of a store_only twin,
      -- retire the twin first. It is the same product at the same price under a
      -- second Freshop id, which is precisely what 054 merges — except a twin
      -- someone picked as a preferred substitute, which is left alone (the
      -- update below is then skipped rather than forced).
      keep_key := NULL;
      IF rec.fields ? 'price' THEN
        SELECT public.product_match_key(k.description, k.pkg_size)
          INTO keep_key
          FROM products k
         WHERE k.id = rec.id AND k.store_only = TRUE;
      END IF;

      IF keep_key IS NOT NULL THEN
        DELETE FROM products dup
        WHERE dup.store_only = TRUE
          AND dup.id <> rec.id
          AND dup.price = (rec.fields->>'price')::numeric
          AND public.product_match_key(dup.description, dup.pkg_size) = keep_key
          -- Never retire the row that carries the photo: if the twin has one
          -- and this row does not, the twin is the better row and THIS update
          -- is the one that gets skipped below.
          AND dup.image_url IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM order_items oi WHERE oi.preferred_sub_product_id = dup.id
          );
      END IF;

      UPDATE products p SET
        details             = CASE WHEN rec.fields ? 'details'             THEN rec.fields->>'details'                        ELSE p.details END,
        image_url           = CASE WHEN rec.fields ? 'image_url'           THEN rec.fields->>'image_url'                      ELSE p.image_url END,
        image_source        = CASE WHEN rec.fields ? 'image_source'        THEN rec.fields->>'image_source'                   ELSE p.image_source END,
        billed_by_weight    = CASE WHEN rec.fields ? 'billed_by_weight'    THEN (rec.fields->>'billed_by_weight')::boolean    ELSE p.billed_by_weight END,
        location            = CASE WHEN rec.fields ? 'location'            THEN rec.fields->>'location'                       ELSE p.location END,
        location_seq        = CASE WHEN rec.fields ? 'location_seq'        THEN (rec.fields->>'location_seq')::smallint       ELSE p.location_seq END,
        price               = CASE WHEN rec.fields ? 'price'               THEN (rec.fields->>'price')::numeric               ELSE p.price END,
        quantity_step       = CASE WHEN rec.fields ? 'quantity_step'       THEN (rec.fields->>'quantity_step')::numeric       ELSE p.quantity_step END,
        quantity_label      = CASE WHEN rec.fields ? 'quantity_label'      THEN rec.fields->>'quantity_label'                 ELSE p.quantity_label END,
        quantity_size_ratio = CASE WHEN rec.fields ? 'quantity_size_ratio' THEN (rec.fields->>'quantity_size_ratio')::numeric ELSE p.quantity_size_ratio END,
        freshop_id          = CASE WHEN rec.fields ? 'freshop_id'          THEN rec.fields->>'freshop_id'                     ELSE p.freshop_id END,
        regular_price       = CASE WHEN rec.fields ? 'regular_price'       THEN (rec.fields->>'regular_price')::numeric       ELSE p.regular_price END,
        sale_start_date     = CASE WHEN rec.fields ? 'sale_start_date'     THEN (rec.fields->>'sale_start_date')::date        ELSE p.sale_start_date END,
        sale_finish_date    = CASE WHEN rec.fields ? 'sale_finish_date'    THEN (rec.fields->>'sale_finish_date')::date       ELSE p.sale_finish_date END,
        popularity          = CASE WHEN rec.fields ? 'popularity'          THEN (rec.fields->>'popularity')::integer          ELSE p.popularity END,
        is_active           = CASE WHEN rec.fields ? 'is_active'           THEN (rec.fields->>'is_active')::boolean           ELSE p.is_active END,
        is_available        = CASE WHEN rec.fields ? 'is_available'        THEN (rec.fields->>'is_available')::boolean        ELSE p.is_available END
      WHERE p.id = rec.id;
      GET DIAGNOSTICS one = ROW_COUNT;
      updated := updated + one;
    EXCEPTION WHEN unique_violation THEN
      skipped := skipped + 1;
      RAISE WARNING 'apply_enrich_updates: skipped product % (uniq_store_match_key)', rec.id;
    END;
  END LOOP;

  IF skipped > 0 THEN
    RAISE WARNING 'apply_enrich_updates: % of % rows skipped as near-duplicates',
      skipped, jsonb_array_length(items);
  END IF;

  RETURN updated;
END;
$$;

COMMENT ON FUNCTION apply_enrich_updates(jsonb) IS
  'Nightly catalog-sync field writer. Bulk UPDATE with a per-row fallback so one '
  'uniq_store_match_key collision cannot abort the sweep (088).';
