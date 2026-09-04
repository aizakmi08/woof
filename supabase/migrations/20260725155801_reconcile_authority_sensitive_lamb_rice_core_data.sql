-- Reconcile Authority Sensitive Stomach & Skin Adult Lamb & Rice to one
-- current formula. Exact 6, 18, 34, and 45 lb PetSmart package labels all
-- begin the regulated ingredient statement with "Lamb"; the shared PDP's
-- "Deboned Lamb" copy is not used as ingredient evidence.

UPDATE public.product_data
SET
  product_name =
    'Authority Sensitive Stomach & Skin Adult Dog Dry Food - Lamb & Rice',
  brand = 'Authority',
  product_line = 'Sensitive Stomach & Skin',
  flavor = 'Lamb & Rice',
  life_stage = 'adult',
  food_form = 'dry',
  package_size = '45 lb',
  pet_type = 'dog',
  source = 'petsmart-private-label-manual',
  source_quality = 'retailer_verified',
  source_url =
    'https://www.petsmart.com/dog/food/dry-food/authority-sensitive-stomach-and-skin-adult-dog-dry-food---lamb-and-rice-5360305.html',
  image_url = 'https://s7d2.scene7.com/is/image/PetSmart/5360305',
  ingredient_verification_status = 'label_ocr_verified',
  image_verification_status = 'retailer_verified',
  verified_at = now(),
  expires_at = GREATEST(expires_at, now() + interval '180 days'),
  catalog_exclusion_reason = NULL,
  updated_at = now()
WHERE cache_key = 'petsmart-authority:196481089488';

UPDATE public.catalog_formulas
SET
  manufacturer = 'petsmart',
  brand = 'authority',
  product_name =
    'Authority Sensitive Stomach & Skin Adult Dog Dry Food - Lamb & Rice',
  product_line = 'sensitive stomach and skin',
  pet_type = 'dog',
  life_stage = 'adult',
  food_form = 'dry',
  flavor = 'lamb and rice',
  diet_condition = 'sensitive stomach and skin',
  is_complete_food = TRUE,
  complete_food_evidence =
    'Current exact PetSmart private-label package labels reviewed for the 6, 18, 34, and 45 lb variants',
  front_image_url = 'https://s7d2.scene7.com/is/image/PetSmart/5360305',
  source_url =
    'https://www.petsmart.com/dog/food/dry-food/authority-sensitive-stomach-and-skin-adult-dog-dry-food---lamb-and-rice-5360305.html',
  source_authority = 'retailer_verified',
  ingredient_verification_status = 'label_ocr_verified',
  image_verification_status = 'retailer_verified',
  protected_terms = ARRAY[
    'authority',
    'sensitive stomach',
    'sensitive skin',
    'adult',
    'dog',
    'dry',
    'lamb',
    'rice'
  ]::TEXT[],
  verification_status = 'verified',
  active = TRUE,
  absent_since = NULL,
  promoted_cache_key = 'petsmart-authority:196481089488',
  promoted_at = COALESCE(promoted_at, now()),
  last_observed_at = now(),
  updated_at = now()
WHERE formula_key =
  'petsmart|authority|sensitive stomach and skin|dog|adult|dry|lamb and rice|sensitive stomach and skin';

UPDATE public.product_data package
SET
  product_name = canonical.product_name,
  brand = canonical.brand,
  product_line = canonical.product_line,
  flavor = canonical.flavor,
  life_stage = canonical.life_stage,
  food_form = canonical.food_form,
  package_size = '6 lb',
  pet_type = canonical.pet_type,
  ingredient_text = canonical.ingredient_text,
  ingredients = canonical.ingredients,
  ingredient_count = canonical.ingredient_count,
  image_url = 'https://s7d2.scene7.com/is/image/PetSmart/5309277',
  source_quality = 'retailer_verified',
  ingredient_verification_status = 'label_ocr_verified',
  image_verification_status = 'retailer_verified',
  verified_at = now(),
  catalog_exclusion_reason =
    'duplicate_exact_verified_formula_size_variant',
  updated_at = now()
FROM public.product_data canonical
WHERE package.cache_key = 'petsmart-authority:0737257936355'
  AND canonical.cache_key = 'petsmart-authority:196481089488';

