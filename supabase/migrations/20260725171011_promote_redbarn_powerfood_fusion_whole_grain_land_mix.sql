DO $$
DECLARE
  v_formula_id BIGINT;
  v_key TEXT := 'redbarn|redbarn|powerfood fusion|dog|adult|dry|whole grain land mix|';
  v_source TEXT := 'https://www.redbarn.com/products/powerfood-fusion-whole-grain-land-mix-recipe';
  v_front TEXT := 'https://cdn.shopify.com/s/files/1/0508/4767/8644/files/RBPP-1127-0a_-_120082_KibbleFusion_WGLandBeef_3.5lb_-_Bowl_Front.jpg?v=1779111533';
  v_ingredients TEXT := 'Beef, Lamb, Beef Meal, Pork Meal, Lamb Meal, Oatmeal, Barley, Whole Grain Sorghum, Millet, Brown Rice, Sunflower Oil, Flaxseed, Dried Yeast, Miscanthus Grass, Sunflower Meal, Brewers Rice, Beef Lung, Natural Flavor, Beef Liver, DL-Methionine, Potassium Chloride, Salt, Minerals (Zinc Proteinate, Iron Proteinate, Copper Proteinate, Selenium Yeast, Manganese Proteinate, Ethylenediamine Dihydroiodide, Ferrous Sulfate, Zinc Sulfate, Sodium Selenite, Manganese Sulfate, Calcium Iodate), Salmon Oil (Preserved With Mixed Tocopherols), Choline (Choline Chloride), Dicalcium Phosphate, Calcium Carbonate, Taurine, Inulin, Vitamins (Vitamin E Supplement, Niacin Supplement, Vitamin A Supplement, Riboflavin Supplement, Vitamin B5 (d-Calcium Pantothenate), Vitamin B1 (Thiamine Mononitrate), Vitamin B6 (Pyridoxine Hydrochloride), Vitamin B12 Supplement, Vitamin B7 (Biotin), Vitamin D3 Supplement, Vitamin B9 (Folic Acid)), Lactic Acid, Citric Acid (A Preservative), Dried Pumpkin, Turmeric, Magnesium Sulfate, Yeast Culture, Dried Aspergillus Oryzae Fermentation Extract, Dried Bacillus Subtilis Fermentation Product, Dried Bacillus Licheniformis Fermentation Product, Dried Trichoderma Longibrachiatum Fermentation Extract, Dried Enterococcus Faecium Fermentation Product, Dried Lactobacillus Acidophilus Fermentation Product, Dried Bacillus Subtilis Fermentation Extract, Brewers Dried Yeast, L-Carnitine, Rosemary Extract.';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.catalog_skus sku
    JOIN public.catalog_formulas f ON f.id = sku.formula_id
    WHERE ltrim(regexp_replace(coalesce(sku.gtin, ''), '[^0-9]', '', 'g'), '0')
      IN ('785184120828', '785184120729', '785184920824')
      AND f.formula_key <> v_key
  ) THEN
    RAISE EXCEPTION 'Redbarn package GTIN already belongs to another formula';
  END IF;

  UPDATE public.product_data
  SET
    product_name = 'Redbarn Powerfood Fusion Whole Grain Land Mix Recipe Dry Dog Food',
    brand = 'Redbarn',
    ingredients = public.catalog_split_ingredient_statement(v_ingredients),
    ingredient_text = v_ingredients,
    ingredient_count = cardinality(public.catalog_split_ingredient_statement(v_ingredients)),
    source = 'redbarn-manufacturer-manual',
    source_url = v_source,
    scraped_at = now(),
    expires_at = now() + interval '365 days',
    image_url = v_front,
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    pet_type = 'dog',
    source_quality = 'manufacturer',
    ingredient_verification_status = 'label_ocr_verified',
    image_verification_status = 'manufacturer',
    verified_at = now(),
    gtin = '785184120828',
    product_line = 'Powerfood Fusion',
    flavor = 'Whole Grain Land Mix',
    life_stage = 'adult',
    food_form = 'dry',
    package_size = '3.5 lb bag',
    updated_at = now()
  WHERE cache_key = 'redbarn-pet-products:785184120828';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Redbarn target serving row missing';
  END IF;

  INSERT INTO public.catalog_formulas (
    formula_key, manufacturer, brand, product_name, product_line, pet_type,
    life_stage, food_form, flavor, diet_condition, is_complete_food,
    complete_food_evidence, ingredient_text, ingredients, front_image_url,
    source_url, source_authority, ingredient_verification_status,
    image_verification_status, protected_terms, verification_status, active,
    is_popular_brand, first_observed_at, last_observed_at, promoted_cache_key,
    promoted_at, identity_hash, created_at, updated_at
  ) VALUES (
    v_key, 'redbarn', 'redbarn',
    'Redbarn Powerfood Fusion Whole Grain Land Mix Recipe Dry Dog Food',
    'powerfood fusion', 'dog', 'adult', 'dry', 'whole grain land mix', '',
    true,
    'Exact official package side label: formulated to meet AAFCO Dog Food Nutrient Profiles for maintenance of adult dogs.',
    v_ingredients, public.catalog_split_ingredient_statement(v_ingredients),
    v_front, v_source, 'manufacturer', 'label_ocr_verified', 'manufacturer',
    ARRAY[
      'redbarn', 'powerfood fusion', 'whole grain', 'land mix', 'beef',
      'lamb', 'dog', 'adult', 'maintenance', 'dry'
    ]::TEXT[],
    'verified', true, false, now(), now(),
    'redbarn-pet-products:785184120828', now(),
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
  ) VALUES
    (
      v_formula_id, '785184120828', '3.5 lb bag', 1,
      'redbarn-manufacturer-manual', 'shopify-variant:44007771898036',
      v_source, true, now(), now(), now()
    ),
    (
      v_formula_id, '785184120729', '20 lb bag', 1,
      'redbarn-manufacturer-manual', 'shopify-variant:44007771930804',
      v_source, true, now(), now(), now()
    ),
    (
      v_formula_id, '785184920824', '3.5 lb bag case of 4', 4,
      'redbarn-manufacturer-manual', 'shopify-variant:44008493416628',
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
    WHERE cache_key = 'redbarn-pet-products:785184120828'
      AND catalog_exclusion_reason IS NULL
      AND ingredient_verification_status = 'label_ocr_verified'
      AND image_verification_status = 'manufacturer'
      AND life_stage = 'adult'
      AND food_form = 'dry'
      AND ingredient_count = 66
  ) <> 1 THEN
    RAISE EXCEPTION 'Redbarn serving row promotion failed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_skus
    WHERE formula_id = v_formula_id
      AND active
      AND gtin IN ('785184120828', '785184120729', '785184920824')
  ) <> 3 THEN
    RAISE EXCEPTION 'Redbarn package GTIN preservation failed';
  END IF;
END
$$;
