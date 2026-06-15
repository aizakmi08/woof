-- Return sanitized catalog payloads from search_products so a search tap can
-- start Results with verified ingredients without a second product_data read.
-- Older clients ignore the extra columns; current clients still fall back to
-- exact validation when these payload fields are absent or malformed.

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
BEGIN
  IF needle IS NULL OR length(needle) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      pd.cache_key,
      pd.product_name,
      pd.brand,
      pd.source,
      pd.image_url,
      pd.nutritional_info,
      pd.nutrient_panel,
      pd.has_published_nutrients,
      pd.source_url,
      ARRAY(
        SELECT trim(ingredient.value)
        FROM unnest(COALESCE(pd.ingredients, ARRAY[]::TEXT[])) AS ingredient(value)
        WHERE public.is_plausible_product_ingredient(ingredient.value)
      ) AS clean_ingredients
    FROM public.product_data pd
    WHERE pd.expires_at > NOW()
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
  ),
  ranked AS (
    SELECT
      c.cache_key,
      c.product_name,
      c.brand,
      c.source,
      c.image_url,
      c.nutritional_info,
      c.nutrient_panel,
      c.has_published_nutrients,
      c.source_url,
      c.clean_ingredients,
      COALESCE(array_length(c.clean_ingredients, 1), 0)::INT AS clean_ingredient_count,
      GREATEST(
        CASE WHEN lower(c.product_name) LIKE '%' || needle || '%' THEN 1.0 ELSE 0.0 END,
        CASE WHEN lower(COALESCE(c.brand, '')) LIKE '%' || needle || '%' THEN 0.9 ELSE 0.0 END,
        similarity(lower(c.product_name), needle),
        similarity(lower(COALESCE(c.brand, '')), needle) * 0.8
      )::REAL AS rank
    FROM candidates c
    WHERE COALESCE(array_length(c.clean_ingredients, 1), 0) >= 5
      AND (
        lower(c.product_name) LIKE '%' || needle || '%'
        OR lower(COALESCE(c.brand, '')) LIKE '%' || needle || '%'
        OR similarity(lower(c.product_name), needle) > 0.15
        OR similarity(lower(COALESCE(c.brand, '')), needle) > 0.15
      )
  )
  SELECT
    r.cache_key,
    r.product_name,
    r.brand,
    r.clean_ingredient_count AS ingredient_count,
    r.source,
    r.image_url,
    r.clean_ingredients AS ingredients,
    array_to_string(r.clean_ingredients, ', ') AS ingredient_text,
    r.nutritional_info,
    r.nutrient_panel,
    COALESCE(r.has_published_nutrients, FALSE) AS has_published_nutrients,
    r.source_url,
    r.rank
  FROM ranked r
  ORDER BY r.rank DESC, r.clean_ingredient_count DESC
  LIMIT safe_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_products(TEXT, INT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INT)
  TO anon, authenticated;

ANALYZE public.product_data;

NOTIFY pgrst, 'reload schema';
