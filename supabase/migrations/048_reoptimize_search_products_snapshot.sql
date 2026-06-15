-- Keep search_products fast after adding catalog snapshots. The previous
-- snapshot RPC cleaned ingredient arrays before query ranking, which could scan
-- and unnest too many product_data rows on a large catalog.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_product_data_name_lower_trgm
  ON public.product_data USING gin (LOWER(product_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_product_data_brand_lower_trgm
  ON public.product_data USING gin (LOWER(brand) gin_trgm_ops)
  WHERE brand IS NOT NULL;

DROP FUNCTION IF EXISTS public.search_products(TEXT, INT);

CREATE OR REPLACE FUNCTION public.search_products(q TEXT, max_results INT DEFAULT 10)
RETURNS TABLE (
  cache_key TEXT,
  product_name TEXT,
  brand TEXT,
  ingredient_count INT,
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
  candidate_limit INT := LEAST(LEAST(GREATEST(COALESCE(max_results, 10), 1), 25) * 12, 240);
BEGIN
  IF needle IS NULL OR length(needle) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH matched AS (
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
        CASE WHEN lower(pd.product_name) LIKE '%' || needle || '%' THEN 1.0 ELSE 0.0 END,
        CASE WHEN lower(COALESCE(pd.brand, '')) LIKE '%' || needle || '%' THEN 0.9 ELSE 0.0 END,
        similarity(lower(pd.product_name), needle),
        similarity(lower(COALESCE(pd.brand, '')), needle) * 0.8
      )::REAL AS rank
    FROM public.product_data pd
    WHERE pd.expires_at > NOW()
      AND pd.ingredient_count >= 5
      AND NOT public.is_likely_non_product_catalog_row(pd.product_name, pd.brand)
      AND COALESCE(pd.ingredient_text, '') !~ '\\"'
      AND COALESCE(pd.ingredient_text, '') NOT ILIKE '%mailto:%'
      AND COALESCE(pd.ingredient_text, '') NOT ILIKE '%legalLinks%'
      AND COALESCE(pd.ingredient_text, '') NOT ILIKE '%reportAbuseLink%'
      AND COALESCE(pd.ingredient_text, '') NOT ILIKE '%siteSettings%'
      AND COALESCE(pd.ingredient_text, '') NOT ILIKE '%powered by%'
      AND COALESCE(pd.ingredient_text, '') !~ 'https?://'
      AND COALESCE(pd.ingredient_text, '') !~ '\{[^}]{3,}":'
      AND COALESCE(pd.ingredient_text, '') !~ '\}[\,\}]'
      AND LENGTH(COALESCE(pd.ingredient_text, '')) <= 5000
      AND (
        lower(pd.product_name) LIKE '%' || needle || '%'
        OR lower(COALESCE(pd.brand, '')) LIKE '%' || needle || '%'
        OR similarity(lower(pd.product_name), needle) > 0.15
        OR similarity(lower(COALESCE(pd.brand, '')), needle) > 0.15
      )
    ORDER BY rank DESC, pd.ingredient_count DESC
    LIMIT candidate_limit
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

REVOKE ALL ON FUNCTION public.search_products(TEXT, INT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INT)
  TO anon, authenticated;

ANALYZE public.product_data;

NOTIFY pgrst, 'reload schema';
