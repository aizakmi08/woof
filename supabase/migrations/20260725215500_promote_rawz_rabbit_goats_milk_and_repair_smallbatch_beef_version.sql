DO $$
DECLARE
  v_rawz_formula_id BIGINT;
  v_rawz_run_id BIGINT;
  v_rawz_observation_id BIGINT;
  v_rawz_key TEXT := 'rawz|rawz|96%|cat|adult|wet|rabbit with goat''s milk|';
  v_rawz_cache_key TEXT := 'rawz:rawz 96 rabbit with goat s milk canned cat food product 96-rabbit-with-goats-milk-canned-cat-food';
  v_rawz_source TEXT := 'https://rawznaturalpetfood.com/product/96-rabbit-with-goats-milk-canned-cat-food/';
  v_rawz_image TEXT := 'https://rawznaturalpetfood.com/wp-content/uploads/RAWZ_WebsiteCarousel_Cat_PateGM_Rabbit_5.5OZ-FRONT-scaled.webp';
  v_rawz_ingredients TEXT := 'Rabbit, Vegetable Broth, Goat''s Milk, Tricalcium Phosphate, Natural Flavor, Potassium Chloride, Fenugreek Seeds, Choline Chloride, Thiamine Mononitrate, Taurine, Dandelion Greens, Magnesium Sulfate, Kelp, Zinc Proteinate, Iron Proteinate, Niacin Supplement, Vitamin E Supplement, Copper Proteinate, Vitamin A Supplement, Manganese Proteinate, Sodium Selenite, Calcium Pantothenate, Pyridoxine Hydrochloride, Vitamin D3 Supplement, Riboflavin Supplement, Vitamin B12 Supplement, Folic Acid, Calcium Iodate, Biotin';
  v_rawz_hash TEXT;
