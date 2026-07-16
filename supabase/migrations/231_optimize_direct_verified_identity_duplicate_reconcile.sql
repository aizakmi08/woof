-- Optimize the direct verified-identity duplicate closer. Migration 230 proved
-- the correctness path, but it still ran strict PL/pgSQL identity guards across
-- too many same-brand catalog pairs and called the broad stale-gap closer per
-- brand. This version adds a cheap trigram/containment prefilter, bounds the
-- candidate window per queued row, and leaves global stale-gap closure to queue
-- refresh jobs.

CREATE OR REPLACE FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(
  p_brand TEXT,
  p_max_rows INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_brand TEXT := NULLIF(trim(COALESCE(p_brand, '')), '');
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_max_rows, 50), 1), 250);
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
      q.product_source,
      public.catalog_acquisition_identity_normalize(concat_ws(' ', q.brand, q.product_name)) AS legacy_identity_norm
    FROM public.catalog_acquisition_queue q
    JOIN public.product_data legacy
      ON legacy.cache_key = q.cache_key
    WHERE q.gap_type = 'product'
      AND q.status IN ('open', 'in_progress')
      AND lower(trim(q.brand)) = lower(v_brand)
      AND q.product_name IS NOT NULL
      AND q.product_source IN ('amazon', 'dfa', 'opff', 'web', 'web_verified', 'user_ocr', 'brand')
      AND legacy.catalog_exclusion_reason IS NULL
      AND COALESCE(NULLIF(legacy.source_url, ''), '') = ''
      AND COALESCE(legacy.ingredient_verification_status, 'unverified') NOT IN (
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
  verified_catalog AS (
    SELECT
      pd.cache_key,
      pd.product_name,
      pd.brand,
      pd.product_line,
      pd.flavor,
      pd.life_stage,
      pd.food_form,
      pd.package_size,
      pd.gtin,
      pd.pet_type,
      pd.source,
      pd.source_quality,
      pd.source_url,
      pd.ingredient_count,
      pd.verified_at,
      public.catalog_acquisition_identity_normalize(concat_ws(' ', pd.brand, pd.product_name)) AS catalog_title_norm,
      public.catalog_acquisition_identity_normalize(concat_ws(
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
      )) AS catalog_identity_norm,
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
      ) AS catalog_identity
    FROM public.product_data pd
    WHERE lower(trim(pd.brand)) = lower(v_brand)
      AND public.catalog_quality_state(
        pd.pet_type,
        pd.is_complete_food,
        pd.catalog_exclusion_reason,
        pd.ingredient_text,
        pd.ingredient_count,
        pd.ingredient_verification_status,
        pd.image_url,
        pd.image_verification_status,
        pd.source_url,
        pd.expires_at
      ) = 'verified_ready'
      AND pd.source_quality IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
      AND COALESCE(pd.source, '') NOT IN ('amazon', 'dfa', 'opff', 'web', 'web_verified', 'user_ocr')
      AND COALESCE(NULLIF(pd.source_url, ''), '') <> ''
  ),
  prefilter_candidates AS (
    SELECT
      qs.id,
      qs.cache_key AS legacy_cache_key,
      qs.brand AS legacy_brand,
      qs.product_name AS legacy_product_name,
      qs.pet_type AS legacy_pet_type,
      qs.product_source AS legacy_source,
      qs.legacy_identity_norm,
      vc.cache_key AS matched_cache_key,
      vc.product_name AS matched_product_name,
      vc.brand AS matched_brand,
      vc.pet_type AS matched_pet_type,
      vc.source AS matched_source,
      vc.source_quality AS matched_source_quality,
      vc.source_url AS matched_source_url,
      vc.catalog_identity AS matched_identity,
      vc.ingredient_count AS matched_ingredient_count,
      vc.verified_at AS matched_verified_at,
      vc.catalog_title_norm,
      vc.catalog_identity_norm,
      GREATEST(
        CASE WHEN qs.legacy_identity_norm = vc.catalog_title_norm THEN 1.20 ELSE 0 END,
        CASE WHEN vc.catalog_identity_norm LIKE '%' || qs.legacy_identity_norm || '%' THEN 1.05 ELSE 0 END,
        CASE WHEN qs.legacy_identity_norm LIKE '%' || vc.catalog_title_norm || '%' THEN 1.00 ELSE 0 END,
        word_similarity(qs.legacy_identity_norm, vc.catalog_identity_norm) * 0.92,
        similarity(qs.legacy_identity_norm, vc.catalog_identity_norm) * 0.86
      ) AS prefilter_score
    FROM queue_scope qs
    JOIN verified_catalog vc
      ON vc.cache_key <> qs.cache_key
    WHERE qs.legacy_identity_norm IS NOT NULL
      AND vc.catalog_identity_norm IS NOT NULL
      AND (
        vc.catalog_identity_norm LIKE '%' || qs.legacy_identity_norm || '%'
        OR qs.legacy_identity_norm LIKE '%' || vc.catalog_title_norm || '%'
        OR word_similarity(qs.legacy_identity_norm, vc.catalog_identity_norm) > 0.46
        OR similarity(qs.legacy_identity_norm, vc.catalog_identity_norm) > 0.30
      )
  ),
  bounded_candidates AS (
    SELECT *
    FROM (
      SELECT
        pc.*,
        row_number() OVER (
          PARTITION BY pc.id
          ORDER BY
            pc.prefilter_score DESC,
            pc.matched_ingredient_count DESC,
            pc.matched_verified_at DESC NULLS LAST,
            pc.matched_cache_key
        ) AS prefilter_rank
      FROM prefilter_candidates pc
    ) ranked_prefilter
    WHERE prefilter_rank <= 24
  ),
  raw_candidates AS (
    SELECT
      bc.*,
      (
        CASE
          WHEN bc.legacy_identity_norm = bc.catalog_title_norm THEN 120
          WHEN bc.catalog_identity_norm LIKE '%' || bc.legacy_identity_norm || '%' THEN 105
          WHEN bc.legacy_identity_norm LIKE '%' || bc.catalog_title_norm || '%' THEN 100
          ELSE 80
        END
        + LEAST(COALESCE(bc.matched_ingredient_count, 0), 40) * 0.1
        + bc.prefilter_score
      )::REAL AS direct_identity_score
    FROM bounded_candidates bc
    WHERE public.catalog_acquisition_life_stage_terms_match(bc.legacy_product_name, bc.matched_identity)
      AND public.catalog_acquisition_protected_line_terms_match(bc.legacy_product_name, bc.matched_identity)
      AND public.catalog_acquisition_package_count_match(bc.legacy_product_name, bc.matched_identity)
      AND (
        public.catalog_acquisition_identity_match(
          concat_ws(' ', bc.legacy_brand, bc.legacy_product_name),
          bc.legacy_pet_type,
          bc.matched_identity,
          bc.matched_pet_type
        )
        OR public.catalog_acquisition_strict_search_high_confidence(
          bc.legacy_brand,
          bc.legacy_product_name,
          bc.legacy_pet_type,
          bc.matched_brand,
          bc.matched_identity,
          bc.matched_pet_type,
          8.0
        )
      )
  ),
  species_summary AS (
    SELECT
      id,
      count(DISTINCT matched_pet_type)::INTEGER AS species_count
    FROM raw_candidates
    WHERE matched_pet_type IN ('dog', 'cat')
    GROUP BY id
  ),
  species_safe_candidates AS (
    SELECT rc.*
    FROM raw_candidates rc
    JOIN species_summary ss
      ON ss.id = rc.id
    WHERE (
        lower(COALESCE(rc.legacy_pet_type, '')) IN ('dog', 'cat')
        AND rc.legacy_pet_type = rc.matched_pet_type
      )
      OR (
        lower(COALESCE(rc.legacy_pet_type, 'unknown')) NOT IN ('dog', 'cat')
        AND ss.species_count = 1
      )
  ),
  ranked_candidates AS (
    SELECT
      ssc.*,
      row_number() OVER (
        PARTITION BY ssc.id
        ORDER BY
          ssc.direct_identity_score DESC,
          ssc.matched_ingredient_count DESC,
          ssc.matched_verified_at DESC NULLS LAST,
          ssc.matched_cache_key
      ) AS candidate_rank,
      max(ssc.direct_identity_score) OVER (PARTITION BY ssc.id) AS top_score
    FROM species_safe_candidates ssc
  ),
  ambiguous_candidates AS (
    SELECT DISTINCT top_candidate.id
    FROM ranked_candidates top_candidate
    JOIN ranked_candidates alt
      ON alt.id = top_candidate.id
     AND alt.matched_cache_key <> top_candidate.matched_cache_key
     AND alt.direct_identity_score >= top_candidate.top_score - 5.0
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
    ORDER BY rc.id, rc.direct_identity_score DESC, rc.matched_ingredient_count DESC, rc.matched_cache_key
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
      sm.direct_identity_score
  ),
  resolved_queue AS (
    UPDATE public.catalog_acquisition_queue q
    SET
      status = 'resolved',
      resolved_at = v_now,
      resolution_reason = 'legacy no-source row excluded because direct verified catalog identity matched an official source-backed product',
      updated_at = v_now,
      sample_metadata = COALESCE(q.sample_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'duplicate_closed_at', v_now,
          'duplicate_closed_by', 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand',
          'matched_cache_key', ep.matched_cache_key,
          'matched_product_name', ep.matched_product_name,
          'matched_brand', ep.matched_brand,
          'matched_pet_type', ep.matched_pet_type,
          'matched_source', ep.matched_source,
          'matched_source_quality', ep.matched_source_quality,
          'matched_source_url', ep.matched_source_url,
          'direct_identity_score', ep.direct_identity_score
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
          'duplicate_closed_at', v_now,
          'duplicate_closed_by', 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand'
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
          'last_reconcile_checked_by', 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand',
          'last_reconcile_checked_result', CASE
            WHEN EXISTS (SELECT 1 FROM ambiguous_candidates ac WHERE ac.id = q.id) THEN 'ambiguous_direct_verified_identity_match'
            ELSE 'no_direct_verified_identity_match'
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
              'direct_identity_score', ep.direct_identity_score
            )
            ORDER BY ep.direct_identity_score DESC
          )
          FROM (
            SELECT *
            FROM excluded_products
            ORDER BY direct_identity_score DESC
            LIMIT 10
          ) ep
        ),
        '[]'::jsonb
      ) AS examples
  )
  SELECT excluded_rows, queue_rows, evidence_rows, checked_unresolved_rows, examples
  INTO v_excluded_rows, v_queue_rows, v_evidence_rows, v_checked_unresolved_rows, v_examples
  FROM counts;

  RETURN jsonb_build_object(
    'brand', v_brand,
    'max_rows', v_limit,
    'excluded_product_rows', v_excluded_rows,
    'resolved_queue_rows', v_queue_rows,
    'rejected_evidence_rows', v_evidence_rows,
    'checked_unresolved_rows', v_checked_unresolved_rows,
    'examples', v_examples,
    'closed_at', v_now,
    'optimizer', 'prefiltered_direct_identity_v2'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(TEXT, INTEGER) TO service_role;

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql LIKE '%search_verified_products%' THEN
    RAISE EXCEPTION 'optimized direct verified identity duplicate closer must not call search_verified_products';
  END IF;

  IF function_sql LIKE '%close_stale_catalog_acquisition_queue_gaps%' THEN
    RAISE EXCEPTION 'optimized direct verified identity duplicate closer must stay bounded and skip global stale-gap closure';
  END IF;

  IF function_sql NOT LIKE '%prefilter_candidates%' OR function_sql NOT LIKE '%prefilter_rank <= 24%' THEN
    RAISE EXCEPTION 'optimized direct verified identity duplicate closer must bound strict identity guard candidates';
  END IF;

  IF function_sql NOT LIKE '%catalog_quality_state%' THEN
    RAISE EXCEPTION 'optimized direct verified identity duplicate closer must require verified-ready catalog rows';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_life_stage_terms_match%' THEN
    RAISE EXCEPTION 'optimized direct verified identity duplicate closer must keep life-stage guard';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_protected_line_terms_match%' THEN
    RAISE EXCEPTION 'optimized direct verified identity duplicate closer must keep protected line guard';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_package_count_match%' THEN
    RAISE EXCEPTION 'optimized direct verified identity duplicate closer must keep package-count guard';
  END IF;

  IF function_sql NOT LIKE '%ambiguous_direct_verified_identity_match%' THEN
    RAISE EXCEPTION 'optimized direct verified identity duplicate closer must keep ambiguity marker';
  END IF;

  IF public.catalog_acquisition_identity_match(
    'Blue Buffalo Life Protection Formula Natural Adult Small Bite Dry Dog Food Chicken and Brown Rice',
    'dog',
    'Blue Buffalo Life Protection Formula Small Breed Adult Dry Dog Food Chicken Brown Rice https://www.bluebuffalo.com/dry-dog-food/life-protection-formula/small-breed-adult-chicken-brown-rice-recipe/',
    'dog'
  ) THEN
    RAISE EXCEPTION 'Small Bite direct identity fixture must not match Small Breed official row';
  END IF;
END $$;
