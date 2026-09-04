DO $$
DECLARE
  v_formula_id BIGINT;
  v_cache_key TEXT := 'blue-buffalo-general-mills:blue buffalo blue tastefuls adult indoor cat chicken brown rice recipe blue tastefuls-indoor-chicken-brown-rice';
  v_formula_key TEXT := 'blue buffalo|blue buffalo|blue tastefuls adult indoor|cat|adult|dry|chicken and brown rice recipe|';
  v_source TEXT := 'https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-indoor-chicken-brown-rice/';
  v_image TEXT := 'https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-dry-food/tastefuls/share-product-image/share_tastefuls_dry_indoor.png';
  v_search_cache TEXT;
  v_barcode_15 TEXT;
  v_barcode_22 TEXT;
BEGIN
  SELECT id
  INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_formula_key;

  IF (
    SELECT cardinality(ingredients)
    FROM public.catalog_formulas
    WHERE id = v_formula_id
  ) <> 65 THEN
    RAISE EXCEPTION 'Blue Tastefuls current official ledger ingredients are not the expected 65-item formula';
  END IF;

  IF (
    SELECT ingredients[1:5]
    FROM public.catalog_formulas
    WHERE id = v_formula_id
  ) IS DISTINCT FROM ARRAY[
    'Deboned Chicken',
    'Chicken Meal',
    'Brown Rice',
    'Oatmeal',
    'Barley'
  ]::TEXT[] THEN
    RAISE EXCEPTION 'Blue Tastefuls current official formula leading ingredients changed';
  END IF;

  UPDATE public.product_data AS serving
  SET
    product_name = 'BLUE Tastefuls Adult Indoor Cat Chicken & Brown Rice Recipe',
    brand = 'Blue Buffalo',
    ingredients = formula.ingredients,
    ingredient_text = formula.ingredient_text,
    ingredient_count = cardinality(formula.ingredients),
    source = 'blue-buffalo-general-mills',
    source_url = v_source,
    scraped_at = now(),
    expires_at = now() + interval '365 days',
    image_url = v_image,
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    pet_type = 'cat',
    source_quality = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    verified_at = now(),
    gtin = NULL,
    product_line = 'BLUE Tastefuls Adult Indoor',
    flavor = 'Chicken & Brown Rice Recipe',
    life_stage = 'adult',
    food_form = 'dry',
    package_size = NULL,
    updated_at = now()
  FROM public.catalog_formulas AS formula
  WHERE serving.cache_key = v_cache_key
    AND formula.id = v_formula_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Blue Tastefuls canonical serving row is missing';
  END IF;

  UPDATE public.product_data
  SET
    is_complete_food = false,
    catalog_exclusion_reason = 'duplicate_canonical_formula_sku_variant_current_official_formula',
    updated_at = now()
  WHERE cache_key IN (
    'petsmart-retail-catalog:840243151103',
    'petsmart-retail-catalog:859610000876'
  );

  IF (SELECT count(*) FROM public.product_data WHERE cache_key IN (
    'petsmart-retail-catalog:840243151103',
    'petsmart-retail-catalog:859610000876'
  ) AND catalog_exclusion_reason = 'duplicate_canonical_formula_sku_variant_current_official_formula') <> 2 THEN
    RAISE EXCEPTION 'Blue Tastefuls retailer serving aliases were not safely excluded';
  END IF;

  UPDATE public.catalog_skus
  SET
    formula_id = v_formula_id,
    active = true,
    last_observed_at = now(),
    updated_at = now()
  WHERE formula_id IN (
    SELECT id
    FROM public.catalog_formulas
    WHERE formula_key IN (
      'blue buffalo|blue buffalo|blue buffalo tastefuls adult dry cat food indoor cat formula chicken and brown rice|cat|adult|dry|chicken and brown rice|',
      'blue buffalo|blue buffalo|blue buffalo tastefuls adult indoor cat dry food natural chicken and brown rice|cat|adult|dry|chicken and brown rice|'
    )
  );

  INSERT INTO public.catalog_skus (
    formula_id, gtin, package_size, package_count, source_slug,
    source_external_id, source_url, active, first_observed_at,
    last_observed_at, updated_at
  ) VALUES
    (v_formula_id, NULL, '3 lb bag', 1, 'blue-buffalo-general-mills', 'tastefuls-indoor-chicken-brown-rice:3lb', v_source, true, now(), now(), now()),
    (v_formula_id, NULL, '5 lb bag', 1, 'blue-buffalo-general-mills', 'tastefuls-indoor-chicken-brown-rice:5lb', v_source, true, now(), now(), now()),
    (v_formula_id, NULL, '7 lb bag', 1, 'blue-buffalo-general-mills', 'tastefuls-indoor-chicken-brown-rice:7lb', v_source, true, now(), now(), now()),
    (v_formula_id, NULL, '10 lb bag', 1, 'blue-buffalo-general-mills', 'tastefuls-indoor-chicken-brown-rice:10lb', v_source, true, now(), now(), now()),
    (v_formula_id, NULL, '15 lb bag', 1, 'blue-buffalo-general-mills', 'tastefuls-indoor-chicken-brown-rice:15lb', v_source, true, now(), now(), now()),
    (v_formula_id, NULL, '22 lb bag', 1, 'blue-buffalo-general-mills', 'tastefuls-indoor-chicken-brown-rice:22lb', v_source, true, now(), now(), now())
  ON CONFLICT (source_slug, source_external_id, gtin, package_size) DO UPDATE SET
    formula_id = excluded.formula_id,
    source_url = excluded.source_url,
    active = true,
    last_observed_at = now(),
    updated_at = now();

  UPDATE public.catalog_formulas
  SET
    active = false,
    absent_since = now(),
    verification_status = 'quarantined',
    promoted_cache_key = NULL,
    updated_at = now()
  WHERE formula_key IN (
    'blue buffalo|blue buffalo|blue buffalo tastefuls adult dry cat food indoor cat formula chicken and brown rice|cat|adult|dry|chicken and brown rice|',
    'blue buffalo|blue buffalo|blue buffalo tastefuls adult indoor cat dry food natural chicken and brown rice|cat|adult|dry|chicken and brown rice|'
  );

  UPDATE public.catalog_formulas
  SET
    product_name = 'BLUE Tastefuls Adult Indoor Cat Chicken & Brown Rice Recipe',
    product_line = 'blue tastefuls adult indoor',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'chicken and brown rice recipe',
    is_complete_food = true,
    complete_food_evidence = 'Current official manufacturer product page for adult indoor cats; manufacturer-published nutrient panel and complete-food catalog classification.',
    front_image_url = v_image,
    source_url = v_source,
    source_authority = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    protected_terms = ARRAY[
      'blue buffalo', 'blue tastefuls', 'adult', 'indoor', 'cat',
      'chicken', 'brown rice', 'dry'
    ]::TEXT[],
    verification_status = 'verified',
    active = true,
    absent_since = NULL,
    promoted_cache_key = v_cache_key,
    promoted_at = now(),
    last_observed_at = now(),
    updated_at = now()
  WHERE id = v_formula_id;

  SELECT cache_key
  INTO v_search_cache
  FROM public.search_verified_products(
    'BLUE Tastefuls Adult Indoor Cat Chicken Brown Rice Recipe',
    5
  )
  LIMIT 1;

  SELECT cache_key
  INTO v_barcode_15
  FROM public.resolve_verified_product_by_gtin('859610000876', 8)
  LIMIT 1;

  SELECT cache_key
  INTO v_barcode_22
  FROM public.resolve_verified_product_by_gtin('840243151103', 8)
  LIMIT 1;

  IF v_search_cache IS DISTINCT FROM v_cache_key
     OR v_barcode_15 IS DISTINCT FROM v_cache_key
     OR v_barcode_22 IS DISTINCT FROM v_cache_key THEN
    RAISE EXCEPTION
      'Blue Tastefuls search/barcode regression: search %, 15 lb %, 22 lb %',
      v_search_cache, v_barcode_15, v_barcode_22;
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_formulas
    WHERE formula_key IN (
      v_formula_key,
      'blue buffalo|blue buffalo|blue buffalo tastefuls adult dry cat food indoor cat formula chicken and brown rice|cat|adult|dry|chicken and brown rice|',
      'blue buffalo|blue buffalo|blue buffalo tastefuls adult indoor cat dry food natural chicken and brown rice|cat|adult|dry|chicken and brown rice|'
    )
      AND active
      AND verification_status = 'verified'
  ) <> 1 THEN
    RAISE EXCEPTION 'Blue Tastefuls Indoor Chicken & Brown Rice still has duplicate active formulas';
  END IF;
END
$$;