BEGIN
  v_rawz_hash := encode(digest(
    v_rawz_key || '|' || v_rawz_ingredients || '|' || v_rawz_image,
    'sha256'
  ), 'hex');

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE formula_key <> v_rawz_key
      AND lower(brand) = 'rawz'
      AND pet_type = 'cat'
      AND food_form = 'wet'
      AND lower(flavor) LIKE '%rabbit%'
      AND lower(flavor) LIKE '%goat%'
      AND active
  ) THEN
    RAISE EXCEPTION 'RAWZ Rabbit with Goat''s Milk identity already belongs to a different active formula';
  END IF;

  INSERT INTO public.product_data (
    cache_key, product_name, brand, ingredients, ingredient_text,
    ingredient_count, source, source_url, scraped_at, expires_at,
    image_url, nutrient_panel, has_published_nutrients, is_complete_food,
    catalog_exclusion_reason, pet_type, source_quality,
    ingredient_verification_status, image_verification_status, verified_at,
    gtin, product_line, flavor, life_stage, food_form, package_size,
    updated_at
  ) VALUES (
    v_rawz_cache_key,
    'RAWZ 96% Rabbit with Goat''s Milk Canned Cat Food',
    'RAWZ',
    public.catalog_split_ingredient_statement(v_rawz_ingredients),
    v_rawz_ingredients,
    cardinality(public.catalog_split_ingredient_statement(v_rawz_ingredients)),
    'rawz',
    v_rawz_source,
    now(),
    now() + interval '365 days',
    v_rawz_image,
    '{"proteinContent":"10.50%","fatContent":"5.50%","fiberContent":"1.00%","moistureContent":"78.00%"}'::jsonb,
    true,
    true,
    NULL,
    'cat',
    'manufacturer',
    'manufacturer',
    'manufacturer',
    now(),
    NULL,
    '96%',
    'Rabbit with Goat''s Milk',
    'adult',
    'wet',
    '5.5 oz can',
    now()
  )
  ON CONFLICT (cache_key) DO UPDATE SET
    product_name = excluded.product_name,
    brand = excluded.brand,
    ingredients = excluded.ingredients,
    ingredient_text = excluded.ingredient_text,
    ingredient_count = excluded.ingredient_count,
    source = excluded.source,
    source_url = excluded.source_url,
    scraped_at = excluded.scraped_at,
    expires_at = excluded.expires_at,
    image_url = excluded.image_url,
    nutrient_panel = excluded.nutrient_panel,
    has_published_nutrients = excluded.has_published_nutrients,
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    pet_type = excluded.pet_type,
    source_quality = excluded.source_quality,
    ingredient_verification_status = excluded.ingredient_verification_status,
    image_verification_status = excluded.image_verification_status,
    verified_at = excluded.verified_at,
    product_line = excluded.product_line,
    flavor = excluded.flavor,
    life_stage = excluded.life_stage,
    food_form = excluded.food_form,
    package_size = excluded.package_size,
    updated_at = now();

  INSERT INTO public.catalog_formulas (
    formula_key, manufacturer, brand, product_name, product_line, pet_type,
    life_stage, food_form, flavor, diet_condition, is_complete_food,
    complete_food_evidence, ingredient_text, ingredients, front_image_url,
    source_url, source_authority, ingredient_verification_status,
    image_verification_status, protected_terms, verification_status, active,
    is_popular_brand, first_observed_at, last_observed_at, promoted_cache_key,
    promoted_at, identity_hash, created_at, updated_at
  ) VALUES (
    v_rawz_key, 'rawz', 'rawz',
    'RAWZ 96% Rabbit with Goat''s Milk Canned Cat Food',
    '96%', 'cat', 'adult', 'wet', 'rabbit with goat''s milk', '',
    true,
    'Official manufacturer page states 100% nutritionally complete and formulated to meet AAFCO Cat Food Nutrient Profiles for Maintenance.',
    v_rawz_ingredients,
    public.catalog_split_ingredient_statement(v_rawz_ingredients),
    v_rawz_image,
    v_rawz_source,
    'manufacturer',
    'manufacturer',
    'manufacturer',
    ARRAY[
      'rawz', '96%', 'rabbit', 'goat''s milk', 'canned', 'cat',
      'wet', 'adult', 'maintenance'
    ]::TEXT[],
    'verified',
    true,
    false,
    now(),
    now(),
    v_rawz_cache_key,
    now(),
    encode(digest(v_rawz_key, 'sha256'), 'hex'),
    now(),
    now()
  )
  ON CONFLICT (formula_key) DO UPDATE SET
    product_name = excluded.product_name,
    product_line = excluded.product_line,
    pet_type = excluded.pet_type,
    life_stage = excluded.life_stage,
    food_form = excluded.food_form,
    flavor = excluded.flavor,
    is_complete_food = true,
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
    absent_since = NULL,
    promoted_cache_key = excluded.promoted_cache_key,
    promoted_at = now(),
    last_observed_at = now(),
    updated_at = now()
  RETURNING id INTO v_rawz_formula_id;

  INSERT INTO public.catalog_skus (
    formula_id, gtin, package_size, package_count, source_slug,
    source_external_id, source_url, active, first_observed_at,
    last_observed_at, updated_at
  ) VALUES (
    v_rawz_formula_id, NULL, '5.5 oz can', 1, 'rawz',
    '96-rabbit-with-goats-milk-canned-cat-food:5.5oz',
    v_rawz_source, true, now(), now(), now()
  )
  ON CONFLICT (source_slug, source_external_id, gtin, package_size) DO UPDATE SET
    formula_id = excluded.formula_id,
    source_url = excluded.source_url,
    active = true,
    last_observed_at = now(),
    updated_at = now();

  INSERT INTO public.catalog_source_runs (
    run_key, source_slug, source_type, coverage_role, status, started_at,
    finished_at, expected_count, observed_count, accepted_count,
    rejected_count, pagination_complete, source_content_hash, checkpoint,
    metadata, created_at, updated_at
  ) VALUES (
    'rawz-rabbit-goats-milk-manual-20260725',
    'rawz',
    'manufacturer',
    'verification',
    'completed',
    now(),
    now(),
    1,
    1,
    1,
    0,
    true,
    v_rawz_hash,
    '{"completed":true}'::jsonb,
    jsonb_build_object(
      'method', 'official_manufacturer_page_exact_evidence',
      'capture_date', '2026-07-25',
      'formula_key', v_rawz_key
    ),
    now(),
    now()
  )
  ON CONFLICT (run_key) DO UPDATE SET
    finished_at = excluded.finished_at,
    status = 'completed',
    observed_count = 1,
    accepted_count = 1,
    rejected_count = 0,
    pagination_complete = true,
    source_content_hash = excluded.source_content_hash,
    metadata = excluded.metadata,
    updated_at = now()
  RETURNING id INTO v_rawz_run_id;

  INSERT INTO public.catalog_observations (
    run_id, formula_id, source_slug, source_external_id, source_url,
    source_authority, gtin, manufacturer, brand, product_name, product_line,
    pet_type, life_stage, food_form, flavor, diet_condition, package_size,
    ingredient_text, front_image_url, is_complete_food, available_in_us,
    observed_at, content_hash, validation_status, validation_reasons,
    raw_payload, created_at
  ) VALUES (
    v_rawz_run_id,
    v_rawz_formula_id,
    'rawz',
    '96-rabbit-with-goats-milk-canned-cat-food:5.5oz',
    v_rawz_source,
    'manufacturer',
    NULL,
    'rawz',
    'rawz',
    'RAWZ 96% Rabbit with Goat''s Milk Canned Cat Food',
    '96%',
    'cat',
    'adult',
    'wet',
    'rabbit with goat''s milk',
    '',
    '5.5 oz can',
    v_rawz_ingredients,
    v_rawz_image,
    true,
    true,
    now(),
    v_rawz_hash,
    'accepted',
    ARRAY[]::TEXT[],
    jsonb_build_object(
      'capture_date', '2026-07-25',
      'complete_food_text', '100% nutritionally complete; AAFCO Cat Food Nutrient Profiles for Maintenance',
      'guaranteed_analysis', jsonb_build_object(
        'protein_min', '10.50%',
        'fat_min', '5.50%',
        'fiber_max', '1.00%',
        'moisture_max', '78.00%'
      )
    ),
    now()
  )
  ON CONFLICT (run_id, source_slug, source_external_id, content_hash) DO UPDATE SET
    formula_id = excluded.formula_id,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    observed_at = now()
  RETURNING id INTO v_rawz_observation_id;

  INSERT INTO public.catalog_field_evidence (
    formula_id, observation_id, field_name, field_value, source_url,
    source_authority, accepted, observed_at, content_hash, created_at
  ) VALUES
    (
      v_rawz_formula_id, v_rawz_observation_id, 'ingredients',
      to_jsonb(v_rawz_ingredients), v_rawz_source, 'manufacturer', true, now(),
      encode(digest('ingredients|' || v_rawz_ingredients, 'sha256'), 'hex'), now()
    ),
    (
      v_rawz_formula_id, v_rawz_observation_id, 'front_image_url',
      to_jsonb(v_rawz_image), v_rawz_source, 'manufacturer', true, now(),
      encode(digest('front_image_url|' || v_rawz_image, 'sha256'), 'hex'), now()
    ),
    (
      v_rawz_formula_id, v_rawz_observation_id, 'complete_food_evidence',
      to_jsonb('100% nutritionally complete; AAFCO Cat Food Nutrient Profiles for Maintenance'::TEXT),
      v_rawz_source, 'manufacturer', true, now(),
      encode(digest('complete_food|rawz-rabbit-goats-milk-maintenance', 'sha256'), 'hex'), now()
    )
  ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE SET
    observation_id = excluded.observation_id,
    accepted = true,
    observed_at = now();

  IF (
    SELECT count(*)
    FROM public.product_data
    WHERE cache_key = v_rawz_cache_key
      AND catalog_exclusion_reason IS NULL
      AND is_complete_food
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND ingredient_count = 29
      AND pet_type = 'cat'
      AND life_stage = 'adult'
      AND food_form = 'wet'
  ) <> 1 THEN
    RAISE EXCEPTION 'RAWZ serving-row promotion failed';
  END IF;
