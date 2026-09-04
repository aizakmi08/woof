-- Reconcile six exact Target BLUE Tastefuls Indoor dry-cat-food packages.
--
-- The Target pages expose multiple ingredient versions under the same shelf
-- formula names. Package sizes are SKU children only when their normalized
-- ingredient statements match:
--
--   Chicken & Brown Rice
--     * 3 lb / 15 lb -> existing 63-item retailer web version
--     * 5 lb / 10 lb -> separate 69-item retailer web version
--     * manufacturer current remains a separate 65-item version
--
--   Salmon & Brown Rice
--     * 5 lb -> exact ingredient match to manufacturer current
--     * 3 lb -> separate 64-item retailer web version
--
-- Barcode lookup selects the exact package version. Generic text search keeps
-- preferring the current manufacturer formula.

DO $$
DECLARE
  v_chicken_current_id BIGINT;
  v_chicken_63_id BIGINT;
  v_chicken_69_id BIGINT;
  v_chicken_3_gap_id BIGINT;
  v_salmon_current_id BIGINT;
  v_salmon_3_id BIGINT;
  v_salmon_5_gap_id BIGINT;
  v_run_id BIGINT;

  v_chicken_current_cache TEXT :=
    'blue-buffalo-general-mills:blue buffalo blue tastefuls adult indoor cat chicken brown rice recipe blue tastefuls-indoor-chicken-brown-rice';
  v_chicken_63_cache TEXT := 'petsmart-retail-catalog:859610000876';
  v_chicken_69_cache TEXT := 'target-retail-catalog:840243122455';
  v_salmon_current_cache TEXT :=
    'blue-buffalo-general-mills:blue buffalo blue tastefuls adult indoor cat salmon brown rice recipe blue tastefuls-indoor-salmon-brown-rice';
  v_salmon_3_cache TEXT := 'target-retail-catalog:840243151431';

  v_chicken_5_gap_key TEXT :=
    'blue buffalo|blue buffalo|blue buffalo tastefuls with chicken indoor natural adult dry cat food|cat|adult|dry||';
  v_chicken_3_gap_key TEXT :=
    'blue buffalo|blue buffalo|blue buffalo tastefuls adult indoor dry cat food with chicken 38 brown rice|cat|adult|dry||';
  v_salmon_5_gap_key TEXT :=
    'blue buffalo|blue buffalo|blue buffalo tastefuls with salmon indoor natural adult dry cat food|cat|adult|dry||';
  v_salmon_3_gap_key TEXT :=
    'blue buffalo|blue buffalo|blue buffalo tastefuls adult indoor dry cat food with salmon 38 brown rice|cat|adult|dry||';

  v_chicken_3_url TEXT :=
    'https://www.target.com/p/blue-buffalo-tastefuls-adult-indoor-dry-cat-food-with-chicken-38-brown-rice-3lbs/-/A-89608511';
  v_chicken_5_url TEXT :=
    'https://www.target.com/p/blue-buffalo-tastefuls-with-chicken-indoor-natural-adult-dry-cat-food/-/A-52768569';
  v_chicken_10_url TEXT :=
    'https://www.target.com/p/blue-buffalo-tastefuls-with-chicken-indoor-natural-adult-dry-cat-food-10lbs/-/A-52615639';
  v_chicken_15_url TEXT :=
    'https://www.target.com/p/blue-buffalo-tastefuls-with-chicken-indoor-natural-adult-dry-cat-food-15lbs/-/A-76366274';
  v_salmon_3_url TEXT :=
    'https://www.target.com/p/blue-buffalo-tastefuls-adult-indoor-dry-cat-food-with-salmon-38-brown-rice-3lbs/-/A-89608506';
  v_salmon_5_url TEXT :=
    'https://www.target.com/p/blue-buffalo-tastefuls-with-salmon-indoor-natural-adult-dry-cat-food-5lbs/-/A-52615633';

  v_chicken_3_image TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_42242dad-9aad-442c-9a90-c3ad201818e8';
  v_chicken_5_image TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_0af1751e-c4ac-4d6a-8539-c928dbbe8be9';
  v_chicken_10_image TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_57c75714-fc9b-4582-bebe-3f24651e4c2b';
  v_chicken_15_image TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_368a0ac0-366e-4045-8d29-85ad05b21e3f';
  v_salmon_3_image TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_8f32578e-faa9-4eec-af46-1b0848eafe46';
  v_salmon_5_image TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_0834ebf1-86f3-4b44-8608-630fde449fc0';

  v_chicken_63_ingredients TEXT :=
    'deboned chicken, chicken meal, fish meal (source of omega 3 fatty acids), brown rice, barley, oatmeal, peas, pea protein, chicken fat (preserved with mixed tocopherols), dried egg product, potato starch, natural flavor, pea fiber, flaxseed (source of omega 6 fatty acids), miscanthus grass, calcium sulfate, choline chloride, direct dehydrated alfalfa pellets, dl-methionine, taurine, salt, potassium chloride, potatoes, l-threonine, dried chicory root, alfalfa nutrient concentrate, calcium chloride, calcium carbonate, preserved with mixed tocopherols, cranberries, dried sweet potatoes, carrots, vegetable juice for color, ferrous sulfate, niacin (vitamin b3), iron amino acid chelate, zinc amino acid chelate, zinc sulfate, vitamin e supplement, blueberries, barley grass, parsley, turmeric, dried kelp, yucca schidigera extract, copper sulfate, thiamine mononitrate (vitamin b1), copper amino acid chelate, l-ascorbyl-2-polyphosphate (vitamin c), l-lysine, biotin (vitamin b7), vitamin a supplement, manganese sulfate, manganese amino acid chelate, pyridoxine hydrochloride (vitamin b6), calcium pantothenate (vitamin b5), riboflavin (vitamin b2), vitamin d3 supplement, vitamin b12 supplement, folic acid (vitamin b9), calcium iodate, sodium selenite, oil of rosemary';
  v_chicken_69_ingredients TEXT :=
    'deboned chicken, chicken meal, fish meal (source of omega 3 fatty acids), brown rice, barley, oatmeal, peas, pea protein, dried egg product, chicken fat (preserved with mixed tocopherols), potato starch, powdered cellulose, natural flavor, flaxseed (source of omega 6 fatty acids), choline chloride, dl-methionine, calcium sulfate, potassium chloride, calcium chloride, pea fiber, potatoes, taurine, dried chicory root, direct dehydrated alfalfa pellets, alfalfa nutrient concentrate, calcium carbonate, cranberries, preserved with mixed tocopherols, salt, sweet potatoes, carrots, vegetable juice for color, ferrous sulfate, niacin (vitamin b3), iron amino acid chelate, zinc amino acid chelate, zinc sulfate, vitamin e supplement, blueberries, barley grass, parsley, turmeric, dried kelp, yucca schidigera extract, copper sulfate, thiamine mononitrate (vitamin b1), copper amino acid chelate, l-ascorbyl-2-polyphosphate (source of vitamin c), l-lysine, biotin (vitamin b7), l-carnitine, vitamin a supplement, manganese sulfate, manganese amino acid chelate, pyridoxine hydrochloride (vitamin b6), calcium pantothenate (vitamin b5), riboflavin (vitamin b2), vitamin d3 supplement, vitamin b12 supplement, folic acid (vitamin b9), dried yeast, dried enterococcus faecium fermentation product, dried lactobacillus acidophilus fermentation product, dried aspergillus niger fermentation extract, dried trichoderma longibrachiatum fermentation extract, dried bacillus subtilis fermentation extract, calcium iodate, sodium selenite, oil of rosemary';
  v_salmon_3_ingredients TEXT :=
    'salmon, chicken meal, brown rice, oatmeal, barley, pea protein, peas, fish meal (source of omega 3 fatty acids), chicken fat (preserved with mixed tocopherols), pea starch, dried yeast, pea fiber, natural flavor, dried egg product, flaxseed (source of omega 6 fatty acids), miscanthus grass, calcium sulfate, choline chloride, salt, direct dehydrated alfalfa pellets, taurine, dl-methionine, potatoes, potassium chloride, dried chicory root, alfalfa nutrient concentrate, l-threonine, calcium carbonate, calcium chloride, preserved with mixed tocopherols, cranberries, dried sweet potatoes, carrots, vitamin e supplement, vegetable juice for color, ferrous sulfate, niacin (vitamin b3), iron amino acid chelate, zinc amino acid chelate, zinc sulfate, blueberries, barley grass, parsley, turmeric, dried kelp, yucca schidigera extract, copper sulfate, thiamine mononitrate (vitamin b1), copper amino acid chelate, l-ascorbyl-2-polyphosphate (vitamin c), l-lysine, biotin (vitamin b7), vitamin a supplement, manganese sulfate, manganese amino acid chelate, pyridoxine hydrochloride (vitamin b6), calcium pantothenate (vitamin b5), riboflavin (vitamin b2), vitamin d3 supplement, vitamin b12 supplement, folic acid (vitamin b9), calcium iodate, sodium selenite, oil of rosemary';
  v_salmon_5_ingredients TEXT :=
    'salmon, chicken meal, brown rice, oatmeal, barley, pea protein, peas, chicken fat (preserved with mixed tocopherols), fish meal (source of omega 3 fatty acids), powdered cellulose, natural flavor, flaxseed (source of omega 6 fatty acids), calcium sulfate, dl-methionine, choline chloride, calcium chloride, potassium chloride, potatoes, dried chicory root, taurine, direct dehydrated alfalfa pellets, pea fiber, alfalfa nutrient concentrate, calcium carbonate, salt, cranberries, preserved with mixed tocopherols, sweet potatoes, carrots, vegetable juice for color, ferrous sulfate, niacin (vitamin b3), iron amino acid chelate, zinc amino acid chelate, zinc sulfate, vitamin e supplement, blueberries, barley grass, parsley, turmeric, dried kelp, yucca schidigera extract, copper sulfate, thiamine mononitrate (vitamin b1), copper amino acid chelate, l-ascorbyl-2-polyphosphate (source of vitamin c), l-lysine, l-carnitine, biotin (vitamin b7), vitamin a supplement, manganese sulfate, manganese amino acid chelate, pyridoxine hydrochloride (vitamin b6), calcium pantothenate (vitamin b5), riboflavin (vitamin b2), vitamin d3 supplement, vitamin b12 supplement, folic acid (vitamin b9), dried yeast, dried enterococcus faecium fermentation product, dried lactobacillus acidophilus fermentation product, dried aspergillus niger fermentation extract, dried trichoderma longibrachiatum fermentation extract, dried bacillus subtilis fermentation extract, calcium iodate, sodium selenite, oil of rosemary';

  v_chicken_63_hash TEXT;
  v_chicken_69_hash TEXT;
  v_salmon_3_hash TEXT;
  v_salmon_5_hash TEXT;
  v_chicken_current_hash TEXT;
  v_salmon_current_hash TEXT;
  v_observed_at TIMESTAMPTZ := '2026-07-27T01:35:00Z';
