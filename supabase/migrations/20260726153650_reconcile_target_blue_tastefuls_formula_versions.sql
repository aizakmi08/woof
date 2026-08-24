-- Preserve three exact Target BLUE Tastefuls package pages as source-versioned
-- evidence without collapsing their ingredient statements into the current
-- manufacturer formulas.
--
-- Resolution policy:
--   * Adult Chicken UPC 840243140510 -> exact Target/PetSmart web version.
--   * Adult Turkey & Chicken UPC 840243140558 -> exact Target web version.
--   * Mature Chicken UPC 840243140534 -> current manufacturer formula because
--     the UPC is reused by a conflicting Target statement. The Target statement
--     remains a verified source version addressable by its TCIN, not by barcode.
--   * Generic name search prefers the current manufacturer formula.

DO $$
DECLARE
  v_adult_formula_id BIGINT;
  v_turkey_formula_id BIGINT;
  v_mature_target_formula_id BIGINT;
  v_mature_duplicate_formula_id BIGINT;
  v_adult_current_formula_id BIGINT;
  v_turkey_current_formula_id BIGINT;
  v_mature_current_formula_id BIGINT;
  v_run_id BIGINT;

  v_adult_cache TEXT := 'petsmart-retail-catalog:840243140510';
  v_turkey_cache TEXT := 'target-retail-catalog:840243140558';
  v_mature_target_cache TEXT := 'target-retail-catalog:840243140534';
  v_adult_current_cache TEXT :=
    'blue-buffalo-general-mills:blue buffalo blue tastefuls adult wet cat food - chicken pat tastefuls chicken-pate';
  v_turkey_current_cache TEXT :=
    'blue-buffalo-general-mills:blue buffalo blue tastefuls adult wet cat food - turkey chicken pat tastefuls turkey-chicken-pate';
  v_mature_current_cache TEXT :=
    'blue-buffalo-general-mills:blue buffalo blue tastefuls pat for mature cats tastefuls mature-chicken-pate';

  v_adult_gap_key TEXT :=
    'blue buffalo|blue buffalo|blue buffalo tastefuls adult cat chicken entree pate wet cat food|cat|adult|wet||';
  v_turkey_gap_key TEXT :=
    'blue buffalo|blue buffalo|blue buffalo tastefuls adult cat turkey and chicken entree pate wet cat food|cat|adult|wet||';
  v_mature_gap_key TEXT :=
    'blue buffalo|blue buffalo|blue buffalo tastefuls mature cat chicken entree pate senior wet cat food|cat|senior|wet||';

  v_adult_url TEXT :=
    'https://www.target.com/p/blue-buffalo-tastefuls-adult-cat-chicken-entree-pate-wet-cat-food-3oz/-/A-80778999';
  v_turkey_url TEXT :=
    'https://www.target.com/p/blue-buffalo-tastefuls-adult-cat-turkey-and-chicken-entree-pate-wet-cat-food-3oz/-/A-80778976';
  v_mature_url TEXT :=
    'https://www.target.com/p/blue-buffalo-tastefuls-mature-cat-chicken-entree-pate-senior-wet-cat-food-3oz/-/A-80778985';

  v_adult_image TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_f6fa6eaa-bc7d-4418-9f20-47226917b81b';
  v_turkey_image TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_81832785-3b6e-4e92-bdf7-e564954ae5fa';
  v_mature_image TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_37b48510-18d4-4260-8605-a8464a0196d8';

  v_adult_ingredients TEXT :=
    'chicken, chicken broth, chicken liver, natural flavor, brown rice, guar gum, sweet potatoes, powdered cellulose, tricalcium phosphate, sodium acid pyrophosphate, carrageenan, taurine, fish oil, cassia gum, potassium chloride, salt, choline chloride, iron amino acid chelate, zinc amino acid chelate, vitamin e supplement, thiamine mononitrate (vitamin b1), copper amino acid chelate, manganese amino acid chelate, sodium selenite, niacin supplement (vitamin b3), calcium pantothenate (vitamin b5), pyridoxine hydrochloride (vitamin b6), riboflavin supplement (vitamin b2), vitamin a supplement, biotin (vitamin b7), potassium iodide, vitamin d3 supplement, vitamin b12 supplement, folic acid (vitamin b9), preserved with mixed tocopherols';
  v_turkey_ingredients TEXT :=
    'turkey, chicken broth, chicken liver, chicken, natural flavor, brown rice, guar gum, sweet potatoes, potassium chloride, salt, sodium acid pyrophosphate, carrageenan, taurine, fish oil, cassia gum, choline chloride, iron amino acid chelate, zinc amino acid chelate, vitamin e supplement, thiamine mononitrate (vitamin b1), copper amino acid chelate, manganese amino acid chelate, sodium selenite, niacin supplement (vitamin b3), calcium pantothenate (vitamin b5), pyridoxine hydrochloride (vitamin b6), riboflavin supplement (vitamin b2), vitamin a supplement, biotin (vitamin b7), potassium iodide, vitamin d3 supplement, vitamin b12 supplement, folic acid (vitamin b9), preserved with mixed tocopherols';
  v_mature_ingredients TEXT :=
    'chicken, chicken broth, chicken liver, natural flavor, brown rice, sweet potatoes, brewer’s dried yeast, powdered cellulose, calcium carbonate, sodium acid pyrophosphate, guar gum, potassium chloride, salt, taurine, fish oil, choline chloride, carrageenan, cassia gum, iron amino acid chelate, zinc amino acid chelate, copper amino acid chelate, manganese amino acid chelate, sodium selenite, thiamine mononitrate (vitamin b1), potassium iodide, niacin supplement (vitamin b3), calcium pantothenate (vitamin b5), pyridoxine hydrochloride (vitamin b6), vitamin a supplement, biotin (vitamin b7), vitamin d3 supplement, vitamin b12 supplement, vitamin e supplement, folic acid (vitamin b9), riboflavin supplement (vitamin b2), preserved with mixed tocopherols';

  v_adult_hash TEXT;
  v_turkey_hash TEXT;
  v_mature_hash TEXT;
  v_adult_current_hash TEXT;
  v_turkey_current_hash TEXT;
  v_mature_current_hash TEXT;
  v_observed_at TIMESTAMPTZ := '2026-07-27T00:35:00Z';
