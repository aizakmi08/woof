-- Repair four exact PetSmart veterinary serving rows whose generic
-- "Veterinary Diet" food_form prevented their already verified dry/wet
-- formulas from participating in exact census and runtime matching.
-- Ingredient text, images, GTINs, and source-version provenance are unchanged.

WITH repair(
  cache_key,
  food_form,
  product_line,
  flavor,
  expected_ingredient_hash
) AS (
  VALUES
    (
      'petsmart-retail-catalog:052742022161',
      'dry',
      'Prescription Diet c/d Multicare Stress',
      'Chicken',
      'a5d15cdf9ab7b444eb03883fbef14980b802e416f61a7cfc129a1a8d0c11a6c3'
    ),
    (
      'petsmart-retail-catalog:038100137999',
      'wet',
      'Pro Plan Veterinary Diets DM Dietetic Management',
      NULL,
      '4c61ee25c941f95e028f1c8f9c8ed46e7392baa314518e8d378ec7a706f0841c'
    ),
    (
      'petsmart-retail-catalog:038100178886',
      'dry',
      'Pro Plan Veterinary Diets NF Kidney Function Advanced Care',
      NULL,
      '040e2cb3d7a21b165afb1088c894d471cd0d80d6da96b1839c192a8319759fe1'
    ),
    (
      'petsmart-retail-catalog:038100179029',
      'wet',
      'Pro Plan Veterinary Diets NF Kidney Function Advanced Care',
      NULL,
      '77793349d1956be09fa914313b947801fc6afd6db51a5e48669a5b2c21496542'
    )
)
UPDATE public.product_data product
SET
  food_form = repair.food_form,
  product_line = repair.product_line,
  flavor = coalesce(repair.flavor, product.flavor),
  formula_version_provenance =
    coalesce(product.formula_version_provenance, '{}'::jsonb)
    || jsonb_build_object(
      'identity_repair', jsonb_build_object(
        'reviewed_at', '2026-07-27',
        'wave', 'v178',
        'reason',
          'Exact PetSmart product title, category, GTIN, package image, and full ingredient evidence prove dry versus wet food form; generic Veterinary Diet is a category, not a food form',
        'ingredients_changed', false,
        'image_changed', false
      )
    ),
  updated_at = now()
FROM repair
WHERE product.cache_key = repair.cache_key
  AND product.formula_evidence_tier = 'retailer_web_version'
  AND product.ingredient_verification_status = 'retailer_verified'
  AND product.image_verification_status = 'retailer_verified'
  AND encode(
    digest(
      public.catalog_normalize_ingredient_evidence(product.ingredient_text),
      'sha256'
    ),
    'hex'
  ) = repair.expected_ingredient_hash;

WITH repair(
  formula_key,
  cache_key,
  food_form,
  expected_ingredient_hash
) AS (
  VALUES
    (
      'hill s prescription diet|hill s prescription diet|hill s prescription diet urinary care c d multicare stress dry cat food chicken|cat|adult|dry|chicken|',
      'petsmart-retail-catalog:052742022161',
      'dry',
      'a5d15cdf9ab7b444eb03883fbef14980b802e416f61a7cfc129a1a8d0c11a6c3'
    ),
    (
      'purina pro plan veterinary diets|purina pro plan veterinary diets|purina pro plan veterinary diets dm dietetic management wet cat food|cat|adult|wet||dm dietetic management',
      'petsmart-retail-catalog:038100137999',
      'wet',
      '4c61ee25c941f95e028f1c8f9c8ed46e7392baa314518e8d378ec7a706f0841c'
    ),
    (
      'purina pro plan veterinary diets|purina pro plan veterinary diets|purina pro plan veterinary diets kidney function advanced care nf dry cat food|cat|adult|dry||nf kidney function advanced care',
      'petsmart-retail-catalog:038100178886',
      'dry',
      '040e2cb3d7a21b165afb1088c894d471cd0d80d6da96b1839c192a8319759fe1'
    ),
    (
      'purina pro plan veterinary diets|purina pro plan veterinary diets|purina pro plan veterinary diets nf kidney function advanced care wet cat food|cat|adult|wet||nf kidney function advanced care',
      'petsmart-retail-catalog:038100179029',
      'wet',
      '77793349d1956be09fa914313b947801fc6afd6db51a5e48669a5b2c21496542'
    )
)
UPDATE public.catalog_formulas formula
SET
  food_form = repair.food_form,
  promoted_cache_key = repair.cache_key,
  promoted_at = coalesce(formula.promoted_at, now()),
  formula_version_provenance =
    coalesce(formula.formula_version_provenance, '{}'::jsonb)
    || jsonb_build_object(
      'identity_repair', jsonb_build_object(
        'reviewed_at', '2026-07-27',
        'wave', 'v178',
        'food_form', repair.food_form,
        'ingredients_changed', false
      )
    ),
  updated_at = now()
FROM repair
JOIN public.product_data product
  ON product.cache_key = repair.cache_key
WHERE formula.formula_key = repair.formula_key
  AND formula.active
  AND formula.verification_status = 'verified'
  AND formula.formula_evidence_tier = 'retailer_web_version'
  AND encode(
    digest(
      public.catalog_normalize_ingredient_evidence(formula.ingredient_text),
      'sha256'
    ),
    'hex'
  ) = repair.expected_ingredient_hash
  AND encode(
    digest(
      public.catalog_normalize_ingredient_evidence(product.ingredient_text),
      'sha256'
    ),
    'hex'
  ) = repair.expected_ingredient_hash;

DO $$
DECLARE
  v_products integer;
  v_formulas integer;
BEGIN
  SELECT count(*)
  INTO v_products
  FROM public.product_data
  WHERE cache_key IN (
      'petsmart-retail-catalog:052742022161',
      'petsmart-retail-catalog:038100137999',
      'petsmart-retail-catalog:038100178886',
      'petsmart-retail-catalog:038100179029'
    )
    AND food_form IN ('dry', 'wet')
    AND public.catalog_quality_state(
      pet_type, is_complete_food, catalog_exclusion_reason, ingredient_text,
      coalesce(array_length(ingredients, 1), 0),
      ingredient_verification_status, image_url,
      image_verification_status, source_url, expires_at
    ) = 'verified_ready';

  SELECT count(*)
  INTO v_formulas
  FROM public.catalog_formulas
  WHERE promoted_cache_key IN (
      'petsmart-retail-catalog:052742022161',
      'petsmart-retail-catalog:038100137999',
      'petsmart-retail-catalog:038100178886',
      'petsmart-retail-catalog:038100179029'
    )
    AND active
    AND verification_status = 'verified'
    AND food_form IN ('dry', 'wet');

  IF v_products <> 4 OR v_formulas <> 4 THEN
    RAISE EXCEPTION
      'PetSmart veterinary identity repair failed: products %, formulas %',
      v_products,
      v_formulas;
  END IF;
END
$$;
