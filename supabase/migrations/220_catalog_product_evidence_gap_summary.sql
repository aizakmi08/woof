-- Timeout-safe catalog readiness and evidence-gap summary for scraper tooling.
-- This keeps live reporting inside Postgres instead of paging every catalog row
-- through the client. It is service-role only because it exposes acquisition
-- backlog detail that should not be available to app clients.

CREATE OR REPLACE FUNCTION public.catalog_product_evidence_gap_summary(
  p_limit INTEGER DEFAULT 25
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH params AS (
    SELECT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100) AS result_limit
  ),
  base AS (
    SELECT
      pd.cache_key,
      pd.brand,
      pd.source,
      pd.product_name,
      pd.pet_type,
      pd.is_complete_food,
      pd.catalog_exclusion_reason,
      pd.ingredient_text,
      pd.ingredient_count,
      pd.ingredient_verification_status,
      pd.image_url,
      pd.image_verification_status,
      pd.source_url,
      pd.expires_at,
      public.catalog_quality_state(
        pd.pet_type,
        pd.is_complete_food,
        pd.catalog_exclusion_reason,
        pd.ingredient_text,
        COALESCE(pd.ingredient_count, 0),
        pd.ingredient_verification_status,
        pd.image_url,
        pd.image_verification_status,
        pd.source_url,
        pd.expires_at
      ) AS quality_state,
      lower(regexp_replace(COALESCE(pd.source, ''), '[^a-z0-9]+', '-', 'g')) AS source_key
    FROM public.product_data pd
  ),
  classified AS (
    SELECT
      base.*,
      (
        lower(COALESCE(base.pet_type, '')) IN ('dog', 'cat')
        AND base.is_complete_food IS TRUE
        AND COALESCE(NULLIF(trim(base.catalog_exclusion_reason), ''), '') = ''
        AND COALESCE(NULLIF(trim(base.ingredient_text), ''), '') <> ''
        AND COALESCE(NULLIF(trim(base.source_url), ''), '') = ''
        AND lower(COALESCE(base.ingredient_verification_status, 'unverified')) = 'unverified'
        AND (base.expires_at IS NULL OR base.expires_at > now())
      ) AS legacy_unverified_no_source,
      CASE
        WHEN COALESCE(NULLIF(trim(base.ingredient_text), ''), '') <> ''
          AND COALESCE(NULLIF(trim(base.source_url), ''), '') = ''
          AND lower(COALESCE(base.ingredient_verification_status, 'unverified')) = 'unverified'
          THEN 'legacy_no_source_do_not_promote'
        WHEN COALESCE(NULLIF(trim(base.source_url), ''), '') = ''
          AND base.source_key IN ('dfa', 'opff', 'user-ocr')
          THEN 'third_party_no_source_review_required'
        WHEN base.source_key = 'amazon'
          THEN 'authorized_feed_or_official_import_required'
        WHEN COALESCE(NULLIF(trim(base.source_url), ''), '') = ''
          THEN 'missing_source_url'
        ELSE 'unmapped_source_review'
      END AS recommended_action
    FROM base
  ),
  counts AS (
    SELECT
      count(*) AS total_product_rows,
      count(*) FILTER (WHERE lower(COALESCE(pet_type, '')) IN ('dog', 'cat')) AS dog_cat_rows,
      count(*) FILTER (WHERE quality_state = 'verified_ready') AS verified_ready_rows,
      count(*) FILTER (WHERE legacy_unverified_no_source) AS legacy_unverified_no_source_rows,
      count(*) FILTER (WHERE catalog_exclusion_reason = 'duplicate_verified_official_catalog_row') AS duplicate_excluded_rows
    FROM classified
  ),
  quality_counts AS (
    SELECT quality_state, count(*) AS row_count
    FROM classified
    GROUP BY quality_state
  ),
  action_counts AS (
    SELECT recommended_action, count(*) AS row_count
    FROM classified
    WHERE quality_state = 'needs_ingredients'
    GROUP BY recommended_action
  ),
  verified_sources AS (
    SELECT COALESCE(NULLIF(trim(source), ''), 'unknown') AS source, count(*) AS row_count
    FROM classified
    WHERE quality_state = 'verified_ready'
    GROUP BY COALESCE(NULLIF(trim(source), ''), 'unknown')
    ORDER BY row_count DESC, source
    LIMIT (SELECT result_limit FROM params)
  ),
  needs_groups AS (
    SELECT
      COALESCE(NULLIF(trim(brand), ''), 'unknown') AS brand,
      COALESCE(NULLIF(trim(source), ''), 'unknown') AS source,
      recommended_action,
      count(*) AS row_count,
      count(*) FILTER (WHERE COALESCE(NULLIF(trim(ingredient_text), ''), '') <> '') AS rows_with_ingredient_text,
      count(*) FILTER (WHERE COALESCE(NULLIF(trim(image_url), ''), '') <> '' AND image_url !~* '^data:') AS rows_with_image,
      count(*) FILTER (WHERE COALESCE(NULLIF(trim(source_url), ''), '') <> '') AS rows_with_source_url,
      (array_agg(product_name ORDER BY product_name) FILTER (
        WHERE COALESCE(NULLIF(trim(product_name), ''), '') <> ''
      ))[1:5] AS sample_products
    FROM classified
    WHERE quality_state = 'needs_ingredients'
    GROUP BY
      COALESCE(NULLIF(trim(brand), ''), 'unknown'),
      COALESCE(NULLIF(trim(source), ''), 'unknown'),
      recommended_action
    ORDER BY row_count DESC, brand, source
    LIMIT (SELECT result_limit FROM params)
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'total_rows_sampled', counts.total_product_rows,
    'total_product_rows', counts.total_product_rows,
    'dog_cat_rows', counts.dog_cat_rows,
    'verified_ready_rows', counts.verified_ready_rows,
    'strict_verified_ready_rows', counts.verified_ready_rows,
    'quality_state_counts', COALESCE((
      SELECT jsonb_object_agg(quality_state, row_count ORDER BY quality_state)
      FROM quality_counts
    ), '{}'::jsonb),
    'needs_ingredients_action_counts', COALESCE((
      SELECT jsonb_object_agg(recommended_action, row_count ORDER BY recommended_action)
      FROM action_counts
    ), '{}'::jsonb),
    'legacy_unverified_no_source_rows', counts.legacy_unverified_no_source_rows,
    'duplicate_excluded_rows', counts.duplicate_excluded_rows,
    'source_breakdown', COALESCE((
      SELECT jsonb_object_agg(source, row_count)
      FROM verified_sources
    ), '{}'::jsonb),
    'top_needs_ingredients_by_brand_source', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'brand', brand,
          'source', source,
          'recommended_action', recommended_action,
          'action', recommended_action,
          'count', row_count,
          'rows', row_count,
          'rows_with_ingredient_text', rows_with_ingredient_text,
          'rows_with_image', rows_with_image,
          'rows_with_source_url', rows_with_source_url,
          'sample_products', COALESCE(to_jsonb(sample_products), '[]'::jsonb)
        )
        ORDER BY row_count DESC, brand, source
      )
      FROM needs_groups
    ), '[]'::jsonb)
  )
  FROM counts;
$$;

REVOKE ALL ON FUNCTION public.catalog_product_evidence_gap_summary(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_product_evidence_gap_summary(INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_product_evidence_gap_summary(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_product_evidence_gap_summary(INTEGER) TO service_role;

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.catalog_product_evidence_gap_summary(integer)'::regprocedure)
    INTO function_sql;

  IF function_sql NOT LIKE '%catalog_quality_state%' THEN
    RAISE EXCEPTION 'catalog evidence-gap summary must use catalog_quality_state';
  END IF;

  IF function_sql NOT LIKE '%legacy_no_source_do_not_promote%' THEN
    RAISE EXCEPTION 'catalog evidence-gap summary must include legacy no-source action';
  END IF;

  IF function_sql NOT LIKE '%duplicate_verified_official_catalog_row%' THEN
    RAISE EXCEPTION 'catalog evidence-gap summary must report duplicate exclusions';
  END IF;
END $$;
