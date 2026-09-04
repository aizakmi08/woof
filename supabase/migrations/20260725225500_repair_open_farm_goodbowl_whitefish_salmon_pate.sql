-- Repair a stale serving copy and truncated canonical identity for the current
-- Open Farm Goodbowl Wild-Caught Whitefish & Salmon Pâté for Dogs.
DO $$
DECLARE
  v_formula_id BIGINT;
  v_cache_key TEXT := 'open-farm:683547140981';
  v_gtin TEXT := '683547140981';
  v_old_formula_key TEXT :=
    'open farm|open farm|goodbowl wild caught|dog|unknown|wet|whitefish and salmon p|';
  v_formula_key TEXT :=
    'open farm|open farm|goodbowl wild caught|dog|adult|wet|whitefish and salmon|';
  v_source_url TEXT :=
    'https://openfarmpet.com/products/goodbowl%E2%84%A2-wild-caught-whitefish-salmon-pate-for-dogs';
  v_image_url TEXT :=
    'https://openfarmpet.com/cdn/shop/files/OFP-Dog-PLP-Goodbowl_Pates-Whitefish_and_Salmon-RENDER_548x768_436a850c-38df-4ef3-b3c2-fa617a38c0c8.png?v=1769199748&width=1024';
  v_search_cache TEXT;
  v_barcode_cache TEXT;
BEGIN
  SELECT id
  INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_old_formula_key
    AND verification_status = 'verified'
    AND active
    AND cardinality(ingredients) = 31
    AND ingredients[1:5] = ARRAY[
      'Ocean Whitefish',
      'Fish Broth',
      'Oats',
      'Wild-Caught Pacific Salmon',
      'Pumpkin'
    ]::TEXT[]
    AND source_url = v_source_url;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE formula_key = v_formula_key
      AND id <> v_formula_id
  ) THEN
    RAISE EXCEPTION 'Open Farm Goodbowl corrected formula identity already exists';
  END IF;

  UPDATE public.catalog_formulas
  SET
    formula_key = v_formula_key,
    product_name =
      'Goodbowl Wild-Caught Whitefish & Salmon Pâté for Dogs',
    product_line = 'goodbowl wild caught',
    flavor = 'whitefish and salmon',
    life_stage = 'adult',
    food_form = 'wet',
    complete_food_evidence =
      'Current official Open Farm PDP identifies a complete and balanced pâté and states AAFCO adult-maintenance nutritional adequacy.',
    front_image_url = v_image_url,
    source_url = v_source_url,
    source_authority = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    protected_terms = ARRAY[
      'open farm',
      'goodbowl',
      'wild-caught',
      'whitefish',
      'salmon',
      'pâté',
      'dog',
      'adult',
      'wet'
    ]::TEXT[],
    verification_status = 'verified',
    active = true,
    absent_since = NULL,
    promoted_cache_key = v_cache_key,
    promoted_at = now(),
    last_observed_at = now(),
    updated_at = now()
  WHERE id = v_formula_id;

  UPDATE public.product_data AS serving
  SET
    product_name =
      'Goodbowl Wild-Caught Whitefish & Salmon Pâté for Dogs',
    brand = 'Open Farm',
    product_line = 'Goodbowl Wild-Caught',
    flavor = 'Whitefish & Salmon',
    life_stage = 'adult',
    food_form = 'wet',
    pet_type = 'dog',
    ingredients = formula.ingredients,
    ingredient_text = formula.ingredient_text,
    ingredient_count = cardinality(formula.ingredients),
    source = 'open-farm',
    source_url = v_source_url,
    image_url = v_image_url,
    source_quality = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    verified_at = now(),
    scraped_at = now(),
    expires_at = now() + interval '365 days',
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    gtin = v_gtin,
    package_size = '12.5 oz (Case of 12)',
    updated_at = now()
  FROM public.catalog_formulas AS formula
  WHERE serving.cache_key = v_cache_key
    AND formula.id = v_formula_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Open Farm Goodbowl serving row is missing';
  END IF;

  UPDATE public.catalog_skus
  SET
    formula_id = v_formula_id,
    package_size = '12.5 oz',
    package_count = 12,
    source_slug = 'open-farm',
    source_external_id = v_cache_key,
    source_url = v_source_url,
    active = true,
    last_observed_at = now(),
    updated_at = now()
  WHERE gtin = v_gtin;

  IF (
    SELECT count(*)
    FROM public.catalog_skus
    WHERE gtin = v_gtin
      AND formula_id = v_formula_id
      AND package_size = '12.5 oz'
      AND package_count = 12
      AND active
  ) <> 1 THEN
    RAISE EXCEPTION 'Open Farm Goodbowl exact package SKU was not preserved';
  END IF;

  SELECT cache_key
  INTO v_search_cache
  FROM public.search_verified_products(
    'Open Farm Goodbowl Wild-Caught Whitefish Salmon Pate for Dogs',
    5
  )
  LIMIT 1;

  SELECT cache_key
  INTO v_barcode_cache
  FROM public.resolve_verified_product_by_gtin(v_gtin, 8)
  LIMIT 1;

  IF v_search_cache IS DISTINCT FROM v_cache_key
     OR v_barcode_cache IS DISTINCT FROM v_cache_key
     OR (
       SELECT ingredient_count
       FROM public.product_data
       WHERE cache_key = v_cache_key
     ) <> 31
  THEN
    RAISE EXCEPTION
      'Open Farm Goodbowl search/barcode/ingredient regression: search %, barcode %',
      v_search_cache, v_barcode_cache;
  END IF;
END
$$;
