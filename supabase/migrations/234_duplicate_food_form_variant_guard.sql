-- Duplicate cleanup must not collapse dry/wet/fresh/freeze-dried form variants.
-- Retail titles can be noisy, but a verified row is only a duplicate when the
-- product form evidence matches too.

CREATE OR REPLACE FUNCTION public.catalog_acquisition_food_form_terms_match(
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
    regexp_replace(lower(COALESCE(p_query_identity, '')), '[^a-z0-9]+', ' ', 'g') AS q_norm,
    regexp_replace(lower(COALESCE(p_candidate_identity, '')), '[^a-z0-9]+', ' ', 'g') AS c_norm
),
flags AS (
  SELECT
    q_norm ~ '(^| )(dry|kibble|crunchy)( |$)' AS q_dry,
    c_norm ~ '(^| )(dry|kibble|crunchy)( |$)' AS c_dry,
    q_norm ~ '(^| )(wet|can|cans|canned|pouch|pouches|tray|trays|tub|cups|cup|pate|pat|gravy|sauce|stew|morsels|chunks|shreds|filets|loaf|minced|flaked|entree|entr e|broth)( |$)' AS q_wet,
    c_norm ~ '(^| )(wet|can|cans|canned|pouch|pouches|tray|trays|tub|cups|cup|pate|pat|gravy|sauce|stew|morsels|chunks|shreds|filets|loaf|minced|flaked|entree|entr e|broth)( |$)' AS c_wet,
    q_norm ~ '(^| )(fresh food|fresh dog food|fresh cat food|fresh frozen|fresh refrigerated|frozen|refrigerated)( |$)' AS q_fresh,
    c_norm ~ '(^| )(fresh food|fresh dog food|fresh cat food|fresh frozen|fresh refrigerated|frozen|refrigerated)( |$)' AS c_fresh,
    q_norm ~ '(^| )(freeze dried|freezedried|freeze dry)( |$)' AS q_freeze_dried,
    c_norm ~ '(^| )(freeze dried|freezedried|freeze dry)( |$)' AS c_freeze_dried,
    q_norm ~ '(^| )(dehydrated)( |$)' AS q_dehydrated,
    c_norm ~ '(^| )(dehydrated)( |$)' AS c_dehydrated,
    q_norm ~ '(^| )(air dried|airdried)( |$)' AS q_air_dried,
    c_norm ~ '(^| )(air dried|airdried)( |$)' AS c_air_dried,
    q_norm ~ '(^| )(raw)( |$)' AS q_raw,
    c_norm ~ '(^| )(raw)( |$)' AS c_raw
  FROM normalized
)
SELECT
  q_dry = c_dry
  AND q_wet = c_wet
  AND q_fresh = c_fresh
  AND q_freeze_dried = c_freeze_dried
  AND q_dehydrated = c_dehydrated
  AND q_air_dried = c_air_dried
  AND q_raw = c_raw
