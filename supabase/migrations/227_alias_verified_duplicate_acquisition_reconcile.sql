-- Close stale acquisition rows whose queue brand is a known retail/sub-line
-- alias of an already verified official/manufacturer catalog brand. This is
-- intentionally separate from the normal brand-scoped reconciler because alias
-- rows can have lower search rank even when formula terms match exactly.

CREATE OR REPLACE FUNCTION public.catalog_acquisition_verified_brand_alias_match(
  p_queue_brand TEXT,
  p_matched_brand TEXT,
  p_matched_source TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT
      public.catalog_acquisition_identity_normalize(p_queue_brand) AS queue_brand,
      public.catalog_acquisition_identity_normalize(p_matched_brand) AS matched_brand,
      public.catalog_acquisition_identity_normalize(p_matched_source) AS matched_source
  )
  SELECT
    queue_brand IS NOT NULL
    AND matched_brand IS NOT NULL
    AND (
      queue_brand = matched_brand
      OR (
        matched_source = 'daves pet food'
        AND matched_brand = 'dave s pet food'
        AND queue_brand IN ('dave s', 'dave s 95', 'dave s 95 premium meats')
      )
      OR (
        matched_source = 'diamond pet foods'
        AND matched_brand IN ('diamond naturals', 'diamond naturals grain free')
        AND queue_brand IN ('diamond', 'diamond naturals', 'diamond naturals grain free')
      )
      OR (
        matched_source = 'tiki pets'
        AND matched_brand IN ('tiki pets', 'tiki cat', 'tiki dog')
        AND queue_brand IN ('tiki pets', 'tiki cat', 'tiki dog')
      )
    )
  FROM normalized;
