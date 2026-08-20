-- Migration 055: nightly store reconcile + one-time barge photo backfill
--
-- TWO POPULATIONS, TWO LIFECYCLES. Keeping these straight is the whole point:
--
--   STORE items (store_only = TRUE) come FROM Sinclair's catalog and are
--   re-synced every night. If Sinclair's stops listing one, it must come off
--   our site — otherwise a crew orders something that cannot be rung up.
--
--   BARGE items (store_only = FALSE) come from Jen's order form. They are
--   curated, they are known-good, and they are NOT synced. We set their photos
--   once and then leave them alone forever. Nothing in this migration touches
--   them except clearing the photo-retry marker below.
--
-- WHY A SEEN TABLE. The sweep already enumerates Sinclair's entire catalog
-- across many invocations, but that runs over ~20k products and spans a whole
-- night, so there is nowhere to hold the id list in memory. Recording ids as
-- they go by costs one small bulk insert per page batch — far cheaper than
-- touching 20k product rows every night — and gives the reconcile an exact
-- answer at the end.

CREATE TABLE IF NOT EXISTS catalog_sync_seen (
  freshop_id text NOT NULL,
  seen_day   date NOT NULL,
  PRIMARY KEY (freshop_id, seen_day)
);

-- Service-role only, same as the rest of the sync plumbing.
ALTER TABLE catalog_sync_seen ENABLE ROW LEVEL SECURITY;

/**
 * Hide store items Sinclair's no longer lists; restore ones that came back.
 *
 * SAFETY CAP. A partial or broken sweep would otherwise look identical to
 * "Sinclair's delisted everything" and could empty the store in one night.
 * Freshop's totals are known to wobble during their own nightly rebuild, so if
 * more than p_max_pct of the catalog would disappear, this changes NOTHING and
 * reports what it would have done. Better a stale catalog than an empty one.
 *
 * Manual edits win: a row whose is_available was set by hand is never
 * overridden, matching the manual_fields rule used everywhere else.
 */
CREATE OR REPLACE FUNCTION reconcile_store_availability(
  p_day      date,
  p_max_pct  numeric DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_total   int;
  v_missing int;
  v_hidden  int := 0;
  v_restored int := 0;
  v_pct     numeric;
BEGIN
  -- ONLY rows that CAN be reconciled. A store row with no freshop_id can never
  -- appear in the roster, so including it would hide it every single night
  -- forever — migration 053 proves these exist (it dedupes on
  -- "freshop_id IS NULL"). They are legacy imports from before 032 added the
  -- column; every row imported since carries one. Leaving them visible is the
  -- safe direction: we never pull a sellable item.
  SELECT count(*) INTO v_total
    FROM products WHERE store_only = TRUE AND freshop_id IS NOT NULL;

  IF v_total = 0 THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no reconcilable store items');
  END IF;

  SELECT count(*) INTO v_missing
    FROM products p
   WHERE p.store_only = TRUE
     AND p.freshop_id IS NOT NULL
     AND p.is_available IS DISTINCT FROM FALSE
     AND NOT EXISTS (
       SELECT 1 FROM catalog_sync_seen s
        WHERE s.seen_day = p_day AND s.freshop_id = p.freshop_id);

  v_pct := (v_missing::numeric / v_total::numeric) * 100;

  -- Purge stale rosters unconditionally — including when the cap aborts below,
  -- or a run of skipped nights would pile up ~20k rows a night indefinitely.
  DELETE FROM catalog_sync_seen WHERE seen_day < p_day;

  IF v_pct > p_max_pct THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'too many missing — treating as an incomplete sweep, not a delisting',
      'would_hide', v_missing, 'total', v_total, 'pct', round(v_pct, 2));
  END IF;

  -- Gone from Sinclair's → off our site. The customer catalog already filters
  -- on is_available, so no new gating code is needed anywhere.
  UPDATE products p
     SET is_available = FALSE
   WHERE p.store_only = TRUE
     AND p.freshop_id IS NOT NULL
     AND p.is_available IS DISTINCT FROM FALSE
     AND NOT (COALESCE(p.manual_fields, '{}') && ARRAY['is_available'])
     AND NOT EXISTS (
       SELECT 1 FROM catalog_sync_seen s
        WHERE s.seen_day = p_day AND s.freshop_id = p.freshop_id);
  GET DIAGNOSTICS v_hidden = ROW_COUNT;

  -- Came back → back on the site.
  UPDATE products p
     SET is_available = TRUE
   WHERE p.store_only = TRUE
     AND p.freshop_id IS NOT NULL
     AND p.is_available = FALSE
     AND NOT (COALESCE(p.manual_fields, '{}') && ARRAY['is_available'])
     AND EXISTS (
       SELECT 1 FROM catalog_sync_seen s
        WHERE s.seen_day = p_day AND s.freshop_id = p.freshop_id);
  GET DIAGNOSTICS v_restored = ROW_COUNT;

  RETURN jsonb_build_object(
    'skipped', false, 'hidden', v_hidden, 'restored', v_restored,
    'total', v_total, 'pct', round(v_pct, 2));
END;
$fn$;

-- ── Barge photos: one-time backfill ──────────────────────────────────────────
-- Flags a proposed photo taken from a DIFFERENT Sinclair's listing in the same
-- department. Sinclair's has no photograph of their own "P2 LIMES" (it carries
-- the generic department icon) while "Robinson Fresh Limes 2 lb" does. Worth
-- proposing — but the reviewer must SEE it was borrowed, because in that same
-- result set "Pompeii Lime 100% Juice" scores only 0.06 lower.
ALTER TABLE products ADD COLUMN IF NOT EXISTS proposed_image_borrowed boolean DEFAULT false;

-- Migration 049's photo_match_tried_at marks an item as already attempted, so
-- everything that failed under the OLD store-wide search would never be retried
-- under the new department-scoped one. That old search is exactly why LIMES came
-- back empty: q="limes" returns 601 hits store-wide and the first twenty are all
-- lemon-lime soda, so the 20-row window never held a lime. Scoped to Produce the
-- same query returns 20 rows with "P2 LIMES" first. Clear the marker so the
-- whole barge backlog runs once through the fixed matcher.
UPDATE products
   SET photo_match_tried_at = NULL
 WHERE store_only = FALSE
   AND image_url IS NULL
   AND proposed_image_url IS NULL;