END
$$;

DO $$
DECLARE
  v_formula_id BIGINT;
  v_run_id BIGINT;
  v_slider_observation_id BIGINT;
  v_patty_observation_id BIGINT;
  v_formula_key TEXT := 'smallbatch|smallbatch|frozen raw|dog|all life stages|frozen|beef|';
  v_slider_cache_key TEXT := 'smallbatch-pets:smallbatch frozen raw beef sliders for dogs products frozen-raw-beef-sliders';
  v_old_patty_cache_key TEXT := 'smallbatch-pets:smallbatch frozen raw beef patties for dogs products frozen-raw-beef-sliders-for-dogs-test';
  v_current_patty_cache_key TEXT := 'smallbatch-pets:smallbatch frozen raw beef patties for dogs 6 lb patties products frozen-raw-beef-sliders-for-dogs';
  v_slider_source TEXT := 'https://smallbatchpets.com/products/frozen-raw-beef-sliders';
  v_patty_source TEXT := 'https://smallbatchpets.com/products/frozen-raw-beef-sliders-for-dogs';
  v_slider_image TEXT := 'https://smallbatchpets.com/cdn/shop/files/Beef-Frozen-Raw-Sliders-3lb-MAIN_450x450.png?v=1772044354';
  v_patty_image TEXT := 'https://smallbatchpets.com/cdn/shop/files/Beef-Frozen-Raw-Patties-3lb-MAIN_ad66a961-f017-4283-9cc5-a4bab8532a4d_450x450.png?v=1784834343';
  v_ingredients TEXT := 'Beef Heart, Ground Beef Bone, Beef Kidney, Beef Liver, Organic Carrots, Organic Zucchini, Organic Sweet Potatoes, Organic Kale, Organic Sunflower Seeds, Organic Broccoli, Organic Pumpkin Seeds, Organic Spinach, Organic Blueberries, Organic Parsley, Organic Apple Cider Vinegar, Sea Salt, Cod Liver Oil, Dried Organic Kelp, Organic Basil, Vitamin E Supplement, Organic Shiitake Mushroom';
  v_hash TEXT;
