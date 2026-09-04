-- Keep the existing verified-search ranking, then apply app-facing variant
-- tiebreakers for same-rank rows. This prevents a query without kitten/puppy
-- terms from preferring a life-stage variant over the matching adult formula.

DO $$
BEGIN
  IF to_regprocedure('public.search_verified_products_ranked_v1(text, integer)') IS NULL THEN
    ALTER FUNCTION public.search_verified_products(TEXT, INTEGER)
      RENAME TO search_verified_products_ranked_v1;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_verified_products(q TEXT, max_results INTEGER DEFAULT 10)
RETURNS TABLE(
  cache_key TEXT,
  product_name TEXT,
  brand TEXT,
  gtin TEXT,
  product_line TEXT,
  flavor TEXT,
  life_stage TEXT,
  food_form TEXT,
  package_size TEXT,
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
      public.normalize_verified_product_search_query(q) AS normalized,
      LEAST(GREATEST(COALESCE(max_results, 10), 1), 25) AS safe_limit
  ),
  ranked AS (
    SELECT
      p.*,
      NULLIF(trim(regexp_replace(extensions.unaccent(lower(COALESCE(p.product_name, ''))), '[^a-z0-9]+', ' ', 'g')), '') AS product_name_lc
    FROM public.search_verified_products_ranked_v1(q, max_results) AS p
  )
  SELECT
    ranked.cache_key,
    ranked.product_name,
    ranked.brand,
    ranked.gtin,
    ranked.product_line,
    ranked.flavor,
    ranked.life_stage,
    ranked.food_form,
    ranked.package_size,
    ranked.pet_type,
    ranked.ingredient_count,
    ranked.source,
    ranked.source_quality,
    ranked.ingredient_verification_status,
    ranked.image_verification_status,
    ranked.verified_at,
    ranked.image_url,
    ranked.ingredients,
    ranked.ingredient_text,
    ranked.nutritional_info,
    ranked.nutrient_panel,
    ranked.has_published_nutrients,
    ranked.source_url,
    ranked.rank
  FROM ranked
  CROSS JOIN input
  ORDER BY
    ranked.rank DESC,
    CASE
      WHEN input.normalized !~ '\m(kitten|kittens|puppy|puppies)\M'
        AND ranked.product_name_lc ~ '\m(kitten|kittens|puppy|puppies)\M'
      THEN 1 ELSE 0
    END ASC,
    CASE
      WHEN input.normalized !~ '\m(senior|seniors|mature)\M'
        AND ranked.product_name_lc ~ '\m(senior|seniors|mature)\M'
      THEN 1 ELSE 0
    END ASC,
    CASE
      WHEN input.normalized ~ '\mclassic\M'
        AND ranked.product_name_lc !~ '\mclassic\M'
      THEN 1 ELSE 0
    END ASC,
    ranked.ingredient_count DESC
  LIMIT (SELECT safe_limit FROM input);
$$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.search_verified_products_ranked_v1(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products_ranked_v1(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products_ranked_v1(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products_ranked_v1(TEXT, INTEGER) TO service_role;
