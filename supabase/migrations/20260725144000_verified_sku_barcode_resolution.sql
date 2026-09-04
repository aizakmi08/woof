-- Make canonical formula / SKU-child normalization usable by the app. An exact
-- package GTIN resolves to the formula's promoted verified serving row while
-- returning the scanned SKU GTIN and package size. No fuzzy identity fallback
-- is allowed in this function.

DO $$
DECLARE
  invalid_wave_z_link_count INTEGER;
BEGIN
  SELECT count(*)
  INTO invalid_wave_z_link_count
  FROM public.catalog_skus sku
  JOIN public.catalog_formulas formula
    ON formula.id = sku.formula_id
  JOIN public.product_data product
    ON product.cache_key = sku.source_external_id
  WHERE sku.source_slug = 'petsmart-private-reviewed-wave-z-20260725'
    AND (
      regexp_replace(lower(formula.brand), '[^a-z0-9]+', '', 'g')
        <> regexp_replace(lower(product.brand), '[^a-z0-9]+', '', 'g')
      OR formula.pet_type IS DISTINCT FROM product.pet_type
      OR formula.food_form IS DISTINCT FROM product.food_form
      OR (
        NULLIF(trim(COALESCE(formula.flavor, '')), '') IS NOT NULL
        AND public.normalize_verified_product_search_query(formula.flavor)
          <> public.normalize_verified_product_search_query(product.flavor)
      )
      OR lower(COALESCE(formula.life_stage, 'unknown'))
        <> lower(COALESCE(product.life_stage, 'unknown'))
      OR product.catalog_exclusion_reason IS NOT NULL
      OR public.catalog_quality_state(
        product.pet_type,
        product.is_complete_food,
        product.catalog_exclusion_reason,
        product.ingredient_text,
        COALESCE(array_length(product.ingredients, 1), 0),
        product.ingredient_verification_status,
        product.image_url,
        product.image_verification_status,
        product.source_url,
        product.expires_at
      ) <> 'verified_ready'
    );

  IF invalid_wave_z_link_count <> 0 THEN
    RAISE EXCEPTION
      'refusing to promote % incompatible Wave Z formula/SKU links',
      invalid_wave_z_link_count;
  END IF;
END $$;

UPDATE public.catalog_formulas formula
SET
  product_name = product.product_name,
  product_line = COALESCE(
    NULLIF(formula.product_line, ''),
    lower(product.product_line)
  ),
  flavor = COALESCE(NULLIF(formula.flavor, ''), lower(product.flavor)),
  life_stage = COALESCE(
    NULLIF(formula.life_stage, ''),
    lower(product.life_stage)
  ),
  food_form = COALESCE(
    NULLIF(formula.food_form, ''),
    lower(product.food_form)
  ),
  source_authority = 'retailer_verified',
  source_url = product.source_url,
  ingredient_text = product.ingredient_text,
  ingredients = product.ingredients,
  front_image_url = product.image_url,
  is_complete_food = TRUE,
  complete_food_evidence =
    'Current exact PetSmart complete-food listing reviewed in Wave Z',
  ingredient_verification_status = 'retailer_verified',
  image_verification_status = 'retailer_verified',
  verification_status = 'verified',
  promoted_cache_key = product.cache_key,
  promoted_at = now(),
  active = TRUE,
  absent_since = NULL,
  updated_at = now()
FROM public.catalog_skus sku
JOIN public.product_data product
  ON product.cache_key = sku.source_external_id
WHERE sku.formula_id = formula.id
  AND sku.source_slug = 'petsmart-private-reviewed-wave-z-20260725';

