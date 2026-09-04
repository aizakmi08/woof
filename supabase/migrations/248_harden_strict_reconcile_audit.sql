-- Strict verified-search reconciliation must be audited with the same guard
-- set expected by the catalog serving path. It may close acquisition gaps, but
-- it must never hide a product that still needs exact formula/source evidence.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.reconcile_catalog_acquisition_queue_strict_search_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'reconcile_catalog_acquisition_queue_strict_search_for_brand(text, integer) not found';
  END IF;

  function_sql := replace(
    function_sql,
    $$      concat_ws(
        ' ',
        matched.product_name,$$,
    $$      concat_ws(
        ' ',
        matched.brand,
        matched.product_name,$$
  );

  IF function_sql NOT LIKE '%matched.brand,%matched.product_name%AS matched_identity%' THEN
    RAISE EXCEPTION 'brand-scoped strict reconciler must include matched brand in matched_identity';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_protected_line_terms_match(hc.product_name, hc.matched_identity)%' THEN
    function_sql := replace(
      function_sql,
      $$    WHERE public.catalog_acquisition_life_stage_terms_match(hc.product_name, hc.matched_identity)
      AND public.catalog_acquisition_food_form_terms_match(hc.product_name, hc.matched_identity)$$,
      $$    WHERE public.catalog_acquisition_life_stage_terms_match(hc.product_name, hc.matched_identity)
      AND public.catalog_acquisition_protected_line_terms_match(hc.product_name, hc.matched_identity)
      AND public.catalog_acquisition_food_form_terms_match(hc.product_name, hc.matched_identity)$$
    );
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_protected_line_terms_match(hc.product_name, hc.matched_identity)%' THEN
    RAISE EXCEPTION 'brand-scoped strict reconciler protected-line guard patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.catalog_strict_reconcile_audit(
  p_brands TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_sample_limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_brands TEXT[] := COALESCE(p_brands, ARRAY[]::TEXT[]);
  v_since TIMESTAMPTZ := p_since;
  v_sample_limit INTEGER := LEAST(GREATEST(COALESCE(p_sample_limit, 50), 1), 250);
  v_result JSONB;
BEGIN
  WITH strict_rows AS (
    SELECT
      q.id,
      q.brand,
      q.product_name,
      q.pet_type,
      q.cache_key AS queued_cache_key,
      q.sample_metadata->>'matched_cache_key' AS matched_cache_key,
      q.sample_metadata->>'matched_product_name' AS recorded_matched_product_name,
      q.sample_metadata->>'matched_source_url' AS recorded_matched_source_url,
      NULLIF(q.sample_metadata->>'matched_rank', '')::REAL AS matched_rank,
      (q.sample_metadata->>'reconciled_at')::TIMESTAMPTZ AS reconciled_at
    FROM public.catalog_acquisition_queue q
    WHERE q.status = 'resolved'
      AND q.sample_metadata->>'reconciled_by' = 'reconcile_catalog_acquisition_queue_strict_search_for_brand'
      AND (
        cardinality(v_brands) IS NULL
        OR cardinality(v_brands) = 0
        OR lower(trim(q.brand)) IN (
          SELECT lower(trim(brand_value))
          FROM unnest(v_brands) AS brand_value
        )
      )
      AND (
        v_since IS NULL
        OR (q.sample_metadata->>'reconciled_at')::TIMESTAMPTZ >= v_since
      )
  ),
  checked AS (
    SELECT
      sr.*,
      matched.brand AS matched_brand,
      matched.product_name AS matched_product_name,
      matched.pet_type AS matched_pet_type,
      matched.source AS matched_source,
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
      ) AS matched_identity
    FROM strict_rows sr
    LEFT JOIN public.product_data matched
      ON matched.cache_key = sr.matched_cache_key
  ),
  guarded AS (
    SELECT
      checked.*,
      public.catalog_acquisition_life_stage_terms_match(product_name, matched_identity) AS life_stage_ok,
      public.catalog_acquisition_protected_line_terms_match(product_name, matched_identity) AS line_ok,
      public.catalog_acquisition_food_form_terms_match(product_name, matched_identity) AS food_form_ok,
      public.catalog_acquisition_size_terms_match(product_name, matched_identity) AS size_ok,
      public.catalog_acquisition_package_count_match(product_name, matched_identity) AS package_count_ok,
      (
        public.catalog_acquisition_identity_match(
          concat_ws(' ', brand, product_name),
          pet_type,
          matched_identity,
          matched_pet_type
        )
        OR public.catalog_acquisition_strict_search_high_confidence(
          brand,
          product_name,
          pet_type,
          matched_brand,
          matched_identity,
          matched_pet_type,
          matched_rank
        )
      ) AS identity_or_strict_ok
    FROM checked
  ),
  all_failures AS (
    SELECT *
    FROM guarded
    WHERE matched_quality_state IS DISTINCT FROM 'verified_ready'
      OR life_stage_ok IS NOT TRUE
      OR line_ok IS NOT TRUE
      OR food_form_ok IS NOT TRUE
      OR size_ok IS NOT TRUE
      OR package_count_ok IS NOT TRUE
      OR identity_or_strict_ok IS NOT TRUE
  ),
  sample_failures AS (
    SELECT *
    FROM all_failures
    ORDER BY brand, product_name
    LIMIT v_sample_limit
  ),
  brand_counts AS (
    SELECT brand, count(*)::INTEGER AS rows
    FROM guarded
    GROUP BY brand
  )
  SELECT jsonb_build_object(
    'scope', jsonb_build_object(
      'brands', CASE
        WHEN cardinality(v_brands) IS NULL OR cardinality(v_brands) = 0 THEN to_jsonb('all'::TEXT)
        ELSE to_jsonb(v_brands)
      END,
      'since', v_since,
      'sample_limit', v_sample_limit
    ),
    'summary', jsonb_build_object(
      'strict_resolved_rows', (SELECT count(*) FROM guarded),
      'matched_verified_ready_rows', (SELECT count(*) FROM guarded WHERE matched_quality_state = 'verified_ready'),
      'life_stage_mismatch_rows', (SELECT count(*) FROM guarded WHERE life_stage_ok IS NOT TRUE),
      'line_mismatch_rows', (SELECT count(*) FROM guarded WHERE line_ok IS NOT TRUE),
      'food_form_mismatch_rows', (SELECT count(*) FROM guarded WHERE food_form_ok IS NOT TRUE),
      'size_mismatch_rows', (SELECT count(*) FROM guarded WHERE size_ok IS NOT TRUE),
      'package_count_mismatch_rows', (SELECT count(*) FROM guarded WHERE package_count_ok IS NOT TRUE),
      'identity_or_strict_mismatch_rows', (SELECT count(*) FROM guarded WHERE identity_or_strict_ok IS NOT TRUE),
      'failure_rows', (SELECT count(*) FROM all_failures),
      'sampled_failure_rows', (SELECT count(*) FROM sample_failures)
    ),
    'brand_counts', COALESCE((
      SELECT jsonb_agg(to_jsonb(brand_counts.*) ORDER BY rows DESC, brand)
      FROM brand_counts
    ), '[]'::jsonb),
    'failures', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'brand', brand,
        'product_name', product_name,
        'queued_cache_key', queued_cache_key,
        'matched_cache_key', matched_cache_key,
        'matched_product_name', matched_product_name,
        'matched_source', matched_source,
        'matched_source_url', matched_source_url,
        'matched_quality_state', matched_quality_state,
        'life_stage_ok', life_stage_ok,
        'line_ok', line_ok,
        'food_form_ok', food_form_ok,
        'size_ok', size_ok,
        'package_count_ok', package_count_ok,
        'identity_or_strict_ok', identity_or_strict_ok
      ))
      FROM sample_failures
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_strict_reconcile_audit(TEXT[], TIMESTAMPTZ, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_strict_reconcile_audit(TEXT[], TIMESTAMPTZ, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_strict_reconcile_audit(TEXT[], TIMESTAMPTZ, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_strict_reconcile_audit(TEXT[], TIMESTAMPTZ, INTEGER) TO service_role;

WITH strict_failures AS (
  SELECT (failure->>'queued_cache_key') AS queued_cache_key
  FROM jsonb_array_elements(
    public.catalog_strict_reconcile_audit(ARRAY[]::TEXT[], NULL, 250)->'failures'
  ) AS failure
),
reopened AS (
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
      - 'matched_source_url'
      - 'matched_rank'
      - 'match_strategy'
      || jsonb_build_object(
        'last_reconcile_checked_at', now(),
        'last_reconcile_checked_by', 'catalog_strict_reconcile_audit',
        'last_reconcile_checked_result', 'reopened_strict_reconcile_audit_failure',
        'reopened_at', now(),
        'reopened_by', '248_harden_strict_reconcile_audit',
        'reopen_reason', 'Strict verified-search reconcile failed serving-path identity/source guard audit.'
      )
  FROM strict_failures sf
  WHERE q.cache_key = sf.queued_cache_key
    AND q.status = 'resolved'
    AND q.sample_metadata->>'reconciled_by' = 'reconcile_catalog_acquisition_queue_strict_search_for_brand'
  RETURNING 1
)
SELECT count(*) AS reopened_strict_reconcile_failures
FROM reopened;

DO $$
DECLARE
  audit JSONB;
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.reconcile_catalog_acquisition_queue_strict_search_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql NOT LIKE '%catalog_acquisition_protected_line_terms_match(hc.product_name, hc.matched_identity)%' THEN
    RAISE EXCEPTION 'brand-scoped strict reconciler must require protected-line compatibility';
  END IF;

  SELECT public.catalog_strict_reconcile_audit(ARRAY[]::TEXT[], NULL, 25)
  INTO audit;

  IF (audit->'summary'->>'failure_rows')::INTEGER <> 0 THEN
    RAISE EXCEPTION 'strict reconcile audit has failures: %', audit;
  END IF;
END $$;