BEGIN
  v_chicken_63_hash := encode(
    digest(public.catalog_normalize_ingredient_evidence(
      v_chicken_63_ingredients
    ), 'sha256'), 'hex'
  );
  v_chicken_69_hash := encode(
    digest(public.catalog_normalize_ingredient_evidence(
      v_chicken_69_ingredients
    ), 'sha256'), 'hex'
  );
  v_salmon_3_hash := encode(
    digest(public.catalog_normalize_ingredient_evidence(
      v_salmon_3_ingredients
    ), 'sha256'), 'hex'
  );
  v_salmon_5_hash := encode(
    digest(public.catalog_normalize_ingredient_evidence(
      v_salmon_5_ingredients
    ), 'sha256'), 'hex'
  );

  IF v_chicken_63_hash <>
      'da946523cbd39fee6d1f881c6299e5d429d25684b49d2aacdce56ca84dd7549b'
     OR v_chicken_69_hash <>
      '02fe47d4a66810b72463df7e6e5a6ace4897241a24860024e395b002fcd4bced'
     OR v_salmon_3_hash <>
      '576c7adcbd714c377c2c1a94ad7b2e82d2955f803a35071fd0b3e2573f0700fb'
     OR v_salmon_5_hash <>
      '1ecf04a787d62cd640659fb987e3b29f5fe15d6fd4b28535b51977b2245583dd'
  THEN
    RAISE EXCEPTION 'Target Tastefuls Indoor transcription changed';
  END IF;

  SELECT id, encode(
    digest(public.catalog_normalize_ingredient_evidence(
      COALESCE(ingredient_text, '')
    ), 'sha256'), 'hex'
  )
  INTO STRICT v_chicken_current_id, v_chicken_current_hash
  FROM public.catalog_formulas
  WHERE promoted_cache_key = v_chicken_current_cache
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND verification_status = 'verified'
    AND active;

  SELECT id
  INTO STRICT v_chicken_63_id
  FROM public.catalog_formulas
  WHERE promoted_cache_key = v_chicken_63_cache
    AND formula_evidence_tier = 'retailer_web_version'
    AND verification_status = 'verified'
    AND active
    AND encode(
      digest(public.catalog_normalize_ingredient_evidence(
        COALESCE(ingredient_text, '')
      ), 'sha256'), 'hex'
    ) = v_chicken_63_hash;

  SELECT id
  INTO STRICT v_chicken_69_id
  FROM public.catalog_formulas
  WHERE formula_key = v_chicken_5_gap_key;

  SELECT id
  INTO STRICT v_chicken_3_gap_id
  FROM public.catalog_formulas
  WHERE formula_key = v_chicken_3_gap_key;

  SELECT id, encode(
    digest(public.catalog_normalize_ingredient_evidence(
      COALESCE(ingredient_text, '')
    ), 'sha256'), 'hex'
  )
  INTO STRICT v_salmon_current_id, v_salmon_current_hash
  FROM public.catalog_formulas
  WHERE promoted_cache_key = v_salmon_current_cache
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND verification_status = 'verified'
    AND active;

  SELECT id
  INTO STRICT v_salmon_3_id
  FROM public.catalog_formulas
  WHERE formula_key = v_salmon_3_gap_key;

  SELECT id
  INTO STRICT v_salmon_5_gap_id
  FROM public.catalog_formulas
  WHERE formula_key = v_salmon_5_gap_key;

  IF v_chicken_current_hash <>
      'faf1d6f40cf47685c03be74f9f9e5d4cd7ceccc1f0e64b9f4fbb5c43d9636cd4'
     OR v_salmon_current_hash <> v_salmon_5_hash
     OR v_chicken_current_hash IN (v_chicken_63_hash, v_chicken_69_hash)
     OR v_salmon_current_hash = v_salmon_3_hash
  THEN
    RAISE EXCEPTION
      'Tastefuls Indoor manufacturer/source version precondition changed';
  END IF;

  -- Promote the Target 5/10 lb Chicken package era as one retailer version.
  INSERT INTO public.product_data (
    cache_key, product_name, brand, ingredients, ingredient_text,
    ingredient_count, source, source_url, scraped_at, expires_at, image_url,
    nutrient_panel, nutritional_info, has_published_nutrients,
    is_complete_food, catalog_exclusion_reason, pet_type, source_quality,
    ingredient_verification_status, image_verification_status, verified_at,
    gtin, product_line, flavor, life_stage, food_form, package_size,
    formula_evidence_tier, formula_version_provenance, updated_at
  ) VALUES (
    v_chicken_69_cache,
    'Blue Buffalo Tastefuls Adult Indoor Chicken & Brown Rice Dry Cat Food',
    'Blue Buffalo',
    public.catalog_split_ingredient_statement(v_chicken_69_ingredients),
    v_chicken_69_ingredients,
    cardinality(public.catalog_split_ingredient_statement(
      v_chicken_69_ingredients
    )),
    'target-retail-label-manual', v_chicken_5_url, v_observed_at,
    now() + INTERVAL '180 days', v_chicken_5_image, '{}'::JSONB,
    jsonb_build_object('formula_evidence_tier', 'retailer_web_version'),
    false, true, NULL, 'cat', 'retailer_verified', 'retailer_verified',
    'retailer_verified', v_observed_at, '840243122455',
    'BLUE Tastefuls Adult Indoor', 'Chicken & Brown Rice', 'adult', 'dry',
    '5 lb', 'retailer_web_version',
    jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'source', 'target-retail-label-manual',
      'equivalent_exact_source_urls',
        jsonb_build_array(v_chicken_5_url, v_chicken_10_url),
      'captured_at', v_observed_at,
      'package_gtins',
        jsonb_build_array('840243122455', '840243122431'),
      'package_sizes', jsonb_build_array('5 lb', '10 lb'),
      'front_image_url', v_chicken_5_image,
      'ingredient_text_hash', v_chicken_69_hash,
      'different_from_manufacturer_current_hash', v_chicken_current_hash
    ),
    now()
  )
  ON CONFLICT (cache_key) DO UPDATE
  SET
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
    nutritional_info = excluded.nutritional_info,
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    pet_type = excluded.pet_type,
    source_quality = excluded.source_quality,
    ingredient_verification_status =
      excluded.ingredient_verification_status,
    image_verification_status = excluded.image_verification_status,
    verified_at = excluded.verified_at,
    gtin = excluded.gtin,
    product_line = excluded.product_line,
    flavor = excluded.flavor,
    life_stage = excluded.life_stage,
    food_form = excluded.food_form,
    package_size = excluded.package_size,
    formula_evidence_tier = excluded.formula_evidence_tier,
    formula_version_provenance = excluded.formula_version_provenance,
    updated_at = now();

  UPDATE public.catalog_formulas
  SET
    manufacturer = 'blue buffalo',
    brand = 'blue buffalo',
    product_name =
      'Blue Buffalo Tastefuls Adult Indoor Chicken & Brown Rice Dry Cat Food',
    product_line = 'BLUE Tastefuls Adult Indoor',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'chicken and brown rice',
    diet_condition = '',
    is_complete_food = true,
    complete_food_evidence =
      'Exact Target 5 lb and 10 lb adult dry cat-food PDPs publish the same full ingredient statement and matching package identities.',
    ingredient_text = v_chicken_69_ingredients,
    ingredients =
      public.catalog_split_ingredient_statement(v_chicken_69_ingredients),
    front_image_url = v_chicken_5_image,
    source_url = v_chicken_5_url,
    source_authority = 'retailer_verified',
    ingredient_verification_status = 'retailer_verified',
    image_verification_status = 'retailer_verified',
    protected_terms = ARRAY[
      'blue buffalo', 'tastefuls', 'adult', 'indoor', 'cat', 'dry',
      'chicken', 'brown rice'
    ]::TEXT[],
    verification_status = 'verified',
    active = true,
    absent_since = NULL,
    promoted_cache_key = v_chicken_69_cache,
    promoted_at = now(),
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance = jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'source', 'target-retail-label-manual',
      'equivalent_exact_source_urls',
        jsonb_build_array(v_chicken_5_url, v_chicken_10_url),
      'captured_at', v_observed_at,
      'package_gtins',
        jsonb_build_array('840243122455', '840243122431'),
      'package_sizes', jsonb_build_array('5 lb', '10 lb'),
      'ingredient_text_hash', v_chicken_69_hash,
      'different_from_manufacturer_current_hash', v_chicken_current_hash
    ),
    last_observed_at = v_observed_at,
    updated_at = now()
  WHERE id = v_chicken_69_id;

  -- The Target 3/15 lb Chicken pages are ingredient-identical to the existing
  -- PetSmart retailer version. Add the exact packages without creating another
  -- formula or overwriting manufacturer current.
  UPDATE public.catalog_formulas
  SET
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'equivalent_exact_source_urls', jsonb_build_array(
          source_url, v_chicken_3_url, v_chicken_15_url
        ),
        'package_gtins',
          jsonb_build_array('859610000852', '859610000876'),
        'target_product_codes',
          jsonb_build_array('TCIN 89608511', 'TCIN 76366274'),
        'target_captured_at', v_observed_at,
        'ingredient_text_hash', v_chicken_63_hash,
        'different_from_manufacturer_current_hash', v_chicken_current_hash
      ),
    last_observed_at = v_observed_at,
    updated_at = now()
  WHERE id = v_chicken_63_id;

  UPDATE public.product_data
  SET
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'equivalent_exact_source_urls', jsonb_build_array(
          source_url, v_chicken_3_url, v_chicken_15_url
        ),
        'package_gtins',
          jsonb_build_array('859610000852', '859610000876'),
        'target_product_codes',
          jsonb_build_array('TCIN 89608511', 'TCIN 76366274'),
        'target_captured_at', v_observed_at,
        'ingredient_text_hash', v_chicken_63_hash,
        'different_from_manufacturer_current_hash', v_chicken_current_hash
      ),
    updated_at = now()
  WHERE cache_key = v_chicken_63_cache;

  -- Promote the Target 3 lb Salmon package as a distinct retailer version.
  INSERT INTO public.product_data (
    cache_key, product_name, brand, ingredients, ingredient_text,
    ingredient_count, source, source_url, scraped_at, expires_at, image_url,
    nutrient_panel, nutritional_info, has_published_nutrients,
    is_complete_food, catalog_exclusion_reason, pet_type, source_quality,
    ingredient_verification_status, image_verification_status, verified_at,
    gtin, product_line, flavor, life_stage, food_form, package_size,
    formula_evidence_tier, formula_version_provenance, updated_at
  ) VALUES (
    v_salmon_3_cache,
    'Blue Buffalo Tastefuls Adult Indoor Salmon & Brown Rice Dry Cat Food',
    'Blue Buffalo',
    public.catalog_split_ingredient_statement(v_salmon_3_ingredients),
    v_salmon_3_ingredients,
    cardinality(public.catalog_split_ingredient_statement(
      v_salmon_3_ingredients
    )),
    'target-retail-label-manual', v_salmon_3_url, v_observed_at,
    now() + INTERVAL '180 days', v_salmon_3_image, '{}'::JSONB,
    jsonb_build_object('formula_evidence_tier', 'retailer_web_version'),
    false, true, NULL, 'cat', 'retailer_verified', 'retailer_verified',
    'retailer_verified', v_observed_at, '840243151431',
    'BLUE Tastefuls Adult Indoor', 'Salmon & Brown Rice', 'adult', 'dry',
    '3 lb', 'retailer_web_version',
    jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'source', 'target-retail-label-manual',
      'source_url', v_salmon_3_url,
      'captured_at', v_observed_at,
      'package_gtin', '840243151431',
      'product_code', 'TCIN 89608506',
      'package_size', '3 lb',
      'front_image_url', v_salmon_3_image,
      'ingredient_text_hash', v_salmon_3_hash,
      'different_from_manufacturer_current_hash', v_salmon_current_hash
    ),
    now()
  )
  ON CONFLICT (cache_key) DO UPDATE
  SET
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
    nutritional_info = excluded.nutritional_info,
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    pet_type = excluded.pet_type,
    source_quality = excluded.source_quality,
    ingredient_verification_status =
      excluded.ingredient_verification_status,
    image_verification_status = excluded.image_verification_status,
    verified_at = excluded.verified_at,
    gtin = excluded.gtin,
    product_line = excluded.product_line,
    flavor = excluded.flavor,
    life_stage = excluded.life_stage,
    food_form = excluded.food_form,
    package_size = excluded.package_size,
    formula_evidence_tier = excluded.formula_evidence_tier,
    formula_version_provenance = excluded.formula_version_provenance,
    updated_at = now();

  UPDATE public.catalog_formulas
  SET
    manufacturer = 'blue buffalo',
    brand = 'blue buffalo',
    product_name =
      'Blue Buffalo Tastefuls Adult Indoor Salmon & Brown Rice Dry Cat Food',
    product_line = 'BLUE Tastefuls Adult Indoor',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'salmon and brown rice',
    diet_condition = '',
    is_complete_food = true,
    complete_food_evidence =
      'Exact Target TCIN 89608506 identifies an adult indoor dry cat-food package and publishes its full ingredient statement.',
    ingredient_text = v_salmon_3_ingredients,
    ingredients =
      public.catalog_split_ingredient_statement(v_salmon_3_ingredients),
    front_image_url = v_salmon_3_image,
    source_url = v_salmon_3_url,
    source_authority = 'retailer_verified',
    ingredient_verification_status = 'retailer_verified',
    image_verification_status = 'retailer_verified',
    protected_terms = ARRAY[
      'blue buffalo', 'tastefuls', 'adult', 'indoor', 'cat', 'dry',
      'salmon', 'brown rice', 'tcin 89608506'
    ]::TEXT[],
    verification_status = 'verified',
    active = true,
    absent_since = NULL,
    promoted_cache_key = v_salmon_3_cache,
    promoted_at = now(),
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance = jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'source', 'target-retail-label-manual',
      'source_url', v_salmon_3_url,
      'captured_at', v_observed_at,
      'package_gtin', '840243151431',
      'product_code', 'TCIN 89608506',
      'package_size', '3 lb',
      'ingredient_text_hash', v_salmon_3_hash,
      'different_from_manufacturer_current_hash', v_salmon_current_hash
    ),
    last_observed_at = v_observed_at,
    updated_at = now()
  WHERE id = v_salmon_3_id;

  -- Record the exact Target 5 lb Salmon package as manufacturer-current
  -- equivalent because its normalized ingredient statement matches exactly.
  UPDATE public.catalog_formulas
  SET
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'manufacturer_current',
        'manufacturer_current_equivalence', true,
        'target_product_code', 'TCIN 52615633',
        'target_package_gtin', '840243122479',
        'target_ingredient_hash', v_salmon_5_hash,
        'target_captured_at', v_observed_at
      ),
    updated_at = now()
  WHERE id = v_salmon_current_id;

  UPDATE public.product_data
  SET
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'manufacturer_current',
        'manufacturer_current_equivalence', true,
        'equivalent_exact_source_urls',
          jsonb_build_array(source_url, v_salmon_5_url),
        'target_product_code', 'TCIN 52615633',
        'target_package_gtin', '840243122479',
        'target_ingredient_hash', v_salmon_5_hash,
        'target_captured_at', v_observed_at
      ),
    updated_at = now()
  WHERE cache_key = v_salmon_current_cache;

  -- Close the two duplicate census identities through exact aliases.
  INSERT INTO public.catalog_formula_aliases (
    alias_formula_key, formula_id, identity_hash, match_reason, source_url,
    metadata, updated_at
  ) VALUES
    (
      v_chicken_3_gap_key, v_chicken_63_id,
      encode(digest(
        'blue buffalo|blue buffalo|blue buffalo tastefuls adult indoor cat dry food natural chicken and brown rice|cat|adult|dry|chicken and brown rice|retailer_web_version',
        'sha256'
      ), 'hex'),
      'manual_review', v_chicken_3_url,
      jsonb_build_object(
        'exact_formula_identity', true,
        'species_boundary', 'cat',
        'life_stage_boundary', 'adult',
        'food_form_boundary', 'dry',
        'recipe_boundary', 'chicken and brown rice',
        'ingredient_hash_equality_verified', true,
        'formula_version_boundary', v_chicken_63_hash,
        'target_tcin', '89608511',
        'target_upc', '859610000852',
        'reviewed_at', '2026-07-26'
      ),
      now()
    ),
    (
      v_salmon_5_gap_key, v_salmon_current_id,
      encode(digest(
        'general mills|blue buffalo|blue tastefuls adult indoor cat salmon and brown rice recipe|cat|adult|dry|salmon and brown rice recipe|manufacturer_current_exact',
        'sha256'
      ), 'hex'),
      'manual_review',
      'https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-indoor-salmon-brown-rice/',
      jsonb_build_object(
        'exact_formula_identity', true,
        'species_boundary', 'cat',
        'life_stage_boundary', 'adult',
        'food_form_boundary', 'dry',
        'recipe_boundary', 'salmon and brown rice',
        'ingredient_hash_equality_verified', true,
        'target_tcin', '52615633',
        'target_upc', '840243122479',
        'reviewed_at', '2026-07-26'
      ),
      now()
    )
  ON CONFLICT (alias_formula_key) DO UPDATE
  SET
    formula_id = excluded.formula_id,
    identity_hash = excluded.identity_hash,
    match_reason = excluded.match_reason,
    source_url = excluded.source_url,
    metadata = excluded.metadata,
    updated_at = now();

  UPDATE public.catalog_formulas
  SET
    verification_status = 'quarantined',
    active = false,
    absent_since = COALESCE(absent_since, now()),
    promoted_cache_key = NULL,
    promoted_at = NULL,
    complete_food_evidence =
      'Exact Target 3 lb package alias of the ingredient-identical retailer web version.',
    updated_at = now()
  WHERE id = v_chicken_3_gap_id;

  UPDATE public.catalog_formulas
  SET
    verification_status = 'quarantined',
    active = false,
    absent_since = COALESCE(absent_since, now()),
    promoted_cache_key = NULL,
    promoted_at = NULL,
    complete_food_evidence =
      'Exact Target 5 lb package alias of the ingredient-identical current manufacturer formula.',
    updated_at = now()
  WHERE id = v_salmon_5_gap_id;

  -- Reparent the four existing Target sitemap SKU placeholders.
  UPDATE public.catalog_skus
  SET
    formula_id = v_chicken_69_id,
    gtin = '840243122455',
    package_size = '5 lb',
    package_count = 1,
    source_slug = 'target-retail-label-manual',
    source_external_id = 'TCIN:52615627',
    source_url = v_chicken_5_url,
    active = true,
    last_observed_at = v_observed_at,
    updated_at = now()
  WHERE source_url = v_chicken_5_url;

  UPDATE public.catalog_skus
  SET
    formula_id = v_chicken_63_id,
    gtin = '859610000852',
    package_size = '3 lb',
    package_count = 1,
    source_slug = 'target-retail-label-manual',
    source_external_id = 'TCIN:89608511',
    source_url = v_chicken_3_url,
    active = true,
    last_observed_at = v_observed_at,
    updated_at = now()
  WHERE source_url = v_chicken_3_url;

  UPDATE public.catalog_skus
  SET
    formula_id = v_salmon_current_id,
    gtin = '840243122479',
    package_size = '5 lb',
    package_count = 1,
    source_slug = 'target-retail-label-manual',
    source_external_id = 'TCIN:52615633',
    source_url = v_salmon_5_url,
    active = true,
    last_observed_at = v_observed_at,
    updated_at = now()
  WHERE source_url = v_salmon_5_url;

  UPDATE public.catalog_skus
  SET
    formula_id = v_salmon_3_id,
    gtin = '840243151431',
    package_size = '3 lb',
    package_count = 1,
    source_slug = 'target-retail-label-manual',
    source_external_id = 'TCIN:89608506',
    source_url = v_salmon_3_url,
    active = true,
    last_observed_at = v_observed_at,
    updated_at = now()
  WHERE source_url = v_salmon_3_url;

  -- Add the exact Target pages that were not part of the sitemap census.
  INSERT INTO public.catalog_skus (
    formula_id, gtin, package_size, package_count, source_slug,
    source_external_id, source_url, active, first_observed_at,
    last_observed_at, updated_at
  ) VALUES
    (
      v_chicken_69_id, '840243122431', '10 lb', 1,
      'target-retail-label-manual', 'TCIN:52615639', v_chicken_10_url,
      true, v_observed_at, v_observed_at, now()
    ),
    (
      v_chicken_63_id, '859610000876', '15 lb', 1,
      'target-retail-label-manual', 'TCIN:76366274', v_chicken_15_url,
      true, v_observed_at, v_observed_at, now()
    )
  ON CONFLICT (source_slug, source_external_id, gtin, package_size)
  DO UPDATE
  SET
    formula_id = excluded.formula_id,
    source_url = excluded.source_url,
    active = true,
    last_observed_at = excluded.last_observed_at,
    updated_at = now();

  INSERT INTO public.catalog_source_runs (
    run_key, source_slug, source_type, coverage_role, status, started_at,
    finished_at, expected_count, observed_count, accepted_count,
    rejected_count, pagination_complete, source_content_hash, checkpoint,
    metadata, updated_at
  ) VALUES (
    'manual-exact-evidence:target:blue-tastefuls-indoor:20260726',
    'target-retail-label-manual', 'retailer', 'verification', 'completed',
    v_observed_at, v_observed_at, 6, 6, 6, 0, true,
    encode(digest(
      v_chicken_3_url || v_chicken_5_url || v_chicken_10_url ||
      v_chicken_15_url || v_salmon_3_url || v_salmon_5_url ||
      v_chicken_63_hash || v_chicken_69_hash ||
      v_salmon_3_hash || v_salmon_5_hash,
      'sha256'
    ), 'hex'),
    '{}'::JSONB,
    jsonb_build_object(
      'manual_exact_evidence', true,
      'exact_package_count', 6,
      'retailer_web_version_package_count', 5,
      'manufacturer_current_equivalent_package_count', 1,
      'distinct_source_versions', 4
    ),
    now()
  )
  ON CONFLICT (run_key) DO UPDATE
  SET
    status = 'completed',
    finished_at = excluded.finished_at,
    observed_count = 6,
    accepted_count = 6,
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
    formula_evidence_tier, formula_version_provenance, raw_payload
  ) VALUES
    (
      v_run_id, v_chicken_63_id, 'target-retail-label-manual',
      'TCIN:89608511', v_chicken_3_url, 'retailer_verified',
      '859610000852', 'blue buffalo', 'blue buffalo',
      'Blue Buffalo Tastefuls Adult Indoor Chicken & Brown Rice Dry Cat Food',
      'BLUE Tastefuls Adult Indoor', 'cat', 'adult', 'dry',
      'chicken and brown rice', '', '3 lb', v_chicken_63_ingredients,
      v_chicken_3_image, true, true, v_observed_at,
      encode(digest(
        v_chicken_3_url || '|859610000852|' || v_chicken_63_ingredients ||
        '|' || v_chicken_3_image, 'sha256'
      ), 'hex'),
      'accepted', ARRAY[]::TEXT[], 'retailer_web_version',
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'package_gtin', '859610000852',
        'product_code', 'TCIN 89608511',
        'captured_at', v_observed_at,
        'ingredient_text_hash', v_chicken_63_hash
      ),
      jsonb_build_object(
        'target_tcin', '89608511',
        'target_upc', '859610000852',
        'ingredients_verbatim_from_exact_pdp', true
      )
    ),
    (
      v_run_id, v_chicken_69_id, 'target-retail-label-manual',
      'TCIN:52615627', v_chicken_5_url, 'retailer_verified',
      '840243122455', 'blue buffalo', 'blue buffalo',
      'Blue Buffalo Tastefuls Adult Indoor Chicken & Brown Rice Dry Cat Food',
      'BLUE Tastefuls Adult Indoor', 'cat', 'adult', 'dry',
      'chicken and brown rice', '', '5 lb', v_chicken_69_ingredients,
      v_chicken_5_image, true, true, v_observed_at,
      encode(digest(
        v_chicken_5_url || '|840243122455|' || v_chicken_69_ingredients ||
        '|' || v_chicken_5_image, 'sha256'
      ), 'hex'),
      'accepted', ARRAY[]::TEXT[], 'retailer_web_version',
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'package_gtin', '840243122455',
        'product_code', 'TCIN 52615627',
        'captured_at', v_observed_at,
        'ingredient_text_hash', v_chicken_69_hash
      ),
      jsonb_build_object(
        'target_tcin', '52615627',
        'target_upc', '840243122455',
        'ingredients_verbatim_from_exact_pdp', true
      )
    ),
    (
      v_run_id, v_chicken_69_id, 'target-retail-label-manual',
      'TCIN:52615639', v_chicken_10_url, 'retailer_verified',
      '840243122431', 'blue buffalo', 'blue buffalo',
      'Blue Buffalo Tastefuls Adult Indoor Chicken & Brown Rice Dry Cat Food',
      'BLUE Tastefuls Adult Indoor', 'cat', 'adult', 'dry',
      'chicken and brown rice', '', '10 lb', v_chicken_69_ingredients,
      v_chicken_10_image, true, true, v_observed_at,
      encode(digest(
        v_chicken_10_url || '|840243122431|' || v_chicken_69_ingredients ||
        '|' || v_chicken_10_image, 'sha256'
      ), 'hex'),
      'accepted', ARRAY[]::TEXT[], 'retailer_web_version',
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'package_gtin', '840243122431',
        'product_code', 'TCIN 52615639',
        'captured_at', v_observed_at,
        'ingredient_text_hash', v_chicken_69_hash,
        'retailer_transcription_normalized',
          'trichoderma iongibrachiatum -> trichoderma longibrachiatum'
      ),
      jsonb_build_object(
        'target_tcin', '52615639',
        'target_upc', '840243122431',
        'ingredients_verbatim_except_obvious_label_transcription', true
      )
    ),
    (
      v_run_id, v_chicken_63_id, 'target-retail-label-manual',
      'TCIN:76366274', v_chicken_15_url, 'retailer_verified',
      '859610000876', 'blue buffalo', 'blue buffalo',
      'Blue Buffalo Tastefuls Adult Indoor Chicken & Brown Rice Dry Cat Food',
      'BLUE Tastefuls Adult Indoor', 'cat', 'adult', 'dry',
      'chicken and brown rice', '', '15 lb', v_chicken_63_ingredients,
      v_chicken_15_image, true, true, v_observed_at,
      encode(digest(
        v_chicken_15_url || '|859610000876|' || v_chicken_63_ingredients ||
        '|' || v_chicken_15_image, 'sha256'
      ), 'hex'),
      'accepted', ARRAY[]::TEXT[], 'retailer_web_version',
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'package_gtin', '859610000876',
        'product_code', 'TCIN 76366274',
        'captured_at', v_observed_at,
        'ingredient_text_hash', v_chicken_63_hash,
        'retailer_transcription_normalized',
          'calcium lodate -> calcium iodate'
      ),
      jsonb_build_object(
        'target_tcin', '76366274',
        'target_upc', '859610000876',
        'ingredients_verbatim_except_obvious_label_transcription', true
      )
    ),
    (
      v_run_id, v_salmon_3_id, 'target-retail-label-manual',
      'TCIN:89608506', v_salmon_3_url, 'retailer_verified',
      '840243151431', 'blue buffalo', 'blue buffalo',
      'Blue Buffalo Tastefuls Adult Indoor Salmon & Brown Rice Dry Cat Food',
      'BLUE Tastefuls Adult Indoor', 'cat', 'adult', 'dry',
      'salmon and brown rice', '', '3 lb', v_salmon_3_ingredients,
      v_salmon_3_image, true, true, v_observed_at,
      encode(digest(
        v_salmon_3_url || '|840243151431|' || v_salmon_3_ingredients ||
        '|' || v_salmon_3_image, 'sha256'
      ), 'hex'),
      'accepted', ARRAY[]::TEXT[], 'retailer_web_version',
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'package_gtin', '840243151431',
        'product_code', 'TCIN 89608506',
        'captured_at', v_observed_at,
        'ingredient_text_hash', v_salmon_3_hash
      ),
      jsonb_build_object(
        'target_tcin', '89608506',
        'target_upc', '840243151431',
        'ingredients_verbatim_from_exact_pdp', true
      )
    ),
    (
      v_run_id, v_salmon_current_id, 'target-retail-label-manual',
      'TCIN:52615633', v_salmon_5_url, 'retailer_verified',
      '840243122479', 'general mills', 'blue buffalo',
      'BLUE Tastefuls Adult Indoor Cat Salmon & Brown Rice Recipe',
      'BLUE Tastefuls Adult Indoor', 'cat', 'adult', 'dry',
      'salmon and brown rice', '', '5 lb', v_salmon_5_ingredients,
      v_salmon_5_image, true, true, v_observed_at,
      encode(digest(
        v_salmon_5_url || '|840243122479|' || v_salmon_5_ingredients ||
        '|' || v_salmon_5_image, 'sha256'
      ), 'hex'),
      'accepted', ARRAY[]::TEXT[], 'manufacturer_current_exact',
      jsonb_build_object(
        'version_status', 'manufacturer_current_equivalent_package',
        'manufacturer_current_equivalence', true,
        'package_gtin', '840243122479',
        'product_code', 'TCIN 52615633',
        'captured_at', v_observed_at,
        'ingredient_text_hash', v_salmon_5_hash
      ),
      jsonb_build_object(
        'target_tcin', '52615633',
        'target_upc', '840243122479',
        'ingredients_verbatim_from_exact_pdp', true,
        'exact_official_ingredient_hash_match', true
      )
    )
  ON CONFLICT (
    run_id, source_slug, source_external_id, content_hash
  ) DO UPDATE
  SET
    formula_id = excluded.formula_id,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    formula_evidence_tier = excluded.formula_evidence_tier,
    formula_version_provenance =
      excluded.formula_version_provenance,
    raw_payload = excluded.raw_payload,
    observed_at = excluded.observed_at;

  -- Repair every census copy of the four pages already in the panel.
  UPDATE public.catalog_observations
  SET
    formula_id = v_chicken_69_id,
    gtin = '840243122455',
    manufacturer = 'blue buffalo',
    brand = 'blue buffalo',
    product_name =
      'Blue Buffalo Tastefuls Adult Indoor Chicken & Brown Rice Dry Cat Food',
    product_line = 'BLUE Tastefuls Adult Indoor',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'chicken and brown rice',
    diet_condition = '',
    package_size = '5 lb',
    ingredient_text = v_chicken_69_ingredients,
    front_image_url = v_chicken_5_image,
    is_complete_food = true,
    observed_at = v_observed_at,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance = jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'package_gtin', '840243122455',
      'product_code', 'TCIN 52615627',
      'captured_at', v_observed_at,
      'ingredient_text_hash', v_chicken_69_hash
    ),
    raw_payload = COALESCE(raw_payload, '{}'::JSONB) ||
      jsonb_build_object(
        'target_tcin', '52615627',
        'target_upc', '840243122455',
        'ingredients_verbatim_from_exact_pdp', true
      )
  WHERE source_url = v_chicken_5_url;

  UPDATE public.catalog_observations
  SET
    formula_id = v_chicken_63_id,
    gtin = '859610000852',
    manufacturer = 'blue buffalo',
    brand = 'blue buffalo',
    product_name =
      'Blue Buffalo Tastefuls Adult Indoor Chicken & Brown Rice Dry Cat Food',
    product_line = 'BLUE Tastefuls Adult Indoor',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'chicken and brown rice',
    diet_condition = '',
    package_size = '3 lb',
    ingredient_text = v_chicken_63_ingredients,
    front_image_url = v_chicken_3_image,
    is_complete_food = true,
    observed_at = v_observed_at,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance = jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'package_gtin', '859610000852',
      'product_code', 'TCIN 89608511',
      'captured_at', v_observed_at,
      'ingredient_text_hash', v_chicken_63_hash
    ),
    raw_payload = COALESCE(raw_payload, '{}'::JSONB) ||
      jsonb_build_object(
        'target_tcin', '89608511',
        'target_upc', '859610000852',
        'ingredients_verbatim_from_exact_pdp', true
      )
  WHERE source_url = v_chicken_3_url;

  UPDATE public.catalog_observations
  SET
    formula_id = v_salmon_3_id,
    gtin = '840243151431',
    manufacturer = 'blue buffalo',
    brand = 'blue buffalo',
    product_name =
      'Blue Buffalo Tastefuls Adult Indoor Salmon & Brown Rice Dry Cat Food',
    product_line = 'BLUE Tastefuls Adult Indoor',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'salmon and brown rice',
    diet_condition = '',
    package_size = '3 lb',
    ingredient_text = v_salmon_3_ingredients,
    front_image_url = v_salmon_3_image,
    is_complete_food = true,
    observed_at = v_observed_at,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance = jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'package_gtin', '840243151431',
      'product_code', 'TCIN 89608506',
      'captured_at', v_observed_at,
      'ingredient_text_hash', v_salmon_3_hash
    ),
    raw_payload = COALESCE(raw_payload, '{}'::JSONB) ||
      jsonb_build_object(
        'target_tcin', '89608506',
        'target_upc', '840243151431',
        'ingredients_verbatim_from_exact_pdp', true
      )
  WHERE source_url = v_salmon_3_url;

  UPDATE public.catalog_observations
  SET
    formula_id = v_salmon_current_id,
    gtin = '840243122479',
    manufacturer = 'general mills',
    brand = 'blue buffalo',
    product_name =
      'BLUE Tastefuls Adult Indoor Cat Salmon & Brown Rice Recipe',
    product_line = 'BLUE Tastefuls Adult Indoor',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'salmon and brown rice',
    diet_condition = '',
    package_size = '5 lb',
    ingredient_text = v_salmon_5_ingredients,
    front_image_url = v_salmon_5_image,
    is_complete_food = true,
    observed_at = v_observed_at,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    formula_evidence_tier = 'manufacturer_current_exact',
    formula_version_provenance = jsonb_build_object(
      'version_status', 'manufacturer_current_equivalent_package',
      'manufacturer_current_equivalence', true,
      'package_gtin', '840243122479',
      'product_code', 'TCIN 52615633',
      'captured_at', v_observed_at,
      'ingredient_text_hash', v_salmon_5_hash
    ),
    raw_payload = COALESCE(raw_payload, '{}'::JSONB) ||
      jsonb_build_object(
        'target_tcin', '52615633',
        'target_upc', '840243122479',
        'ingredients_verbatim_from_exact_pdp', true,
        'exact_official_ingredient_hash_match', true
      )
  WHERE source_url = v_salmon_5_url;

  -- Generic names remain current-first. TCIN aliases expose exact source
  -- versions without presenting them as manufacturer-current.
  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key, alias_text, normalized_alias, source_url, source_authority,
    evidence_observed_at, provenance, active, created_at, updated_at
  ) VALUES
    (
      v_chicken_current_cache,
      'Blue Buffalo Tastefuls with Chicken Indoor Natural Adult Dry Cat Food',
      public.normalize_verified_product_search_query(
        'Blue Buffalo Tastefuls with Chicken Indoor Natural Adult Dry Cat Food'
      ),
      'https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-indoor-chicken-brown-rice/',
      'manufacturer', v_observed_at,
      jsonb_build_object(
        'formula_evidence_tier', 'manufacturer_current_exact',
        'generic_name_prefers_manufacturer_current', true
      ),
      true, now(), now()
    ),
    (
      v_chicken_current_cache,
      'Blue Buffalo Tastefuls Adult Indoor Dry Cat Food with Chicken and Brown Rice',
      public.normalize_verified_product_search_query(
        'Blue Buffalo Tastefuls Adult Indoor Dry Cat Food with Chicken and Brown Rice'
      ),
      'https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-indoor-chicken-brown-rice/',
      'manufacturer', v_observed_at,
      jsonb_build_object(
        'formula_evidence_tier', 'manufacturer_current_exact',
        'generic_name_prefers_manufacturer_current', true
      ),
      true, now(), now()
    ),
    (
      v_salmon_current_cache,
      'Blue Buffalo Tastefuls with Salmon Indoor Natural Adult Dry Cat Food',
      public.normalize_verified_product_search_query(
        'Blue Buffalo Tastefuls with Salmon Indoor Natural Adult Dry Cat Food'
      ),
      'https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-indoor-salmon-brown-rice/',
      'manufacturer', v_observed_at,
      jsonb_build_object(
        'formula_evidence_tier', 'manufacturer_current_exact',
        'generic_name_prefers_manufacturer_current', true
      ),
      true, now(), now()
    ),
    (
      v_salmon_current_cache,
      'Blue Buffalo Tastefuls Adult Indoor Dry Cat Food with Salmon and Brown Rice',
      public.normalize_verified_product_search_query(
        'Blue Buffalo Tastefuls Adult Indoor Dry Cat Food with Salmon and Brown Rice'
      ),
      'https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-indoor-salmon-brown-rice/',
      'manufacturer', v_observed_at,
      jsonb_build_object(
        'formula_evidence_tier', 'manufacturer_current_exact',
        'generic_name_prefers_manufacturer_current', true
      ),
      true, now(), now()
    ),
    (
      v_chicken_63_cache,
      'Target TCIN 89608511 Blue Buffalo Tastefuls Indoor Chicken Brown Rice 3 lb',
      public.normalize_verified_product_search_query(
        'Target TCIN 89608511 Blue Buffalo Tastefuls Indoor Chicken Brown Rice 3 lb'
      ),
      v_chicken_3_url, 'retailer_verified', v_observed_at,
      jsonb_build_object(
        'formula_evidence_tier', 'retailer_web_version',
        'package_gtin', '859610000852',
        'product_code', 'TCIN 89608511',
        'manufacturer_current_equivalence', false
      ),
      true, now(), now()
    ),
    (
      v_chicken_69_cache,
      'Target TCIN 52615627 Blue Buffalo Tastefuls Indoor Chicken Brown Rice 5 lb',
      public.normalize_verified_product_search_query(
        'Target TCIN 52615627 Blue Buffalo Tastefuls Indoor Chicken Brown Rice 5 lb'
      ),
      v_chicken_5_url, 'retailer_verified', v_observed_at,
      jsonb_build_object(
        'formula_evidence_tier', 'retailer_web_version',
        'package_gtin', '840243122455',
        'product_code', 'TCIN 52615627',
        'manufacturer_current_equivalence', false
      ),
      true, now(), now()
    ),
    (
      v_chicken_69_cache,
      'Target TCIN 52615639 Blue Buffalo Tastefuls Indoor Chicken Brown Rice 10 lb',
      public.normalize_verified_product_search_query(
        'Target TCIN 52615639 Blue Buffalo Tastefuls Indoor Chicken Brown Rice 10 lb'
      ),
      v_chicken_10_url, 'retailer_verified', v_observed_at,
      jsonb_build_object(
        'formula_evidence_tier', 'retailer_web_version',
        'package_gtin', '840243122431',
        'product_code', 'TCIN 52615639',
        'manufacturer_current_equivalence', false
      ),
      true, now(), now()
    ),
    (
      v_chicken_63_cache,
      'Target TCIN 76366274 Blue Buffalo Tastefuls Indoor Chicken Brown Rice 15 lb',
      public.normalize_verified_product_search_query(
        'Target TCIN 76366274 Blue Buffalo Tastefuls Indoor Chicken Brown Rice 15 lb'
      ),
      v_chicken_15_url, 'retailer_verified', v_observed_at,
      jsonb_build_object(
        'formula_evidence_tier', 'retailer_web_version',
        'package_gtin', '859610000876',
        'product_code', 'TCIN 76366274',
        'manufacturer_current_equivalence', false
      ),
      true, now(), now()
    ),
    (
      v_salmon_3_cache,
      'Target TCIN 89608506 Blue Buffalo Tastefuls Indoor Salmon Brown Rice 3 lb',
      public.normalize_verified_product_search_query(
        'Target TCIN 89608506 Blue Buffalo Tastefuls Indoor Salmon Brown Rice 3 lb'
      ),
      v_salmon_3_url, 'retailer_verified', v_observed_at,
      jsonb_build_object(
        'formula_evidence_tier', 'retailer_web_version',
        'package_gtin', '840243151431',
        'product_code', 'TCIN 89608506',
        'manufacturer_current_equivalence', false
      ),
      true, now(), now()
    ),
    (
      v_salmon_current_cache,
      'Target TCIN 52615633 Blue Buffalo Tastefuls Indoor Salmon Brown Rice 5 lb',
      public.normalize_verified_product_search_query(
        'Target TCIN 52615633 Blue Buffalo Tastefuls Indoor Salmon Brown Rice 5 lb'
      ),
      v_salmon_5_url, 'retailer_verified', v_observed_at,
      jsonb_build_object(
        'formula_evidence_tier', 'manufacturer_current_exact',
        'package_gtin', '840243122479',
        'product_code', 'TCIN 52615633',
        'manufacturer_current_equivalence', true
      ),
      true, now(), now()
    )
  ON CONFLICT (normalized_alias)
    WHERE active
  DO UPDATE
  SET
    cache_key = excluded.cache_key,
    alias_text = excluded.alias_text,
    source_url = excluded.source_url,
    source_authority = excluded.source_authority,
    evidence_observed_at = excluded.evidence_observed_at,
    provenance = excluded.provenance,
    active = true,
    updated_at = now();

  INSERT INTO public.catalog_product_evidence (
    cache_key, gtin, product_name, brand, pet_type, source, source_quality,
    source_url, ingredient_source_url, image_source_url,
    ingredient_verification_status, image_verification_status,
    raw_source_hash, content_hash, extractor_version, review_state,
    rejection_reason, evidence, updated_at
  ) VALUES
    (
      v_chicken_63_cache, '859610000852',
      'Blue Buffalo Tastefuls Adult Indoor Chicken & Brown Rice Dry Cat Food',
      'Blue Buffalo', 'cat', 'target-retail-label-manual',
      'retailer_verified', v_chicken_3_url, v_chicken_3_url,
      v_chicken_3_image, 'retailer_verified', 'retailer_verified',
      encode(digest(v_chicken_3_url || '|' || v_chicken_3_image, 'sha256'), 'hex'),
      encode(digest(v_chicken_63_ingredients || '|' || v_chicken_3_image, 'sha256'), 'hex'),
      '2026-07-26-source-versioned-web-label-v1', 'promoted', NULL,
      jsonb_build_object(
        'formula_evidence_tier', 'retailer_web_version',
        'target_tcin', '89608511',
        'package_gtin', '859610000852',
        'manufacturer_current_equivalence', false,
        'captured_at', v_observed_at
      ),
      now()
    ),
    (
      v_chicken_69_cache, '840243122455',
      'Blue Buffalo Tastefuls Adult Indoor Chicken & Brown Rice Dry Cat Food',
      'Blue Buffalo', 'cat', 'target-retail-label-manual',
      'retailer_verified', v_chicken_5_url, v_chicken_5_url,
      v_chicken_5_image, 'retailer_verified', 'retailer_verified',
      encode(digest(v_chicken_5_url || '|' || v_chicken_5_image, 'sha256'), 'hex'),
      encode(digest(v_chicken_69_ingredients || '|' || v_chicken_5_image, 'sha256'), 'hex'),
      '2026-07-26-source-versioned-web-label-v1', 'promoted', NULL,
      jsonb_build_object(
        'formula_evidence_tier', 'retailer_web_version',
        'target_tcin', '52615627',
        'package_gtin', '840243122455',
        'manufacturer_current_equivalence', false,
        'captured_at', v_observed_at
      ),
      now()
    ),
    (
      v_chicken_69_cache, '840243122431',
      'Blue Buffalo Tastefuls Adult Indoor Chicken & Brown Rice Dry Cat Food',
      'Blue Buffalo', 'cat', 'target-retail-label-manual',
      'retailer_verified', v_chicken_10_url, v_chicken_10_url,
      v_chicken_10_image, 'retailer_verified', 'retailer_verified',
      encode(digest(v_chicken_10_url || '|' || v_chicken_10_image, 'sha256'), 'hex'),
      encode(digest(v_chicken_69_ingredients || '|' || v_chicken_10_image, 'sha256'), 'hex'),
      '2026-07-26-source-versioned-web-label-v1', 'promoted', NULL,
      jsonb_build_object(
        'formula_evidence_tier', 'retailer_web_version',
        'target_tcin', '52615639',
        'package_gtin', '840243122431',
        'manufacturer_current_equivalence', false,
        'captured_at', v_observed_at
      ),
      now()
    ),
    (
      v_chicken_63_cache, '859610000876',
      'Blue Buffalo Tastefuls Adult Indoor Chicken & Brown Rice Dry Cat Food',
      'Blue Buffalo', 'cat', 'target-retail-label-manual',
      'retailer_verified', v_chicken_15_url, v_chicken_15_url,
      v_chicken_15_image, 'retailer_verified', 'retailer_verified',
      encode(digest(v_chicken_15_url || '|' || v_chicken_15_image, 'sha256'), 'hex'),
      encode(digest(v_chicken_63_ingredients || '|' || v_chicken_15_image, 'sha256'), 'hex'),
      '2026-07-26-source-versioned-web-label-v1', 'promoted', NULL,
      jsonb_build_object(
        'formula_evidence_tier', 'retailer_web_version',
        'target_tcin', '76366274',
        'package_gtin', '859610000876',
        'manufacturer_current_equivalence', false,
        'captured_at', v_observed_at
      ),
      now()
    ),
    (
      v_salmon_3_cache, '840243151431',
      'Blue Buffalo Tastefuls Adult Indoor Salmon & Brown Rice Dry Cat Food',
      'Blue Buffalo', 'cat', 'target-retail-label-manual',
      'retailer_verified', v_salmon_3_url, v_salmon_3_url,
      v_salmon_3_image, 'retailer_verified', 'retailer_verified',
      encode(digest(v_salmon_3_url || '|' || v_salmon_3_image, 'sha256'), 'hex'),
      encode(digest(v_salmon_3_ingredients || '|' || v_salmon_3_image, 'sha256'), 'hex'),
      '2026-07-26-source-versioned-web-label-v1', 'promoted', NULL,
      jsonb_build_object(
        'formula_evidence_tier', 'retailer_web_version',
        'target_tcin', '89608506',
        'package_gtin', '840243151431',
        'manufacturer_current_equivalence', false,
        'captured_at', v_observed_at
      ),
      now()
    ),
    (
      v_salmon_current_cache, '840243122479',
      'BLUE Tastefuls Adult Indoor Cat Salmon & Brown Rice Recipe',
      'Blue Buffalo', 'cat', 'target-retail-label-manual',
      'retailer_verified', v_salmon_5_url, v_salmon_5_url,
      v_salmon_5_image, 'retailer_verified', 'retailer_verified',
      encode(digest(v_salmon_5_url || '|' || v_salmon_5_image, 'sha256'), 'hex'),
      encode(digest(v_salmon_5_ingredients || '|' || v_salmon_5_image, 'sha256'), 'hex'),
      '2026-07-26-source-versioned-web-label-v1', 'promoted', NULL,
      jsonb_build_object(
        'formula_evidence_tier', 'manufacturer_current_exact',
        'target_tcin', '52615633',
        'package_gtin', '840243122479',
        'manufacturer_current_equivalence', true,
        'captured_at', v_observed_at
      ),
      now()
    )
  ON CONFLICT DO NOTHING;

  -- Runtime acceptance checks.
  IF (
    SELECT cache_key
    FROM public.resolve_verified_product_by_gtin('859610000852', 8)
    LIMIT 1
  ) IS DISTINCT FROM v_chicken_63_cache
     OR (
       SELECT cache_key
       FROM public.resolve_verified_product_by_gtin('859610000876', 8)
       LIMIT 1
     ) IS DISTINCT FROM v_chicken_63_cache
     OR (
       SELECT cache_key
       FROM public.resolve_verified_product_by_gtin('840243122455', 8)
       LIMIT 1
     ) IS DISTINCT FROM v_chicken_69_cache
     OR (
       SELECT cache_key
       FROM public.resolve_verified_product_by_gtin('840243122431', 8)
       LIMIT 1
     ) IS DISTINCT FROM v_chicken_69_cache
     OR (
       SELECT cache_key
       FROM public.resolve_verified_product_by_gtin('840243151431', 8)
       LIMIT 1
     ) IS DISTINCT FROM v_salmon_3_cache
     OR (
       SELECT cache_key
       FROM public.resolve_verified_product_by_gtin('840243122479', 8)
       LIMIT 1
     ) IS DISTINCT FROM v_salmon_current_cache
  THEN
    RAISE EXCEPTION
      'Tastefuls Indoor exact package barcode resolution failed';
  END IF;

  IF (
    SELECT cache_key
    FROM public.search_verified_products(
      'Blue Buffalo Tastefuls with Chicken Indoor Natural Adult Dry Cat Food',
      1
    )
    LIMIT 1
  ) IS DISTINCT FROM v_chicken_current_cache
     OR (
       SELECT cache_key
       FROM public.search_verified_products(
         'Blue Buffalo Tastefuls with Salmon Indoor Natural Adult Dry Cat Food',
         1
       )
       LIMIT 1
     ) IS DISTINCT FROM v_salmon_current_cache
  THEN
    RAISE EXCEPTION
      'Tastefuls Indoor generic search did not prefer manufacturer current';
  END IF;

  IF (
    SELECT cache_key
    FROM public.search_verified_products(
      'Target TCIN 52615639 Blue Buffalo Tastefuls Indoor Chicken Brown Rice 10 lb',
      1
    )
    LIMIT 1
  ) IS DISTINCT FROM v_chicken_69_cache
     OR (
       SELECT cache_key
       FROM public.search_verified_products(
         'Target TCIN 89608506 Blue Buffalo Tastefuls Indoor Salmon Brown Rice 3 lb',
         1
       )
       LIMIT 1
     ) IS DISTINCT FROM v_salmon_3_cache
  THEN
    RAISE EXCEPTION
      'Tastefuls Indoor source-specific search did not resolve exact version';
  END IF;
END;
$$;
