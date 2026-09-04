-- Keep front-label resolution on the indexed, lightweight identity path. The
-- previous RPC returned full ingredient/nutrient payloads and joined aliases
-- before the app had selected a formula, which made a warm request consume
-- most of the client timeout budget.
CREATE OR REPLACE FUNCTION public.search_verified_product_identities_for_label(
  queries TEXT[],
  max_results INTEGER DEFAULT 32
)
RETURNS TABLE(
  cache_key TEXT,
  product_name TEXT,
  brand TEXT,
  gtin TEXT,
  product_line TEXT,
  flavor TEXT,
  life_stage TEXT,
  food_form TEXT,
  package_size TEXT,
  pet_type TEXT,
  ingredient_count INTEGER,
  source TEXT,
  source_quality TEXT,
  ingredient_verification_status TEXT,
  image_verification_status TEXT,
  verified_at TIMESTAMPTZ,
  image_url TEXT,
  source_url TEXT,
  rank REAL
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $function$
  WITH settings AS MATERIALIZED (
    SELECT LEAST(GREATEST(COALESCE($2, 32), 1), 32) AS safe_limit
  ),
  normalized_queries AS MATERIALIZED (
    SELECT DISTINCT ON (
      public.normalize_verified_product_search_query(candidate.query)
    )
      public.normalize_verified_product_search_query(candidate.query)
        AS normalized_query,
      candidate.position
    FROM unnest(COALESCE($1, ARRAY[]::TEXT[]))
      WITH ORDINALITY AS candidate(query, position)
    WHERE candidate.position <= 4
      AND length(trim(COALESCE(candidate.query, ''))) BETWEEN 2 AND 160
    ORDER BY
      public.normalize_verified_product_search_query(candidate.query),
      candidate.position
  ),
  clean_queries AS MATERIALIZED (
    SELECT
      normalized.normalized_query,
      normalized.position,
      plainto_tsquery(
        'simple',
        COALESCE(
          NULLIF((
            SELECT string_agg(token, ' ' ORDER BY token_position)
            FROM unnest(regexp_split_to_array(
              normalized.normalized_query,
              '\s+'
            )) WITH ORDINALITY AS parsed(token, token_position)
            WHERE length(token) >= 2
              AND token NOT IN (
                'bag', 'balanced', 'complete', 'food', 'foods', 'for',
                'helps', 'label', 'made', 'natural', 'nutrition', 'pound',
                'pounds', 'recommended', 'the', 'veterinarian', 'weight',
                'years'
              )
          ), ''),
          normalized.normalized_query
        )
      ) AS text_query
    FROM normalized_queries normalized
    WHERE length(normalized.normalized_query) >= 2
  ),
  candidate_keys AS MATERIALIZED (
    SELECT
      matched.cache_key,
      query.position,
      matched.candidate_rank
    FROM clean_queries query
    CROSS JOIN LATERAL (
      SELECT
        product.cache_key,
        (
          ts_rank_cd(product.search_document, query.text_query) * 6.0
          + CASE
              WHEN strpos(
                query.normalized_query,
                public.normalize_verified_product_search_query(product.brand)
              ) > 0 THEN 3.0
              ELSE 0.0
            END
        )::REAL AS candidate_rank
      FROM public.product_data product
      WHERE product.search_document @@ query.text_query
        AND product.expires_at > statement_timestamp()
        AND product.ingredient_count >= 5
        AND product.is_complete_food = TRUE
        AND product.catalog_exclusion_reason IS NULL
        AND lower(COALESCE(product.pet_type, '')) IN ('dog', 'cat')
        AND COALESCE(NULLIF(trim(product.source_url), ''), '') <> ''
        AND product.source_quality IN (
          'gdsn', 'official', 'manufacturer', 'retailer_verified'
        )
        AND product.ingredient_verification_status IN (
          'gdsn', 'official', 'manufacturer', 'retailer_verified',
          'label_ocr_verified'
        )
        AND product.image_verification_status IN (
          'official', 'manufacturer', 'retailer_verified'
        )
        AND product.image_url IS NOT NULL
        AND product.image_url !~* '^data:'
      ORDER BY candidate_rank DESC, product.verified_at DESC NULLS LAST
      LIMIT 12
    ) matched
  ),
  deduplicated AS MATERIALIZED (
    SELECT
      candidate.cache_key,
      candidate.position,
      candidate.candidate_rank,
      row_number() OVER (
        PARTITION BY candidate.cache_key
        ORDER BY candidate.position, candidate.candidate_rank DESC
      ) AS product_match_number
    FROM candidate_keys candidate
  )
  SELECT
    product.cache_key,
    product.product_name,
    product.brand,
    NULLIF(trim(product.gtin), '') AS gtin,
    NULLIF(trim(product.product_line), '') AS product_line,
    NULLIF(trim(product.flavor), '') AS flavor,
    NULLIF(trim(product.life_stage), '') AS life_stage,
    NULLIF(trim(product.food_form), '') AS food_form,
    NULLIF(trim(product.package_size), '') AS package_size,
    COALESCE(product.pet_type, 'unknown') AS pet_type,
    product.ingredient_count,
    product.source,
    COALESCE(product.source_quality, 'unknown') AS source_quality,
    COALESCE(product.ingredient_verification_status, 'unverified')
      AS ingredient_verification_status,
    COALESCE(product.image_verification_status, 'unverified')
      AS image_verification_status,
    product.verified_at,
    product.image_url,
    product.source_url,
    deduplicated.candidate_rank AS rank
  FROM deduplicated
  JOIN public.product_data product
    ON product.cache_key = deduplicated.cache_key
  WHERE deduplicated.product_match_number = 1
  ORDER BY
    deduplicated.position,
    deduplicated.candidate_rank DESC,
    product.ingredient_count DESC,
    product.verified_at DESC NULLS LAST
  LIMIT (SELECT safe_limit FROM settings);
$function$;

REVOKE ALL ON FUNCTION
  public.search_verified_product_identities_for_label(TEXT[], INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.search_verified_product_identities_for_label(TEXT[], INTEGER)
  TO authenticated, service_role;

-- The parent budget must include native OCR, the identity RPC, and final
-- reconciliation. It must therefore be greater than either child timeout.
UPDATE public.app_runtime_config
SET
  config = jsonb_set(
    jsonb_set(config, '{reconciliation_timeout_ms}', '9500'::JSONB, TRUE),
    '{auto_open_enabled}',
    'true'::JSONB,
    TRUE
  ),
  updated_at = statement_timestamp()
WHERE config_key = 'label_resolution';

-- Treat label-resolution timeouts as scan failures. The original KPI only
-- included barcode and downstream analysis failures, so the affected scans
-- were invisible even though the client emitted telemetry for them.
CREATE OR REPLACE VIEW public.kpi_scan_failures_daily
WITH (security_invoker = true)
AS
WITH failure_events AS (
  SELECT
    created_at,
    user_id,
    session_id,
    properties,
    CASE
      WHEN name LIKE 'label_lookup_%'
        THEN COALESCE(NULLIF(properties->>'scan_mode', ''), 'label_lookup')
      ELSE COALESCE(NULLIF(properties->>'scan_mode', ''), 'unknown')
    END AS scan_mode,
    CASE
      WHEN name = 'label_lookup_completed'
        THEN 'resolver_timeout'
      WHEN name = 'label_lookup_failed'
        THEN COALESCE(
          NULLIF(properties->>'failure_category', ''),
          CASE
            WHEN properties->>'error_code' ILIKE '%timeout%'
              THEN 'resolver_timeout'
            ELSE 'resolver_error'
          END
        )
      ELSE COALESCE(NULLIF(properties->>'failure_category', ''), 'unknown')
    END AS failure_category
  FROM public.analytics_events
  WHERE name IN (
    'scan_analysis_failed',
    'scan_analysis_timeout',
    'barcode_not_found',
    'label_lookup_failed',
    'label_lookup_completed'
  )
    AND (
      name <> 'label_lookup_completed'
      OR properties->>'timed_out' = 'true'
      OR properties->>'resolver_status' = 'timed_out'
    )
)
SELECT
  date_trunc('day', created_at)::date AS metric_date,
  scan_mode,
  failure_category,
  COALESCE(NULLIF(properties->>'error_code', ''), 'none') AS error_code,
  COALESCE(NULLIF(properties->>'http_status', ''), 'none') AS http_status,
  COALESCE(NULLIF(properties->>'app_version', ''), 'unknown') AS app_version,
  COUNT(*)::integer AS failure_events,
  COUNT(DISTINCT user_id)::integer AS users_impacted,
  COUNT(DISTINCT session_id)::integer AS sessions_impacted,
  COUNT(*) FILTER (
    WHERE properties->>'scan_usage_reversed' = 'true'
  )::integer AS reversed_scan_failures,
  COUNT(*) FILTER (
    WHERE properties->>'entitlement_recovery_attempted' = 'true'
  )::integer AS entitlement_recovery_attempts
FROM failure_events
GROUP BY 1, 2, 3, 4, 5, 6;

REVOKE ALL ON TABLE public.kpi_scan_failures_daily
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.kpi_scan_failures_daily TO service_role;
