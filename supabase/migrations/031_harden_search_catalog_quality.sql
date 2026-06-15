-- Keep search results aligned with rows the app can actually analyze.
-- Some historical rows had stale ingredient_count values or page chrome in
-- ingredient text/arrays, which could make Home show a product that Results
-- later rejected after client-side ingredient sanitization.

UPDATE public.product_data
SET ingredient_count = COALESCE(array_length(ingredients, 1), 0)
WHERE ingredient_count IS DISTINCT FROM COALESCE(array_length(ingredients, 1), 0);

DELETE FROM public.product_data pd
WHERE
  COALESCE(pd.ingredient_text, '') ~ '\\"'
  OR COALESCE(pd.ingredient_text, '') ILIKE '%mailto:%'
  OR COALESCE(pd.ingredient_text, '') ILIKE '%legalLinks%'
  OR COALESCE(pd.ingredient_text, '') ILIKE '%reportAbuseLink%'
  OR COALESCE(pd.ingredient_text, '') ILIKE '%siteSettings%'
  OR COALESCE(pd.ingredient_text, '') ILIKE '%powered by%'
  OR COALESCE(pd.ingredient_text, '') ~ 'https?://'
  OR COALESCE(pd.ingredient_text, '') ~ '\{[^}]{3,}":'
  OR COALESCE(pd.ingredient_text, '') ~ '\}[\,\}]'
  OR LENGTH(COALESCE(pd.ingredient_text, '')) > 5000
  OR EXISTS (
    SELECT 1
    FROM unnest(pd.ingredients) AS ingredient(value)
    WHERE
      ingredient.value IS NULL
      OR length(trim(ingredient.value)) < 2
      OR length(trim(ingredient.value)) > 200
      OR ingredient.value ~ '[\\{}]'
      OR ingredient.value ~ '^[\["'']'
      OR ingredient.value ~ ':\s*"'
      OR ingredient.value ~* '\m(mailto:|https?://)'
      OR ingredient.value ~* '\m(legalLinks|reportAbuseLink|siteSettings|hasChanges|sourceId|tileName)\M'
  );

CREATE OR REPLACE FUNCTION public.search_products(q TEXT, max_results INT DEFAULT 10)
RETURNS TABLE (
  cache_key TEXT,
  product_name TEXT,
  brand TEXT,
  ingredient_count INT,
  source TEXT,
  image_url TEXT,
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
  SELECT
    pd.cache_key,
    pd.product_name,
    pd.brand,
    COALESCE(array_length(pd.ingredients, 1), 0)::INT AS ingredient_count,
    pd.source,
    pd.image_url,
    GREATEST(
      CASE WHEN lower(pd.product_name) LIKE '%' || needle || '%' THEN 1.0 ELSE 0.0 END,
      CASE WHEN lower(COALESCE(pd.brand, '')) LIKE '%' || needle || '%' THEN 0.9 ELSE 0.0 END,
      similarity(lower(pd.product_name), needle),
      similarity(lower(COALESCE(pd.brand, '')), needle) * 0.8
    )::real AS rank
  FROM public.product_data pd
  WHERE COALESCE(array_length(pd.ingredients, 1), 0) >= 5
    AND pd.expires_at > NOW()
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
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(pd.ingredients) AS ingredient(value)
      WHERE
        ingredient.value IS NULL
        OR length(trim(ingredient.value)) < 2
        OR length(trim(ingredient.value)) > 200
        OR ingredient.value ~ '[\\{}]'
        OR ingredient.value ~ '^[\["'']'
        OR ingredient.value ~ ':\s*"'
        OR ingredient.value ~* '\m(mailto:|https?://)'
        OR ingredient.value ~* '\m(legalLinks|reportAbuseLink|siteSettings|hasChanges|sourceId|tileName)\M'
    )
    AND (
      lower(pd.product_name) LIKE '%' || needle || '%'
      OR lower(COALESCE(pd.brand, '')) LIKE '%' || needle || '%'
      OR similarity(lower(pd.product_name), needle) > 0.15
      OR similarity(lower(COALESCE(pd.brand, '')), needle) > 0.15
    )
  ORDER BY rank DESC, ingredient_count DESC
  LIMIT safe_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_products(TEXT, INT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INT)
  TO anon, authenticated;

ANALYZE public.product_data;
