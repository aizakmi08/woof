-- Deduplicate acquisition rows before upsert so brand/product/lookup signals
-- can overlap without causing a double-update conflict.

CREATE OR REPLACE FUNCTION public.refresh_catalog_acquisition_queue(
  p_days INTEGER DEFAULT 30,
  p_limit INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_started_at TIMESTAMPTZ := now();
  v_days INTEGER := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 500), 10), 5000);
  v_upserted_rows INTEGER := 0;
BEGIN
  WITH ready AS (
    SELECT
      cache_key,
      product_name,
      COALESCE(NULLIF(trim(brand), ''), '[unknown brand]') AS brand,
      source AS product_source,
      source_quality,
      source_url,
      COALESCE(pet_type, 'unknown') AS pet_type,
      image_url,
      ingredient_verification_status,
      image_verification_status
    FROM public.product_data
    WHERE expires_at > v_started_at
      AND ingredient_count >= 5
      AND is_complete_food = TRUE
      AND catalog_exclusion_reason IS NULL
  ),
  classified AS (
    SELECT
      *,
      CASE
        WHEN pet_type IN ('dog', 'cat') THEN pet_type
        WHEN lower(concat_ws(' ', product_name, brand)) ~ '\m(dog|puppy|canine)\M' THEN 'dog'
        WHEN lower(concat_ws(' ', product_name, brand)) ~ '\m(cat|kitten|feline)\M' THEN 'cat'
        ELSE 'unknown'
      END AS inferred_pet_type,
      ingredient_verification_status IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified',
        'label_ocr_verified'
      ) AS has_verified_ingredients,
      image_url IS NOT NULL
        AND image_url !~* '^data:'
        AND image_verification_status IN (
          'official',
          'manufacturer',
          'retailer_verified',
          'scan_preview'
        ) AS has_verified_image
    FROM ready
  ),
  brand_gaps AS (
    SELECT
      'brand:' || md5(lower(brand)) AS gap_key,
      'brand'::TEXT AS gap_type,
      brand,
      NULL::TEXT AS product_name,
      NULL::TEXT AS cache_key,
      NULL::TEXT AS normalized_query,
      NULL::TEXT AS pet_type,
      NULL::TEXT AS product_source,
      NULL::TEXT AS source_quality,
      NULL::TEXT AS source_url,
      FALSE AS needs_product_record,
      count(*) FILTER (WHERE NOT has_verified_ingredients) > 0 AS needs_verified_ingredients,
      count(*) FILTER (WHERE NOT has_verified_image) > 0 AS needs_verified_image,
      count(*) FILTER (WHERE inferred_pet_type = 'unknown') > 0 AS needs_pet_type,
      count(*)::INTEGER AS ready_rows,
      count(*) FILTER (
        WHERE NOT has_verified_ingredients
           OR NOT has_verified_image
           OR inferred_pet_type = 'unknown'
      )::INTEGER AS affected_product_count,
      0::INTEGER AS demand_events,
      NULL::TIMESTAMPTZ AS last_event_at,
      (
        count(*) FILTER (WHERE NOT has_verified_ingredients) * 5
        + count(*) FILTER (WHERE NOT has_verified_image) * 2
        + count(*) FILTER (WHERE inferred_pet_type = 'unknown') * 2
        + count(*)
      )::INTEGER AS priority_score,
      jsonb_build_object(
        'sources', COALESCE(jsonb_agg(DISTINCT product_source) FILTER (WHERE product_source IS NOT NULL), '[]'::jsonb),
        'missing_image_count', count(*) FILTER (WHERE image_url IS NULL OR image_url ~* '^data:'),
        'unknown_pet_type_count', count(*) FILTER (WHERE inferred_pet_type = 'unknown')
      ) AS sample_metadata
    FROM classified
    GROUP BY brand
    HAVING count(*) FILTER (
      WHERE NOT has_verified_ingredients
         OR NOT has_verified_image
         OR inferred_pet_type = 'unknown'
    ) > 0
    ORDER BY priority_score DESC, ready_rows DESC
    LIMIT v_limit
  ),
  product_gaps AS (
    SELECT
      'product:' || cache_key AS gap_key,
      'product'::TEXT AS gap_type,
      brand,
      product_name,
      cache_key,
      NULL::TEXT AS normalized_query,
      inferred_pet_type AS pet_type,
      product_source,
      source_quality,
      source_url,
      FALSE AS needs_product_record,
      NOT has_verified_ingredients AS needs_verified_ingredients,
      NOT has_verified_image AS needs_verified_image,
      inferred_pet_type = 'unknown' AS needs_pet_type,
      1::INTEGER AS ready_rows,
      1::INTEGER AS affected_product_count,
      0::INTEGER AS demand_events,
      NULL::TIMESTAMPTZ AS last_event_at,
      (
        CASE WHEN NOT has_verified_ingredients THEN 5 ELSE 0 END
        + CASE WHEN NOT has_verified_image THEN 2 ELSE 0 END
        + CASE WHEN inferred_pet_type = 'unknown' THEN 2 ELSE 0 END
      )::INTEGER AS priority_score,
      jsonb_build_object(
        'ingredient_verification_status', ingredient_verification_status,
        'image_verification_status', image_verification_status,
        'has_image', image_url IS NOT NULL AND image_url !~* '^data:'
      ) AS sample_metadata
    FROM classified
    WHERE NOT has_verified_ingredients
       OR NOT has_verified_image
       OR inferred_pet_type = 'unknown'
    ORDER BY priority_score DESC, brand, product_name
    LIMIT v_limit
  ),
  lookup_gaps AS (
    SELECT
      'lookup:' || md5(COALESCE(NULLIF(trim(metadata->>'normalized_query'), ''), '[blank]')) AS gap_key,
      'lookup'::TEXT AS gap_type,
      NULLIF(max(metadata->>'top_brand'), '') AS brand,
      NULLIF(max(metadata->>'top_product_name'), '') AS product_name,
      NULLIF(max(metadata->>'top_cache_key'), '') AS cache_key,
      COALESCE(NULLIF(trim(metadata->>'normalized_query'), ''), '[blank]') AS normalized_query,
      NULLIF(max(metadata->>'top_pet_type'), '') AS pet_type,
      NULLIF(max(metadata->>'top_source'), '') AS product_source,
      NULLIF(max(metadata->>'top_source_quality'), '') AS source_quality,
      NULL::TEXT AS source_url,
      bool_or(
        event_name IN ('catalog_lookup_miss', 'catalog_lookup_failed')
        AND COALESCE((metadata->>'result_count')::INTEGER, 0) = 0
      ) AS needs_product_record,
      bool_or(COALESCE((metadata->>'needs_verified_ingredient_count')::INTEGER, 0) > 0) AS needs_verified_ingredients,
      bool_or(COALESCE((metadata->>'needs_verified_image_count')::INTEGER, 0) > 0) AS needs_verified_image,
      bool_or(COALESCE((metadata->>'unknown_pet_type_count')::INTEGER, 0) > 0) AS needs_pet_type,
      0::INTEGER AS ready_rows,
      max(COALESCE((metadata->>'product_gap_count')::INTEGER, 0))::INTEGER AS affected_product_count,
      count(*)::INTEGER AS demand_events,
      max(created_at) AS last_event_at,
      (
        count(*) * 10
        + max(COALESCE((metadata->>'needs_verified_ingredient_count')::INTEGER, 0)) * 5
        + max(COALESCE((metadata->>'needs_verified_image_count')::INTEGER, 0)) * 3
        + max(COALESCE((metadata->>'unknown_pet_type_count')::INTEGER, 0)) * 2
        + CASE
          WHEN bool_or(
            event_name IN ('catalog_lookup_miss', 'catalog_lookup_failed')
            AND COALESCE((metadata->>'result_count')::INTEGER, 0) = 0
          ) THEN 20
          ELSE 0
        END
      )::INTEGER AS priority_score,
      jsonb_build_object(
        'sample_reason', max(COALESCE(metadata->>'verification_gap_reasons', metadata->>'miss_reason')),
        'max_result_count', max(COALESCE((metadata->>'result_count')::INTEGER, 0)),
        'max_image_result_count', max(COALESCE((metadata->>'image_result_count')::INTEGER, 0)),
        'max_product_gap_count', max(COALESCE((metadata->>'product_gap_count')::INTEGER, 0))
      ) AS sample_metadata
    FROM public.product_events
    WHERE created_at >= v_started_at - (v_days * INTERVAL '1 day')
      AND event_name IN (
        'catalog_lookup_miss',
        'catalog_lookup_failed',
        'catalog_lookup_completed',
        'catalog_verification_gap'
      )
    GROUP BY COALESCE(NULLIF(trim(metadata->>'normalized_query'), ''), '[blank]')
    HAVING count(*) FILTER (
      WHERE event_name = 'catalog_verification_gap'
         OR event_name <> 'catalog_lookup_completed'
         OR COALESCE((metadata->>'image_result_count')::INTEGER, 0) = 0
         OR COALESCE((metadata->>'product_gap_count')::INTEGER, 0) > 0
    ) > 0
    ORDER BY priority_score DESC, last_event_at DESC
    LIMIT v_limit
  ),
  queue_rows AS (
    SELECT * FROM brand_gaps
    UNION ALL
    SELECT * FROM product_gaps
    UNION ALL
    SELECT * FROM lookup_gaps
  ),
  deduped_queue_rows AS (
    SELECT DISTINCT ON (gap_key) *
    FROM queue_rows
    ORDER BY gap_key, priority_score DESC, demand_events DESC, affected_product_count DESC
  )
  INSERT INTO public.catalog_acquisition_queue (
    gap_key,
    gap_type,
    brand,
    product_name,
    cache_key,
    normalized_query,
    pet_type,
    product_source,
    source_quality,
    source_url,
    needs_product_record,
    needs_verified_ingredients,
    needs_verified_image,
    needs_pet_type,
    ready_rows,
    affected_product_count,
    demand_events,
    last_event_at,
    priority_score,
    sample_metadata,
    last_refreshed_at,
    updated_at
  )
  SELECT
    gap_key,
    gap_type,
    brand,
    product_name,
    cache_key,
    normalized_query,
    pet_type,
    product_source,
    source_quality,
    source_url,
    needs_product_record,
    needs_verified_ingredients,
    needs_verified_image,
    needs_pet_type,
    ready_rows,
    affected_product_count,
    demand_events,
    last_event_at,
    priority_score,
    sample_metadata,
    v_started_at,
    v_started_at
  FROM deduped_queue_rows
  ON CONFLICT (gap_key) DO UPDATE
  SET
    updated_at = v_started_at,
    last_refreshed_at = v_started_at,
    last_event_at = EXCLUDED.last_event_at,
    status = CASE
      WHEN public.catalog_acquisition_queue.status IN ('resolved', 'imported') THEN 'open'
      ELSE public.catalog_acquisition_queue.status
    END,
    priority_score = EXCLUDED.priority_score,
    brand = EXCLUDED.brand,
    product_name = EXCLUDED.product_name,
    cache_key = EXCLUDED.cache_key,
    normalized_query = EXCLUDED.normalized_query,
    pet_type = EXCLUDED.pet_type,
    product_source = EXCLUDED.product_source,
    source_quality = EXCLUDED.source_quality,
    source_url = EXCLUDED.source_url,
    needs_product_record = EXCLUDED.needs_product_record,
    needs_verified_ingredients = EXCLUDED.needs_verified_ingredients,
    needs_verified_image = EXCLUDED.needs_verified_image,
    needs_pet_type = EXCLUDED.needs_pet_type,
    ready_rows = EXCLUDED.ready_rows,
    affected_product_count = EXCLUDED.affected_product_count,
    demand_events = EXCLUDED.demand_events,
    sample_metadata = EXCLUDED.sample_metadata;

  GET DIAGNOSTICS v_upserted_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'upserted_rows', v_upserted_rows,
    'days', v_days,
    'limit', v_limit,
    'refreshed_at', v_started_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_catalog_acquisition_queue(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_catalog_acquisition_queue(INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.refresh_catalog_acquisition_queue(INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_catalog_acquisition_queue(INTEGER, INTEGER) TO service_role;
