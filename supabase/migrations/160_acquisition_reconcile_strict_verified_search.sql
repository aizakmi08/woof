-- Let the acquisition queue close product gaps that are already covered by the
-- same strict verified-search contract the app uses for visible results.

CREATE OR REPLACE FUNCTION public.reconcile_catalog_acquisition_queue_strict_search(
  p_max_rows INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_max_rows, 100), 1), 1000);
  v_product_strict_search_rows INTEGER := 0;
BEGIN
  WITH queue_scope AS (
    SELECT
      q.id,
      q.brand,
      q.product_name,
      q.pet_type,
      concat_ws(' ', q.brand, q.product_name) AS search_query
    FROM public.catalog_acquisition_queue q
    WHERE q.gap_type = 'product'
      AND q.status IN ('open', 'in_progress', 'imported')
      AND q.brand IS NOT NULL
      AND q.product_name IS NOT NULL
    ORDER BY
      public.catalog_acquisition_reconcile_checked_at(q.sample_metadata) ASC,
      q.priority_score DESC,
      q.updated_at DESC
    LIMIT v_limit
  ),
  strict_matches AS (
    SELECT DISTINCT ON (qs.id)
      qs.id,
      matched.cache_key AS matched_cache_key,
      matched.product_name AS matched_product_name,
      matched.brand AS matched_brand,
      matched.pet_type AS matched_pet_type,
      matched.source AS matched_source,
      matched.source_url AS matched_source_url,
      matched.rank AS matched_rank
    FROM queue_scope qs
    JOIN LATERAL public.search_verified_products(qs.search_query, 8) AS matched ON TRUE
    WHERE matched.rank >= 3.0
      AND lower(trim(matched.brand)) = lower(trim(qs.brand))
      AND public.catalog_acquisition_identity_match(
        concat_ws(' ', qs.brand, qs.product_name),
        qs.pet_type,
        concat_ws(
          ' ',
          matched.brand,
          matched.product_name,
          matched.product_line,
          matched.flavor,
          matched.life_stage,
          matched.food_form,
          matched.package_size,
          matched.gtin
        ),
        matched.pet_type
      )
    ORDER BY qs.id, matched.rank DESC
  ),
  resolved_product_strict_search AS (
    UPDATE public.catalog_acquisition_queue q
    SET
      status = 'resolved',
      resolved_at = v_now,
      resolution_reason = 'strict verified catalog search matched queued product identity',
      updated_at = v_now,
      sample_metadata = COALESCE(q.sample_metadata, '{}'::jsonb) || jsonb_build_object(
        'reconciled_at', v_now,
        'reconciled_by', 'reconcile_catalog_acquisition_queue_strict_search',
        'matched_cache_key', sm.matched_cache_key,
        'matched_product_name', sm.matched_product_name,
        'matched_brand', sm.matched_brand,
        'matched_pet_type', sm.matched_pet_type,
        'matched_source', sm.matched_source,
        'matched_source_url', sm.matched_source_url,
        'matched_rank', sm.matched_rank
      )
    FROM strict_matches sm
    WHERE q.id = sm.id
    RETURNING 1
  )
  SELECT count(*) INTO v_product_strict_search_rows
  FROM resolved_product_strict_search;

  RETURN jsonb_build_object(
    'mode', 'strict_verified_search',
    'max_rows', v_limit,
    'resolved_product_strict_search_rows', v_product_strict_search_rows,
    'reconciled_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search(INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search(INTEGER) TO service_role;

DO $$
DECLARE
  function_sql TEXT;
  original_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.reconcile_catalog_acquisition_queue_batch(integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'reconcile_catalog_acquisition_queue_batch(integer) not found';
  END IF;

  original_sql := function_sql;

  -- Product-image verification statuses are separate from ingredient
  -- verification statuses. Keep queue reconciliation aligned with strict
  -- visible search and verified cache reuse.
  function_sql := regexp_replace(
    function_sql,
    'image_verification_status IN \(\s*''gdsn'',\s*''official'',\s*''manufacturer'',\s*''retailer_verified'',\s*''label_ocr_verified''\s*\)',
    'image_verification_status IN (''official'', ''manufacturer'', ''retailer_verified'')',
    'g'
  );

  IF function_sql NOT LIKE '%resolved_product_strict_search_rows%' THEN
    function_sql := replace(
      function_sql,
      'v_product_identity_rows INTEGER := 0;',
      'v_product_identity_rows INTEGER := 0;
  v_product_strict_search_rows INTEGER := 0;'
    );

    function_sql := replace(
      function_sql,
      '  SELECT count(*) INTO v_product_identity_rows
  FROM resolved_product_identity;',
      '  SELECT count(*) INTO v_product_identity_rows
  FROM resolved_product_identity;

  SELECT COALESCE((public.reconcile_catalog_acquisition_queue_strict_search(v_limit)->>''resolved_product_strict_search_rows'')::INTEGER, 0)
    INTO v_product_strict_search_rows;'
    );

    function_sql := replace(
      function_sql,
      '''resolved_product_identity_rows'', v_product_identity_rows,',
      '''resolved_product_identity_rows'', v_product_identity_rows,
    ''resolved_product_strict_search_rows'', v_product_strict_search_rows,'
    );

    function_sql := replace(
      function_sql,
      '''resolved_total_rows'', v_product_rows + v_product_identity_rows + v_brand_rows,',
      '''resolved_total_rows'', v_product_rows + v_product_identity_rows + v_product_strict_search_rows + v_brand_rows,'
    );
  END IF;

  IF function_sql NOT LIKE '%reconcile_catalog_acquisition_queue_strict_search(v_limit)%' THEN
    RAISE EXCEPTION 'strict verified-search reconcile hook missing from batch reconciler';
  END IF;

  IF function_sql LIKE '%image_verification_status IN (''gdsn'', ''official'', ''manufacturer'', ''retailer_verified'', ''label_ocr_verified'')%' THEN
    RAISE EXCEPTION 'stale image verification status set remains in batch reconciler';
  END IF;

  IF function_sql <> original_sql THEN
    EXECUTE function_sql;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_batch(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_batch(INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_batch(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue_batch(INTEGER) TO service_role;
