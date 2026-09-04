-- Service-role-only read audit for automated duplicate closures. The sweep
-- script calls this after closing queue rows so unsafe closures are caught
-- immediately instead of relying on manual SQL pasted into the dashboard.

CREATE OR REPLACE FUNCTION public.catalog_duplicate_closure_audit(
  p_brands TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_closers TEXT[] DEFAULT ARRAY[
    'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand',
    'exclude_verified_duplicate_legacy_catalog_rows_for_brand',
    'exclude_unknown_species_legacy_duplicate_rows_for_brand',
    'exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand'
  ]::TEXT[],
  p_sample_limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_brands TEXT[] := COALESCE(p_brands, ARRAY[]::TEXT[]);
  v_closers TEXT[] := COALESCE(p_closers, ARRAY[]::TEXT[]);
  v_sample_limit INTEGER := LEAST(GREATEST(COALESCE(p_sample_limit, 50), 1), 250);
  v_result JSONB;
BEGIN
  IF cardinality(v_closers) IS NULL OR cardinality(v_closers) = 0 THEN
    RAISE EXCEPTION 'at least one duplicate closer is required'
      USING ERRCODE = '22023';
  END IF;

  WITH direct_closed AS (
    SELECT
      q.id,
      q.brand,
      q.product_name,
      q.pet_type,
      q.cache_key AS legacy_cache_key,
      q.sample_metadata->>'duplicate_closed_by' AS duplicate_closed_by,
      q.sample_metadata->>'matched_cache_key' AS matched_cache_key,
      q.sample_metadata->>'matched_product_name' AS recorded_matched_product_name,
      q.sample_metadata->>'matched_source_url' AS recorded_matched_source_url,
      q.sample_metadata->>'duplicate_closed_at' AS duplicate_closed_at
    FROM public.catalog_acquisition_queue q
    WHERE q.status = 'resolved'
      AND q.sample_metadata ? 'duplicate_closed_by'
      AND q.sample_metadata->>'duplicate_closed_by' = ANY(v_closers)
      AND (
        cardinality(v_brands) IS NULL
        OR cardinality(v_brands) = 0
        OR lower(trim(q.brand)) IN (
          SELECT lower(trim(brand_value))
          FROM unnest(v_brands) AS brand_value
        )
      )
  ),
  checked AS (
    SELECT
      dc.*,
      legacy.catalog_exclusion_reason AS legacy_exclusion_reason,
      legacy.ingredient_verification_status AS legacy_ingredient_status,
      matched.product_name AS matched_product_name,
      matched.brand AS matched_brand,
      matched.source AS matched_source,
      matched.source_quality AS matched_source_quality,
      matched.source_url AS matched_source_url,
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
        dc.product_name,
        concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
      ) AS life_stage_ok,
      public.catalog_acquisition_protected_line_terms_match(
        dc.product_name,
        concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
      ) AS line_ok,
      public.catalog_acquisition_food_form_terms_match(
        dc.product_name,
        concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
      ) AS food_form_ok,
      public.catalog_acquisition_size_terms_match(
        dc.product_name,
        concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
      ) AS size_ok,
      public.catalog_acquisition_package_count_match(
        dc.product_name,
        concat_ws(' ', matched.brand, matched.product_name, matched.product_line, matched.flavor, matched.life_stage, matched.food_form, matched.package_size, matched.gtin, matched.source_url)
      ) AS package_count_ok
    FROM direct_closed dc
    LEFT JOIN public.product_data legacy
      ON legacy.cache_key = dc.legacy_cache_key
    LEFT JOIN public.product_data matched
      ON matched.cache_key = dc.matched_cache_key
  ),
  all_failures AS (
    SELECT *
    FROM checked
    WHERE legacy_exclusion_reason IS DISTINCT FROM 'duplicate_verified_official_catalog_row'
      OR matched_quality_state IS DISTINCT FROM 'verified_ready'
      OR legacy_ingredient_status IN ('gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified')
      OR life_stage_ok IS NOT TRUE
      OR line_ok IS NOT TRUE
      OR food_form_ok IS NOT TRUE
      OR size_ok IS NOT TRUE
      OR package_count_ok IS NOT TRUE
  ),
  sample_failures AS (
    SELECT *
    FROM all_failures
    ORDER BY brand, product_name
    LIMIT v_sample_limit
  ),
  closure_counts AS (
    SELECT
      duplicate_closed_by,
      count(*)::INTEGER AS rows
    FROM checked
    GROUP BY duplicate_closed_by
  )
  SELECT jsonb_build_object(
    'scope', jsonb_build_object(
      'brands', CASE
        WHEN cardinality(v_brands) IS NULL OR cardinality(v_brands) = 0 THEN to_jsonb('all'::TEXT)
        ELSE to_jsonb(v_brands)
      END,
      'closures', to_jsonb(v_closers),
      'sample_limit', v_sample_limit
    ),
    'summary', jsonb_build_object(
      'active_closed_rows', (SELECT count(*) FROM checked),
      'legacy_excluded_rows', (SELECT count(*) FROM checked WHERE legacy_exclusion_reason = 'duplicate_verified_official_catalog_row'),
      'matched_verified_ready_rows', (SELECT count(*) FROM checked WHERE matched_quality_state = 'verified_ready'),
      'wrongly_promoted_legacy_rows', (
        SELECT count(*)
        FROM checked
        WHERE legacy_ingredient_status IN ('gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified')
      ),
      'life_stage_mismatch_rows', (SELECT count(*) FROM checked WHERE life_stage_ok IS NOT TRUE),
      'line_mismatch_rows', (SELECT count(*) FROM checked WHERE line_ok IS NOT TRUE),
      'food_form_mismatch_rows', (SELECT count(*) FROM checked WHERE food_form_ok IS NOT TRUE),
      'size_mismatch_rows', (SELECT count(*) FROM checked WHERE size_ok IS NOT TRUE),
      'package_count_mismatch_rows', (SELECT count(*) FROM checked WHERE package_count_ok IS NOT TRUE),
      'failure_rows', (SELECT count(*) FROM all_failures),
      'sampled_failure_rows', (SELECT count(*) FROM sample_failures)
    ),
    'closure_counts', COALESCE((
      SELECT jsonb_agg(to_jsonb(closure_counts.*) ORDER BY rows DESC, duplicate_closed_by)
      FROM closure_counts
    ), '[]'::jsonb),
    'failures', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'duplicate_closed_by', duplicate_closed_by,
        'brand', brand,
        'legacy_product_name', product_name,
        'legacy_cache_key', legacy_cache_key,
        'legacy_exclusion_reason', legacy_exclusion_reason,
        'legacy_ingredient_status', legacy_ingredient_status,
        'matched_product_name', matched_product_name,
        'matched_source', matched_source,
        'matched_source_url', matched_source_url,
        'matched_quality_state', matched_quality_state,
        'life_stage_ok', life_stage_ok,
        'line_ok', line_ok,
        'food_form_ok', food_form_ok,
        'size_ok', size_ok,
        'package_count_ok', package_count_ok
      ))
      FROM sample_failures
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_duplicate_closure_audit(TEXT[], TEXT[], INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_duplicate_closure_audit(TEXT[], TEXT[], INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_duplicate_closure_audit(TEXT[], TEXT[], INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_duplicate_closure_audit(TEXT[], TEXT[], INTEGER) TO service_role;

DO $$
DECLARE
  audit JSONB;
BEGIN
  SELECT public.catalog_duplicate_closure_audit(
    ARRAY[]::TEXT[],
    ARRAY[
      'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand',
      'exclude_verified_duplicate_legacy_catalog_rows_for_brand',
      'exclude_unknown_species_legacy_duplicate_rows_for_brand',
      'exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand'
    ]::TEXT[],
    25
  )
  INTO audit;

  IF (audit->'summary'->>'failure_rows')::INTEGER <> 0 THEN
    RAISE EXCEPTION 'duplicate closure audit has failures: %', audit;
  END IF;

  IF audit->'summary' ? 'life_stage_mismatch_rows' IS NOT TRUE THEN
    RAISE EXCEPTION 'duplicate closure audit must report life-stage mismatches';
  END IF;
END $$;