BEGIN
  SELECT id
  INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_formula_key;

  v_hash := encode(digest(
    v_formula_key || '|' || v_ingredients || '|' || v_slider_image || '|' || v_patty_image,
    'sha256'
  ), 'hex');

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id <> v_formula_id
      AND lower(brand) = 'smallbatch'
      AND pet_type = 'dog'
      AND food_form = 'frozen'
      AND lower(flavor) = 'beef'
      AND active
  ) THEN
    RAISE EXCEPTION 'Smallbatch frozen raw beef identity belongs to multiple active formulas';
  END IF;

  UPDATE public.product_data
  SET
    product_name = 'Frozen Raw Beef Sliders for Dogs',
    ingredients = public.catalog_split_ingredient_statement(v_ingredients),
    ingredient_text = v_ingredients,
    ingredient_count = cardinality(public.catalog_split_ingredient_statement(v_ingredients)),
    source = 'smallbatch-pets',
    source_url = v_slider_source,
    scraped_at = now(),
    expires_at = now() + interval '365 days',
    image_url = v_slider_image,
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    pet_type = 'dog',
    source_quality = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    verified_at = now(),
    product_line = 'Frozen Raw',
    flavor = 'Beef',
    life_stage = 'all life stages',
    food_form = 'frozen',
    package_size = '3 lb sliders',
    updated_at = now()
  WHERE cache_key = v_slider_cache_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Smallbatch canonical slider serving row is missing';
  END IF;

  UPDATE public.product_data
  SET
    cache_key = v_current_patty_cache_key,
    product_name = 'Frozen Raw Beef Patties for Dogs',
    ingredients = public.catalog_split_ingredient_statement(v_ingredients),
    ingredient_text = v_ingredients,
    ingredient_count = cardinality(public.catalog_split_ingredient_statement(v_ingredients)),
    source = 'smallbatch-pets',
    source_url = v_patty_source,
    scraped_at = now(),
    expires_at = now() + interval '365 days',
    image_url = v_patty_image,
    is_complete_food = false,
    catalog_exclusion_reason = 'duplicate_canonical_formula_sku_variant',
    pet_type = 'dog',
    source_quality = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    verified_at = now(),
    product_line = 'Frozen Raw',
    flavor = 'Beef',
    life_stage = 'all life stages',
    food_form = 'frozen',
    package_size = '6 lb patties',
    updated_at = now()
  WHERE cache_key = v_old_patty_cache_key;

  IF NOT FOUND THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.product_data WHERE cache_key = v_current_patty_cache_key
    ) THEN
      RAISE EXCEPTION 'Smallbatch patty serving alias is missing';
    END IF;
  END IF;

  UPDATE public.catalog_formulas
  SET
    product_name = 'Frozen Raw Beef Sliders for Dogs',
    product_line = 'frozen raw',
    pet_type = 'dog',
    life_stage = 'all life stages',
    food_form = 'frozen',
    flavor = 'beef',
    is_complete_food = true,
    complete_food_evidence = 'Official manufacturer pages state complete and balanced and formulated to meet AAFCO dog food nutrient profiles for all life stages, excluding growth of large breed dogs.',
    ingredient_text = v_ingredients,
    ingredients = public.catalog_split_ingredient_statement(v_ingredients),
    front_image_url = v_slider_image,
    source_url = v_slider_source,
    source_authority = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    protected_terms = ARRAY[
      'smallbatch', 'frozen raw', 'beef', 'dog', 'sliders', 'patties',
      'all life stages', 'large breed growth exclusion'
    ]::TEXT[],
    verification_status = 'verified',
    active = true,
    absent_since = NULL,
    last_observed_at = now(),
    promoted_cache_key = v_slider_cache_key,
    promoted_at = now(),
    updated_at = now()
  WHERE id = v_formula_id;

  UPDATE public.catalog_skus
  SET
    source_external_id = 'frozen-raw-beef-patties-for-dogs:6lb',
    source_url = v_patty_source,
    active = true,
    last_observed_at = now(),
    updated_at = now()
  WHERE formula_id = v_formula_id
    AND source_external_id = v_old_patty_cache_key
    AND package_size = '6 lb patties';

  INSERT INTO public.catalog_skus (
    formula_id, gtin, package_size, package_count, source_slug,
    source_external_id, source_url, active, first_observed_at,
    last_observed_at, updated_at
  ) VALUES
    (
      v_formula_id, NULL, '3 lb sliders', 1, 'smallbatch-pets',
      'frozen-raw-beef-sliders:3lb', v_slider_source,
      true, now(), now(), now()
    ),
    (
      v_formula_id, NULL, '6 lb patties', 1, 'smallbatch-pets',
      'frozen-raw-beef-patties-for-dogs:6lb', v_patty_source,
      true, now(), now(), now()
    ),
    (
      v_formula_id, NULL, '18 lb patties', 1, 'smallbatch-pets',
      'frozen-raw-beef-patties-for-dogs:18lb', v_patty_source,
      true, now(), now(), now()
    )
  ON CONFLICT (source_slug, source_external_id, gtin, package_size) DO UPDATE SET
    formula_id = excluded.formula_id,
    source_url = excluded.source_url,
    active = true,
    last_observed_at = now(),
    updated_at = now();

  INSERT INTO public.catalog_source_runs (
    run_key, source_slug, source_type, coverage_role, status, started_at,
    finished_at, expected_count, observed_count, accepted_count,
    rejected_count, pagination_complete, source_content_hash, checkpoint,
    metadata, created_at, updated_at
  ) VALUES (
    'smallbatch-frozen-beef-recipe-improvement-20260725',
    'smallbatch-pets',
    'manufacturer',
    'verification',
    'completed',
    now(),
    now(),
    2,
    2,
    2,
    0,
    true,
    v_hash,
    '{"completed":true}'::jsonb,
    jsonb_build_object(
      'method', 'official_manufacturer_page_formula_version_repair',
      'capture_date', '2026-07-25',
      'formula_key', v_formula_key,
      'manufacturer_notice', 'We have made recipe improvements'
    ),
    now(),
    now()
  )
  ON CONFLICT (run_key) DO UPDATE SET
    finished_at = excluded.finished_at,
    status = 'completed',
    observed_count = 2,
    accepted_count = 2,
    rejected_count = 0,
    pagination_complete = true,
    source_content_hash = excluded.source_content_hash,
    metadata = excluded.metadata,
    updated_at = now()
  RETURNING id INTO v_run_id;

  INSERT INTO public.catalog_observations (
    run_id, formula_id, source_slug, source_external_id, source_url,
    source_authority, gtin, manufacturer, brand, product_name, product_line,
    pet_type, life_stage, food_form, flavor, diet_condition, package_size,
    ingredient_text, front_image_url, is_complete_food, available_in_us,
    observed_at, content_hash, validation_status, validation_reasons,
    raw_payload, created_at
  ) VALUES (
    v_run_id, v_formula_id, 'smallbatch-pets',
    'frozen-raw-beef-sliders:3lb', v_slider_source, 'manufacturer', NULL,
    'smallbatch', 'smallbatch', 'Frozen Raw Beef Sliders for Dogs',
    'frozen raw', 'dog', 'all life stages', 'frozen', 'beef', '',
    '3 lb sliders', v_ingredients, v_slider_image, true, true, now(),
    encode(digest(v_hash || '|sliders|3lb', 'sha256'), 'hex'),
    'accepted', ARRAY[]::TEXT[],
    jsonb_build_object(
      'capture_date', '2026-07-25',
      'formula_version', 'current recipe improvement',
      'large_breed_growth_exclusion', true
    ),
    now()
  )
  ON CONFLICT (run_id, source_slug, source_external_id, content_hash) DO UPDATE SET
    formula_id = excluded.formula_id,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    observed_at = now()
  RETURNING id INTO v_slider_observation_id;

  INSERT INTO public.catalog_observations (
    run_id, formula_id, source_slug, source_external_id, source_url,
    source_authority, gtin, manufacturer, brand, product_name, product_line,
    pet_type, life_stage, food_form, flavor, diet_condition, package_size,
    ingredient_text, front_image_url, is_complete_food, available_in_us,
    observed_at, content_hash, validation_status, validation_reasons,
    raw_payload, created_at
  ) VALUES (
    v_run_id, v_formula_id, 'smallbatch-pets',
    'frozen-raw-beef-patties-for-dogs:6lb-and-18lb',
    v_patty_source, 'manufacturer', NULL,
    'smallbatch', 'smallbatch', 'Frozen Raw Beef Patties for Dogs',
    'frozen raw', 'dog', 'all life stages', 'frozen', 'beef', '',
    '6 lb and 18 lb patties', v_ingredients, v_patty_image, true, true, now(),
    encode(digest(v_hash || '|patties|6lb|18lb', 'sha256'), 'hex'),
    'accepted', ARRAY[]::TEXT[],
    jsonb_build_object(
      'capture_date', '2026-07-25',
      'formula_version', 'current recipe improvement',
      'package_sizes', jsonb_build_array('6 lb patties', '18 lb patties'),
      'large_breed_growth_exclusion', true
    ),
    now()
  )
  ON CONFLICT (run_id, source_slug, source_external_id, content_hash) DO UPDATE SET
    formula_id = excluded.formula_id,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    observed_at = now()
  RETURNING id INTO v_patty_observation_id;

  INSERT INTO public.catalog_field_evidence (
    formula_id, observation_id, field_name, field_value, source_url,
    source_authority, accepted, observed_at, content_hash, created_at
  ) VALUES
    (
      v_formula_id, v_slider_observation_id, 'ingredients',
      to_jsonb(v_ingredients), v_slider_source, 'manufacturer', true, now(),
      encode(digest('ingredients|' || v_ingredients, 'sha256'), 'hex'), now()
    ),
    (
      v_formula_id, v_slider_observation_id, 'front_image_url',
      to_jsonb(v_slider_image), v_slider_source, 'manufacturer', true, now(),
      encode(digest('front_image_url|' || v_slider_image, 'sha256'), 'hex'), now()
    ),
    (
      v_formula_id, v_patty_observation_id, 'package_variant_front_image_url',
      to_jsonb(v_patty_image), v_patty_source, 'manufacturer', true, now(),
      encode(digest('package_variant_front_image_url|' || v_patty_image, 'sha256'), 'hex'), now()
    ),
    (
      v_formula_id, v_slider_observation_id, 'formula_version',
      jsonb_build_object(
        'status', 'current',
        'manufacturer_notice', 'We have made recipe improvements',
        'observed_date', '2026-07-25'
      ),
      v_slider_source, 'manufacturer', true, now(),
      encode(digest('formula_version|smallbatch-frozen-beef-current-20260725', 'sha256'), 'hex'), now()
    )
  ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE SET
    observation_id = excluded.observation_id,
    accepted = true,
    observed_at = now();

  IF (
    SELECT count(*)
    FROM public.product_data
    WHERE cache_key = v_slider_cache_key
      AND catalog_exclusion_reason IS NULL
      AND is_complete_food
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND ingredient_count = 21
      AND pet_type = 'dog'
      AND life_stage = 'all life stages'
      AND food_form = 'frozen'
  ) <> 1 THEN
    RAISE EXCEPTION 'Smallbatch current canonical serving row repair failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = v_old_patty_cache_key
      AND is_complete_food
  ) THEN
    RAISE EXCEPTION 'Smallbatch obsolete test-path serving row remains active';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_skus
    WHERE formula_id = v_formula_id
      AND active
      AND package_size IN ('3 lb sliders', '6 lb patties', '18 lb patties')
  ) < 3 THEN
    RAISE EXCEPTION 'Smallbatch formula package variants were not preserved';
  END IF;
END
$$;
