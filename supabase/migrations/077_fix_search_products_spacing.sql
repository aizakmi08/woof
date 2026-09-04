-- Fix multi-word catalog search after adding pet_type to search_products.

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
      LEAST(GREATEST(COALESCE(max_results, 10), 1), 25) AS safe_limit
  ),
  query AS (
    SELECT
      normalized,
      safe_limit,
      CASE
        WHEN length(normalized) >= 2 THEN
          to_tsquery('simple', regexp_replace(normalized, '[[:space:]]+', ':* & ', 'g') || ':*')
        ELSE NULL
      END AS ts_query
    FROM input
  )
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
    GREATEST(
      CASE WHEN lower(pd.product_name) = query.normalized THEN 2.0 ELSE 0.0 END,
      CASE WHEN lower(COALESCE(pd.brand, '')) = query.normalized THEN 1.6 ELSE 0.0 END,
      CASE WHEN lower(pd.product_name) LIKE query.normalized || '%' THEN 1.4 ELSE 0.0 END,
      CASE WHEN lower(COALESCE(pd.brand, '')) LIKE query.normalized || '%' THEN 1.2 ELSE 0.0 END,
      ts_rank_cd(pd.search_document, query.ts_query) * 1.4
    )::REAL AS rank
  FROM public.product_data pd
  CROSS JOIN query
  WHERE query.ts_query IS NOT NULL
    AND pd.expires_at > NOW()
    AND pd.ingredient_count >= 5
    AND pd.is_complete_food = TRUE
    AND pd.catalog_exclusion_reason IS NULL
    AND pd.search_document @@ query.ts_query
  ORDER BY rank DESC, pd.ingredient_count DESC
  LIMIT (SELECT safe_limit FROM query);
$$;

REVOKE ALL ON FUNCTION public.search_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INTEGER) TO service_role;