BEGIN
  v_adult_hash := encode(
    digest(
      public.catalog_normalize_ingredient_evidence(v_adult_ingredients),
      'sha256'
    ),
    'hex'
  );
  v_turkey_hash := encode(
    digest(
      public.catalog_normalize_ingredient_evidence(v_turkey_ingredients),
      'sha256'
    ),
    'hex'
  );
  v_mature_hash := encode(
    digest(
      public.catalog_normalize_ingredient_evidence(v_mature_ingredients),
      'sha256'
    ),
    'hex'
  );

  IF v_adult_hash <>
      'e7b850ccfb291f76960424abdfd56acc370fb4a2ddde8eb7f6b98f544a103265'
     OR v_turkey_hash <>
      'd80642e35bd225e441e42608dcfd1434c756a1e39f2adb8834c2f70c5f3e466a'
     OR v_mature_hash <>
      'fb9bb59318b35b776b76f1667d2968ff7a0c3bce6e2072d7927d54404b281472'
  THEN
    RAISE EXCEPTION 'Target Tastefuls ingredient transcription changed';
  END IF;

  SELECT id
  INTO STRICT v_adult_formula_id
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue buffalo tastefuls cat wet food natural pate|cat|adult|wet|chicken|'
    AND formula_evidence_tier = 'retailer_web_version'
    AND verification_status = 'verified'
    AND active
    AND encode(
      digest(
        public.catalog_normalize_ingredient_evidence(
          COALESCE(ingredient_text, '')
        ),
        'sha256'
      ),
      'hex'
    ) = v_adult_hash;

  SELECT id
  INTO STRICT v_turkey_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_turkey_gap_key;

  SELECT id
  INTO STRICT v_mature_target_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_mature_gap_key;

  SELECT id
  INTO STRICT v_mature_duplicate_formula_id
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue buffalo tastefuls senior wet cat food pate natural chicken|cat|senior|wet|chicken|'
    AND verification_status = 'verified'
    AND active;

  SELECT id, encode(
    digest(
      public.catalog_normalize_ingredient_evidence(
        COALESCE(ingredient_text, '')
      ),
      'sha256'
    ),
    'hex'
  )
  INTO STRICT v_adult_current_formula_id, v_adult_current_hash
  FROM public.catalog_formulas
  WHERE promoted_cache_key = v_adult_current_cache
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND verification_status = 'verified'
    AND active;

  SELECT id, encode(
    digest(
      public.catalog_normalize_ingredient_evidence(
        COALESCE(ingredient_text, '')
      ),
      'sha256'
    ),
    'hex'
  )
  INTO STRICT v_turkey_current_formula_id, v_turkey_current_hash
  FROM public.catalog_formulas
  WHERE promoted_cache_key = v_turkey_current_cache
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND verification_status = 'verified'
    AND active;

  SELECT id, encode(
    digest(
      public.catalog_normalize_ingredient_evidence(
        COALESCE(ingredient_text, '')
      ),
      'sha256'
    ),
    'hex'
  )
  INTO STRICT v_mature_current_formula_id, v_mature_current_hash
  FROM public.catalog_formulas
  WHERE promoted_cache_key = v_mature_current_cache
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND verification_status = 'verified'
    AND active;

  IF v_adult_hash = v_adult_current_hash
     OR v_turkey_hash = v_turkey_current_hash
     OR v_mature_hash = v_mature_current_hash
  THEN
    RAISE EXCEPTION
      'A Target Tastefuls source version unexpectedly equals manufacturer current';
  END IF;

  IF v_mature_current_hash <>
      '38ab19207e75185ea9bfe6630f4acb346aef7f2a1be4e6f051e5566bb4ca883a'
     OR EXISTS (
       SELECT 1
       FROM public.catalog_formulas duplicate
       WHERE duplicate.id = v_mature_duplicate_formula_id
         AND encode(
           digest(
             public.catalog_normalize_ingredient_evidence(
               COALESCE(duplicate.ingredient_text, '')
             ),
             'sha256'
           ),
           'hex'
         ) <> v_mature_current_hash
     )
  THEN
    RAISE EXCEPTION
      'Mature Tastefuls current/PetSmart equality precondition changed';
  END IF;

  -- Make the existing Adult Chicken retailer version resolvable while keeping
  -- the manufacturer-current formula separate and preferred for generic text.
  UPDATE public.catalog_formulas
  SET
    manufacturer = 'blue buffalo',
    brand = 'blue buffalo',
    product_name =
      'Blue Buffalo Tastefuls Adult Chicken Entrée Paté Wet Cat Food',
    product_line = 'BLUE Tastefuls Adult Wet',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'wet',
    flavor = 'chicken',
    diet_condition = '',
    is_complete_food = true,
    promoted_cache_key = v_adult_cache,
    promoted_at = now(),
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'equivalent_exact_source_urls', jsonb_build_array(
          'https://www.petsmart.com/cat/food-and-treats/canned-food/blue-buffalo-tastefuls-cat-wet-food-natural-pate-3-oz-63254.html',
          v_adult_url
        ),
        'package_gtin', '840243140510',
        'target_product_code', 'TCIN 80778999',
        'captured_at', v_observed_at,
        'ingredient_text_hash', v_adult_hash,
        'different_from_manufacturer_current_hash',
          v_adult_current_hash
      ),
    updated_at = now()
  WHERE id = v_adult_formula_id;

  UPDATE public.product_data
  SET
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'equivalent_exact_source_urls', jsonb_build_array(
          source_url,
          v_adult_url
        ),
        'target_product_code', 'TCIN 80778999',
        'captured_at', v_observed_at,
        'ingredient_text_hash', v_adult_hash,
        'different_from_manufacturer_current_hash',
          v_adult_current_hash
      ),
    nutritional_info =
      COALESCE(nutritional_info, '{}'::JSONB) ||
      jsonb_build_object(
        'formula_evidence_tier', 'retailer_web_version'
      ),
    updated_at = now()
  WHERE cache_key = v_adult_cache
    AND encode(
      digest(
        public.catalog_normalize_ingredient_evidence(
          COALESCE(ingredient_text, '')
        ),
        'sha256'
      ),
      'hex'
    ) = v_adult_hash;

  -- Promote the exact Target Turkey & Chicken source version. The current
  -- manufacturer formula remains a separate ingredient version.
  INSERT INTO public.product_data (
    cache_key, product_name, brand, ingredients, ingredient_text,
    ingredient_count, source, source_url, scraped_at, expires_at, image_url,
    nutrient_panel, nutritional_info, has_published_nutrients,
    is_complete_food, catalog_exclusion_reason, pet_type, source_quality,
    ingredient_verification_status, image_verification_status, verified_at,
    gtin, product_line, flavor, life_stage, food_form, package_size,
    formula_evidence_tier, formula_version_provenance, updated_at
  ) VALUES (
    v_turkey_cache,
    'Blue Buffalo Tastefuls Adult Turkey & Chicken Entrée Paté Wet Cat Food',
    'Blue Buffalo',
    public.catalog_split_ingredient_statement(v_turkey_ingredients),
    v_turkey_ingredients,
    cardinality(
      public.catalog_split_ingredient_statement(v_turkey_ingredients)
    ),
    'target-retail-label-manual',
    v_turkey_url,
    v_observed_at,
    now() + INTERVAL '180 days',
    v_turkey_image,
    '{}'::JSONB,
    jsonb_build_object(
      'formula_evidence_tier', 'retailer_web_version'
    ),
    false,
    true,
    NULL,
    'cat',
    'retailer_verified',
    'retailer_verified',
    'retailer_verified',
    v_observed_at,
    '840243140558',
    'BLUE Tastefuls Adult Wet',
    'Turkey & Chicken',
    'adult',
    'wet',
    '3 oz',
    'retailer_web_version',
    jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'source', 'target-retail-label-manual',
      'source_url', v_turkey_url,
      'captured_at', v_observed_at,
      'package_gtin', '840243140558',
      'product_code', 'TCIN 80778976',
      'package_size', '3 oz',
      'front_image_url', v_turkey_image,
      'ingredient_text_hash', v_turkey_hash,
      'different_from_manufacturer_current_hash',
        v_turkey_current_hash
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
    nutrient_panel = excluded.nutrient_panel,
    nutritional_info = excluded.nutritional_info,
    has_published_nutrients = excluded.has_published_nutrients,
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
    formula_version_provenance =
      excluded.formula_version_provenance,
    updated_at = now();

  UPDATE public.catalog_formulas
  SET
    manufacturer = 'blue buffalo',
    brand = 'blue buffalo',
    product_name =
      'Blue Buffalo Tastefuls Adult Turkey & Chicken Entrée Paté Wet Cat Food',
    product_line = 'BLUE Tastefuls Adult Wet',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'wet',
    flavor = 'turkey and chicken',
    diet_condition = '',
    is_complete_food = true,
    complete_food_evidence =
      'Exact Target TCIN 80778976 identifies an adult wet cat food package and publishes its complete label ingredient statement; complete-food classification is also supported by the same current manufacturer product identity.',
    ingredient_text = v_turkey_ingredients,
    ingredients =
      public.catalog_split_ingredient_statement(v_turkey_ingredients),
    front_image_url = v_turkey_image,
    source_url = v_turkey_url,
    source_authority = 'retailer_verified',
    ingredient_verification_status = 'retailer_verified',
    image_verification_status = 'retailer_verified',
    protected_terms = ARRAY[
      'blue buffalo', 'tastefuls', 'adult', 'cat', 'wet', 'pate',
      'turkey', 'chicken'
    ]::TEXT[],
    verification_status = 'verified',
    active = true,
    absent_since = NULL,
    promoted_cache_key = v_turkey_cache,
    promoted_at = now(),
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'source', 'target-retail-label-manual',
        'source_url', v_turkey_url,
        'captured_at', v_observed_at,
        'package_gtin', '840243140558',
        'product_code', 'TCIN 80778976',
        'package_size', '3 oz',
        'front_image_url', v_turkey_image,
        'ingredient_text_hash', v_turkey_hash,
        'different_from_manufacturer_current_hash',
          v_turkey_current_hash
      ),
    last_observed_at = v_observed_at,
    updated_at = now()
  WHERE id = v_turkey_formula_id;

  -- First move the ingredient-identical PetSmart mature UPC onto the current
  -- manufacturer formula. This must happen before the conflicting Target
  -- source-version serving row is inserted.
  UPDATE public.product_data product
  SET
    ingredient_text = current_formula.ingredient_text,
    ingredients = current_formula.ingredients,
    ingredient_count = cardinality(current_formula.ingredients),
    formula_version_provenance =
      COALESCE(product.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'transcription_normalized_to_manufacturer_current', true,
        'normalization_scope',
          'spacing-only Biotin(Vitamin B7) transcription',
        'ingredient_text_hash', v_mature_current_hash,
        'normalized_at', v_observed_at
      ),
    updated_at = now()
  FROM public.catalog_formulas current_formula
  WHERE product.cache_key = 'petsmart-retail-catalog:840243140534'
    AND current_formula.id = v_mature_current_formula_id
    AND encode(
      digest(
        public.catalog_normalize_ingredient_evidence(
          COALESCE(product.ingredient_text, '')
        ),
        'sha256'
      ),
      'hex'
    ) = v_mature_current_hash;

  UPDATE public.catalog_skus
  SET
    formula_id = v_mature_current_formula_id,
    source_url =
      'https://www.petsmart.com/cat/food-and-treats/canned-food/blue-buffalo-tastefuls-senior-wet-cat-food-pate-natural-chicken-3-oz-63251.html',
    active = true,
    last_observed_at = v_observed_at,
    updated_at = now()
  WHERE formula_id = v_mature_duplicate_formula_id
    AND gtin = '840243140534';

  UPDATE public.catalog_observations
  SET
    formula_id = v_mature_current_formula_id,
    formula_evidence_tier = 'manufacturer_current_exact',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'manufacturer_current_equivalence', true,
        'manufacturer_current_formula_id', v_mature_current_formula_id,
        'ingredient_text_hash', v_mature_current_hash,
        'reconciled_at', v_observed_at
      )
  WHERE formula_id = v_mature_duplicate_formula_id
    AND source_slug = 'petsmart-retail-catalog'
    AND gtin = '840243140534';

  INSERT INTO public.catalog_formula_aliases (
    alias_formula_key, formula_id, identity_hash, match_reason, source_url,
    metadata, updated_at
  ) VALUES (
    'blue buffalo|blue buffalo|blue buffalo tastefuls senior wet cat food pate natural chicken|cat|senior|wet|chicken|',
    v_mature_current_formula_id,
    encode(
      digest(
        'general mills|blue buffalo|blue tastefuls pate for mature cats|cat|senior|wet||',
        'sha256'
      ),
      'hex'
    ),
    'manual_review',
    'https://www.bluebuffalo.com/wet-cat-food/tastefuls/mature-chicken-pate/',
    jsonb_build_object(
      'exact_formula_identity', true,
      'species_boundary', 'cat',
      'life_stage_boundary', 'senior',
      'food_form_boundary', 'wet pate',
      'recipe_boundary', 'chicken',
      'ingredient_hash_equality_verified', true,
      'package_sizes_are_sku_children', true,
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
      'Ingredient-identical PetSmart package alias of the current manufacturer formula. UPC 840243140534 is now owned by the current canonical formula.',
    updated_at = now()
  WHERE id = v_mature_duplicate_formula_id;

  -- Preserve Target's different mature ingredient statement as its own
  -- source-versioned formula. Because the UPC is reused by the current formula,
  -- this version intentionally has no active GTIN SKU; TCIN is its exact key.
  INSERT INTO public.product_data (
    cache_key, product_name, brand, ingredients, ingredient_text,
    ingredient_count, source, source_url, scraped_at, expires_at, image_url,
    nutrient_panel, nutritional_info, has_published_nutrients,
    is_complete_food, catalog_exclusion_reason, pet_type, source_quality,
    ingredient_verification_status, image_verification_status, verified_at,
    gtin, product_line, flavor, life_stage, food_form, package_size,
    formula_evidence_tier, formula_version_provenance, updated_at
  ) VALUES (
    v_mature_target_cache,
    'Blue Buffalo Tastefuls Mature Chicken Entrée Paté Wet Cat Food',
    'Blue Buffalo',
    public.catalog_split_ingredient_statement(v_mature_ingredients),
    v_mature_ingredients,
    cardinality(
      public.catalog_split_ingredient_statement(v_mature_ingredients)
    ),
    'target-retail-label-manual',
    v_mature_url,
    v_observed_at,
    now() + INTERVAL '180 days',
    v_mature_image,
    '{}'::JSONB,
    jsonb_build_object(
      'formula_evidence_tier', 'retailer_web_version',
      'barcode_resolution_policy',
        'prefer_manufacturer_current_due_reused_gtin'
    ),
    false,
    true,
    NULL,
    'cat',
    'retailer_verified',
    'retailer_verified',
    'retailer_verified',
    v_observed_at,
    '840243140534',
    'BLUE Tastefuls Mature Wet',
    'Chicken',
    'senior',
    'wet',
    '3 oz',
    'retailer_web_version',
    jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'source', 'target-retail-label-manual',
      'source_url', v_mature_url,
      'captured_at', v_observed_at,
      'package_gtin', '840243140534',
      'product_code', 'TCIN 80778985',
      'package_size', '3 oz',
      'front_image_url', v_mature_image,
      'ingredient_text_hash', v_mature_hash,
      'different_from_manufacturer_current_hash',
        v_mature_current_hash,
      'barcode_resolution_policy',
        'prefer_manufacturer_current_due_reused_gtin'
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
    nutrient_panel = excluded.nutrient_panel,
    nutritional_info = excluded.nutritional_info,
    has_published_nutrients = excluded.has_published_nutrients,
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
    formula_version_provenance =
      excluded.formula_version_provenance,
    updated_at = now();

  UPDATE public.catalog_formulas
  SET
    manufacturer = 'blue buffalo',
    brand = 'blue buffalo',
    product_name =
      'Blue Buffalo Tastefuls Mature Chicken Entrée Paté Wet Cat Food',
    product_line = 'BLUE Tastefuls Mature Wet',
    pet_type = 'cat',
    life_stage = 'senior',
    food_form = 'wet',
    flavor = 'chicken',
    diet_condition = '',
    is_complete_food = true,
    complete_food_evidence =
      'Exact Target TCIN 80778985 identifies a senior wet cat food package and publishes its full ingredient statement; the reused UPC remains assigned to manufacturer current for barcode lookup.',
    ingredient_text = v_mature_ingredients,
    ingredients =
      public.catalog_split_ingredient_statement(v_mature_ingredients),
    front_image_url = v_mature_image,
    source_url = v_mature_url,
    source_authority = 'retailer_verified',
    ingredient_verification_status = 'retailer_verified',
    image_verification_status = 'retailer_verified',
    protected_terms = ARRAY[
      'blue buffalo', 'tastefuls', 'mature', 'senior', 'cat', 'wet',
      'pate', 'chicken', 'tcin 80778985'
    ]::TEXT[],
    verification_status = 'verified',
    active = true,
    absent_since = NULL,
    promoted_cache_key = v_mature_target_cache,
    promoted_at = now(),
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'source', 'target-retail-label-manual',
        'source_url', v_mature_url,
        'captured_at', v_observed_at,
        'package_gtin', '840243140534',
        'product_code', 'TCIN 80778985',
        'package_size', '3 oz',
        'front_image_url', v_mature_image,
        'ingredient_text_hash', v_mature_hash,
        'different_from_manufacturer_current_hash',
          v_mature_current_hash,
        'barcode_resolution_policy',
          'prefer_manufacturer_current_due_reused_gtin'
      ),
    last_observed_at = v_observed_at,
    updated_at = now()
  WHERE id = v_mature_target_formula_id;

  -- Reparent the exact Target sitemap SKU rows away from the manufacturer
  -- formulas whose ingredients differ.
  UPDATE public.catalog_skus
  SET
    formula_id = v_adult_formula_id,
    gtin = '840243140510',
    package_size = '3 oz',
    package_count = 1,
    source_slug = 'target-retail-label-manual',
    source_external_id = 'TCIN:80778999',
    source_url = v_adult_url,
    active = true,
    last_observed_at = v_observed_at,
    updated_at = now()
  WHERE source_external_id = 'A-80778999'
    AND source_url = v_adult_url;

  UPDATE public.catalog_skus
  SET
    formula_id = v_turkey_formula_id,
    gtin = '840243140558',
    package_size = '3 oz',
    package_count = 1,
    source_slug = 'target-retail-label-manual',
    source_external_id = 'TCIN:80778976',
    source_url = v_turkey_url,
    active = true,
    last_observed_at = v_observed_at,
    updated_at = now()
  WHERE source_external_id = 'A-80778976'
    AND source_url = v_turkey_url;

  -- The source-only mature SKU remains exact by TCIN and deliberately carries
  -- no GTIN so barcode lookup cannot choose the wrong ingredient version.
  UPDATE public.catalog_skus
  SET
    formula_id = v_mature_target_formula_id,
    gtin = NULL,
    package_size = '3 oz',
    package_count = 1,
    source_slug = 'target-retail-label-manual',
    source_external_id = 'TCIN:80778985',
    source_url = v_mature_url,
    active = true,
    last_observed_at = v_observed_at,
    updated_at = now()
  WHERE source_external_id = 'A-80778985'
    AND source_url = v_mature_url;

  INSERT INTO public.catalog_source_runs (
    run_key, source_slug, source_type, coverage_role, status, started_at,
    finished_at, expected_count, observed_count, accepted_count,
    rejected_count, pagination_complete, source_content_hash, checkpoint,
    metadata, updated_at
  ) VALUES (
    'manual-exact-evidence:target:blue-tastefuls-pates:20260726',
    'target-retail-label-manual',
    'retailer',
    'verification',
    'completed',
    v_observed_at,
    v_observed_at,
    3,
    3,
    3,
    0,
    true,
    encode(
      digest(
        v_adult_url || v_adult_hash || v_turkey_url || v_turkey_hash ||
        v_mature_url || v_mature_hash,
        'sha256'
      ),
      'hex'
    ),
    '{}'::JSONB,
    jsonb_build_object(
      'evidence_tier', 'retailer_web_version',
      'manual_exact_evidence', true,
      'exact_package_count', 3,
      'manufacturer_current_equivalent_count', 0,
      'reused_gtin_conflict_count', 1
    ),
    now()
  )
  ON CONFLICT (run_key) DO UPDATE
  SET
    status = 'completed',
    finished_at = excluded.finished_at,
    observed_count = 3,
    accepted_count = 3,
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
      v_run_id, v_adult_formula_id, 'target-retail-label-manual',
      'TCIN:80778999', v_adult_url, 'retailer_verified',
      '840243140510', 'blue buffalo', 'blue buffalo',
      'Blue Buffalo Tastefuls Adult Chicken Entrée Paté Wet Cat Food',
      'BLUE Tastefuls Adult Wet', 'cat', 'adult', 'wet', 'chicken', '',
      '3 oz', v_adult_ingredients, v_adult_image, true, true,
      v_observed_at,
      encode(
        digest(
          v_adult_gap_key || '|840243140510|' || v_adult_ingredients ||
          '|' || v_adult_image,
          'sha256'
        ),
        'hex'
      ),
      'accepted', ARRAY[]::TEXT[], 'retailer_web_version',
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'package_gtin', '840243140510',
        'product_code', 'TCIN 80778999',
        'captured_at', v_observed_at,
        'ingredient_text_hash', v_adult_hash
      ),
      jsonb_build_object(
        'target_tcin', '80778999',
        'target_upc', '840243140510',
        'front_image_url', v_adult_image,
        'ingredients_verbatim_from_exact_pdp', true
      )
    ),
    (
      v_run_id, v_turkey_formula_id, 'target-retail-label-manual',
      'TCIN:80778976', v_turkey_url, 'retailer_verified',
      '840243140558', 'blue buffalo', 'blue buffalo',
      'Blue Buffalo Tastefuls Adult Turkey & Chicken Entrée Paté Wet Cat Food',
      'BLUE Tastefuls Adult Wet', 'cat', 'adult', 'wet',
      'turkey and chicken', '', '3 oz', v_turkey_ingredients,
      v_turkey_image, true, true, v_observed_at,
      encode(
        digest(
          v_turkey_gap_key || '|840243140558|' || v_turkey_ingredients ||
          '|' || v_turkey_image,
          'sha256'
        ),
        'hex'
      ),
      'accepted', ARRAY[]::TEXT[], 'retailer_web_version',
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'package_gtin', '840243140558',
        'product_code', 'TCIN 80778976',
        'captured_at', v_observed_at,
        'ingredient_text_hash', v_turkey_hash
      ),
      jsonb_build_object(
        'target_tcin', '80778976',
        'target_upc', '840243140558',
        'front_image_url', v_turkey_image,
        'ingredients_verbatim_from_exact_pdp', true
      )
    ),
    (
      v_run_id, v_mature_target_formula_id, 'target-retail-label-manual',
      'TCIN:80778985', v_mature_url, 'retailer_verified',
      '840243140534', 'blue buffalo', 'blue buffalo',
      'Blue Buffalo Tastefuls Mature Chicken Entrée Paté Wet Cat Food',
      'BLUE Tastefuls Mature Wet', 'cat', 'senior', 'wet', 'chicken', '',
      '3 oz', v_mature_ingredients, v_mature_image, true, true,
      v_observed_at,
      encode(
        digest(
          v_mature_gap_key || '|TCIN:80778985|' ||
          v_mature_ingredients || '|' || v_mature_image,
          'sha256'
        ),
        'hex'
      ),
      'accepted', ARRAY[]::TEXT[], 'retailer_web_version',
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'package_gtin', '840243140534',
        'product_code', 'TCIN 80778985',
        'captured_at', v_observed_at,
        'ingredient_text_hash', v_mature_hash,
        'barcode_resolution_policy',
          'prefer_manufacturer_current_due_reused_gtin'
      ),
      jsonb_build_object(
        'target_tcin', '80778985',
        'target_upc', '840243140534',
        'front_image_url', v_mature_image,
        'ingredients_verbatim_from_exact_pdp', true,
        'reused_gtin_version_conflict', true
      )
    )
  ON CONFLICT (
    run_id, source_slug, source_external_id, content_hash
  ) DO UPDATE
  SET
    formula_id = excluded.formula_id,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance =
      excluded.formula_version_provenance,
    raw_payload = excluded.raw_payload,
    observed_at = excluded.observed_at;

  -- Repair all census copies of the exact Target pages. They must never remain
  -- attached to the different current-manufacturer ingredient statements.
  UPDATE public.catalog_observations
  SET
    formula_id = v_adult_formula_id,
    gtin = '840243140510',
    manufacturer = 'blue buffalo',
    brand = 'blue buffalo',
    product_name =
      'Blue Buffalo Tastefuls Adult Chicken Entrée Paté Wet Cat Food',
    product_line = 'BLUE Tastefuls Adult Wet',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'wet',
    flavor = 'chicken',
    diet_condition = '',
    package_size = '3 oz',
    ingredient_text = v_adult_ingredients,
    front_image_url = v_adult_image,
    is_complete_food = true,
    observed_at = v_observed_at,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance = jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'package_gtin', '840243140510',
      'product_code', 'TCIN 80778999',
      'captured_at', v_observed_at,
      'ingredient_text_hash', v_adult_hash
    ),
    raw_payload = COALESCE(raw_payload, '{}'::JSONB) ||
      jsonb_build_object(
        'target_tcin', '80778999',
        'target_upc', '840243140510',
        'ingredients_verbatim_from_exact_pdp', true
      )
  WHERE source_url = v_adult_url;

  UPDATE public.catalog_observations
  SET
    formula_id = v_turkey_formula_id,
    gtin = '840243140558',
    manufacturer = 'blue buffalo',
    brand = 'blue buffalo',
    product_name =
      'Blue Buffalo Tastefuls Adult Turkey & Chicken Entrée Paté Wet Cat Food',
    product_line = 'BLUE Tastefuls Adult Wet',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'wet',
    flavor = 'turkey and chicken',
    diet_condition = '',
    package_size = '3 oz',
    ingredient_text = v_turkey_ingredients,
    front_image_url = v_turkey_image,
    is_complete_food = true,
    observed_at = v_observed_at,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance = jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'package_gtin', '840243140558',
      'product_code', 'TCIN 80778976',
      'captured_at', v_observed_at,
      'ingredient_text_hash', v_turkey_hash
    ),
    raw_payload = COALESCE(raw_payload, '{}'::JSONB) ||
      jsonb_build_object(
        'target_tcin', '80778976',
        'target_upc', '840243140558',
        'ingredients_verbatim_from_exact_pdp', true
      )
  WHERE source_url = v_turkey_url;

  UPDATE public.catalog_observations
  SET
    formula_id = v_mature_target_formula_id,
    gtin = '840243140534',
    manufacturer = 'blue buffalo',
    brand = 'blue buffalo',
    product_name =
      'Blue Buffalo Tastefuls Mature Chicken Entrée Paté Wet Cat Food',
    product_line = 'BLUE Tastefuls Mature Wet',
    pet_type = 'cat',
    life_stage = 'senior',
    food_form = 'wet',
    flavor = 'chicken',
    diet_condition = '',
    package_size = '3 oz',
    ingredient_text = v_mature_ingredients,
    front_image_url = v_mature_image,
    is_complete_food = true,
    observed_at = v_observed_at,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance = jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'package_gtin', '840243140534',
      'product_code', 'TCIN 80778985',
      'captured_at', v_observed_at,
      'ingredient_text_hash', v_mature_hash,
      'barcode_resolution_policy',
        'prefer_manufacturer_current_due_reused_gtin'
    ),
    raw_payload = COALESCE(raw_payload, '{}'::JSONB) ||
      jsonb_build_object(
        'target_tcin', '80778985',
        'target_upc', '840243140534',
        'ingredients_verbatim_from_exact_pdp', true,
        'reused_gtin_version_conflict', true
      )
  WHERE source_url = v_mature_url;

  -- Generic names prefer current manufacturer. Source-specific TCIN aliases
  -- expose each exact retailer version without making it look current.
  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key, alias_text, normalized_alias, source_url, source_authority,
    evidence_observed_at, provenance, active, created_at, updated_at
  ) VALUES
    (
      v_adult_current_cache,
      'Blue Buffalo Tastefuls Adult Cat Chicken Entree Pate Wet Cat Food 3oz',
      public.normalize_verified_product_search_query(
        'Blue Buffalo Tastefuls Adult Cat Chicken Entree Pate Wet Cat Food 3oz'
      ),
      'https://www.bluebuffalo.com/wet-cat-food/tastefuls/chicken-pate/',
      'manufacturer',
      v_observed_at,
      jsonb_build_object(
        'formula_evidence_tier', 'manufacturer_current_exact',
        'generic_name_prefers_manufacturer_current', true
      ),
      true, now(), now()
    ),
    (
      v_turkey_current_cache,
      'Blue Buffalo Tastefuls Adult Cat Turkey and Chicken Entree Pate Wet Cat Food 3oz',
      public.normalize_verified_product_search_query(
        'Blue Buffalo Tastefuls Adult Cat Turkey and Chicken Entree Pate Wet Cat Food 3oz'
      ),
      'https://www.bluebuffalo.com/wet-cat-food/tastefuls/turkey-chicken-pate/',
      'manufacturer',
      v_observed_at,
      jsonb_build_object(
        'formula_evidence_tier', 'manufacturer_current_exact',
        'generic_name_prefers_manufacturer_current', true
      ),
      true, now(), now()
    ),
    (
      v_mature_current_cache,
      'Blue Buffalo Tastefuls Mature Cat Chicken Entree Pate Senior Wet Cat Food 3oz',
      public.normalize_verified_product_search_query(
        'Blue Buffalo Tastefuls Mature Cat Chicken Entree Pate Senior Wet Cat Food 3oz'
      ),
      'https://www.bluebuffalo.com/wet-cat-food/tastefuls/mature-chicken-pate/',
      'manufacturer',
      v_observed_at,
      jsonb_build_object(
        'formula_evidence_tier', 'manufacturer_current_exact',
        'generic_name_prefers_manufacturer_current', true,
        'reused_gtin_version_conflict', true
      ),
      true, now(), now()
    ),
    (
      v_adult_cache,
      'Target TCIN 80778999 Blue Buffalo Tastefuls Adult Chicken Pate 3 oz',
      public.normalize_verified_product_search_query(
        'Target TCIN 80778999 Blue Buffalo Tastefuls Adult Chicken Pate 3 oz'
      ),
      v_adult_url,
      'retailer_verified',
      v_observed_at,
      jsonb_build_object(
        'formula_evidence_tier', 'retailer_web_version',
        'package_gtin', '840243140510',
        'product_code', 'TCIN 80778999',
        'manufacturer_current_equivalence', false
      ),
      true, now(), now()
    ),
    (
      v_turkey_cache,
      'Target TCIN 80778976 Blue Buffalo Tastefuls Turkey Chicken Pate 3 oz',
      public.normalize_verified_product_search_query(
        'Target TCIN 80778976 Blue Buffalo Tastefuls Turkey Chicken Pate 3 oz'
      ),
      v_turkey_url,
      'retailer_verified',
      v_observed_at,
      jsonb_build_object(
        'formula_evidence_tier', 'retailer_web_version',
        'package_gtin', '840243140558',
        'product_code', 'TCIN 80778976',
        'manufacturer_current_equivalence', false
      ),
      true, now(), now()
    ),
    (
      v_mature_target_cache,
      'Target TCIN 80778985 Blue Buffalo Tastefuls Mature Chicken Pate 3 oz',
      public.normalize_verified_product_search_query(
        'Target TCIN 80778985 Blue Buffalo Tastefuls Mature Chicken Pate 3 oz'
      ),
      v_mature_url,
      'retailer_verified',
      v_observed_at,
      jsonb_build_object(
        'formula_evidence_tier', 'retailer_web_version',
        'package_gtin', '840243140534',
        'product_code', 'TCIN 80778985',
        'manufacturer_current_equivalence', false,
        'barcode_resolution_policy',
          'prefer_manufacturer_current_due_reused_gtin'
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
      v_adult_cache, '840243140510',
      'Blue Buffalo Tastefuls Adult Chicken Entrée Paté Wet Cat Food',
      'Blue Buffalo', 'cat', 'target-retail-label-manual',
      'retailer_verified', v_adult_url, v_adult_url, v_adult_image,
      'retailer_verified', 'retailer_verified',
      encode(digest(v_adult_url || '|' || v_adult_image, 'sha256'), 'hex'),
      encode(digest(v_adult_ingredients || '|' || v_adult_image, 'sha256'), 'hex'),
      '2026-07-26-source-versioned-web-label-v1', 'promoted', NULL,
      jsonb_build_object(
        'formula_evidence_tier', 'retailer_web_version',
        'target_tcin', '80778999',
        'package_gtin', '840243140510',
        'manufacturer_current_equivalence', false,
        'captured_at', v_observed_at
      ),
      now()
    ),
    (
      v_turkey_cache, '840243140558',
      'Blue Buffalo Tastefuls Adult Turkey & Chicken Entrée Paté Wet Cat Food',
      'Blue Buffalo', 'cat', 'target-retail-label-manual',
      'retailer_verified', v_turkey_url, v_turkey_url, v_turkey_image,
      'retailer_verified', 'retailer_verified',
      encode(digest(v_turkey_url || '|' || v_turkey_image, 'sha256'), 'hex'),
      encode(digest(v_turkey_ingredients || '|' || v_turkey_image, 'sha256'), 'hex'),
      '2026-07-26-source-versioned-web-label-v1', 'promoted', NULL,
      jsonb_build_object(
        'formula_evidence_tier', 'retailer_web_version',
        'target_tcin', '80778976',
        'package_gtin', '840243140558',
        'manufacturer_current_equivalence', false,
        'captured_at', v_observed_at
      ),
      now()
    ),
    (
      v_mature_target_cache, '840243140534',
      'Blue Buffalo Tastefuls Mature Chicken Entrée Paté Wet Cat Food',
      'Blue Buffalo', 'cat', 'target-retail-label-manual',
      'retailer_verified', v_mature_url, v_mature_url, v_mature_image,
      'retailer_verified', 'retailer_verified',
      encode(digest(v_mature_url || '|' || v_mature_image, 'sha256'), 'hex'),
      encode(digest(v_mature_ingredients || '|' || v_mature_image, 'sha256'), 'hex'),
      '2026-07-26-source-versioned-web-label-v1', 'promoted', NULL,
      jsonb_build_object(
        'formula_evidence_tier', 'retailer_web_version',
        'target_tcin', '80778985',
        'package_gtin', '840243140534',
        'manufacturer_current_equivalence', false,
        'reused_gtin_version_conflict', true,
        'barcode_resolution_policy',
          'prefer_manufacturer_current_due_reused_gtin',
        'captured_at', v_observed_at
      ),
      now()
    )
  ON CONFLICT DO NOTHING;

  IF (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('840243140510', 8)
    WHERE cache_key = v_adult_cache
  ) <> 1 THEN
    RAISE EXCEPTION
      'Target Tastefuls Adult Chicken exact barcode did not resolve';
  END IF;

  IF (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('840243140558', 8)
    WHERE cache_key = v_turkey_cache
  ) <> 1 THEN
    RAISE EXCEPTION
      'Target Tastefuls Turkey & Chicken exact barcode did not resolve';
  END IF;

  IF (
    SELECT cache_key
    FROM public.resolve_verified_product_by_gtin('840243140534', 8)
    LIMIT 1
  ) IS DISTINCT FROM v_mature_current_cache
     OR EXISTS (
       SELECT 1
       FROM public.resolve_verified_product_by_gtin('840243140534', 8)
       WHERE cache_key = v_mature_target_cache
     )
  THEN
    RAISE EXCEPTION
      'Reused mature Tastefuls UPC did not prefer manufacturer current';
  END IF;

  IF (
    SELECT cache_key
    FROM public.search_verified_products(
      'Blue Buffalo Tastefuls Adult Cat Chicken Entree Pate Wet Cat Food 3oz',
      1
    )
    LIMIT 1
  ) IS DISTINCT FROM v_adult_current_cache
     OR (
       SELECT cache_key
       FROM public.search_verified_products(
         'Blue Buffalo Tastefuls Adult Cat Turkey and Chicken Entree Pate Wet Cat Food 3oz',
         1
       )
       LIMIT 1
     ) IS DISTINCT FROM v_turkey_current_cache
     OR (
       SELECT cache_key
       FROM public.search_verified_products(
         'Blue Buffalo Tastefuls Mature Cat Chicken Entree Pate Senior Wet Cat Food 3oz',
         1
       )
       LIMIT 1
     ) IS DISTINCT FROM v_mature_current_cache
  THEN
    RAISE EXCEPTION
      'Generic Tastefuls search did not prefer manufacturer current';
  END IF;

  IF (
    SELECT cache_key
    FROM public.search_verified_products(
      'Target TCIN 80778985 Blue Buffalo Tastefuls Mature Chicken Pate 3 oz',
      1
    )
    LIMIT 1
  ) IS DISTINCT FROM v_mature_target_cache THEN
    RAISE EXCEPTION
      'Source-specific mature Tastefuls search did not resolve Target version';
  END IF;
END;
$$;
