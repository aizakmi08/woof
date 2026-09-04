-- Make product search tolerant of common aisle typos and OCR drift while
-- preserving the fast indexed full-text path for exact/prefix matches.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE INDEX IF NOT EXISTS idx_product_data_product_name_trgm
  ON public.product_data
  USING gin (lower(product_name) gin_trgm_ops)
  WHERE ingredient_count >= 5
    AND is_complete_food = TRUE
    AND catalog_exclusion_reason IS NULL;

CREATE INDEX IF NOT EXISTS idx_product_data_brand_trgm
  ON public.product_data
  USING gin (lower(COALESCE(brand, '')) gin_trgm_ops)
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
      CASE WHEN pd.image_url ILIKE 'data:%' THEN NULL ELSE pd.image_url END AS image_url,
      pd.ingredients,
      COALESCE(NULLIF(pd.ingredient_text, ''), array_to_string(pd.ingredients, ', ')) AS ingredient_text,
      pd.nutritional_info,
      pd.nutrient_panel,
      COALESCE(pd.has_published_nutrients, FALSE) AS has_published_nutrients,
      pd.source_url,
      pd.search_document,
      lower(pd.product_name) AS product_name_lc,
      lower(COALESCE(pd.brand, '')) AS brand_lc
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
      ))::REAL AS rank
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
      r.image_url,
      r.ingredients,
      r.ingredient_text,
      r.nutritional_info,
      r.nutrient_panel,
      r.has_published_nutrients,
      r.source_url,
      GREATEST(
        CASE WHEN r.product_name_lc LIKE '%' || query.normalized || '%' THEN 0.9 ELSE 0.0 END,
        CASE WHEN r.brand_lc LIKE query.normalized || '%' THEN 0.82 ELSE 0.0 END,
        similarity(r.product_name_lc, query.normalized) * 0.95,
        similarity(r.brand_lc, query.normalized) * 0.8,
        word_similarity(query.normalized, r.brand_lc || ' ' || r.product_name_lc) * 0.72
      )::REAL AS rank
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
