-- Speed up product catalog search for the scanner/search experience.
-- This keeps the existing search_products(text, integer) RPC contract intact.

ALTER TABLE public.product_data
  ADD COLUMN IF NOT EXISTS search_document tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(product_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(brand, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(ingredient_text, '')), 'D')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_product_data_search_document
  ON public.product_data
  USING gin (search_document);

CREATE INDEX IF NOT EXISTS idx_product_data_catalog_ready
  ON public.product_data (ingredient_count DESC, expires_at DESC)
  WHERE ingredient_count >= 5
    AND is_complete_food = TRUE
    AND catalog_exclusion_reason IS NULL;

CREATE OR REPLACE FUNCTION public.search_products(q TEXT, max_results INTEGER DEFAULT 10)
RETURNS TABLE (
  cache_key TEXT,
  product_name TEXT,
  brand TEXT,
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  needle TEXT := lower(trim(q));
  safe_limit INT := LEAST(GREATEST(COALESCE(max_results, 10), 1), 25);
  candidate_limit INT := LEAST(LEAST(GREATEST(COALESCE(max_results, 10), 1), 25) * 8, 160);
  ts_query TSQUERY;
BEGIN
  IF needle IS NULL OR length(needle) < 2 THEN
    RETURN;
  END IF;

  ts_query := websearch_to_tsquery('simple', needle);

  RETURN QUERY
  WITH fast_matched AS (
    SELECT
      pd.cache_key,
      pd.product_name,
      pd.brand,
      pd.source,
      CASE WHEN pd.image_url ILIKE 'data:%' THEN NULL ELSE pd.image_url END AS image_url,
      pd.ingredients,
      pd.nutritional_info,
      pd.nutrient_panel,
      pd.has_published_nutrients,
      pd.source_url,
      pd.ingredient_count,
      GREATEST(
        CASE WHEN lower(pd.product_name) = needle THEN 2.0 ELSE 0.0 END,
        CASE WHEN lower(COALESCE(pd.brand, '')) = needle THEN 1.6 ELSE 0.0 END,
        CASE WHEN lower(pd.product_name) LIKE needle || '%' THEN 1.4 ELSE 0.0 END,
        CASE WHEN lower(COALESCE(pd.brand, '')) LIKE needle || '%' THEN 1.2 ELSE 0.0 END,
        ts_rank_cd(pd.search_document, ts_query) * 1.4,
        similarity(lower(pd.product_name), needle),
        similarity(lower(COALESCE(pd.brand, '')), needle) * 0.8
      )::REAL AS rank
    FROM public.product_data pd
    WHERE pd.expires_at > NOW()
      AND pd.ingredient_count >= 5
      AND pd.is_complete_food = TRUE
      AND pd.catalog_exclusion_reason IS NULL
      AND NOT public.is_likely_non_product_catalog_row(pd.product_name, pd.brand)
      AND COALESCE(pd.ingredient_text, '') !~ '\\\\"'
      AND COALESCE(pd.ingredient_text, '') NOT ILIKE '%mailto:%'
      AND COALESCE(pd.ingredient_text, '') NOT ILIKE '%legalLinks%'
      AND COALESCE(pd.ingredient_text, '') NOT ILIKE '%reportAbuseLink%'
      AND COALESCE(pd.ingredient_text, '') NOT ILIKE '%siteSettings%'
      AND COALESCE(pd.ingredient_text, '') NOT ILIKE '%powered by%'
      AND COALESCE(pd.ingredient_text, '') !~ 'https?://'
      AND COALESCE(pd.ingredient_text, '') !~ '\\{[^}]{3,}\\":'
      AND COALESCE(pd.ingredient_text, '') !~ '\\}[\\,\\}]'
      AND LENGTH(COALESCE(pd.ingredient_text, '')) <= 5000
      AND (
        pd.search_document @@ ts_query
        OR lower(pd.product_name) LIKE needle || '%'
        OR lower(COALESCE(pd.brand, '')) LIKE needle || '%'
      )
    ORDER BY rank DESC, pd.ingredient_count DESC
    LIMIT candidate_limit
  ),
  fuzzy_matched AS (
    SELECT
      pd.cache_key,
      pd.product_name,
      pd.brand,
      pd.source,
      CASE WHEN pd.image_url ILIKE 'data:%' THEN NULL ELSE pd.image_url END AS image_url,
      pd.ingredients,
      pd.nutritional_info,
      pd.nutrient_panel,
      pd.has_published_nutrients,
      pd.source_url,
      pd.ingredient_count,
      GREATEST(
        CASE WHEN lower(pd.product_name) LIKE '%' || needle || '%' THEN 0.85 ELSE 0.0 END,
        CASE WHEN lower(COALESCE(pd.brand, '')) LIKE '%' || needle || '%' THEN 0.75 ELSE 0.0 END,
        similarity(lower(pd.product_name), needle),
        similarity(lower(COALESCE(pd.brand, '')), needle) * 0.8
      )::REAL AS rank
    FROM public.product_data pd
    WHERE (SELECT count(*) FROM fast_matched) < safe_limit
      AND pd.expires_at > NOW()
      AND pd.ingredient_count >= 5
      AND pd.is_complete_food = TRUE
      AND pd.catalog_exclusion_reason IS NULL
      AND NOT public.is_likely_non_product_catalog_row(pd.product_name, pd.brand)
      AND COALESCE(pd.ingredient_text, '') !~ '\\\\"'
      AND COALESCE(pd.ingredient_text, '') NOT ILIKE '%mailto:%'
      AND COALESCE(pd.ingredient_text, '') NOT ILIKE '%legalLinks%'
      AND COALESCE(pd.ingredient_text, '') NOT ILIKE '%reportAbuseLink%'
      AND COALESCE(pd.ingredient_text, '') NOT ILIKE '%siteSettings%'
      AND COALESCE(pd.ingredient_text, '') NOT ILIKE '%powered by%'
      AND COALESCE(pd.ingredient_text, '') !~ 'https?://'
      AND COALESCE(pd.ingredient_text, '') !~ '\\{[^}]{3,}\\":'
      AND COALESCE(pd.ingredient_text, '') !~ '\\}[\\,\\}]'
      AND LENGTH(COALESCE(pd.ingredient_text, '')) <= 5000
      AND (
        lower(pd.product_name) LIKE '%' || needle || '%'
        OR lower(COALESCE(pd.brand, '')) LIKE '%' || needle || '%'
        OR similarity(lower(pd.product_name), needle) > 0.18
        OR similarity(lower(COALESCE(pd.brand, '')), needle) > 0.18
      )
    ORDER BY rank DESC, pd.ingredient_count DESC
    LIMIT candidate_limit
  ),
  matched AS (
    SELECT DISTINCT ON (cache_key) *
    FROM (
      SELECT * FROM fast_matched
      UNION ALL
      SELECT * FROM fuzzy_matched
    ) combined
    ORDER BY cache_key, rank DESC, ingredient_count DESC
  ),
  sanitized AS (
    SELECT
      m.cache_key,
      m.product_name,
      m.brand,
      m.source,
      m.image_url,
      m.nutritional_info,
      m.nutrient_panel,
      m.has_published_nutrients,
      m.source_url,
      m.rank,
      ARRAY(
        SELECT trim(ingredient.value)
        FROM unnest(COALESCE(m.ingredients, ARRAY[]::TEXT[])) AS ingredient(value)
        WHERE public.is_plausible_product_ingredient(ingredient.value)
      ) AS clean_ingredients
    FROM matched m
  )
  SELECT
    s.cache_key,
    s.product_name,
    s.brand,
    COALESCE(array_length(s.clean_ingredients, 1), 0)::INT AS ingredient_count,
    s.source,
    s.image_url,
    s.clean_ingredients AS ingredients,
    array_to_string(s.clean_ingredients, ', ') AS ingredient_text,
    s.nutritional_info,
    s.nutrient_panel,
    COALESCE(s.has_published_nutrients, FALSE) AS has_published_nutrients,
    s.source_url,
    s.rank
  FROM sanitized s
  WHERE COALESCE(array_length(s.clean_ingredients, 1), 0) >= 5
  ORDER BY s.rank DESC, COALESCE(array_length(s.clean_ingredients, 1), 0) DESC
  LIMIT safe_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INTEGER) TO service_role;