WITH canonical AS (
  SELECT id
  FROM public.catalog_formulas
  WHERE formula_key =
    'petsmart|authority|sensitive stomach and skin|dog|adult|dry|lamb and rice|sensitive stomach and skin'
),
duplicate AS (
  SELECT id
  FROM public.catalog_formulas
  WHERE formula_key =
    'authority|authority|authority sensitive stomach and skin adult dog dry food lamb and rice|dog|adult|dry|lamb and rice|'
)
UPDATE public.catalog_skus sku
SET
  formula_id = canonical.id,
  active = FALSE,
  updated_at = now()
FROM canonical, duplicate
WHERE sku.formula_id = duplicate.id
  AND ltrim(
    regexp_replace(COALESCE(sku.gtin, ''), '[^0-9]', '', 'g'),
    '0'
  ) = '196481089488';

UPDATE public.catalog_formulas
SET
  verification_status = 'quarantined',
  active = FALSE,
  absent_since = COALESCE(absent_since, now()),
  promoted_cache_key = NULL,
  promoted_at = NULL,
  updated_at = now()
WHERE formula_key =
  'authority|authority|authority sensitive stomach and skin adult dog dry food lamb and rice|dog|adult|dry|lamb and rice|';

WITH canonical AS (
  SELECT id
  FROM public.catalog_formulas
  WHERE formula_key =
    'petsmart|authority|sensitive stomach and skin|dog|adult|dry|lamb and rice|sensitive stomach and skin'
),
variants(gtin, package_size, source_external_id, source_url) AS (
  VALUES
    (
      '0737257936355',
      '6 lb',
      '5309277',
      'https://www.petsmart.com/dog/food/dry-food/authority-sensitive-stomach-and-skin-adult-dog-dry-food---lamb-and-rice-5309277.html'
    ),
    (
      '0737257936331',
      '34 lb',
      '5309278',
      'https://www.petsmart.com/dog/food/dry-food/authority-sensitive-stomach-and-skin-adult-dog-dry-food---lamb-and-rice-5309278.html'
    ),
    (
      '0196481057739',
      '18 lb',
      '5348620',
      'https://www.petsmart.com/dog/food/dry-food/authority-sensitive-stomach-and-skin-adult-dog-dry-food---lamb-and-rice-5348620.html'
    )
)
INSERT INTO public.catalog_skus (
  formula_id,
  gtin,
  package_size,
  source_slug,
  source_external_id,
  source_url,
  active,
  first_observed_at,
  last_observed_at
)
SELECT
  canonical.id,
  variants.gtin,
  variants.package_size,
  'petsmart-private-label-manual',
  variants.source_external_id,
  variants.source_url,
  TRUE,
  now(),
  now()
FROM canonical
CROSS JOIN variants
ON CONFLICT (
  source_slug,
  source_external_id,
  gtin,
  package_size
)
DO UPDATE SET
  formula_id = EXCLUDED.formula_id,
  source_url = EXCLUDED.source_url,
  active = TRUE,
  last_observed_at = now(),
  updated_at = now();

UPDATE public.catalog_skus sku
SET
  package_size = '45 lb',
  source_url =
    'https://www.petsmart.com/dog/food/dry-food/authority-sensitive-stomach-and-skin-adult-dog-dry-food---lamb-and-rice-5360305.html',
  active = TRUE,
  last_observed_at = now(),
  updated_at = now()
FROM public.catalog_formulas formula
WHERE sku.formula_id = formula.id
  AND formula.formula_key =
    'petsmart|authority|sensitive stomach and skin|dog|adult|dry|lamb and rice|sensitive stomach and skin'
  AND sku.source_slug = 'petsmart-private-label-manual'
  AND ltrim(
    regexp_replace(COALESCE(sku.gtin, ''), '[^0-9]', '', 'g'),
    '0'
  ) = '196481089488';

UPDATE public.product_data
SET
  catalog_exclusion_reason = 'stale_unverified_formula_version_conflict',
  updated_at = now()
WHERE cache_key =
    'authority authority adult sensitive stomach skin lamb rice'
  AND source_quality = 'user_ocr'
  AND ingredient_verification_status = 'ai_extracted'
  AND image_verification_status = 'unverified'
  AND image_url IS NULL;

