-- Older search-based duplicate closers must use the same explicit variant
-- guards as the direct identity closer. Verified coverage cannot depend on a
-- high search rank when the queued title says dry/wet, pack count, protected
-- line, life stage, or size terms that conflict with the matched source row.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.exclude_verified_duplicate_legacy_catalog_rows_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'exclude_verified_duplicate_legacy_catalog_rows_for_brand(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_package_count_match(qs.product_name%' THEN
    function_sql := regexp_replace(
      function_sql,
      $pattern$\n\s+AND public\.catalog_acquisition_strict_search_high_confidence\(\n\s+qs\.brand,$pattern$,
      $replacement$
      AND public.catalog_acquisition_life_stage_terms_match(
        qs.product_name,
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
      AND public.catalog_acquisition_protected_line_terms_match(
        qs.product_name,
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
      AND public.catalog_acquisition_food_form_terms_match(
        qs.product_name,
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
      AND public.catalog_acquisition_size_terms_match(
        qs.product_name,
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
      AND public.catalog_acquisition_package_count_match(
        qs.product_name,
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
      AND public.catalog_acquisition_strict_search_high_confidence(
        qs.brand,$replacement$
    );
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_life_stage_terms_match(qs.product_name%' THEN
    RAISE EXCEPTION 'legacy search duplicate closer missing life-stage guard';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_protected_line_terms_match(qs.product_name%' THEN
    RAISE EXCEPTION 'legacy search duplicate closer missing protected-line guard';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_food_form_terms_match(qs.product_name%' THEN
    RAISE EXCEPTION 'legacy search duplicate closer missing food-form guard';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_size_terms_match(qs.product_name%' THEN
    RAISE EXCEPTION 'legacy search duplicate closer missing size guard';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_package_count_match(qs.product_name%' THEN
    RAISE EXCEPTION 'legacy search duplicate closer missing package-count guard';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.exclude_verified_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exclude_verified_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.exclude_verified_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exclude_verified_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) TO service_role;

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.exclude_unknown_species_legacy_duplicate_rows_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'exclude_unknown_species_legacy_duplicate_rows_for_brand(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_package_count_match(rm.legacy_product_name%' THEN
    function_sql := regexp_replace(
      function_sql,
      $pattern$\n\s+AND public\.catalog_acquisition_strict_search_high_confidence\(\n\s+rm\.legacy_brand,$pattern$,
      $replacement$
      AND public.catalog_acquisition_food_form_terms_match(
        rm.legacy_product_name,
        concat_ws(
          ' ',
          rm.matched_brand,
          rm.matched_product_name,
          rm.matched_product_line,
          rm.matched_flavor,
          rm.matched_life_stage,
          rm.matched_food_form,
          rm.matched_package_size,
          rm.matched_gtin,
          rm.matched_source_url
        )
      )
      AND public.catalog_acquisition_size_terms_match(
        rm.legacy_product_name,
        concat_ws(
          ' ',
          rm.matched_brand,
          rm.matched_product_name,
          rm.matched_product_line,
          rm.matched_flavor,
          rm.matched_life_stage,
          rm.matched_food_form,
          rm.matched_package_size,
          rm.matched_gtin,
          rm.matched_source_url
        )
      )
      AND public.catalog_acquisition_package_count_match(
        rm.legacy_product_name,
        concat_ws(
          ' ',
          rm.matched_brand,
          rm.matched_product_name,
          rm.matched_product_line,
          rm.matched_flavor,
          rm.matched_life_stage,
          rm.matched_food_form,
          rm.matched_package_size,
          rm.matched_gtin,
          rm.matched_source_url
        )
      )
      AND public.catalog_acquisition_strict_search_high_confidence(
        rm.legacy_brand,$replacement$
    );
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_food_form_terms_match(rm.legacy_product_name%' THEN
    RAISE EXCEPTION 'unknown-species duplicate closer missing food-form guard';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_size_terms_match(rm.legacy_product_name%' THEN
    RAISE EXCEPTION 'unknown-species duplicate closer missing size guard';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_package_count_match(rm.legacy_product_name%' THEN
    RAISE EXCEPTION 'unknown-species duplicate closer missing package-count guard';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.exclude_unknown_species_legacy_duplicate_rows_for_brand(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exclude_unknown_species_legacy_duplicate_rows_for_brand(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.exclude_unknown_species_legacy_duplicate_rows_for_brand(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exclude_unknown_species_legacy_duplicate_rows_for_brand(TEXT, INTEGER) TO service_role;

WITH bad_duplicate_closures AS (
  SELECT
    q.id,
    q.cache_key,
    q.product_name,
    q.sample_metadata->>'duplicate_closed_by' AS duplicate_closed_by,
    q.sample_metadata->>'matched_cache_key' AS matched_cache_key,
    q.sample_metadata->>'matched_product_name' AS matched_product_name,
    q.sample_metadata->>'matched_source_url' AS matched_source_url,
    public.catalog_quality_state(
      matched.pet_type,
      matched.is_complete_food,
      matched.catalog_exclusion_reason,
      matched.ingredient_text,
      matched.ingredient_count,
      matched.ingredient_verification_status,
      matched.image_url,
      matched.image_verification_status,
      matched.source_url,
      matched.expires_at
    ) AS matched_quality_state,
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
    AND q.sample_metadata->>'duplicate_closed_by' IN (
      'exclude_verified_duplicate_legacy_catalog_rows_for_brand',
      'exclude_unknown_species_legacy_duplicate_rows_for_brand'
    )
),
closures_to_reopen AS (
  SELECT *
  FROM bad_duplicate_closures
  WHERE matched_quality_state IS DISTINCT FROM 'verified_ready'
    OR life_stage_ok IS NOT TRUE
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
      - 'duplicate_closed_at'
      - 'duplicate_closed_by'
      - 'inferred_pet_type_from_single_species_verified_search'
      || jsonb_build_object(
        'last_reconcile_checked_at', now(),
        'last_reconcile_checked_by', 'harden_search_duplicate_closures',
        'last_reconcile_checked_result', 'reopened_variant_guard_mismatch',
        'previous_duplicate_closed_by', bad.duplicate_closed_by,
        'previous_matched_cache_key', bad.matched_cache_key,
        'previous_matched_product_name', bad.matched_product_name,
        'previous_matched_source_url', bad.matched_source_url,
        'previous_matched_quality_state', bad.matched_quality_state,
        'previous_life_stage_ok', bad.life_stage_ok,
        'previous_line_ok', bad.line_ok,
        'previous_food_form_ok', bad.food_form_ok,
        'previous_size_ok', bad.size_ok,
        'previous_package_count_ok', bad.package_count_ok,
        'reopened_at', now(),
        'reopened_by', '244_harden_search_duplicate_closures',
        'reopen_reason', 'Search-based duplicate closure failed strict verified catalog variant guards.'
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
  legacy_function_sql TEXT;
  unknown_function_sql TEXT;
  remaining_bad_rows INTEGER;
BEGIN
  SELECT pg_get_functiondef('public.exclude_verified_duplicate_legacy_catalog_rows_for_brand(text, integer)'::regprocedure)
    INTO legacy_function_sql;

  IF legacy_function_sql NOT LIKE '%catalog_acquisition_life_stage_terms_match(qs.product_name%' THEN
    RAISE EXCEPTION 'legacy search duplicate closer must call life-stage guard';
  END IF;

  IF legacy_function_sql NOT LIKE '%catalog_acquisition_protected_line_terms_match(qs.product_name%' THEN
    RAISE EXCEPTION 'legacy search duplicate closer must call protected-line guard';
  END IF;

  IF legacy_function_sql NOT LIKE '%catalog_acquisition_food_form_terms_match(qs.product_name%' THEN
    RAISE EXCEPTION 'legacy search duplicate closer must call food-form guard';
  END IF;

  IF legacy_function_sql NOT LIKE '%catalog_acquisition_package_count_match(qs.product_name%' THEN
    RAISE EXCEPTION 'legacy search duplicate closer must call package-count guard';
  END IF;

  SELECT pg_get_functiondef('public.exclude_unknown_species_legacy_duplicate_rows_for_brand(text, integer)'::regprocedure)
    INTO unknown_function_sql;

  IF unknown_function_sql NOT LIKE '%catalog_acquisition_food_form_terms_match(rm.legacy_product_name%' THEN
    RAISE EXCEPTION 'unknown-species duplicate closer must call food-form guard';
  END IF;

  IF unknown_function_sql NOT LIKE '%catalog_acquisition_package_count_match(rm.legacy_product_name%' THEN
    RAISE EXCEPTION 'unknown-species duplicate closer must call package-count guard';
  END IF;

  IF public.catalog_acquisition_food_form_terms_match(
    'Blue Buffalo True Solutions Digestive Care Natural Dry Dog Food for Adult Dogs, Chicken, 24-lb. Bag',
    'BLUE True Solutions Digestive Care Chicken Recipe for Adult Dogs https://www.bluebuffalo.com/wet-dog-food/true-solutions/digestive-care/'
  ) THEN
    RAISE EXCEPTION 'legacy search duplicate guard must reject dry title matched to wet source URL';
  END IF;

  IF public.catalog_acquisition_package_count_match(
    'Purina Fancy Feast Gravy Lovers Chicken Feast Pate in Wet Cat Food Gravy - (Pack of 24)',
    'Purina Fancy Feast Gravy Lovers Chicken Feast Pate in Gravy Wet Cat Food'
  ) THEN
    RAISE EXCEPTION 'legacy search duplicate guard must reject pack-count mismatch';
  END IF;

  SELECT count(*)::INTEGER
  INTO remaining_bad_rows
  FROM public.catalog_acquisition_queue q
  JOIN public.product_data matched
    ON matched.cache_key = q.sample_metadata->>'matched_cache_key'
  WHERE q.status = 'resolved'
    AND q.sample_metadata->>'duplicate_closed_by' IN (
      'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand',
      'exclude_verified_duplicate_legacy_catalog_rows_for_brand',
      'exclude_unknown_species_legacy_duplicate_rows_for_brand',
      'exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand'
    )
    AND (
      public.catalog_quality_state(
        matched.pet_type,
        matched.is_complete_food,
        matched.catalog_exclusion_reason,
        matched.ingredient_text,
        matched.ingredient_count,
        matched.ingredient_verification_status,
        matched.image_url,
        matched.image_verification_status,
        matched.source_url,
        matched.expires_at
      ) IS DISTINCT FROM 'verified_ready'
      OR NOT public.catalog_acquisition_life_stage_terms_match(
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
    RAISE EXCEPTION 'search duplicate closure guard mismatches remain: %', remaining_bad_rows;
  END IF;
END $$;
