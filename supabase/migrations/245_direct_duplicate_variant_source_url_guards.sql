-- Direct duplicate reconciliation must keep source URLs out of formula
-- identity, but every variant guard needs source URL evidence. Official
-- product names can omit terms such as puppy, high-protein, or wet while the
-- canonical URL exposes the variant.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%matched_food_form_identity%' THEN
    RAISE EXCEPTION 'direct duplicate closer must have source-url-backed matched_food_form_identity before variant guard patch';
  END IF;

  function_sql := replace(
    function_sql,
    'catalog_acquisition_life_stage_terms_match(bc.legacy_product_name, bc.matched_identity)',
    'catalog_acquisition_life_stage_terms_match(bc.legacy_product_name, bc.matched_food_form_identity)'
  );

  function_sql := replace(
    function_sql,
    'catalog_acquisition_protected_line_terms_match(bc.legacy_product_name, bc.matched_identity)',
    'catalog_acquisition_protected_line_terms_match(bc.legacy_product_name, bc.matched_food_form_identity)'
  );

  function_sql := replace(
    function_sql,
    'catalog_acquisition_size_terms_match(bc.legacy_product_name, bc.matched_identity)',
    'catalog_acquisition_size_terms_match(bc.legacy_product_name, bc.matched_food_form_identity)'
  );

  function_sql := replace(
    function_sql,
    'catalog_acquisition_package_count_match(bc.legacy_product_name, bc.matched_identity)',
    'catalog_acquisition_package_count_match(bc.legacy_product_name, bc.matched_food_form_identity)'
  );

  IF function_sql NOT LIKE '%catalog_acquisition_life_stage_terms_match(bc.legacy_product_name, bc.matched_food_form_identity)%' THEN
    RAISE EXCEPTION 'direct duplicate closer must use source-url-backed identity for life-stage guard';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_protected_line_terms_match(bc.legacy_product_name, bc.matched_food_form_identity)%' THEN
    RAISE EXCEPTION 'direct duplicate closer must use source-url-backed identity for protected-line guard';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_size_terms_match(bc.legacy_product_name, bc.matched_food_form_identity)%' THEN
    RAISE EXCEPTION 'direct duplicate closer must use source-url-backed identity for size guard';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_package_count_match(bc.legacy_product_name, bc.matched_food_form_identity)%' THEN
    RAISE EXCEPTION 'direct duplicate closer must use source-url-backed identity for package-count guard';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) TO service_role;

WITH bad_variant_closures AS (
  SELECT
    q.id,
    q.cache_key,
    q.sample_metadata->>'duplicate_closed_by' AS duplicate_closed_by,
    q.sample_metadata->>'matched_cache_key' AS matched_cache_key,
    q.sample_metadata->>'matched_product_name' AS matched_product_name,
    q.sample_metadata->>'matched_source_url' AS matched_source_url,
    public.catalog_acquisition_life_stage_terms_match(
      q.product_name,
      concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
    ) AS life_stage_ok,
    public.catalog_acquisition_protected_line_terms_match(
      q.product_name,
      concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
    ) AS line_ok,
    public.catalog_acquisition_food_form_terms_match(
      q.product_name,
      concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
    ) AS food_form_ok,
    public.catalog_acquisition_size_terms_match(
      q.product_name,
      concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
    ) AS size_ok,
    public.catalog_acquisition_package_count_match(
      q.product_name,
      concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
    ) AS package_count_ok
  FROM public.catalog_acquisition_queue q
  JOIN public.product_data matched
    ON matched.cache_key = q.sample_metadata->>'matched_cache_key'
  WHERE q.status = 'resolved'
    AND q.sample_metadata->>'duplicate_closed_by' = 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand'
),
closures_to_reopen AS (
  SELECT *
  FROM bad_variant_closures
  WHERE life_stage_ok IS NOT TRUE
    OR line_ok IS NOT TRUE
    OR food_form_ok IS NOT TRUE
    OR size_ok IS NOT TRUE
    OR package_count_ok IS NOT TRUE
),
reopened_products AS (
  UPDATE public.product_data pd
  SET
    catalog_exclusion_reason = NULL,
    updated_at = now()
  FROM closures_to_reopen bad
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
      - 'direct_identity_score'
      - 'duplicate_closed_at'
      - 'duplicate_closed_by'
      || jsonb_build_object(
        'last_reconcile_checked_at', now(),
        'last_reconcile_checked_by', 'direct_duplicate_variant_source_url_guards',
        'last_reconcile_checked_result', 'reopened_variant_source_url_mismatch',
        'previous_duplicate_closed_by', bad.duplicate_closed_by,
        'previous_matched_cache_key', bad.matched_cache_key,
        'previous_matched_product_name', bad.matched_product_name,
        'previous_matched_source_url', bad.matched_source_url,
        'previous_life_stage_ok', bad.life_stage_ok,
        'previous_line_ok', bad.line_ok,
        'previous_food_form_ok', bad.food_form_ok,
        'previous_size_ok', bad.size_ok,
        'previous_package_count_ok', bad.package_count_ok,
        'reopened_at', now(),
        'reopened_by', '245_direct_duplicate_variant_source_url_guards',
        'reopen_reason', 'Direct duplicate closure failed source-url-backed variant guards.'
      )
  FROM closures_to_reopen bad
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
  SELECT pg_get_functiondef('public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql NOT LIKE '%catalog_acquisition_life_stage_terms_match(bc.legacy_product_name, bc.matched_food_form_identity)%' THEN
    RAISE EXCEPTION 'direct duplicate closer must call source-url-backed life-stage guard';
  END IF;

  IF public.catalog_acquisition_life_stage_terms_match(
    'Nulo MedalSeries Baked & Coated Large Breed Whitefish, Chicken and Turkey',
    'MedalSeries Baked & Coated Large Breed Whitefish, Chicken & Turkey https://nulo.com/products/medalseries-large-breed-puppy-baked-and-coated-whitefish-chicken-turkey-recipe-for-dogs'
  ) THEN
    RAISE EXCEPTION 'direct duplicate variant guard must reject non-puppy title matched to puppy source URL';
  END IF;

  SELECT count(*)::INTEGER
  INTO remaining_bad_rows
  FROM public.catalog_acquisition_queue q
  JOIN public.product_data matched
    ON matched.cache_key = q.sample_metadata->>'matched_cache_key'
  WHERE q.status = 'resolved'
    AND q.sample_metadata->>'duplicate_closed_by' = 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand'
    AND (
      NOT public.catalog_acquisition_life_stage_terms_match(
        q.product_name,
        concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
      )
      OR NOT public.catalog_acquisition_protected_line_terms_match(
        q.product_name,
        concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
      )
      OR NOT public.catalog_acquisition_food_form_terms_match(
        q.product_name,
        concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
      )
      OR NOT public.catalog_acquisition_size_terms_match(
        q.product_name,
        concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
      )
      OR NOT public.catalog_acquisition_package_count_match(
        q.product_name,
        concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
      )
    );

  IF remaining_bad_rows <> 0 THEN
    RAISE EXCEPTION 'direct duplicate source-url-backed variant guard mismatches remain: %', remaining_bad_rows;
  END IF;
END $$;
