-- Preserve the existing indexed verified search, but add a hard identity
-- boundary for explicit "Adult 7+" queries. A package-size or vitamin "7"
-- token must never let an ordinary adult sibling outrank a senior formula.

ALTER FUNCTION public.search_verified_products(TEXT, INTEGER)
  RENAME TO search_verified_products_unprotected_age_v1;

REVOKE ALL ON FUNCTION
  public.search_verified_products_unprotected_age_v1(TEXT, INTEGER)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public.search_verified_products_unprotected_age_v1(TEXT, INTEGER)
  FROM anon;
REVOKE ALL ON FUNCTION
  public.search_verified_products_unprotected_age_v1(TEXT, INTEGER)
  FROM authenticated;
REVOKE ALL ON FUNCTION
  public.search_verified_products_unprotected_age_v1(TEXT, INTEGER)
  FROM service_role;

CREATE OR REPLACE FUNCTION public.search_verified_products(
  q TEXT,
  max_results INTEGER DEFAULT 10
)
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_safe_limit INTEGER :=
    LEAST(GREATEST(COALESCE(max_results, 10), 1), 25);
  v_requires_adult_7_plus BOOLEAN :=
    lower(COALESCE(q, '')) ~
      '(^|[^a-z0-9])adult[[:space:]-]+(7[+]?|seven[[:space:]-]+plus)([^a-z0-9]|$)';
BEGIN
  RETURN QUERY
  SELECT
    candidate.cache_key,
    candidate.product_name,
    candidate.brand,
    candidate.gtin,
    candidate.product_line,
    candidate.flavor,
    candidate.life_stage,
    candidate.food_form,
    candidate.package_size,
    candidate.pet_type,
    candidate.ingredient_count,
    candidate.source,
    candidate.source_quality,
    candidate.ingredient_verification_status,
    candidate.image_verification_status,
    candidate.verified_at,
    candidate.image_url,
    candidate.ingredients,
    candidate.ingredient_text,
    candidate.nutritional_info,
    candidate.nutrient_panel,
    candidate.has_published_nutrients,
    candidate.source_url,
    candidate.rank
  FROM public.search_verified_products_unprotected_age_v1(q, 25)
    AS candidate
  WHERE NOT v_requires_adult_7_plus
     OR lower(COALESCE(candidate.life_stage, '')) ~
          '\m(senior|mature)\M'
     OR lower(concat_ws(
          ' ',
          candidate.product_name,
          candidate.product_line,
          candidate.source_url
        )) ~
          '\madult[[:space:]-]+(7[+]?|seven[[:space:]-]+plus)\M'
  ORDER BY candidate.rank DESC,
    candidate.ingredient_count DESC,
    candidate.verified_at DESC NULLS LAST
  LIMIT v_safe_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER)
  TO service_role;

DO $$
DECLARE
  indoor_top_cache_key TEXT;
  complete_essentials_top_cache_key TEXT;
  ordinary_adult_sibling_count INTEGER;
BEGIN
  SELECT result.cache_key
  INTO indoor_top_cache_key
  FROM public.search_verified_products(
    'Purina Pro Plan Adult 7+ Indoor Chicken Rice Dry Cat Food',
    5
  ) result
  ORDER BY result.rank DESC
  LIMIT 1;

  SELECT result.cache_key
  INTO complete_essentials_top_cache_key
  FROM public.search_verified_products(
    'Purina Pro Plan Adult 7+ Complete Essentials Chicken Rice Dry Cat Food',
    5
  ) result
  ORDER BY result.rank DESC
  LIMIT 1;

  SELECT count(*)
  INTO ordinary_adult_sibling_count
  FROM public.search_verified_products(
    'Purina Pro Plan Adult 7+ Indoor Chicken Rice Dry Cat Food',
    25
  ) result
  WHERE result.cache_key =
    'petsmart-retail-catalog:038100103949';

  IF indoor_top_cache_key <>
        'nestle-purina-pro-plan:038100104014'
      OR complete_essentials_top_cache_key <>
        'nestle-purina-pro-plan:038100105752'
      OR ordinary_adult_sibling_count <> 0 THEN
    RAISE EXCEPTION
      'Adult 7+ search guard failed: indoor %, complete essentials %, ordinary sibling count %',
      indoor_top_cache_key,
      complete_essentials_top_cache_key,
      ordinary_adult_sibling_count;
  END IF;
END $$;