FROM flags;
$$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_food_form_terms_match(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_food_form_terms_match(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_food_form_terms_match(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_food_form_terms_match(TEXT, TEXT) TO service_role;

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_food_form_terms_match%' THEN
    function_sql := replace(
      function_sql,
      $$      AND public.catalog_acquisition_protected_line_terms_match(bc.legacy_product_name, bc.matched_identity)
      AND public.catalog_acquisition_size_terms_match(bc.legacy_product_name, bc.matched_identity)$$,
      $$      AND public.catalog_acquisition_protected_line_terms_match(bc.legacy_product_name, bc.matched_identity)
      AND public.catalog_acquisition_food_form_terms_match(bc.legacy_product_name, bc.matched_identity)
      AND public.catalog_acquisition_size_terms_match(bc.legacy_product_name, bc.matched_identity)$$
    );

    function_sql := replace(
      function_sql,
      $$      AND public.catalog_acquisition_protected_line_terms_match(bc.legacy_product_name, bc.matched_identity)
      AND public.catalog_acquisition_package_count_match(bc.legacy_product_name, bc.matched_identity)$$,
      $$      AND public.catalog_acquisition_protected_line_terms_match(bc.legacy_product_name, bc.matched_identity)
      AND public.catalog_acquisition_food_form_terms_match(bc.legacy_product_name, bc.matched_identity)
      AND public.catalog_acquisition_package_count_match(bc.legacy_product_name, bc.matched_identity)$$
    );
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_food_form_terms_match(bc.legacy_product_name, bc.matched_identity)%' THEN
    RAISE EXCEPTION 'direct verified duplicate closer food-form guard patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) TO service_role;

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_food_form_terms_match%' THEN
    function_sql := replace(
      function_sql,
      $$      AND public.catalog_acquisition_protected_line_terms_match(hc.legacy_product_name, hc.matched_identity)
      AND public.catalog_acquisition_size_terms_match(hc.legacy_product_name, hc.matched_identity)$$,
      $$      AND public.catalog_acquisition_protected_line_terms_match(hc.legacy_product_name, hc.matched_identity)
      AND public.catalog_acquisition_food_form_terms_match(hc.legacy_product_name, hc.matched_identity)
      AND public.catalog_acquisition_size_terms_match(hc.legacy_product_name, hc.matched_identity)$$
    );

    function_sql := replace(
      function_sql,
      $$      AND public.catalog_acquisition_protected_line_terms_match(hc.legacy_product_name, hc.matched_identity)
      AND public.catalog_acquisition_package_count_match(hc.legacy_product_name, hc.matched_identity)$$,
      $$      AND public.catalog_acquisition_protected_line_terms_match(hc.legacy_product_name, hc.matched_identity)
      AND public.catalog_acquisition_food_form_terms_match(hc.legacy_product_name, hc.matched_identity)
      AND public.catalog_acquisition_package_count_match(hc.legacy_product_name, hc.matched_identity)$$
    );
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_food_form_terms_match(hc.legacy_product_name, hc.matched_identity)%' THEN
    RAISE EXCEPTION 'alias verified duplicate closer food-form guard patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) TO service_role;

WITH bad_form_closures AS (
  SELECT
    q.id,
    q.cache_key,
    q.sample_metadata->>'duplicate_closed_by' AS duplicate_closed_by,
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
    AND q.sample_metadata->>'duplicate_closed_by' IN (
      'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand',
      'exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand'
    )
    AND NOT public.catalog_acquisition_food_form_terms_match(
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
      || jsonb_build_object(
        'last_reconcile_checked_at', now(),
        'last_reconcile_checked_by', 'duplicate_food_form_variant_guard',
        'last_reconcile_checked_result', 'reopened_food_form_variant_mismatch',
        'previous_duplicate_closed_by', bad.duplicate_closed_by,
        'reopened_at', now(),
        'reopened_by', '234_duplicate_food_form_variant_guard',
        'reopen_reason', 'Queued title lacks the food-form evidence required by the matched verified catalog identity.'
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
  direct_function_sql TEXT;
  alias_function_sql TEXT;
  remaining_bad_rows INTEGER;
BEGIN
  IF public.catalog_acquisition_food_form_terms_match(
    'Blue Buffalo Freedom Grain-Free Small Breed Dry Dog Food Chicken Potatoes',
    'BLUE Freedom Wet Dog Food Grain-Free Small Breed Chicken wet https://www.bluebuffalo.com/wet-dog-food/freedom/small-breed-grain-free-chicken-recipe/'
  ) THEN
    RAISE EXCEPTION 'food-form guard must reject dry title matched to wet verified row';
  END IF;

  IF public.catalog_acquisition_food_form_terms_match(
    'Blue Buffalo Tastefuls Natural Flaked Wet Cat Food Chicken Entree in Gravy 3 oz cans',
    'BLUE Tastefuls Adult Dry Cat Food Chicken Brown Rice dry https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-adult-chicken/'
  ) THEN
    RAISE EXCEPTION 'food-form guard must reject wet title matched to dry verified row';
  END IF;

  IF NOT public.catalog_acquisition_food_form_terms_match(
    'Blue Buffalo Wilderness High-Protein Natural Dry Food for Puppies Chicken Recipe',
    'BLUE Wilderness Puppy Grain-Free Chicken Recipe dry https://www.bluebuffalo.com/dry-dog-food/wilderness/puppy-chicken-grain-free-recipe/'
  ) THEN
    RAISE EXCEPTION 'food-form guard should accept matching dry verified row';
  END IF;

  IF NOT public.catalog_acquisition_food_form_terms_match(
    'Fancy Feast Classic Pate Chicken Feast Gourmet Wet Cat Food 3 oz cans',
    'Classic Paté Chicken Feast Gourmet Wet Cat Food wet 3 oz'
  ) THEN
    RAISE EXCEPTION 'food-form guard should accept matching wet verified row';
  END IF;

  SELECT pg_get_functiondef('public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(text, integer)'::regprocedure)
    INTO direct_function_sql;

  IF direct_function_sql NOT LIKE '%catalog_acquisition_food_form_terms_match(bc.legacy_product_name, bc.matched_identity)%' THEN
    RAISE EXCEPTION 'direct verified duplicate closer must call food-form guard';
  END IF;

  SELECT pg_get_functiondef('public.exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(text, integer)'::regprocedure)
    INTO alias_function_sql;

  IF alias_function_sql NOT LIKE '%catalog_acquisition_food_form_terms_match(hc.legacy_product_name, hc.matched_identity)%' THEN
    RAISE EXCEPTION 'alias verified duplicate closer must call food-form guard';
  END IF;

  SELECT count(*)::INTEGER
  INTO remaining_bad_rows
  FROM public.catalog_acquisition_queue q
  JOIN public.product_data matched
    ON matched.cache_key = q.sample_metadata->>'matched_cache_key'
  WHERE q.status = 'resolved'
    AND q.sample_metadata->>'duplicate_closed_by' IN (
      'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand',
      'exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand'
    )
    AND NOT public.catalog_acquisition_food_form_terms_match(
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
    RAISE EXCEPTION 'duplicate food-form mismatches remain: %', remaining_bad_rows;
  END IF;
END $$;
