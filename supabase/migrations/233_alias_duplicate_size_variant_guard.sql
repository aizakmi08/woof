-- Alias duplicate cleanup must use the same size/breed guard as direct
-- duplicate cleanup. Retail/community titles without size evidence must stay
-- open when the verified match is a size-specific variant.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_size_terms_match%' THEN
    function_sql := replace(
      function_sql,
      $$      AND public.catalog_acquisition_protected_line_terms_match(hc.legacy_product_name, hc.matched_identity)
      AND public.catalog_acquisition_package_count_match(hc.legacy_product_name, hc.matched_identity)$$,
      $$      AND public.catalog_acquisition_protected_line_terms_match(hc.legacy_product_name, hc.matched_identity)
      AND public.catalog_acquisition_size_terms_match(hc.legacy_product_name, hc.matched_identity)
      AND public.catalog_acquisition_package_count_match(hc.legacy_product_name, hc.matched_identity)$$
    );
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_size_terms_match(hc.legacy_product_name, hc.matched_identity)%' THEN
    RAISE EXCEPTION 'alias verified duplicate closer size guard patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) TO service_role;

WITH bad_alias_closures AS (
  SELECT
    q.id,
    q.cache_key,
    q.product_name,
    q.sample_metadata->>'matched_cache_key' AS matched_cache_key,
    concat_ws(
      ' ',
      matched.product_name,
      matched.product_line,
      matched.flavor,
      matched.life_stage,
      matched.food_form,
      matched.package_size,
      matched.gtin,
      matched.source_url
    ) AS matched_identity
  FROM public.catalog_acquisition_queue q
  JOIN public.product_data matched
    ON matched.cache_key = q.sample_metadata->>'matched_cache_key'
  WHERE q.status = 'resolved'
    AND q.sample_metadata->>'duplicate_closed_by' = 'exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand'
    AND NOT public.catalog_acquisition_size_terms_match(
      q.product_name,
      concat_ws(
        ' ',
        matched.product_name,
        matched.product_line,
        matched.flavor,
        matched.life_stage,
        matched.food_form,
        matched.package_size,
        matched.gtin,
        matched.source_url
      )
    )
),
reopened_products AS (
  UPDATE public.product_data pd
  SET
    catalog_exclusion_reason = NULL,
    updated_at = now()
  FROM bad_alias_closures bad
  WHERE pd.cache_key = bad.cache_key
    AND pd.catalog_exclusion_reason = 'duplicate_verified_official_catalog_row'
  RETURNING pd.cache_key
),
reopened_queue AS (
  UPDATE public.catalog_acquisition_queue q
  SET
    status = 'open',
    resolved_at = NULL,
    resolution_reason = NULL,
    updated_at = now(),
    sample_metadata = COALESCE(q.sample_metadata, '{}'::jsonb)
      - 'matched_cache_key'
      - 'matched_product_name'
      - 'matched_brand'
      - 'matched_pet_type'
      - 'matched_source'
      - 'matched_source_quality'
      - 'matched_source_url'
      - 'matched_rank'
      || jsonb_build_object(
        'last_reconcile_checked_at', now(),
        'last_reconcile_checked_by', 'alias_duplicate_size_variant_guard',
        'last_reconcile_checked_result', 'reopened_size_variant_mismatch',
        'reopened_at', now(),
        'reopened_by', '233_alias_duplicate_size_variant_guard',
        'reopen_reason', 'Queued title lacks size/breed terms required by the matched verified catalog identity.'
      )
  FROM bad_alias_closures bad
  WHERE q.id = bad.id
  RETURNING q.id
)
SELECT
  (SELECT count(*) FROM reopened_products) AS reopened_product_rows,
  (SELECT count(*) FROM reopened_queue) AS reopened_queue_rows;

DO $$
DECLARE
  function_sql TEXT;
  remaining_bad_rows INTEGER;
BEGIN
  SELECT pg_get_functiondef('public.exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql NOT LIKE '%catalog_acquisition_size_terms_match(hc.legacy_product_name, hc.matched_identity)%' THEN
    RAISE EXCEPTION 'alias verified duplicate closer must call size guard';
  END IF;

  SELECT count(*)::INTEGER
  INTO remaining_bad_rows
  FROM public.catalog_acquisition_queue q
  JOIN public.product_data matched
    ON matched.cache_key = q.sample_metadata->>'matched_cache_key'
  WHERE q.status = 'resolved'
    AND q.sample_metadata->>'duplicate_closed_by' = 'exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand'
    AND NOT public.catalog_acquisition_size_terms_match(
      q.product_name,
      concat_ws(
        ' ',
        matched.product_name,
        matched.product_line,
        matched.flavor,
        matched.life_stage,
        matched.food_form,
        matched.package_size,
        matched.gtin,
        matched.source_url
      )
    );

  IF remaining_bad_rows <> 0 THEN
    RAISE EXCEPTION 'alias verified duplicate size mismatches remain: %', remaining_bad_rows;
  END IF;
END $$;
