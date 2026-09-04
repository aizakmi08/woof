-- Keep product search fast by returning catalog candidates directly.
-- Deeper ingredient cleanup happens when the selected product is analyzed.

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
  WITH fts AS (
    SELECT
      pd.cache_key,
      pd.product_name,
      pd.brand,
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
        CASE WHEN lower(pd.product_name) = needle THEN 2.0 ELSE 0.0 END,
        CASE WHEN lower(COALESCE(pd.brand, '')) = needle THEN 1.6 ELSE 0.0 END,
        CASE WHEN lower(pd.product_name) LIKE needle || '%' THEN 1.4 ELSE 0.0 END,
        CASE WHEN lower(COALESCE(pd.brand, '')) LIKE needle || '%' THEN 1.2 ELSE 0.0 END,
        ts_rank_cd(pd.search_document, ts_query) * 1.4
      )::REAL AS rank
    FROM public.product_data pd
    WHERE pd.expires_at > NOW()
      AND pd.ingredient_count >= 5
      AND pd.is_complete_food = TRUE
      AND pd.catalog_exclusion_reason IS NULL
      AND (
        pd.search_document @@ ts_query
        OR lower(pd.product_name) LIKE needle || '%'
        OR lower(COALESCE(pd.brand, '')) LIKE needle || '%'
      )
    ORDER BY rank DESC, pd.ingredient_count DESC
    LIMIT candidate_limit
  ),
  fuzzy AS (
    SELECT
      pd.cache_key,
      pd.product_name,
      pd.brand,
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
        CASE WHEN lower(pd.product_name) LIKE '%' || needle || '%' THEN 0.85 ELSE 0.0 END,
        CASE WHEN lower(COALESCE(pd.brand, '')) LIKE '%' || needle || '%' THEN 0.75 ELSE 0.0 END,
        similarity(lower(pd.product_name), needle),
        similarity(lower(COALESCE(pd.brand, '')), needle) * 0.8
      )::REAL AS rank
    FROM public.product_data pd
    WHERE (SELECT count(*) FROM fts) = 0
      AND pd.expires_at > NOW()
      AND pd.ingredient_count >= 5
      AND pd.is_complete_food = TRUE
      AND pd.catalog_exclusion_reason IS NULL
      AND (
        lower(pd.product_name) LIKE '%' || needle || '%'
        OR lower(COALESCE(pd.brand, '')) LIKE '%' || needle || '%'
        OR similarity(lower(pd.product_name), needle) > 0.18
        OR similarity(lower(COALESCE(pd.brand, '')), needle) > 0.18
      )
    ORDER BY rank DESC, pd.ingredient_count DESC
    LIMIT candidate_limit
  ),
  combined AS (
    SELECT * FROM fts
    UNION ALL
    SELECT * FROM fuzzy
  )
  SELECT DISTINCT ON (c.cache_key)
    c.cache_key,
    c.product_name,
    c.brand,
    c.ingredient_count,
    c.source,
    c.image_url,
    c.ingredients,
    c.ingredient_text,
    c.nutritional_info,
    c.nutrient_panel,
    c.has_published_nutrients,
    c.source_url,
    c.rank
  FROM combined c
  ORDER BY c.cache_key, c.rank DESC, c.ingredient_count DESC
  LIMIT safe_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INTEGER) TO service_role;
