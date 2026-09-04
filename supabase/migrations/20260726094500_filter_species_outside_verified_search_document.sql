-- Species is a hard catalog boundary, but it is stored in product_data.pet_type
-- rather than repeated in every clean manufacturer title. The indexed search
-- document intentionally contains product identity fields, not pet_type.
-- Therefore an explicit "dog" or "cat" token must filter candidates after the
-- indexed identity search instead of being required inside the product title.
--
-- Keep puppy/kitten in the indexed query because they are also formula-level
-- life-stage terms. Only the generic species words move outside the document.

ALTER FUNCTION public.search_verified_products_unprotected_age_v1(TEXT, INTEGER)
  RENAME TO search_verified_products_species_embedded_v1;

REVOKE ALL ON FUNCTION
  public.search_verified_products_species_embedded_v1(TEXT, INTEGER)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public.search_verified_products_species_embedded_v1(TEXT, INTEGER)
  FROM anon;
REVOKE ALL ON FUNCTION
  public.search_verified_products_species_embedded_v1(TEXT, INTEGER)
  FROM authenticated;
REVOKE ALL ON FUNCTION
  public.search_verified_products_species_embedded_v1(TEXT, INTEGER)
  FROM service_role;

CREATE OR REPLACE FUNCTION public.search_verified_products_unprotected_age_v1(
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
  v_query_lc TEXT := lower(COALESCE(q, ''));
  v_requires_dog BOOLEAN :=
    v_query_lc ~ '\m(dogs?|pupp(y|ies)|canines?)\M';
  v_requires_cat BOOLEAN :=
    v_query_lc ~ '\m(cats?|kittens?|felines?)\M';
  v_identity_query TEXT := NULLIF(
    btrim(
      regexp_replace(
        COALESCE(q, ''),
        '\m(dogs?|cats?|canines?|felines?)\M',
        ' ',
        'gi'
      )
    ),
    ''
  );
BEGIN
  IF v_identity_query IS NULL OR (v_requires_dog AND v_requires_cat) THEN
    RETURN;
  END IF;

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
  FROM public.search_verified_products_species_embedded_v1(
    v_identity_query,
    25
  ) AS candidate
  WHERE (NOT v_requires_dog OR candidate.pet_type = 'dog')
    AND (NOT v_requires_cat OR candidate.pet_type = 'cat')
  ORDER BY
    candidate.rank DESC,
    candidate.ingredient_count DESC,
    candidate.verified_at DESC NULLS LAST
  LIMIT v_safe_limit;
END;
$$;

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

DO $$
DECLARE
  purrfect_top TEXT;
  grain_free_top TEXT;
  wholesome_grains_top TEXT;
  protein_bowls_top TEXT;
  wrong_species_count INTEGER;
BEGIN
  SELECT result.cache_key
  INTO purrfect_top
  FROM public.search_verified_products(
    'Wellness Complete Health Purrfect Duos Beef Chicken wet cat food',
    5
  ) AS result
  ORDER BY result.rank DESC
  LIMIT 1;

  SELECT result.cache_key
  INTO grain_free_top
  FROM public.search_verified_products(
    'Wellness CORE Original Turkey Chicken grain free dry dog food',
    5
  ) AS result
  ORDER BY result.rank DESC
  LIMIT 1;

  SELECT result.cache_key
  INTO wholesome_grains_top
  FROM public.search_verified_products(
    'Wellness CORE Original Turkey Chicken wholesome grains dry dog food',
    5
  ) AS result
  ORDER BY result.rank DESC
  LIMIT 1;

  SELECT result.cache_key
  INTO protein_bowls_top
  FROM public.search_verified_products(
    'Wellness Protein Bowls Beef Red Pepper Egg dog food',
    5
  ) AS result
  ORDER BY result.rank DESC
  LIMIT 1;

  SELECT count(*)
  INTO wrong_species_count
  FROM public.search_verified_products(
    'Wellness Complete Health Purrfect Duos Beef Chicken wet dog food',
    25
  ) AS result
  WHERE result.cache_key =
    'wellness-pet-company:wellness wellness complete health purrfect duos beef chicken';

  IF purrfect_top <>
       'wellness-pet-company:wellness wellness complete health purrfect duos beef chicken'
    OR grain_free_top <>
       'wellness-pet-company:wellness wellness core original turkey chicken recipe product-catalog wellness-core-grain-free-original-turkey-chicken'
    OR wholesome_grains_top <>
       'wellness-pet-company:wellness wellness core original turkey chicken recipe product-catalog wellness-core-wholesome-grains-original-turkey-chicken'
    OR protein_bowls_top <>
       'wellness-pet-company:wellness wellness protein bowls beef red pepper egg product-catalog wellness-protein-bowls-beef-red-pepper-egg'
    OR wrong_species_count <> 0 THEN
    RAISE EXCEPTION
      'Verified species search regression: Purrfect %, grain-free %, wholesome %, Protein Bowls %, wrong-species %',
      purrfect_top,
      grain_free_top,
      wholesome_grains_top,
      protein_bowls_top,
      wrong_species_count;
  END IF;
END $$;
