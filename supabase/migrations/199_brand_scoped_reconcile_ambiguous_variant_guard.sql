-- Verified acquisition reconciliation must not close a queue row when the same
-- user/retailer title strongly matches multiple different verified formulas.
-- Package duplicates of the same matched product can still resolve.

CREATE OR REPLACE FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(
  p_brand TEXT,
  p_max_rows INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_brand TEXT := NULLIF(trim(COALESCE(p_brand, '')), '');
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_max_rows, 100), 1), 500);
  v_product_strict_search_rows INTEGER := 0;
  v_checked_unresolved_rows INTEGER := 0;
BEGIN
  IF v_brand IS NULL THEN
    RAISE EXCEPTION 'brand is required'
      USING ERRCODE = '22023';
  END IF;

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
      AND lower(trim(q.brand)) = lower(v_brand)
      AND q.product_name IS NOT NULL
    ORDER BY
      q.priority_score DESC,
      public.catalog_acquisition_reconcile_checked_at(q.sample_metadata) ASC,
      q.updated_at DESC
    LIMIT v_limit
  ),
  search_candidates AS (
    SELECT
      qs.id,
      qs.brand,
      qs.product_name,
      qs.pet_type,
      matched.cache_key AS matched_cache_key,
      matched.product_name AS matched_product_name,
      matched.brand AS matched_brand,
      matched.pet_type AS matched_pet_type,
      matched.source AS matched_source,
      matched.source_url AS matched_source_url,
      matched.rank AS matched_rank,
      concat_ws(
        ' ',
        matched.product_name,
        matched.product_line,
        matched.flavor,
        matched.life_stage,
        matched.food_form,
        matched.package_size,
        matched.gtin
      ) AS matched_identity
    FROM queue_scope qs
    JOIN LATERAL public.search_verified_products(qs.search_query, 8) AS matched ON TRUE
    WHERE lower(trim(matched.brand)) = lower(trim(qs.brand))
  ),
  candidate_species AS (
    SELECT
      sc.id,
      count(DISTINCT sc.matched_pet_type) FILTER (WHERE sc.matched_rank >= 6.0) AS high_rank_species_count,
      min(sc.matched_pet_type) FILTER (WHERE sc.matched_rank >= 6.0) AS inferred_pet_type,
      max(sc.matched_rank) AS max_rank
    FROM search_candidates sc
    GROUP BY sc.id
  ),
  high_confidence_candidates AS (
    SELECT
      sc.*
    FROM search_candidates sc
    JOIN candidate_species cs ON cs.id = sc.id
    WHERE public.catalog_acquisition_strict_search_high_confidence(
      sc.brand,
      sc.product_name,
      CASE
        WHEN lower(COALESCE(sc.pet_type, '')) IN ('dog', 'cat') THEN lower(sc.pet_type)
        WHEN cs.high_rank_species_count = 1 AND COALESCE(cs.max_rank, 0) >= 6.0 THEN cs.inferred_pet_type
        ELSE sc.pet_type
      END,
      sc.matched_brand,
      sc.matched_identity,
      sc.matched_pet_type,
      sc.matched_rank
    )
  ),
  strict_matches AS (
    SELECT DISTINCT ON (hc.id)
      hc.id,
      hc.matched_cache_key,
      hc.matched_product_name,
      hc.matched_brand,
      hc.matched_pet_type,
      hc.matched_source,
      hc.matched_source_url,
      hc.matched_rank,
      'high_confidence_strict_search' AS match_strategy
    FROM high_confidence_candidates hc
    WHERE NOT EXISTS (
      SELECT 1
      FROM high_confidence_candidates alt
      WHERE alt.id = hc.id
        -- ambiguous verified formula guard
        AND public.catalog_acquisition_identity_normalize(alt.matched_product_name)
          <> public.catalog_acquisition_identity_normalize(hc.matched_product_name)
        AND alt.matched_rank >= hc.matched_rank - 0.50
    )
    ORDER BY hc.id, hc.matched_rank DESC
  ),
  resolved_product_strict_search AS (
    UPDATE public.catalog_acquisition_queue q
    SET
      status = 'resolved',
      resolved_at = v_now,
      resolution_reason = 'brand-scoped strict verified catalog search matched queued product identity',
      updated_at = v_now,
      sample_metadata = COALESCE(q.sample_metadata, '{}'::jsonb) || jsonb_build_object(
        'last_reconcile_checked_at', v_now,
        'last_reconcile_checked_by', 'reconcile_catalog_acquisition_queue_strict_search_for_brand',
        'last_reconcile_checked_result', 'resolved',
        'reconciled_at', v_now,
        'reconciled_by', 'reconcile_catalog_acquisition_queue_strict_search_for_brand',
        'matched_cache_key', sm.matched_cache_key,
        'matched_product_name', sm.matched_product_name,
        'matched_brand', sm.matched_brand,
        'matched_pet_type', sm.matched_pet_type,
        'matched_source', sm.matched_source,
        'matched_source_url', sm.matched_source_url,
        'matched_rank', sm.matched_rank,
        'match_strategy', sm.match_strategy
      )
    FROM strict_matches sm
    WHERE q.id = sm.id
    RETURNING 1
  ),
  checked_unresolved_search AS (
    UPDATE public.catalog_acquisition_queue q
    SET
      updated_at = v_now,
      sample_metadata = COALESCE(q.sample_metadata, '{}'::jsonb) || jsonb_build_object(
        'last_reconcile_checked_at', v_now,
        'last_reconcile_checked_by', 'reconcile_catalog_acquisition_queue_strict_search_for_brand',
        'last_reconcile_checked_result', 'no_strict_match'
      )
    WHERE q.id IN (SELECT id FROM queue_scope)
      AND NOT EXISTS (
        SELECT 1
        FROM strict_matches sm
        WHERE sm.id = q.id
      )
    RETURNING 1
  ),
  counts AS (
    SELECT
      (SELECT count(*)::INTEGER FROM resolved_product_strict_search) AS resolved_rows,
      (SELECT count(*)::INTEGER FROM checked_unresolved_search) AS checked_unresolved_rows
  )
  SELECT resolved_rows, checked_unresolved_rows
  INTO v_product_strict_search_rows, v_checked_unresolved_rows
  FROM counts;

  RETURN jsonb_build_object(
    'mode', 'strict_verified_search_for_brand',
    'brand', v_brand,
    'max_rows', v_limit,
    'resolved_product_strict_search_rows', v_product_strict_search_rows,
    'checked_unresolved_search_rows', v_checked_unresolved_rows,
    'reconciled_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) TO service_role;

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.reconcile_catalog_acquisition_queue_strict_search_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql NOT LIKE '%ambiguous verified formula guard%' THEN
    RAISE EXCEPTION 'brand-scoped reconciler must keep ambiguous verified formula matches open';
  END IF;

  IF function_sql NOT LIKE '%high_confidence_candidates%' THEN
    RAISE EXCEPTION 'brand-scoped reconciler must separate high-confidence candidates before ambiguity checks';
  END IF;
END $$;
