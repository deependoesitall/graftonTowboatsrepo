-- One-transaction barge list replace. The API recomputes the plan, then
-- this function inserts, updates, and deactivates together. A count mismatch
-- raises and rolls the whole call back. Store-only rows are never touched.
CREATE OR REPLACE FUNCTION replace_barge_catalog(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer := 0;
  updated_count integer := 0;
  deactivated_count integer := 0;
  expected_inserted integer;
  expected_updated integer;
  expected_removed integer;
BEGIN
  expected_inserted := COALESCE(jsonb_array_length(payload->'added'), 0);
  expected_updated := COALESCE(jsonb_array_length(payload->'updated'), 0);
  expected_removed := COALESCE(jsonb_array_length(payload->'removed_ids'), 0);

  INSERT INTO products (
    category, sub_category, upc, description, pkg_size, uom, price,
    is_active, is_available, store_only, form_seq, form_section, billed_by_weight
  )
  SELECT
    COALESCE(NULLIF(x.category, ''), 'General'),
    COALESCE(NULLIF(x.sub_category, ''), NULLIF(x.category, ''), 'General'),
    NULLIF(x.upc, ''),
    x.description,
    NULLIF(x.pkg_size, ''),
    NULLIF(x.uom, ''),
    x.price,
    true,
    true,
    false,
    x.form_seq,
    NULLIF(x.sub_category, ''),
    COALESCE(x.billed_by_weight, false)
  FROM jsonb_to_recordset(COALESCE(payload->'added', '[]'::jsonb)) AS x(
    category text,
    sub_category text,
    upc text,
    description text,
    pkg_size text,
    uom text,
    price numeric,
    form_seq integer,
    billed_by_weight boolean
  )
  WHERE x.description IS NOT NULL AND x.price > 0;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count <> expected_inserted THEN
    RAISE EXCEPTION 'barge insert count % did not match %', inserted_count, expected_inserted;
  END IF;

  UPDATE products p SET
    category = COALESCE(NULLIF(x.category, ''), 'General'),
    sub_category = COALESCE(NULLIF(x.sub_category, ''), NULLIF(x.category, ''), 'General'),
    upc = NULLIF(x.upc, ''),
    description = x.description,
    pkg_size = NULLIF(x.pkg_size, ''),
    uom = NULLIF(x.uom, ''),
    price = x.price,
    is_active = true,
    form_seq = x.form_seq,
    form_section = NULLIF(x.sub_category, '')
  FROM jsonb_to_recordset(COALESCE(payload->'updated', '[]'::jsonb)) AS x(
    id uuid,
    category text,
    sub_category text,
    upc text,
    description text,
    pkg_size text,
    uom text,
    price numeric,
    form_seq integer
  )
  WHERE p.id = x.id
    AND p.store_only = false
    AND x.price > 0;
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count <> expected_updated THEN
    RAISE EXCEPTION 'barge update count % did not match %', updated_count, expected_updated;
  END IF;

  UPDATE products p SET
    is_active = false,
    form_seq = NULL
  WHERE p.store_only = false
    AND p.is_active = true
    AND p.id IN (
      SELECT value::uuid
      FROM jsonb_array_elements_text(COALESCE(payload->'removed_ids', '[]'::jsonb))
    );
  GET DIAGNOSTICS deactivated_count = ROW_COUNT;

  IF deactivated_count <> expected_removed THEN
    RAISE EXCEPTION 'barge deactivate count % did not match %', deactivated_count, expected_removed;
  END IF;

  INSERT INTO activity_logs (
    order_id, order_number, action, from_value, to_value,
    admin_username, admin_display_name, admin_role, note
  ) VALUES (
    NULL,
    NULL,
    'catalog_import',
    'Sinclair barge order form',
    inserted_count || ' added / ' || updated_count || ' updated / ' || deactivated_count || ' removed',
    payload->'log'->>'admin_username',
    payload->'log'->>'admin_display_name',
    payload->'log'->>'admin_role',
    'replace_barge'
  );

  RETURN jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'deactivated', deactivated_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_barge_catalog(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_barge_catalog(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.replace_barge_catalog(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_barge_catalog(jsonb) TO service_role;
