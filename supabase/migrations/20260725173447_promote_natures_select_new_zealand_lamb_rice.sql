DO $$
DECLARE
  v_formula_id BIGINT;
  v_key TEXT := 'nature''s select premium pet products|nature''s select|select|dog|adult|dry|new zealand lamb and rice recipe|';
  v_source TEXT := 'https://www.naturesselectpetfood.com/dryfood/selectnewzealandrecipe';
  v_front TEXT := 'https://images.squarespace-cdn.com/content/v1/60f7077195879f2b347f26a0/9b4d8257-a548-46c6-9380-e6f4385f2e26/NZ+2026+3D+Bag+PNG.png';
  v_cache_key TEXT := 'nature-s-select:nature s select nature s select premium pet products select new zealand lamb rice recipe mdash nature s select premium pet products dryfood selectnewzealandrecipe';
  v_original TEXT;
  v_ingredients TEXT;
BEGIN
  SELECT ingredient_text
  INTO STRICT v_original
  FROM public.product_data
  WHERE cache_key = v_cache_key
    AND source_url = v_source
    AND pet_type = 'dog';

  v_ingredients := replace(
    v_original,
    'Selenium Yeast, Vitamins',
    'Selenium Yeast), Vitamins'
  );

  IF v_ingredients = v_original
     OR cardinality(public.catalog_split_ingredient_statement(v_ingredients)) <> 58
     OR (
       length(v_ingredients) - length(replace(v_ingredients, '(', ''))
     ) <> (
       length(v_ingredients) - length(replace(v_ingredients, ')', ''))
     ) THEN
    RAISE EXCEPTION 'Nature''s Select bounded ingredient repair precondition failed';
  END IF;

  UPDATE public.product_data
  SET
    product_name = 'Nature''s Select Select New Zealand Lamb & Rice Recipe Dry Dog Food',
    brand = 'Nature''s Select',
    ingredients = public.catalog_split_ingredient_statement(v_ingredients),
    ingredient_text = v_ingredients,
    ingredient_count = cardinality(public.catalog_split_ingredient_statement(v_ingredients)),
    source = 'natures-select-manufacturer-manual',
    source_url = v_source,
    scraped_at = now(),
    expires_at = now() + interval '365 days',
    image_url = v_front,
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    pet_type = 'dog',
    source_quality = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    verified_at = now(),
    product_line = 'Select',
    flavor = 'New Zealand Lamb & Rice Recipe',
    life_stage = 'adult',
    food_form = 'dry',
    package_size = '28 lb bag',
    updated_at = now()
  WHERE cache_key = v_cache_key;

  UPDATE public.product_data
  SET
    catalog_exclusion_reason = 'duplicate_alias_of_verified_formula',
    ingredient_verification_status = 'unverified',
    image_verification_status = CASE
      WHEN source_url IS NULL THEN 'unverified'
      ELSE image_verification_status
    END,
    expires_at = now(),
    updated_at = now()
  WHERE cache_key IN (
    'nature039s select nature039s select new zealand',
    'natures select new zealand lamb amp rice dry for adults'
  );

  INSERT INTO public.catalog_formulas (
    formula_key, manufacturer, brand, product_name, product_line, pet_type,
    life_stage, food_form, flavor, diet_condition, is_complete_food,
    complete_food_evidence, ingredient_text, ingredients, front_image_url,
    source_url, source_authority, ingredient_verification_status,
    image_verification_status, protected_terms, verification_status, active,
    is_popular_brand, first_observed_at, last_observed_at, promoted_cache_key,
    promoted_at, identity_hash, created_at, updated_at
  ) VALUES (
    v_key, 'nature''s select premium pet products', 'nature''s select',
    'Nature''s Select Select New Zealand Lamb & Rice Recipe Dry Dog Food',
    'select', 'dog', 'adult', 'dry',
    'new zealand lamb and rice recipe', '', true,
    'Official current manufacturer page: formulated to meet AAFCO Dog Food Nutrient Profiles for maintenance of adult dogs.',
    v_ingredients, public.catalog_split_ingredient_statement(v_ingredients),
    v_front, v_source, 'manufacturer', 'manufacturer', 'manufacturer',
    ARRAY[
      'nature''s select', 'natures select', 'select', 'new zealand',
      'lamb', 'rice', 'adult', 'dog', 'dry', 'maintenance'
    ]::TEXT[],
    'verified', true, false, now(), now(), v_cache_key, now(),
    encode(digest(v_key, 'sha256'), 'hex'), now(), now()
  )
  ON CONFLICT (formula_key) DO UPDATE SET
    manufacturer = excluded.manufacturer,
    brand = excluded.brand,
    product_name = excluded.product_name,
    product_line = excluded.product_line,
    pet_type = excluded.pet_type,
    life_stage = excluded.life_stage,
    food_form = excluded.food_form,
    flavor = excluded.flavor,
    diet_condition = excluded.diet_condition,
    is_complete_food = excluded.is_complete_food,
    complete_food_evidence = excluded.complete_food_evidence,
    ingredient_text = excluded.ingredient_text,
    ingredients = excluded.ingredients,
    front_image_url = excluded.front_image_url,
    source_url = excluded.source_url,
    source_authority = excluded.source_authority,
    ingredient_verification_status = excluded.ingredient_verification_status,
    image_verification_status = excluded.image_verification_status,
    protected_terms = excluded.protected_terms,
    verification_status = 'verified',
    active = true,
    promoted_cache_key = excluded.promoted_cache_key,
    promoted_at = now(),
    last_observed_at = now(),
    updated_at = now()
  RETURNING id INTO v_formula_id;

  INSERT INTO public.catalog_skus (
    formula_id, gtin, package_size, package_count, source_slug,
    source_external_id, source_url, active, first_observed_at,
    last_observed_at, updated_at
  ) VALUES (
    v_formula_id, NULL, '28 lb bag', 1,
    'natures-select-manufacturer-manual',
    'squarespace-item:60f87e04d8601742b3cfceb9:28lb',
    v_source, true, now(), now(), now()
  )
  ON CONFLICT (source_slug, source_external_id, gtin, package_size) DO UPDATE
  SET
    formula_id = excluded.formula_id,
    package_count = excluded.package_count,
    source_url = excluded.source_url,
    active = true,
    last_observed_at = now(),
    updated_at = now();

  IF (
    SELECT count(*)
    FROM public.product_data
    WHERE cache_key = v_cache_key
      AND catalog_exclusion_reason IS NULL
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND product_line = 'Select'
      AND life_stage = 'adult'
      AND food_form = 'dry'
      AND ingredient_count = 58
      AND package_size = '28 lb bag'
  ) <> 1 THEN
    RAISE EXCEPTION 'Nature''s Select serving-row promotion failed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.product_data
    WHERE cache_key IN (
      'nature039s select nature039s select new zealand',
      'natures select new zealand lamb amp rice dry for adults'
    )
      AND catalog_exclusion_reason = 'duplicate_alias_of_verified_formula'
  ) <> 2 THEN
    RAISE EXCEPTION 'Nature''s Select duplicate alias exclusion failed';
  END IF;
END
$$;
