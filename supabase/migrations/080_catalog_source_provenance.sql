-- Track catalog provenance so release gates can distinguish searchable rows from
-- rows with verified ingredient and product-image data.

ALTER TABLE public.product_data
  ADD COLUMN IF NOT EXISTS source_quality TEXT DEFAULT 'unknown' NOT NULL,
  ADD COLUMN IF NOT EXISTS ingredient_verification_status TEXT DEFAULT 'unverified' NOT NULL,
  ADD COLUMN IF NOT EXISTS image_verification_status TEXT DEFAULT 'unverified' NOT NULL,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE public.product_data
  DROP CONSTRAINT IF EXISTS product_data_source_quality_check,
  DROP CONSTRAINT IF EXISTS product_data_ingredient_verification_status_check,
  DROP CONSTRAINT IF EXISTS product_data_image_verification_status_check;

UPDATE public.product_data
SET
  source_quality = CASE
    WHEN lower(COALESCE(source, '')) IN ('gdsn', 'gs1', 'gs1_us_data_hub') THEN 'gdsn'
    WHEN lower(COALESCE(source, '')) IN ('official', 'official_feed') THEN 'official'
    WHEN lower(COALESCE(source, '')) IN ('manufacturer', 'brand') THEN 'manufacturer'
    WHEN lower(COALESCE(source, '')) IN ('store_brand', 'web_verified') THEN 'retailer_verified'
    WHEN lower(COALESCE(source, '')) IN ('amazon') THEN 'retailer'
    WHEN lower(COALESCE(source, '')) IN ('opff', 'open_pet_food_facts', 'dfa') THEN 'community'
    WHEN lower(COALESCE(source, '')) IN ('user_ocr') THEN 'user_ocr'
    WHEN lower(COALESCE(source, '')) IN ('web') THEN 'scraped'
    ELSE 'unknown'
  END,
  ingredient_verification_status = CASE
    WHEN lower(COALESCE(source, '')) IN ('gdsn', 'gs1', 'gs1_us_data_hub') THEN 'gdsn'
    WHEN lower(COALESCE(source, '')) IN ('official', 'official_feed') THEN 'official'
    WHEN lower(COALESCE(source, '')) IN ('manufacturer', 'brand') THEN 'manufacturer'
    WHEN lower(COALESCE(source, '')) IN ('store_brand', 'web_verified') THEN 'retailer_verified'
    WHEN lower(COALESCE(source, '')) IN ('opff', 'open_pet_food_facts', 'dfa') THEN 'community'
    WHEN lower(COALESCE(source, '')) IN ('user_ocr') THEN 'ai_extracted'
    ELSE 'unverified'
  END,
  image_verification_status = CASE
    WHEN image_url IS NULL OR image_url ILIKE 'data:%' THEN 'unverified'
    WHEN lower(COALESCE(source, '')) IN ('gdsn', 'gs1', 'gs1_us_data_hub', 'official', 'official_feed') THEN 'official'
    WHEN lower(COALESCE(source, '')) IN ('manufacturer', 'brand') THEN 'manufacturer'
    WHEN lower(COALESCE(source, '')) IN ('store_brand', 'web_verified', 'amazon') THEN 'retailer_verified'
    WHEN lower(COALESCE(source, '')) IN ('opff', 'open_pet_food_facts', 'dfa') THEN 'community'
    WHEN lower(COALESCE(source, '')) IN ('user_ocr') THEN 'scan_preview'
    ELSE 'unverified'
  END,
  verified_at = CASE
    WHEN lower(COALESCE(source, '')) IN (
      'gdsn',
      'gs1',
      'gs1_us_data_hub',
      'official',
      'official_feed',
      'manufacturer',
      'brand',
      'store_brand',
      'web_verified'
    )
      THEN COALESCE(verified_at, scraped_at, updated_at, created_at, NOW())
    ELSE verified_at
  END
WHERE (
    source_quality IS NULL
    OR source_quality = 'unknown'
    OR ingredient_verification_status IS NULL
    OR image_verification_status IS NULL
  )
  AND ingredient_count >= 5
  AND is_complete_food = TRUE
  AND catalog_exclusion_reason IS NULL
  AND NOT public.is_likely_non_product_catalog_row(product_name, brand)
  AND (
    SELECT count(*)
    FROM unnest(COALESCE(ingredients, ARRAY[]::TEXT[])) AS ingredient(value)
    WHERE public.is_plausible_product_ingredient(ingredient.value)
  ) >= 5;