$$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_verified_brand_alias_match(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_verified_brand_alias_match(TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_verified_brand_alias_match(TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_verified_brand_alias_match(TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.catalog_acquisition_alias_formula_terms_match(
  p_query_identity TEXT,
  p_candidate_identity TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  q_norm TEXT := public.catalog_acquisition_identity_normalize(p_query_identity);
  c_norm TEXT := public.catalog_acquisition_identity_normalize(p_candidate_identity);
  q_terms TEXT[];
  c_terms TEXT[];
BEGIN
  IF q_norm IS NULL OR c_norm IS NULL THEN
    RETURN FALSE;
  END IF;

  q_terms := public.catalog_acquisition_identity_tokens(q_norm, ARRAY[
    'beef', 'bison', 'chicken', 'cod', 'crab', 'duck', 'fish',
    'eggs', 'filet', 'herring', 'lamb', 'liver', 'mackerel', 'mignon',
    'oceanfish', 'pork', 'porterhouse', 'quail', 'rabbit', 'rotisserie',
    'salmon', 'sardine', 'shrimp', 'steak', 'trout', 'tuna', 'turkey',
    'veal', 'venison', 'whitefish'
  ]);
  c_terms := public.catalog_acquisition_identity_tokens(c_norm, ARRAY[
    'beef', 'bison', 'chicken', 'cod', 'crab', 'duck', 'fish',
    'eggs', 'filet', 'herring', 'lamb', 'liver', 'mackerel', 'mignon',
    'oceanfish', 'pork', 'porterhouse', 'quail', 'rabbit', 'rotisserie',
    'salmon', 'sardine', 'shrimp', 'steak', 'trout', 'tuna', 'turkey',
    'veal', 'venison', 'whitefish'
  ]);

  IF cardinality(q_terms) = 0 THEN
    RETURN FALSE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM unnest(q_terms) AS q_required(term)
    WHERE NOT q_required.term = ANY(c_terms)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM unnest(c_terms) AS c_extra(term)
    WHERE NOT c_extra.term = ANY(q_terms)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_alias_formula_terms_match(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_alias_formula_terms_match(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_alias_formula_terms_match(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_alias_formula_terms_match(TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(
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
      AND q.product_source IN ('amazon', 'dfa', 'opff', 'web', 'web_verified', 'user_ocr', 'brand')
      AND pd.catalog_exclusion_reason IS NULL
      AND COALESCE(NULLIF(pd.source_url, ''), '') = ''
      AND COALESCE(pd.ingredient_verification_status, 'unverified') NOT IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified',
        'label_ocr_verified'
      )
    ORDER BY
      public.catalog_acquisition_reconcile_checked_at(q.sample_metadata) ASC,
      q.priority_score DESC,
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
      ) AS matched_identity,
      matched.pet_type AS matched_pet_type,
      matched.source AS matched_source,
      matched.source_quality AS matched_source_quality,
      matched.source_url AS matched_source_url,
      matched.rank AS matched_rank
    FROM queue_scope qs
    JOIN LATERAL public.search_verified_products(concat_ws(' ', qs.brand, qs.product_name), 8) AS matched
      ON TRUE
    WHERE matched.cache_key <> qs.cache_key
      AND public.catalog_acquisition_verified_brand_alias_match(qs.brand, matched.brand, matched.source)
      AND matched.pet_type IN ('dog', 'cat')
      AND matched.rank >= 5.5
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
  high_confidence_candidates AS (
    SELECT
      rm.*
    FROM raw_matches rm
    JOIN species_summary ss
      ON ss.id = rm.id
    WHERE (
        lower(COALESCE(rm.legacy_pet_type, '')) IN ('dog', 'cat')
        AND rm.legacy_pet_type = rm.matched_pet_type
      )
      OR (
        lower(COALESCE(rm.legacy_pet_type, 'unknown')) NOT IN ('dog', 'cat')
        AND ss.species_count = 1
      )
  ),
  strict_candidates AS (
    SELECT
      hc.*
    FROM high_confidence_candidates hc
    WHERE public.catalog_acquisition_life_stage_terms_match(hc.legacy_product_name, hc.matched_identity)
      AND public.catalog_acquisition_protected_line_terms_match(hc.legacy_product_name, hc.matched_identity)
      AND public.catalog_acquisition_package_count_match(hc.legacy_product_name, hc.matched_identity)
      AND (
        public.catalog_acquisition_strict_search_high_confidence(
          hc.matched_brand,
          hc.legacy_product_name,
          CASE
            WHEN lower(COALESCE(hc.legacy_pet_type, '')) IN ('dog', 'cat') THEN lower(hc.legacy_pet_type)
            ELSE hc.matched_pet_type
          END,
          hc.matched_brand,
          hc.matched_identity,
          hc.matched_pet_type,
          GREATEST(hc.matched_rank, 8.0)
        )
        OR (
          public.catalog_acquisition_identity_normalize(hc.legacy_brand) IN ('dave s 95', 'dave s 95 premium meats')
          AND hc.matched_source = 'daves-pet-food'
          AND hc.matched_pet_type = 'dog'
          AND public.catalog_acquisition_identity_normalize(hc.matched_identity) ~ '\m(wet|can|cans|canned)\M'
          AND public.catalog_acquisition_alias_formula_terms_match(hc.legacy_product_name, hc.matched_identity)
        )
      )
  ),
  ranked_candidates AS (
    SELECT
      sc.*,
      row_number() OVER (PARTITION BY sc.id ORDER BY sc.matched_rank DESC) AS candidate_rank,
      max(sc.matched_rank) OVER (PARTITION BY sc.id) AS top_rank
    FROM strict_candidates sc
  ),
  ambiguous_candidates AS (
    SELECT DISTINCT top_candidate.id
    FROM ranked_candidates top_candidate
    JOIN ranked_candidates alt
      ON alt.id = top_candidate.id
     AND alt.matched_cache_key <> top_candidate.matched_cache_key
     AND alt.matched_rank >= top_candidate.top_rank - 1.0
     AND public.catalog_acquisition_identity_normalize(alt.matched_product_name)
       IS DISTINCT FROM public.catalog_acquisition_identity_normalize(top_candidate.matched_product_name)
    WHERE top_candidate.candidate_rank = 1
  ),
  strict_matches AS (
    SELECT DISTINCT ON (rc.id)
      rc.*
    FROM ranked_candidates rc
    WHERE rc.candidate_rank = 1
      AND NOT EXISTS (
        SELECT 1
        FROM ambiguous_candidates ac
        WHERE ac.id = rc.id
      )
    ORDER BY rc.id, rc.matched_rank DESC
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
      resolution_reason = 'legacy alias row excluded because verified official catalog row covers the same product',
      updated_at = v_now,
      sample_metadata = COALESCE(q.sample_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'duplicate_closed_at', v_now,
          'duplicate_closed_by', 'exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand',
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
          'last_reconcile_checked_by', 'exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand',
          'last_reconcile_checked_result', CASE
            WHEN EXISTS (SELECT 1 FROM ambiguous_candidates ac WHERE ac.id = q.id) THEN 'ambiguous_alias_verified_duplicate_match'
            ELSE 'no_alias_verified_duplicate_match'
          END
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
              'matched_brand', ep.matched_brand,
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

REVOKE ALL ON FUNCTION public.exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) TO service_role;

DO $$
BEGIN
  IF NOT public.catalog_acquisition_verified_brand_alias_match(
    'Dave''s 95%',
    'Dave''s Pet Food',
    'daves-pet-food'
  ) THEN
    RAISE EXCEPTION 'Dave''s 95%% must be recognized as a Dave''s Pet Food verified source alias';
  END IF;

  IF public.catalog_acquisition_verified_brand_alias_match(
    'Dave''s 95%',
    'Blue Buffalo',
    'blue-buffalo-general-mills'
  ) THEN
    RAISE EXCEPTION 'Dave''s alias guard must not match unrelated verified brands';
  END IF;

  IF NOT public.catalog_acquisition_verified_brand_alias_match(
    'Diamond Naturals',
    'Diamond Naturals Grain-Free',
    'diamond-pet-foods'
  ) THEN
    RAISE EXCEPTION 'Diamond Naturals must match official Diamond Naturals Grain-Free source aliases';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Dave''s Pet Food',
    'Dave''s 95% Premium Beef and Beef Liver',
    'dog',
    'Dave''s Pet Food',
    '95% Premium Meats Beef Beef Liver For Dogs 12.5 oz https://davespetfood.com/products/95-premium-meats-beef-beef-liver-12-5-oz',
    'dog',
    8.0
  ) THEN
    RAISE EXCEPTION 'Dave''s general strict guard should still reject wet/can mismatch without alias-specific formula guard';
  END IF;

  IF NOT public.catalog_acquisition_alias_formula_terms_match(
    'Dave''s 95% Premium Beef and Beef Liver',
    '95% Premium Meats Beef Beef Liver For Dogs 12.5 oz'
  ) THEN
    RAISE EXCEPTION 'Dave''s alias formula guard should accept exact beef and beef liver row';
  END IF;

  IF public.catalog_acquisition_alias_formula_terms_match(
    'Dave''s 95% Premium Beef and Beef Liver',
    '95% Premium Meats Chicken Beef For Dogs 13 oz'
  ) THEN
    RAISE EXCEPTION 'Dave''s alias formula guard must reject chicken beef sibling formula';
  END IF;
END $$;
