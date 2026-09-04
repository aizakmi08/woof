-- The 15 lb and 22 lb PetSmart packages were incorrectly attached as SKU
-- children of the current manufacturer formula even though their exact label
-- ingredient statements are materially different. Restore the retailer-label
-- formula boundaries so barcode/photo lookup cannot inherit sibling
-- ingredients. Typed search continues to prefer the current official formula.

DO $$
DECLARE
  v_current_formula_id BIGINT;
  v_22_formula_id BIGINT;
  v_15_formula_id BIGINT;
  v_current_cache_key TEXT :=
    'blue-buffalo-general-mills:blue buffalo blue tastefuls adult indoor cat chicken brown rice recipe blue tastefuls-indoor-chicken-brown-rice';
  v_22_cache_key TEXT := 'petsmart-retail-catalog:840243151103';
  v_15_cache_key TEXT := 'petsmart-retail-catalog:859610000876';
  v_22_gtin TEXT := '840243151103';
  v_15_gtin TEXT := '859610000876';
  v_22_source TEXT :=
    'https://www.petsmart.com/cat/food-and-treats/dry-food/blue-buffalo-tastefuls-adult-dry-cat-food-indoor-cat-formula-chicken-and-brown-rice-22-lb-99324.html';
  v_15_source TEXT :=
    'https://www.petsmart.com/cat/food-and-treats/dry-food/blue-buffalo-tastefuls-adult-indoor-cat-dry-food---natural-chicken-and-brown-rice-366.html?redirected=true';
  v_search_cache TEXT;
  v_22_barcode_cache TEXT;
  v_15_barcode_cache TEXT;
BEGIN
  SELECT id
  INTO STRICT v_current_formula_id
  FROM public.catalog_formulas
  WHERE formula_key =
    'general mills|blue buffalo|blue tastefuls adult indoor cat chicken and brown rice recipe|cat|adult|dry|chicken and brown rice recipe|'
    AND active
    AND verification_status = 'verified'
    AND source_url =
      'https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-indoor-chicken-brown-rice/';

  SELECT id
  INTO STRICT v_22_formula_id
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue buffalo tastefuls adult dry cat food indoor cat formula chicken and brown rice|cat|adult|dry|chicken and brown rice|'
    AND source_url = v_22_source;

  SELECT id
  INTO STRICT v_15_formula_id
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue buffalo tastefuls adult indoor cat dry food natural chicken and brown rice|cat|adult|dry|chicken and brown rice|'
    AND source_url = v_15_source;

  IF (
    SELECT count(*)
    FROM public.product_data
    WHERE cache_key IN (v_22_cache_key, v_15_cache_key)
      AND catalog_exclusion_reason =
        'duplicate_canonical_formula_sku_variant_current_official_formula'
      AND is_complete_food = false
      AND ingredient_verification_status = 'retailer_verified'
      AND image_verification_status = 'retailer_verified'
  ) <> 2 THEN
    RAISE EXCEPTION
      'Blue Tastefuls version preflight changed: expected two incorrectly excluded retailer label rows';
  END IF;

  IF (
    SELECT ingredient_count
    FROM public.product_data
    WHERE cache_key = v_22_cache_key
  ) <> 69 OR (
    SELECT ingredient_count
    FROM public.product_data
    WHERE cache_key = v_15_cache_key
  ) <> 63 THEN
    RAISE EXCEPTION
      'Blue Tastefuls retailer label ingredient counts changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas AS retailer
    JOIN public.catalog_formulas AS current
      ON current.id = v_current_formula_id
    WHERE retailer.id IN (v_22_formula_id, v_15_formula_id)
      AND retailer.ingredient_text = current.ingredient_text
  ) THEN
    RAISE EXCEPTION
      'Blue Tastefuls retailer formula unexpectedly equals the current official ingredient statement';
  END IF;

  UPDATE public.product_data
  SET
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    source_quality = 'retailer_verified',
    ingredient_verification_status = 'retailer_verified',
    image_verification_status = 'retailer_verified',
    verified_at = now(),
    expires_at = now() + interval '180 days',
    updated_at = now()
  WHERE cache_key IN (v_22_cache_key, v_15_cache_key);

  UPDATE public.catalog_formulas
  SET
    manufacturer = 'Blue Buffalo',
    brand = 'Blue Buffalo',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'Chicken & Brown Rice',
    is_complete_food = true,
    complete_food_evidence =
      'Exact PetSmart package and product evidence identifies complete adult dry cat food; the package-bound ingredient statement is preserved as its own formula version.',
    source_authority = 'retailer_verified',
    ingredient_verification_status = 'retailer_verified',
    image_verification_status = 'retailer_verified',
    protected_terms = ARRAY[
      'blue buffalo',
      'tastefuls',
      'adult',
      'indoor',
      'cat',
      'chicken',
      'brown rice',
      'dry'
    ]::TEXT[],
    verification_status = 'verified',
    active = true,
    absent_since = NULL,
    promoted_cache_key = CASE id
      WHEN v_22_formula_id THEN v_22_cache_key
      WHEN v_15_formula_id THEN v_15_cache_key
    END,
    promoted_at = now(),
    last_observed_at = now(),
    updated_at = now()
  WHERE id IN (v_22_formula_id, v_15_formula_id);

  UPDATE public.catalog_skus
  SET
    formula_id = CASE gtin
      WHEN v_22_gtin THEN v_22_formula_id
      WHEN v_15_gtin THEN v_15_formula_id
    END,
    source_slug = 'petsmart-retail-catalog',
    source_url = CASE gtin
      WHEN v_22_gtin THEN v_22_source
      WHEN v_15_gtin THEN v_15_source
    END,
    active = true,
    last_observed_at = now(),
    updated_at = now()
  WHERE gtin IN (v_22_gtin, v_15_gtin);

  IF (
    SELECT count(*)
    FROM public.catalog_skus
    WHERE (gtin = v_22_gtin AND formula_id = v_22_formula_id)
       OR (gtin = v_15_gtin AND formula_id = v_15_formula_id)
  ) <> 2 THEN
    RAISE EXCEPTION
      'Blue Tastefuls GTINs were not restored to their exact formula versions';
  END IF;

  SELECT cache_key
  INTO v_search_cache
  FROM public.search_verified_products(
    'BLUE Tastefuls Adult Indoor Cat Chicken Brown Rice Recipe',
    5
  )
  LIMIT 1;

  SELECT cache_key
  INTO v_22_barcode_cache
  FROM public.resolve_verified_product_by_gtin(v_22_gtin, 8)
  LIMIT 1;

  SELECT cache_key
  INTO v_15_barcode_cache
  FROM public.resolve_verified_product_by_gtin(v_15_gtin, 8)
  LIMIT 1;

  IF v_search_cache IS DISTINCT FROM v_current_cache_key
     OR v_22_barcode_cache IS DISTINCT FROM v_22_cache_key
     OR v_15_barcode_cache IS DISTINCT FROM v_15_cache_key THEN
    RAISE EXCEPTION
      'Blue Tastefuls formula-version resolution regression: search %, 22 lb %, 15 lb %',
      v_search_cache, v_22_barcode_cache, v_15_barcode_cache;
  END IF;

  IF (
    SELECT count(DISTINCT encode(digest(ingredient_text, 'sha256'), 'hex'))
    FROM public.catalog_formulas
    WHERE id IN (v_current_formula_id, v_22_formula_id, v_15_formula_id)
      AND active
      AND verification_status = 'verified'
  ) <> 3 THEN
    RAISE EXCEPTION
      'Blue Tastefuls formula-version ingredient boundaries collapsed';
  END IF;
END
$$;
