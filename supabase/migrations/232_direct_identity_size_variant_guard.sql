-- Direct verified-identity duplicate cleanup must not collapse broad legacy
-- titles into size/breed variants. Example: a generic Hill's Sensitive Stomach
-- row must not close against a Small & Mini official product unless the queued
-- title also carries that size signal.

CREATE OR REPLACE FUNCTION public.catalog_acquisition_size_terms_match(
  p_query_identity TEXT,
  p_candidate_identity TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
WITH normalized AS (
  SELECT
    regexp_replace(lower(COALESCE(p_query_identity, '')), '[^a-z0-9&+]+', ' ', 'g') AS q_norm,
    regexp_replace(lower(COALESCE(p_candidate_identity, '')), '[^a-z0-9&+]+', ' ', 'g') AS c_norm
),
flags AS (
  SELECT
    q_norm ~ '(^| )(small breed|small adult|small dog|small dogs|small puppy|small puppies|small & mini|small mini|mini|miniature)( |$)' AS q_small_size,
    c_norm ~ '(^| )(small breed|small adult|small dog|small dogs|small puppy|small puppies|small & mini|small mini|mini|miniature)( |$)' AS c_small_size,
    q_norm ~ '(^| )(large breed|large adult|large dog|large dogs|large puppy|large puppies|giant breed|giant dog|giant dogs)( |$)' AS q_large_size,
    c_norm ~ '(^| )(large breed|large adult|large dog|large dogs|large puppy|large puppies|giant breed|giant dog|giant dogs)( |$)' AS c_large_size,
    q_norm ~ '(^| )(toy breed|toy dog|toy dogs)( |$)' AS q_toy_size,
    c_norm ~ '(^| )(toy breed|toy dog|toy dogs)( |$)' AS c_toy_size,
    q_norm ~ '(^| )(medium breed|medium adult|medium dog|medium dogs)( |$)' AS q_medium_size,
    c_norm ~ '(^| )(medium breed|medium adult|medium dog|medium dogs)( |$)' AS c_medium_size
  FROM normalized
)
SELECT
  q_small_size = c_small_size
  AND q_large_size = c_large_size
  AND q_toy_size = c_toy_size
  AND q_medium_size = c_medium_size
FROM flags;
$$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_size_terms_match(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_size_terms_match(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_size_terms_match(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_size_terms_match(TEXT, TEXT) TO service_role;

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_size_terms_match%' THEN
    function_sql := replace(
      function_sql,
      $$      AND public.catalog_acquisition_protected_line_terms_match(bc.legacy_product_name, bc.matched_identity)
      AND public.catalog_acquisition_package_count_match(bc.legacy_product_name, bc.matched_identity)$$,
      $$      AND public.catalog_acquisition_protected_line_terms_match(bc.legacy_product_name, bc.matched_identity)
      AND public.catalog_acquisition_size_terms_match(bc.legacy_product_name, bc.matched_identity)
      AND public.catalog_acquisition_package_count_match(bc.legacy_product_name, bc.matched_identity)$$
    );
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_size_terms_match(bc.legacy_product_name, bc.matched_identity)%' THEN
    RAISE EXCEPTION 'direct verified identity duplicate closer size guard patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) TO service_role;

WITH bad_direct_closures AS (
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
    AND q.sample_metadata->>'duplicate_closed_by' = 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand'
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
  FROM bad_direct_closures bad
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
      - 'direct_identity_score'
      || jsonb_build_object(
        'last_reconcile_checked_at', now(),
        'last_reconcile_checked_by', 'direct_identity_size_variant_guard',
        'last_reconcile_checked_result', 'reopened_size_variant_mismatch',
        'reopened_at', now(),
        'reopened_by', '232_direct_identity_size_variant_guard',
        'reopen_reason', 'Queued title lacks size/breed terms required by the matched verified catalog identity.'
      )
  FROM bad_direct_closures bad
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
  IF public.catalog_acquisition_size_terms_match(
    'Hill''s Science Diet Adult Sensitive Stomach & Skin Dry Dog Food, Chicken',
    'Adult Sensitive Stomach & Skin Small & Mini Chicken Recipe Dog Food'
  ) THEN
    RAISE EXCEPTION 'size guard must reject generic title matched to Small & Mini variant';
  END IF;

  IF NOT public.catalog_acquisition_size_terms_match(
    'Hill''s Science Diet Adult Sensitive Stomach & Skin Small & Mini Dry Dog Food, Chicken',
    'Adult Sensitive Stomach & Skin Small & Mini Chicken Recipe Dog Food'
  ) THEN
    RAISE EXCEPTION 'size guard should accept matching Small & Mini variant';
  END IF;

  IF public.catalog_acquisition_size_terms_match(
    'Blue Buffalo Life Protection Small Bites Chicken Brown Rice Adult Dog Food',
    'Blue Buffalo Life Protection Small Breed Adult Chicken Brown Rice Dog Food'
  ) THEN
    RAISE EXCEPTION 'size guard must not treat Small Bites as Small Breed';
  END IF;

  SELECT pg_get_functiondef('public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql NOT LIKE '%catalog_acquisition_size_terms_match(bc.legacy_product_name, bc.matched_identity)%' THEN
    RAISE EXCEPTION 'direct verified identity duplicate closer must call size guard';
  END IF;

  SELECT count(*)::INTEGER
  INTO remaining_bad_rows
  FROM public.catalog_acquisition_queue q
  JOIN public.product_data matched
    ON matched.cache_key = q.sample_metadata->>'matched_cache_key'
  WHERE q.status = 'resolved'
    AND q.sample_metadata->>'duplicate_closed_by' = 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand'
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
    RAISE EXCEPTION 'direct verified identity size mismatches remain: %', remaining_bad_rows;
  END IF;
END $$;
