DO $$
DECLARE
  v_formula_id BIGINT;
  v_key TEXT := 'mid america pet food|nature''s logic|pure naturals|dog|all life stages|dry|grain free chicken recipe|';
  v_source TEXT := 'https://natureslogic.com/dog-products/pure-naturals-grain-free-chicken-recipe/';
  v_front TEXT := 'https://natureslogic.com/wp-content/uploads/2025/09/1_FRONT_24lb-3.png';
  v_cache_key TEXT := 'natures-logic:nature s logic distinction canine fowl recipe grain free chicken dog foodpure naturals grain-free chicken recipe';
  v_ingredients TEXT := 'Chicken (Source of Methionine-cystine), Chicken Meal, Tapioca Starch, Chicken Fat (preserved with Mixed Tocopherols), Yeast Culture, Pumpkin Seed Flour, Turkey Meal, Duck Meal, Spray Dried Chicken Liver, Montmorillonite Clay, Dried Kale, Spray Dried Porcine Plasma, Dried Kelp, Dehydrated Salmon (Source of Taurine), Dried Tomato, Dried Chicory Root, Dried Carrot, Dried Apple, Dried Pumpkin, Dried Apricot, Dried Blueberry, Dried Broccoli, Dried Spinach, Dried Parsley, Dried Cranberry, Dried Artichoke, Dried Mushrooms, Dried Lactobacillus acidophilus Fermentation Product, Dried Lactobacillus casei Fermentation Product, Dried Bifidobacterium bifidum Fermentation Product, Dried Enterococcus faecium Fermentation Product, Dried Bacillus coagulans Fermentation Product, Dried Aspergillus niger Fermentation Extract, Dried Aspergillus oryzae Fermentation Extract, Dried Trichoderma longibrachiatum Fermentation Extract, Rosemary Extract.';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.catalog_skus sku
    JOIN public.catalog_formulas f ON f.id = sku.formula_id
    WHERE ltrim(regexp_replace(coalesce(sku.gtin, ''), '[^0-9]', '', 'g'), '0') = '850013992768'
      AND f.formula_key <> v_key
  ) THEN
    RAISE EXCEPTION 'Nature''s Logic 24 lb GTIN already belongs to another formula';
  END IF;

  UPDATE public.product_data
  SET
    product_name = 'Nature''s Logic PURE NATURALS Grain-Free Chicken Recipe Dry Dog Food',
    brand = 'Nature''s Logic',
    ingredients = public.catalog_split_ingredient_statement(v_ingredients),
    ingredient_text = v_ingredients,
    ingredient_count = cardinality(public.catalog_split_ingredient_statement(v_ingredients)),
    source = 'natures-logic-manufacturer-manual',
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
    gtin = '850013992768',
    product_line = 'PURE NATURALS',
    flavor = 'Grain-Free Chicken Recipe',
    life_stage = 'all life stages',
    food_form = 'dry',
    package_size = '24 lb bag',
    updated_at = now()
  WHERE cache_key = v_cache_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nature''s Logic contaminated serving row missing';
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
    v_key, 'mid america pet food', 'nature''s logic',
    'Nature''s Logic PURE NATURALS Grain-Free Chicken Recipe Dry Dog Food',
    'pure naturals', 'dog', 'all life stages', 'dry',
    'grain free chicken recipe', '', true,
    'Exact official package back: complete and balanced nutrition for all life stages; comparable in nutritional adequacy to a product substantiated using AAFCO feeding tests.',
    v_ingredients, public.catalog_split_ingredient_statement(v_ingredients),
    v_front, v_source, 'manufacturer', 'label_ocr_verified', 'manufacturer',
    ARRAY[
      'nature''s logic', 'natures logic', 'pure naturals', 'grain free',
      'chicken recipe', 'dog', 'all life stages', 'dry', 'no synthetics'
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
    v_formula_id, '850013992768', '24 lb bag', 1,
    'natures-logic-manufacturer-manual',
    'official-package:24lb:850013992768',
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
      AND ingredient_verification_status = 'label_ocr_verified'
      AND image_verification_status = 'manufacturer'
      AND product_line = 'PURE NATURALS'
      AND life_stage = 'all life stages'
      AND food_form = 'dry'
      AND ingredient_count = 36
      AND gtin = '850013992768'
  ) <> 1 THEN
    RAISE EXCEPTION 'Nature''s Logic serving-row repair failed';
  END IF;
END
$$;