ALTER TABLE public.product_data
  ALTER COLUMN source_quality SET DEFAULT 'unknown',
  ALTER COLUMN source_quality SET NOT NULL,
  ALTER COLUMN ingredient_verification_status SET DEFAULT 'unverified',
  ALTER COLUMN ingredient_verification_status SET NOT NULL,
  ALTER COLUMN image_verification_status SET DEFAULT 'unverified',
  ALTER COLUMN image_verification_status SET NOT NULL;

ALTER TABLE public.product_data
  ADD CONSTRAINT product_data_source_quality_check
    CHECK (source_quality IN (
      'gdsn',
      'official',
      'manufacturer',
      'retailer_verified',
      'retailer',
      'community',
      'user_ocr',
      'ai_ocr',
      'scraped',
      'unknown'
    )),
  ADD CONSTRAINT product_data_ingredient_verification_status_check
    CHECK (ingredient_verification_status IN (
      'gdsn',
      'official',
      'manufacturer',
      'retailer_verified',
      'label_ocr_verified',
      'community',
      'ai_extracted',
      'unverified'
    )),
  ADD CONSTRAINT product_data_image_verification_status_check
    CHECK (image_verification_status IN (
      'official',
      'manufacturer',
      'retailer_verified',
      'community',
      'scan_preview',
      'unverified'
    ));

CREATE INDEX IF NOT EXISTS idx_product_data_verified_catalog_ready
  ON public.product_data (
    ingredient_verification_status,
    image_verification_status,
    pet_type,
    ingredient_count DESC,
    expires_at DESC
  )
  WHERE ingredient_count >= 5
    AND is_complete_food = TRUE
    AND catalog_exclusion_reason IS NULL;

DROP FUNCTION IF EXISTS public.search_products(TEXT, INTEGER);

