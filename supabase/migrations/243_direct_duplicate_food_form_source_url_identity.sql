-- Direct duplicate reconciliation keeps source URLs out of formula identity,
-- but food-form detection still needs source URL evidence because official
-- titles can omit words such as dry, wet, pate, or kibble. Use a separate
-- food-form identity with source_url only for the food-form guard.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%catalog_food_form_identity%' THEN
    function_sql := replace(
      function_sql,
      $$      pd.source_url,
      pd.ingredient_count,$$,
      $$      pd.source_url,
      concat_ws(
        ' ',
        pd.brand,
        pd.product_name,
        pd.product_line,
        pd.flavor,
        pd.life_stage,
        pd.food_form,
        pd.package_size,
        pd.gtin,
        pd.source_url
      ) AS catalog_food_form_identity,
      pd.ingredient_count,$$
    );

    function_sql := replace(
      function_sql,
      $$      vc.catalog_identity AS matched_identity,
      vc.ingredient_count AS matched_ingredient_count,$$,
      $$      vc.catalog_identity AS matched_identity,
      vc.catalog_food_form_identity AS matched_food_form_identity,
      vc.ingredient_count AS matched_ingredient_count,$$
    );
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_food_form_terms_match(bc.legacy_product_name, bc.matched_food_form_identity)%' THEN
    function_sql := replace(
      function_sql,
      'catalog_acquisition_food_form_terms_match(bc.legacy_product_name, bc.matched_identity)',
      'catalog_acquisition_food_form_terms_match(bc.legacy_product_name, bc.matched_food_form_identity)'
    );
  END IF;

  IF function_sql NOT LIKE '%catalog_food_form_identity%' THEN
    RAISE EXCEPTION 'direct duplicate closer missing catalog_food_form_identity';
  END IF;

  IF function_sql NOT LIKE '%matched_food_form_identity%' THEN
    RAISE EXCEPTION 'direct duplicate closer missing matched_food_form_identity';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_food_form_terms_match(bc.legacy_product_name, bc.matched_food_form_identity)%' THEN
    RAISE EXCEPTION 'direct duplicate closer must use source-url-backed food-form identity';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) TO service_role;

WITH bad_form_closures AS (
  SELECT
    q.id,
    q.cache_key,
    q.sample_metadata->>'duplicate_closed_by' AS duplicate_closed_by,
    concat_ws(
      ' ',
      matched.brand,
      matched.product_name,
      matched.product_line,
      matched.flavor,
      matched.life_stage,
      matched.food_form,
      matched.package_size,
      matched.gtin,
      matched.source_url
    ) AS matched_food_form_identity
  FROM public.catalog_acquisition_queue q
  JOIN public.product_data matched
    ON matched.cache_key = q.sample_metadata->>'matched_cache_key'
  WHERE q.status = 'resolved'
    AND q.sample_metadata->>'duplicate_closed_by' = 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand'
    AND NOT public.catalog_acquisition_food_form_terms_match(
      q.product_name,
      concat_ws(
        ' ',
        matched.brand,
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
  FROM bad_form_closures bad
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
        'last_reconcile_checked_by', 'direct_duplicate_food_form_source_url_identity',
        'last_reconcile_checked_result', 'reopened_food_form_variant_mismatch',
        'previous_duplicate_closed_by', bad.duplicate_closed_by,
        'reopened_at', now(),
        'reopened_by', '243_direct_duplicate_food_form_source_url_identity',
        'reopen_reason', 'Queued title has dry/wet food-form evidence that conflicts with the matched verified source URL.'
      )
  FROM bad_form_closures bad
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

  IF function_sql NOT LIKE '%source URL omitted from normalized catalog duplicate identity%' THEN
    RAISE EXCEPTION 'formula identity must still omit source URL';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_food_form_terms_match(bc.legacy_product_name, bc.matched_food_form_identity)%' THEN
    RAISE EXCEPTION 'direct duplicate closer must call food-form guard with source-url-backed identity';
  END IF;

  IF public.catalog_acquisition_food_form_terms_match(
    'Wellness Complete Health Puppy Dry Dog Food, Grain Free Kibble, Natural, Chicken and Salmon Recipe',
    'Wellness Complete Health Puppy Chicken & Salmon https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-pate-puppy-chicken-salmon/'
  ) THEN
    RAISE EXCEPTION 'direct duplicate food-form guard must reject dry Wellness title matched to pate source URL';
  END IF;

  SELECT count(*)::INTEGER
  INTO remaining_bad_rows
  FROM public.catalog_acquisition_queue q
  JOIN public.product_data matched
    ON matched.cache_key = q.sample_metadata->>'matched_cache_key'
  WHERE q.status = 'resolved'
    AND q.sample_metadata->>'duplicate_closed_by' = 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand'
    AND NOT public.catalog_acquisition_food_form_terms_match(
      q.product_name,
      concat_ws(
        ' ',
        matched.brand,
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
    RAISE EXCEPTION 'direct duplicate food-form mismatches remain: %', remaining_bad_rows;
  END IF;
END $$;
