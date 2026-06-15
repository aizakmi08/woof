-- Align database search eligibility with the client's ingredient sanitizer.
-- Home should not return a row that Results will reject after removing junk
-- ingredient tokens.

CREATE OR REPLACE FUNCTION public.is_plausible_product_ingredient(value TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    value IS NOT NULL
    AND length(trim(value)) BETWEEN 2 AND 200
    AND trim(value) !~ '[\\{}]'
    AND trim(value) !~ '^[\["'']'
    AND trim(value) !~ ':\s*"'
    AND trim(value) !~* '\m(mailto:|https?://)'
    AND trim(value) !~* '\m(legalLinks|reportAbuseLink|siteSettings|hasChanges|sourceId|tileName)\M'
    AND length(regexp_replace(trim(value), '[^A-Za-z]', '', 'g')) >= 2;
$$;

REVOKE ALL ON FUNCTION public.is_plausible_product_ingredient(TEXT)
  FROM PUBLIC;

WITH cleaned AS (
  SELECT
    pd.cache_key,
    ARRAY(
      SELECT trim(ingredient.value)
      FROM unnest(COALESCE(pd.ingredients, ARRAY[]::TEXT[])) AS ingredient(value)
      WHERE public.is_plausible_product_ingredient(ingredient.value)
    ) AS clean_ingredients
  FROM public.product_data pd
)
UPDATE public.product_data pd
SET
  ingredients = cleaned.clean_ingredients,
  ingredient_text = array_to_string(cleaned.clean_ingredients, ', '),
  ingredient_count = COALESCE(array_length(cleaned.clean_ingredients, 1), 0)
FROM cleaned
WHERE pd.cache_key = cleaned.cache_key
  AND (
    pd.ingredients IS DISTINCT FROM cleaned.clean_ingredients
    OR pd.ingredient_count IS DISTINCT FROM COALESCE(array_length(cleaned.clean_ingredients, 1), 0)
    OR COALESCE(pd.ingredient_text, '') ~ '\\"'
    OR COALESCE(pd.ingredient_text, '') ILIKE '%mailto:%'
    OR COALESCE(pd.ingredient_text, '') ILIKE '%legalLinks%'
    OR COALESCE(pd.ingredient_text, '') ILIKE '%reportAbuseLink%'
    OR COALESCE(pd.ingredient_text, '') ILIKE '%siteSettings%'
    OR COALESCE(pd.ingredient_text, '') ILIKE '%powered by%'
    OR COALESCE(pd.ingredient_text, '') ~ 'https?://'
    OR COALESCE(pd.ingredient_text, '') ~ '\{[^}]{3,}":'
    OR COALESCE(pd.ingredient_text, '') ~ '\}[\,\}]'
    OR LENGTH(COALESCE(pd.ingredient_text, '')) > 5000
  );

DELETE FROM public.product_data pd
WHERE COALESCE(array_length(pd.ingredients, 1), 0) < 5
  OR COALESCE(pd.ingredient_count, 0) < 5;

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
  WITH candidates AS (
    SELECT
      pd.cache_key,
      pd.product_name,
      pd.brand,
      pd.source,
      pd.image_url,
      pd.ingredients,
      pd.ingredient_text,
      pd.expires_at,
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
      COALESCE(array_length(c.clean_ingredients, 1), 0)::INT AS clean_ingredient_count,
      c.source,
      c.image_url,
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