CREATE FUNCTION public.search_products(q TEXT, max_results INTEGER DEFAULT 10)
RETURNS TABLE (
  cache_key TEXT,
  product_name TEXT,
  brand TEXT,
  pet_type TEXT,
  ingredient_count INTEGER,
  source TEXT,
  source_quality TEXT,
  ingredient_verification_status TEXT,
  image_verification_status TEXT,
  verified_at TIMESTAMPTZ,
  image_url TEXT,
  ingredients TEXT[],
  ingredient_text TEXT,
  nutritional_info JSONB,
  nutrient_panel JSONB,
  has_published_nutrients BOOLEAN,
  source_url TEXT,
  rank REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input AS (
    SELECT
      NULLIF(trim(regexp_replace(lower(trim(q)), '[^a-z0-9]+', ' ', 'g')), '') AS normalized,
      LEAST(GREATEST(COALESCE(max_results, 10), 1), 25) AS safe_limit,
      LEAST(LEAST(GREATEST(COALESCE(max_results, 10), 1), 25) * 8, 160) AS candidate_limit
  ),
  query AS (
    SELECT
      normalized,
      safe_limit,
      candidate_limit,
      CASE
        WHEN length(normalized) >= 2 THEN
          to_tsquery('simple', regexp_replace(normalized, '[[:space:]]+', ':* & ', 'g') || ':*')
        ELSE NULL
      END AS ts_query
    FROM input
  ),
  ready AS (
    SELECT
      pd.cache_key,
      pd.product_name,
      pd.brand,
      COALESCE(pd.pet_type, 'unknown') AS pet_type,
      pd.ingredient_count,
      pd.source,
      COALESCE(pd.source_quality, 'unknown') AS source_quality,
      COALESCE(pd.ingredient_verification_status, 'unverified') AS ingredient_verification_status,
      COALESCE(pd.image_verification_status, 'unverified') AS image_verification_status,
      pd.verified_at,
      CASE WHEN pd.image_url ILIKE 'data:%' THEN NULL ELSE pd.image_url END AS image_url,
      pd.ingredients,
      COALESCE(NULLIF(pd.ingredient_text, ''), array_to_string(pd.ingredients, ', ')) AS ingredient_text,
      pd.nutritional_info,
      pd.nutrient_panel,
      COALESCE(pd.has_published_nutrients, FALSE) AS has_published_nutrients,
      pd.source_url,
      pd.search_document,
      lower(pd.product_name) AS product_name_lc,
      lower(COALESCE(pd.brand, '')) AS brand_lc,
      CASE
        WHEN pd.ingredient_verification_status IN ('gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified') THEN 0.08
        WHEN pd.ingredient_verification_status = 'community' THEN 0.02
        ELSE 0.0
      END AS verified_rank_bonus
    FROM public.product_data pd
    WHERE pd.expires_at > NOW()
      AND pd.ingredient_count >= 5
      AND pd.is_complete_food = TRUE
      AND pd.catalog_exclusion_reason IS NULL
  ),
  strict_matched AS (
    SELECT
      r.cache_key,
      r.product_name,
      r.brand,
      r.pet_type,
      r.ingredient_count,
      r.source,
      r.source_quality,
      r.ingredient_verification_status,
      r.image_verification_status,
      r.verified_at,
      r.image_url,
      r.ingredients,
      r.ingredient_text,
      r.nutritional_info,
      r.nutrient_panel,
      r.has_published_nutrients,
      r.source_url,
      (1.0 + GREATEST(
        CASE WHEN r.product_name_lc = query.normalized THEN 2.0 ELSE 0.0 END,
        CASE WHEN r.brand_lc = query.normalized THEN 1.6 ELSE 0.0 END,
        CASE WHEN r.product_name_lc LIKE query.normalized || '%' THEN 1.4 ELSE 0.0 END,
        CASE WHEN r.brand_lc LIKE query.normalized || '%' THEN 1.2 ELSE 0.0 END,
        ts_rank_cd(r.search_document, query.ts_query) * 1.4
      ) + r.verified_rank_bonus)::REAL AS rank
    FROM ready r
    CROSS JOIN query
    WHERE query.ts_query IS NOT NULL
      AND r.search_document @@ query.ts_query
    ORDER BY rank DESC, r.ingredient_count DESC
    LIMIT (SELECT candidate_limit FROM query)
  ),
  fuzzy_matched AS (
    SELECT
      r.cache_key,
      r.product_name,
      r.brand,
      r.pet_type,
      r.ingredient_count,
      r.source,
      r.source_quality,
      r.ingredient_verification_status,
      r.image_verification_status,
      r.verified_at,
      r.image_url,
      r.ingredients,
      r.ingredient_text,
      r.nutritional_info,
      r.nutrient_panel,
      r.has_published_nutrients,
      r.source_url,
      (GREATEST(
        CASE WHEN r.product_name_lc LIKE '%' || query.normalized || '%' THEN 0.9 ELSE 0.0 END,
        CASE WHEN r.brand_lc LIKE query.normalized || '%' THEN 0.82 ELSE 0.0 END,
        similarity(r.product_name_lc, query.normalized) * 0.95,
        similarity(r.brand_lc, query.normalized) * 0.8,
        word_similarity(query.normalized, r.brand_lc || ' ' || r.product_name_lc) * 0.72
      ) + r.verified_rank_bonus)::REAL AS rank
    FROM ready r
    CROSS JOIN query
    WHERE query.normalized IS NOT NULL
      AND (SELECT count(*) FROM strict_matched) < query.safe_limit
      AND (
        r.product_name_lc LIKE '%' || query.normalized || '%'
        OR r.brand_lc LIKE query.normalized || '%'
        OR similarity(r.product_name_lc, query.normalized) > 0.24
        OR similarity(r.brand_lc, query.normalized) > 0.28
        OR word_similarity(query.normalized, r.brand_lc || ' ' || r.product_name_lc) > 0.54
      )
    ORDER BY rank DESC, r.ingredient_count DESC
    LIMIT (SELECT candidate_limit FROM query)
  ),
  matched AS (
    SELECT DISTINCT ON (cache_key) *
    FROM (
      SELECT * FROM strict_matched
      UNION ALL
      SELECT * FROM fuzzy_matched
    ) combined
    ORDER BY cache_key, rank DESC, ingredient_count DESC
  )
  SELECT
    m.cache_key,
    m.product_name,
    m.brand,
    m.pet_type,
    m.ingredient_count,
    m.source,
    m.source_quality,
    m.ingredient_verification_status,
    m.image_verification_status,
    m.verified_at,
    m.image_url,
    m.ingredients,
    m.ingredient_text,
    m.nutritional_info,
    m.nutrient_panel,
    m.has_published_nutrients,
    m.source_url,
    m.rank
  FROM matched m
  ORDER BY m.rank DESC, m.ingredient_count DESC
  LIMIT (SELECT safe_limit FROM query);
$$;

REVOKE ALL ON FUNCTION public.search_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INTEGER) TO service_role;