DO $$
DECLARE
  v_formula INTEGER;
  v_duplicate INTEGER;
  v_skus INTEGER;
  v_barcodes INTEGER;
  v_search INTEGER;
  v_legacy_search INTEGER;
  v_stale INTEGER;
  v_ocr INTEGER;
BEGIN
  SELECT count(*) INTO v_formula
  FROM public.catalog_formulas
  WHERE formula_key =
    'petsmart|authority|sensitive stomach and skin|dog|adult|dry|lamb and rice|sensitive stomach and skin'
    AND active
    AND verification_status = 'verified'
    AND promoted_cache_key = 'petsmart-authority:196481089488'
    AND ingredient_text ~* '^Lamb, Fish Meal, Brown Rice'
    AND ingredient_text !~* '^Deboned Lamb';

  SELECT count(*) INTO v_duplicate
  FROM public.catalog_formulas
  WHERE formula_key =
    'authority|authority|authority sensitive stomach and skin adult dog dry food lamb and rice|dog|adult|dry|lamb and rice|'
    AND (
      active
      OR verification_status <> 'quarantined'
      OR absent_since IS NULL
    );

  SELECT count(*) INTO v_skus
  FROM public.catalog_skus sku
  JOIN public.catalog_formulas formula ON formula.id = sku.formula_id
  WHERE formula.formula_key =
    'petsmart|authority|sensitive stomach and skin|dog|adult|dry|lamb and rice|sensitive stomach and skin'
    AND sku.active
    AND ltrim(
      regexp_replace(COALESCE(sku.gtin, ''), '[^0-9]', '', 'g'),
      '0'
    ) IN (
      '737257936355',
      '737257936331',
      '196481057739',
      '196481089488'
    );

  SELECT count(*) INTO v_barcodes
  FROM (
    SELECT '0737257936355' AS gtin
    UNION ALL SELECT '0737257936331'
    UNION ALL SELECT '0196481057739'
    UNION ALL SELECT '0196481089488'
    UNION ALL SELECT '196481089488'
  ) expected
  WHERE (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin(expected.gtin, 8)
    WHERE cache_key = 'petsmart-authority:196481089488'
      AND ingredient_text ~* '^Lamb, Fish Meal, Brown Rice'
      AND ingredient_text !~* '^Deboned Lamb'
  ) = 1;

  SELECT count(*) INTO v_search
  FROM (
    SELECT cache_key
    FROM public.search_verified_products(
      'Authority Sensitive Stomach Skin Adult Dog Dry Food Lamb Rice',
      8
    )
    ORDER BY rank DESC, cache_key
    LIMIT 1
  ) result
  WHERE cache_key = 'petsmart-authority:196481089488';

  SELECT count(*) INTO v_legacy_search
  FROM (
    SELECT cache_key
    FROM public.search_verified_products(
      'Authority Adult Sensitive Stomach Skin Lamb Rice Formula',
      8
    )
    ORDER BY rank DESC, cache_key
    LIMIT 1
  ) result
  WHERE cache_key = 'petsmart-authority:196481089488';

  SELECT count(*) INTO v_stale
  FROM public.product_data
  WHERE cache_key = 'petsmart-authority:0737257936355'
    AND (
      catalog_exclusion_reason IS NULL
      OR ingredient_text ~* '^Deboned Lamb'
      OR ingredient_verification_status <> 'label_ocr_verified'
    );

  SELECT count(*) INTO v_ocr
  FROM public.product_data
  WHERE cache_key =
      'authority authority adult sensitive stomach skin lamb rice'
    AND catalog_exclusion_reason IS NULL;

  IF v_formula <> 1
      OR v_duplicate <> 0
      OR v_skus <> 4
      OR v_barcodes <> 5
      OR v_search <> 1
      OR v_legacy_search <> 1
      OR v_stale <> 0
      OR v_ocr <> 0 THEN
    RAISE EXCEPTION
      'Authority core failed: formula %, duplicate %, SKUs %, barcodes %, search %, legacy %, stale %, OCR %',
      v_formula,
      v_duplicate,
      v_skus,
      v_barcodes,
      v_search,
      v_legacy_search,
      v_stale,
      v_ocr;
  END IF;
END $$;
