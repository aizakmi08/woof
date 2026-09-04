-- Close legacy no-source rows for multi-species brands only when verified
-- search returns a single-species official match and the existing strict
-- identity guard passes after using that inferred species.

CREATE OR REPLACE FUNCTION public.exclude_unknown_species_legacy_duplicate_rows_for_brand(
  p_brand TEXT,
  p_max_rows INTEGER DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_brand TEXT := NULLIF(trim(COALESCE(p_brand, '')), '');
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_max_rows, 10), 1), 25);
  v_excluded_rows INTEGER := 0;
  v_queue_rows INTEGER := 0;
  v_evidence_rows INTEGER := 0;
  v_checked_unresolved_rows INTEGER := 0;
  v_examples JSONB := '[]'::jsonb;
BEGIN
  IF v_brand IS NULL THEN
    RAISE EXCEPTION 'brand is required'
      USING ERRCODE = '22023';
  END IF;

  WITH queue_scope AS (
    SELECT
      q.id,
      q.cache_key,
      q.brand,
      q.product_name,
      q.pet_type,
      q.product_source
    FROM public.catalog_acquisition_queue q
    JOIN public.product_data pd
      ON pd.cache_key = q.cache_key
    WHERE q.gap_type = 'product'
      AND q.status IN ('open', 'in_progress')
      AND lower(trim(q.brand)) = lower(v_brand)
      AND q.product_name IS NOT NULL
      AND COALESCE(q.pet_type, 'unknown') NOT IN ('dog', 'cat')
      AND q.product_source IN ('amazon', 'dfa', 'opff', 'web', 'web_verified', 'user_ocr', 'brand')
      AND pd.catalog_exclusion_reason IS NULL
      AND COALESCE(NULLIF(pd.source_url, ''), '') = ''
    ORDER BY
      q.priority_score DESC,
      public.catalog_acquisition_reconcile_checked_at(q.sample_metadata) ASC,
      q.updated_at DESC
    LIMIT v_limit
  ),
  raw_matches AS (
    SELECT
      qs.id,
      qs.cache_key AS legacy_cache_key,
      qs.brand AS legacy_brand,
      qs.product_name AS legacy_product_name,
      qs.pet_type AS legacy_pet_type,
      qs.product_source AS legacy_source,
      matched.cache_key AS matched_cache_key,
      matched.product_name AS matched_product_name,
      matched.brand AS matched_brand,
      matched.product_line AS matched_product_line,
      matched.flavor AS matched_flavor,
      matched.life_stage AS matched_life_stage,
      matched.food_form AS matched_food_form,
      matched.package_size AS matched_package_size,
      matched.gtin AS matched_gtin,
      matched.pet_type AS matched_pet_type,
      matched.source AS matched_source,
      matched.source_quality AS matched_source_quality,
      matched.source_url AS matched_source_url,
      matched.rank AS matched_rank
    FROM queue_scope qs
    JOIN LATERAL public.search_verified_products(concat_ws(' ', qs.brand, qs.product_name), 8) AS matched
      ON TRUE
    WHERE matched.cache_key <> qs.cache_key
      AND lower(trim(matched.brand)) = lower(trim(qs.brand))
      AND matched.pet_type IN ('dog', 'cat')
      AND matched.rank >= 8.0
      AND matched.source_quality IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
      AND matched.source NOT IN ('amazon', 'dfa', 'opff', 'web', 'web_verified', 'user_ocr')
      AND COALESCE(NULLIF(matched.source_url, ''), '') <> ''
  ),
  species_summary AS (
    SELECT
      id,
      count(DISTINCT matched_pet_type)::INTEGER AS species_count
    FROM raw_matches
    GROUP BY id
  ),
  strict_matches AS (
    SELECT DISTINCT ON (rm.id)
      rm.*
    FROM raw_matches rm
    JOIN species_summary ss
      ON ss.id = rm.id
    WHERE ss.species_count = 1
      AND public.catalog_acquisition_strict_search_high_confidence(
        rm.legacy_brand,
        rm.legacy_product_name,
        rm.matched_pet_type,
        rm.matched_brand,
        concat_ws(
          ' ',
          rm.matched_product_name,
          rm.matched_product_line,
          rm.matched_flavor,
          rm.matched_life_stage,
          rm.matched_food_form,
          rm.matched_package_size,
          rm.matched_gtin
        ),
        rm.matched_pet_type,
        rm.matched_rank
      )
    ORDER BY rm.id, rm.matched_rank DESC
  ),
  excluded_products AS (
    UPDATE public.product_data pd
    SET
      catalog_exclusion_reason = COALESCE(NULLIF(pd.catalog_exclusion_reason, ''), 'duplicate_verified_official_catalog_row'),
      updated_at = v_now
    FROM strict_matches sm
    WHERE pd.cache_key = sm.legacy_cache_key
      AND pd.catalog_exclusion_reason IS NULL
    RETURNING
      sm.id,
      sm.legacy_cache_key,
      sm.legacy_product_name,
      sm.legacy_source,
      sm.matched_cache_key,
      sm.matched_product_name,
      sm.matched_brand,
      sm.matched_pet_type,
      sm.matched_source,
      sm.matched_source_quality,
      sm.matched_source_url,
      sm.matched_rank
  ),
  resolved_queue AS (
    UPDATE public.catalog_acquisition_queue q
    SET
      status = 'resolved',
      resolved_at = v_now,
      resolution_reason = 'legacy no-source row excluded because single-species verified catalog search matched an official source-backed product',
      updated_at = v_now,
      sample_metadata = COALESCE(q.sample_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'duplicate_closed_at', v_now,
          'duplicate_closed_by', 'exclude_unknown_species_legacy_duplicate_rows_for_brand',
          'inferred_pet_type_from_single_species_verified_search', ep.matched_pet_type,
          'matched_cache_key', ep.matched_cache_key,
          'matched_product_name', ep.matched_product_name,
          'matched_brand', ep.matched_brand,
          'matched_pet_type', ep.matched_pet_type,
          'matched_source', ep.matched_source,
          'matched_source_quality', ep.matched_source_quality,
          'matched_source_url', ep.matched_source_url,
          'matched_rank', ep.matched_rank
        )
    FROM excluded_products ep
    WHERE q.id = ep.id
    RETURNING q.id
  ),
  rejected_evidence AS (
    UPDATE public.catalog_product_evidence e
    SET
      review_state = 'rejected',
      rejection_reason = COALESCE(NULLIF(e.rejection_reason, ''), 'duplicate_verified_official_catalog_row'),
      evidence = COALESCE(e.evidence, '{}'::jsonb)
        || jsonb_build_object(
          'rejected_after_backfill', true,
          'rejection_reason', 'duplicate_verified_official_catalog_row',
          'duplicate_closed_at', v_now
        ),
      updated_at = v_now
    FROM excluded_products ep
    WHERE e.cache_key = ep.legacy_cache_key
    RETURNING e.id
  ),
  checked_unresolved AS (
    UPDATE public.catalog_acquisition_queue q
    SET
      updated_at = v_now,
      sample_metadata = COALESCE(q.sample_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'last_reconcile_checked_at', v_now,
          'last_reconcile_checked_by', 'exclude_unknown_species_legacy_duplicate_rows_for_brand',
          'last_reconcile_checked_result', 'no_single_species_verified_duplicate_match'
        )
    WHERE q.id IN (SELECT id FROM queue_scope)
      AND NOT EXISTS (
        SELECT 1
        FROM strict_matches sm
        WHERE sm.id = q.id
      )
    RETURNING q.id
  ),
  counts AS (
    SELECT
      (SELECT count(*)::INTEGER FROM excluded_products) AS excluded_rows,
      (SELECT count(*)::INTEGER FROM resolved_queue) AS queue_rows,
      (SELECT count(*)::INTEGER FROM rejected_evidence) AS evidence_rows,
      (SELECT count(*)::INTEGER FROM checked_unresolved) AS checked_unresolved_rows,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'legacy_cache_key', ep.legacy_cache_key,
              'legacy_product_name', ep.legacy_product_name,
              'legacy_source', ep.legacy_source,
              'matched_cache_key', ep.matched_cache_key,
              'matched_product_name', ep.matched_product_name,
              'matched_pet_type', ep.matched_pet_type,
              'matched_source', ep.matched_source,
              'matched_source_url', ep.matched_source_url,
              'matched_rank', ep.matched_rank
            )
            ORDER BY ep.matched_rank DESC
          )
          FROM (
            SELECT *
            FROM excluded_products
            ORDER BY matched_rank DESC
            LIMIT 10
          ) ep
        ),
        '[]'::jsonb
      ) AS examples
  )
  SELECT excluded_rows, queue_rows, evidence_rows, checked_unresolved_rows, examples
  INTO v_excluded_rows, v_queue_rows, v_evidence_rows, v_checked_unresolved_rows, v_examples
  FROM counts;

  PERFORM public.close_stale_catalog_acquisition_queue_gaps(v_now);

  RETURN jsonb_build_object(
    'brand', v_brand,
    'max_rows', v_limit,
    'excluded_product_rows', v_excluded_rows,
    'resolved_queue_rows', v_queue_rows,
    'rejected_evidence_rows', v_evidence_rows,
    'checked_unresolved_rows', v_checked_unresolved_rows,
    'examples', v_examples,
    'closed_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.exclude_unknown_species_legacy_duplicate_rows_for_brand(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exclude_unknown_species_legacy_duplicate_rows_for_brand(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.exclude_unknown_species_legacy_duplicate_rows_for_brand(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exclude_unknown_species_legacy_duplicate_rows_for_brand(TEXT, INTEGER) TO service_role;

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.exclude_unknown_species_legacy_duplicate_rows_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql NOT LIKE '%COALESCE(q.pet_type, ''unknown'') NOT IN (''dog'', ''cat'')%' THEN
    RAISE EXCEPTION 'unknown-species closer must only process unknown-species queue rows';
  END IF;

  IF function_sql NOT LIKE '%count(DISTINCT matched_pet_type)%' THEN
    RAISE EXCEPTION 'unknown-species closer must require single-species verified search evidence';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_strict_search_high_confidence%' THEN
    RAISE EXCEPTION 'unknown-species closer must keep strict identity matching';
  END IF;

  IF function_sql NOT LIKE '%matched.source_quality IN%' THEN
    RAISE EXCEPTION 'unknown-species closer must require source-backed verified matches';
  END IF;

  IF function_sql NOT LIKE '%matched.rank >= 8.0%' THEN
    RAISE EXCEPTION 'unknown-species closer must require high search rank';
  END IF;
END $$;