CREATE OR REPLACE FUNCTION public.resolve_verified_product_by_gtin(
  q TEXT,
  max_results INTEGER DEFAULT 8
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
  v_gtin TEXT := regexp_replace(COALESCE(q, ''), '[^0-9]', '', 'g');
  v_normalized_gtin TEXT;
  v_safe_limit INTEGER :=
    LEAST(GREATEST(COALESCE(max_results, 8), 1), 25);
BEGIN
  IF length(v_gtin) < 8 OR length(v_gtin) > 14 THEN
    RETURN;
  END IF;

  v_normalized_gtin := ltrim(v_gtin, '0');
  IF v_normalized_gtin = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    product.cache_key,
    product.product_name,
    product.brand,
    sku.gtin,
    NULLIF(trim(product.product_line), '') AS product_line,
    NULLIF(trim(product.flavor), '') AS flavor,
    NULLIF(trim(product.life_stage), '') AS life_stage,
    NULLIF(trim(product.food_form), '') AS food_form,
    COALESCE(
      NULLIF(trim(sku.package_size), ''),
      NULLIF(trim(product.package_size), '')
    ) AS package_size,
    product.pet_type,
    product.ingredient_count,
    product.source,
    product.source_quality,
    product.ingredient_verification_status,
    product.image_verification_status,
    product.verified_at,
    product.image_url,
    product.ingredients,
    COALESCE(
      NULLIF(product.ingredient_text, ''),
      array_to_string(product.ingredients, ', ')
    ) AS ingredient_text,
    product.nutritional_info,
    product.nutrient_panel,
    COALESCE(product.has_published_nutrients, FALSE)
      AS has_published_nutrients,
    product.source_url,
    20.0::REAL AS rank
  FROM public.catalog_skus sku
  JOIN public.catalog_formulas formula
    ON formula.id = sku.formula_id
   AND formula.active
   AND formula.verification_status = 'verified'
   AND formula.promoted_cache_key IS NOT NULL
  JOIN public.product_data product
    ON product.cache_key = formula.promoted_cache_key
  WHERE sku.active
    AND ltrim(
      regexp_replace(COALESCE(sku.gtin, ''), '[^0-9]', '', 'g'),
      '0'
    ) = v_normalized_gtin
    AND product.expires_at > now()
    AND product.ingredient_count >= 5
    AND product.is_complete_food = TRUE
    AND product.catalog_exclusion_reason IS NULL
    AND lower(COALESCE(product.pet_type, '')) IN ('dog', 'cat')
    AND COALESCE(NULLIF(trim(product.source_url), ''), '') <> ''
    AND product.source_quality IN (
      'gdsn',
      'official',
      'manufacturer',
      'retailer_verified'
    )
    AND product.ingredient_verification_status IN (
      'gdsn',
      'official',
      'manufacturer',
      'retailer_verified',
      'label_ocr_verified'
    )
    AND product.image_verification_status IN (
      'official',
      'manufacturer',
      'retailer_verified'
    )
    AND product.image_url IS NOT NULL
    AND product.image_url !~* '^data:'
  ORDER BY
    CASE formula.source_authority
      WHEN 'gdsn' THEN 5
      WHEN 'official' THEN 4
      WHEN 'manufacturer' THEN 3
      WHEN 'retailer_verified' THEN 2
      ELSE 0
    END DESC,
    product.ingredient_count DESC,
    product.verified_at DESC NULLS LAST
  LIMIT v_safe_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_verified_product_by_gtin(TEXT, INTEGER)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_verified_product_by_gtin(TEXT, INTEGER)
  FROM anon;
GRANT EXECUTE
  ON FUNCTION public.resolve_verified_product_by_gtin(TEXT, INTEGER)
  TO authenticated;
GRANT EXECUTE
  ON FUNCTION public.resolve_verified_product_by_gtin(TEXT, INTEGER)
  TO service_role;

DO $$
DECLARE
  purina_match_count INTEGER;
  wave_z_match_count INTEGER;
  wrong_puppy_match_count INTEGER;
BEGIN
  SELECT count(*)
  INTO purina_match_count
  FROM public.resolve_verified_product_by_gtin('017800149211', 8)
  WHERE cache_key = 'nestle-purina-one:017800570534'
    AND gtin = '017800149211'
    AND flavor = 'Turkey'
    AND life_stage = 'adult'
    AND package_size = '31.1 Lb';

  SELECT count(*)
  INTO wave_z_match_count
  FROM (
    SELECT '0196481056596' AS gtin
    UNION ALL SELECT '0196481058996'
    UNION ALL SELECT '0737257826922'
    UNION ALL SELECT '0737257827462'
    UNION ALL SELECT '0737257829947'
  ) expected
  WHERE EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin(expected.gtin, 8)
    WHERE gtin = expected.gtin
  );

  SELECT count(*)
  INTO wrong_puppy_match_count
  FROM public.resolve_verified_product_by_gtin('10448981', 8);

  IF purina_match_count <> 1
      OR wave_z_match_count <> 5
      OR wrong_puppy_match_count <> 0 THEN
    RAISE EXCEPTION
      'verified SKU resolution failed: Purina %, Wave Z %, wrong puppy %',
      purina_match_count, wave_z_match_count, wrong_puppy_match_count;
  END IF;
END $$;
