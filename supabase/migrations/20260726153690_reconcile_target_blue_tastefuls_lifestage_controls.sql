-- Reconcile four exact Target BLUE Tastefuls dry-cat-food packages:
--
--   * Weight Control 5 lb and Kitten 5 lb match manufacturer current.
--   * Hairball Control 7 lb matches an existing PetSmart retailer version,
--     not manufacturer current.
--   * Adult 7+ 3 lb is a separate retailer web version.
--
-- This also repairs Target Kitten and Adult 7+ observations that had been
-- incorrectly attached to an adult wet Chicken Pate formula.

DO $$
DECLARE
  v_weight_current_id BIGINT;
  v_weight_gap_id BIGINT;
  v_hairball_current_id BIGINT;
  v_hairball_retailer_id BIGINT;
  v_hairball_gap_id BIGINT;
  v_kitten_current_id BIGINT;
  v_kitten_gap_id BIGINT;
  v_adult7_current_id BIGINT;
  v_adult7_retailer_id BIGINT;
  v_run_id BIGINT;

  v_weight_current_cache TEXT :=
    'blue-buffalo-general-mills:blue buffalo blue tastefuls adult cat weight control chicken brown rice recipe blue tastefuls-weight-control-chicken-brown-rice';
  v_hairball_current_cache TEXT :=
    'blue-buffalo-general-mills:blue buffalo blue tastefuls adult dry cat food - chicken rice hairball control blue tastefuls-indoor-hairball-control-chicken-brown-rice';
  v_hairball_retailer_cache TEXT := 'petsmart-retail-catalog:840243101580';
  v_kitten_current_cache TEXT :=
    'blue-buffalo-general-mills:blue buffalo blue tastefuls kitten chicken brown rice recipe blue tastefuls-kitten-chicken-brown-rice';
  v_adult7_current_cache TEXT :=
    'blue-buffalo-general-mills:blue buffalo blue tastefuls adult 7 dry cat food - chicken brown rice hairball control blue tastefuls-mature-indoor-hairball-chicken';
  v_adult7_retailer_cache TEXT := 'target-retail-catalog:859610000784';

  v_weight_gap_key TEXT :=
    'blue buffalo|blue buffalo|blue buffalo tastefuls with chicken weight control natural adult dry cat food|cat|adult|dry||';
  v_hairball_gap_key TEXT :=
    'blue buffalo|blue buffalo|blue buffalo tastefuls hairball control natural adult dry cat food with chicken|cat|adult|dry||';
  v_kitten_gap_key TEXT :=
    'blue buffalo|blue buffalo|blue buffalo tastefuls with chicken natural kitten dry cat food|cat|kitten|dry||';
  v_adult7_gap_key TEXT :=
    'blue buffalo|blue buffalo|blue buffalo tastefuls with chicken adult 7 natural dry cat food|cat|adult|dry||';

  v_weight_url TEXT :=
    'https://www.target.com/p/blue-buffalo-tastefuls-with-chicken-weight-control-natural-adult-dry-cat-food/-/A-80254984';
  v_hairball_url TEXT :=
    'https://www.target.com/p/blue-buffalo-tastefuls-hairball-control-natural-adult-dry-cat-food-with-chicken/-/A-76581489';
  v_kitten_url TEXT :=
    'https://www.target.com/p/blue-buffalo-tastefuls-with-chicken-natural-kitten-dry-cat-food/-/A-52769443';
  v_adult7_url TEXT :=
    'https://www.target.com/p/blue-buffalo-tastefuls-with-chicken-adult-7-natural-dry-cat-food/-/A-76581505';

  v_weight_image TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_7651a63c-2f16-4171-9d96-75a5f671bf9e';
  v_hairball_image TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_e6e61326-96f7-423c-b142-2e26141835b4';
  v_kitten_image TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_1247a972-2179-4280-8f29-6640362ac51c';
  v_adult7_image TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_d6ce0fac-40fd-44d8-ba34-075931d836d1';

  v_weight_ingredients TEXT :=
    'deboned chicken, chicken meal, brown rice, barley, oatmeal, pea protein, pea starch, powdered cellulose, fish meal (source of omega 3 fatty acids), peas, chicken fat (preserved with mixed tocopherols), pea fiber, natural flavor, flaxseed (source of omega 6 fatty acids), calcium sulfate, dl-methionine, potassium chloride, choline chloride, potatoes, calcium chloride, dried chicory root, taurine, direct dehydrated alfalfa pellets, alfalfa nutrient concentrate, calcium carbonate, salt, cranberries, sweet potatoes, carrots, preserved with mixed tocopherols, l-carnitine, vegetable juice for color, ferrous sulfate, niacin (vitamin b3), iron amino acid chelate, zinc amino acid chelate, zinc sulfate, vitamin e supplement, blueberries, barley grass, parsley, turmeric, dried kelp, yucca schidigera extract, copper sulfate, thiamine mononitrate (vitamin b1), copper amino acid chelate, l-ascorbyl-2-polyphosphate (source of vitamin c), l-lysine, biotin (vitamin b7), vitamin a supplement, manganese sulfate, manganese amino acid chelate, pyridoxine hydrochloride (vitamin b6), calcium pantothenate (vitamin b5), riboflavin (vitamin b2), vitamin d3 supplement, vitamin b12 supplement, folic acid (vitamin b9), dried yeast, dried enterococcus faecium fermentation product, dried lactobacillus acidophilus fermentation product, dried aspergillus niger fermentation extract, dried trichoderma longibrachiatum fermentation extract, dried bacillus subtilis fermentation extract, calcium iodate, sodium selenite, oil of rosemary';
  v_hairball_ingredients TEXT :=
    'deboned chicken, chicken meal, brown rice, barley, pea protein, chicken fat (preserved with mixed tocopherols), fish meal (source of omega 3 fatty acids), powdered cellulose, peas, flaxseed (source of omega 6 fatty acids), oatmeal, natural flavor, calcium sulfate, potassium chloride, dl-methionine, choline chloride, psyllium seed husks, calcium chloride, potatoes, dried chicory root, pea fiber, alfalfa nutrient concentrate, taurine, calcium carbonate, salt, cranberries, preserved with mixed tocopherols, sweet potatoes, carrots, vegetable juice for color, ferrous sulfate, niacin (vitamin b3), iron amino acid chelate, zinc amino acid chelate, zinc sulfate, vitamin e supplement, blueberries, barley grass, parsley, turmeric, dried kelp, yucca schidigera extract, copper sulfate, thiamine mononitrate (vitamin b1), copper amino acid chelate, l-ascorbyl-2-polyphosphate (vitamin c), l-lysine, l-carnitine, biotin (vitamin b7), vitamin a supplement, manganese sulfate, manganese amino acid chelate, pyridoxine hydrochloride (vitamin b6), calcium pantothenate (vitamin b5), riboflavin (vitamin b2), vitamin d3 supplement, vitamin b12 supplement, folic acid (vitamin b9), dried yeast, dried enterococcus faecium fermentation product, dried lactobacillus acidophilus fermentation product, dried aspergillus niger fermentation extract, dried trichoderma longibrachiatum fermentation extract, dried bacillus subtilis fermentation extract, calcium iodate, sodium selenite, oil of rosemary';
  v_kitten_ingredients TEXT :=
    'deboned chicken, chicken meal, fish meal (source of omega 3 fatty acids), brown rice, barley, oatmeal, chicken fat (preserved with mixed tocopherols), pea protein, peas, dried egg product, natural flavor, fish oil (source of ara-arachidonic acid and dha-docosahexaenoic acid), powdered cellulose, flaxseed (source of omega 6 fatty acids), dl-methionine, calcium chloride, choline chloride, calcium sulfate, potatoes, dried chicory root, direct dehydrated alfalfa pellets, taurine, potassium chloride, salt, pea fiber, alfalfa nutrient concentrate, calcium carbonate, vitamin e supplement, sweet potatoes, carrots, preserved with mixed tocopherols, vegetable juice for color, ferrous sulfate, niacin (vitamin b3), iron amino acid chelate, zinc amino acid chelate, zinc sulfate, blueberries, cranberries, barley grass, parsley, turmeric, dried kelp, yucca schidigera extract, copper sulfate, thiamine mononitrate (vitamin b1), copper amino acid chelate, l-ascorbyl-2-polyphosphate (source of vitamin c), l-lysine, biotin (vitamin b7), vitamin a supplement, manganese sulfate, manganese amino acid chelate, pyridoxine hydrochloride (vitamin b6), calcium pantothenate (vitamin b5), riboflavin (vitamin b2), vitamin d3 supplement, vitamin b12 supplement, folic acid (vitamin b9), dried yeast, dried enterococcus faecium fermentation product, dried lactobacillus acidophilus fermentation product, dried aspergillus niger fermentation extract, dried trichoderma longibrachiatum fermentation extract, dried bacillus subtilis fermentation extract, calcium iodate, sodium selenite, oil of rosemary';
  v_adult7_ingredients TEXT :=
    'deboned chicken, chicken meal, brown rice, oatmeal, barley, pea protein, peas, chicken fat (preserved with mixed tocopherols), fish meal (source of omega 3 fatty acids), fish oil (source of dha-docosahexaenoic acid), natural flavor, powdered cellulose, flaxseed (source of omega 6 fatty acids), potassium chloride, pea fiber, dl-methionine, choline chloride, potatoes, direct dehydrated alfalfa pellets, dried chicory root, taurine, alfalfa nutrient concentrate, calcium carbonate, salt, calcium sulfate, vitamin e supplement, cranberries, preserved with mixed tocopherols, sweet potatoes, carrots, l-ascorbyl-2-polyphosphate (source of vitamin c), l-carnitine, vegetable juice for color, ferrous sulfate, niacin (vitamin b3), iron amino acid chelate, zinc amino acid chelate, zinc sulfate, blueberries, barley grass, parsley, turmeric, dried kelp, yucca schidigera extract, copper sulfate, thiamine mononitrate (vitamin b1), copper amino acid chelate, l-lysine, biotin (vitamin b7), vitamin a supplement, manganese sulfate, manganese amino acid chelate, pyridoxine hydrochloride (vitamin b6), calcium pantothenate (vitamin b5), riboflavin (vitamin b2), vitamin d3 supplement, vitamin b12 supplement, folic acid (vitamin b9), dried yeast, dried enterococcus faecium fermentation product, dried lactobacillus acidophilus fermentation product, dried aspergillus niger fermentation extract, dried trichoderma longibrachiatum fermentation extract, dried bacillus subtilis fermentation extract, calcium iodate, sodium selenite, oil of rosemary';

  v_weight_hash TEXT;
  v_hairball_hash TEXT;
  v_kitten_hash TEXT;
  v_adult7_hash TEXT;
  v_weight_current_hash TEXT;
  v_hairball_current_hash TEXT;
  v_kitten_current_hash TEXT;
  v_adult7_current_hash TEXT;
  v_observed_at TIMESTAMPTZ := '2026-07-27T02:20:00Z';
BEGIN
  v_weight_hash := encode(digest(
    public.catalog_normalize_ingredient_evidence(v_weight_ingredients),
    'sha256'
  ), 'hex');
  v_hairball_hash := encode(digest(
    public.catalog_normalize_ingredient_evidence(v_hairball_ingredients),
    'sha256'
  ), 'hex');
  v_kitten_hash := encode(digest(
    public.catalog_normalize_ingredient_evidence(v_kitten_ingredients),
    'sha256'
  ), 'hex');
  v_adult7_hash := encode(digest(
    public.catalog_normalize_ingredient_evidence(v_adult7_ingredients),
    'sha256'
  ), 'hex');

  IF v_weight_hash <>
      '41cb9bfb1eb679a6b4bdefe536ecf11cbe4f67628f34f8061051ac49e173008a'
     OR v_hairball_hash <>
      'cc2960ce623467ab63ca43a7676dacb23409cdba077b4a20758d23f0151a2682'
     OR v_kitten_hash <>
      '622930d3bd211419d746f657ba1e69c3228f19739281b2680f2c11d0b559db67'
     OR v_adult7_hash <>
      'aa45ad1f257b59e7a9c69cc7616c8f31edc47888a0ff37527b384a11ce966654'
  THEN
    RAISE EXCEPTION 'Target Tastefuls control/life-stage transcription changed';
  END IF;

  SELECT id, encode(digest(
    public.catalog_normalize_ingredient_evidence(COALESCE(ingredient_text,'')),
    'sha256'
  ), 'hex')
  INTO STRICT v_weight_current_id, v_weight_current_hash
  FROM public.catalog_formulas
  WHERE promoted_cache_key = v_weight_current_cache
    AND verification_status = 'verified' AND active;

  SELECT id INTO STRICT v_weight_gap_id
  FROM public.catalog_formulas WHERE formula_key = v_weight_gap_key;

  SELECT id, encode(digest(
    public.catalog_normalize_ingredient_evidence(COALESCE(ingredient_text,'')),
    'sha256'
  ), 'hex')
  INTO STRICT v_hairball_current_id, v_hairball_current_hash
  FROM public.catalog_formulas
  WHERE promoted_cache_key = v_hairball_current_cache
    AND verification_status = 'verified' AND active;

  SELECT id INTO STRICT v_hairball_retailer_id
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue buffalo tastefuls adult cat hairball control dry food natural chicken and brown rice|cat|adult|dry|chicken and brown rice|'
    AND verification_status = 'verified' AND active
    AND formula_evidence_tier = 'retailer_web_version'
    AND encode(digest(
      public.catalog_normalize_ingredient_evidence(COALESCE(ingredient_text,'')),
      'sha256'
    ), 'hex') = v_hairball_hash;

  SELECT id INTO STRICT v_hairball_gap_id
  FROM public.catalog_formulas WHERE formula_key = v_hairball_gap_key;

  SELECT id, encode(digest(
    public.catalog_normalize_ingredient_evidence(COALESCE(ingredient_text,'')),
    'sha256'
  ), 'hex')
  INTO STRICT v_kitten_current_id, v_kitten_current_hash
  FROM public.catalog_formulas
  WHERE promoted_cache_key = v_kitten_current_cache
    AND verification_status = 'verified' AND active;

  SELECT id INTO STRICT v_kitten_gap_id
  FROM public.catalog_formulas WHERE formula_key = v_kitten_gap_key;

  SELECT id, encode(digest(
    public.catalog_normalize_ingredient_evidence(COALESCE(ingredient_text,'')),
    'sha256'
  ), 'hex')
  INTO STRICT v_adult7_current_id, v_adult7_current_hash
  FROM public.catalog_formulas
  WHERE promoted_cache_key = v_adult7_current_cache
    AND verification_status = 'verified' AND active;

  SELECT id INTO STRICT v_adult7_retailer_id
  FROM public.catalog_formulas WHERE formula_key = v_adult7_gap_key;

  IF v_weight_current_hash <> v_weight_hash
     OR v_kitten_current_hash <> v_kitten_hash
     OR v_hairball_current_hash = v_hairball_hash
     OR v_adult7_current_hash = v_adult7_hash
  THEN
    RAISE EXCEPTION 'Tastefuls control/life-stage version boundary changed';
  END IF;

  -- Normalize and expose the ingredient-identical Hairball retailer version.
  UPDATE public.product_data
  SET
    ingredient_text = v_hairball_ingredients,
    ingredients = public.catalog_split_ingredient_statement(v_hairball_ingredients),
    ingredient_count = cardinality(
      public.catalog_split_ingredient_statement(v_hairball_ingredients)
    ),
    product_line = 'BLUE Tastefuls Adult Hairball Control',
    flavor = 'Chicken & Brown Rice',
    life_stage = 'adult',
    food_form = 'dry',
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'equivalent_exact_source_urls', jsonb_build_array(
          source_url, v_hairball_url
        ),
        'package_gtins',
          jsonb_build_array('840243101573', '840243101580'),
        'target_product_code', 'TCIN 76366271',
        'target_captured_at', v_observed_at,
        'ingredient_text_hash', v_hairball_hash,
        'different_from_manufacturer_current_hash', v_hairball_current_hash,
        'transcription_normalized', true
      ),
    updated_at = now()
  WHERE cache_key = v_hairball_retailer_cache;

  UPDATE public.catalog_formulas
  SET
    product_name =
      'Blue Buffalo Tastefuls Adult Hairball Control Chicken & Brown Rice Dry Cat Food',
    product_line = 'BLUE Tastefuls Adult Hairball Control',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'chicken and brown rice',
    diet_condition = 'hairball control',
    is_complete_food = true,
    complete_food_evidence =
      'Exact Target and PetSmart adult dry cat-food packages publish the same complete ingredient statement.',
    ingredient_text = v_hairball_ingredients,
    ingredients = public.catalog_split_ingredient_statement(v_hairball_ingredients),
    protected_terms = ARRAY[
      'blue buffalo','tastefuls','adult','cat','dry','hairball control',
      'chicken','brown rice'
    ]::TEXT[],
    promoted_cache_key = v_hairball_retailer_cache,
    promoted_at = now(),
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'equivalent_exact_source_urls',
          jsonb_build_array(source_url, v_hairball_url),
        'package_gtins',
          jsonb_build_array('840243101573', '840243101580'),
        'target_product_code', 'TCIN 76366271',
        'target_captured_at', v_observed_at,
        'ingredient_text_hash', v_hairball_hash,
        'different_from_manufacturer_current_hash', v_hairball_current_hash
      ),
    last_observed_at = v_observed_at,
    updated_at = now()
  WHERE id = v_hairball_retailer_id;

  -- Promote Target Adult 7+ as its own source-versioned formula.
  INSERT INTO public.product_data (
    cache_key, product_name, brand, ingredients, ingredient_text,
    ingredient_count, source, source_url, scraped_at, expires_at, image_url,
    nutrient_panel, nutritional_info, has_published_nutrients,
    is_complete_food, catalog_exclusion_reason, pet_type, source_quality,
    ingredient_verification_status, image_verification_status, verified_at,
    gtin, product_line, flavor, life_stage, food_form, package_size,
    formula_evidence_tier, formula_version_provenance, updated_at
  ) VALUES (
    v_adult7_retailer_cache,
    'Blue Buffalo Tastefuls Adult 7+ Chicken & Brown Rice Dry Cat Food',
    'Blue Buffalo',
    public.catalog_split_ingredient_statement(v_adult7_ingredients),
    v_adult7_ingredients,
    cardinality(public.catalog_split_ingredient_statement(v_adult7_ingredients)),
    'target-retail-label-manual', v_adult7_url, v_observed_at,
    now() + INTERVAL '180 days', v_adult7_image, '{}'::JSONB,
    jsonb_build_object('formula_evidence_tier','retailer_web_version'),
    false, true, NULL, 'cat', 'retailer_verified', 'retailer_verified',
    'retailer_verified', v_observed_at, '859610000784',
    'BLUE Tastefuls Adult 7+ Healthy Aging', 'Chicken & Brown Rice',
    'senior', 'dry', '3 lb', 'retailer_web_version',
    jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'source', 'target-retail-label-manual',
      'source_url', v_adult7_url,
      'captured_at', v_observed_at,
      'package_gtin', '859610000784',
      'product_code', 'TCIN 76366297',
      'package_size', '3 lb',
      'front_image_url', v_adult7_image,
      'ingredient_text_hash', v_adult7_hash,
      'different_from_manufacturer_current_hash', v_adult7_current_hash
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
    ingredient_verification_status = excluded.ingredient_verification_status,
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
      'Blue Buffalo Tastefuls Adult 7+ Chicken & Brown Rice Dry Cat Food',
    product_line = 'BLUE Tastefuls Adult 7+ Healthy Aging',
    pet_type = 'cat',
    life_stage = 'senior',
    food_form = 'dry',
    flavor = 'chicken and brown rice',
    diet_condition = '',
    is_complete_food = true,
    complete_food_evidence =
      'Exact Target TCIN 76366297 identifies a senior dry cat-food package and publishes its complete ingredient statement.',
    ingredient_text = v_adult7_ingredients,
    ingredients = public.catalog_split_ingredient_statement(v_adult7_ingredients),
    front_image_url = v_adult7_image,
    source_url = v_adult7_url,
    source_authority = 'retailer_verified',
    ingredient_verification_status = 'retailer_verified',
    image_verification_status = 'retailer_verified',
    protected_terms = ARRAY[
      'blue buffalo','tastefuls','adult 7','senior','cat','dry',
      'chicken','brown rice','tcin 76366297'
    ]::TEXT[],
    verification_status = 'verified',
    active = true,
    absent_since = NULL,
    promoted_cache_key = v_adult7_retailer_cache,
    promoted_at = now(),
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance = jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'source', 'target-retail-label-manual',
      'source_url', v_adult7_url,
      'captured_at', v_observed_at,
      'package_gtin', '859610000784',
      'product_code', 'TCIN 76366297',
      'package_size', '3 lb',
      'ingredient_text_hash', v_adult7_hash,
      'different_from_manufacturer_current_hash', v_adult7_current_hash
    ),
    last_observed_at = v_observed_at,
    updated_at = now()
  WHERE id = v_adult7_retailer_id;

  -- Exact aliases close the manufacturer-equivalent and retailer-equivalent
  -- census nodes.
  INSERT INTO public.catalog_formula_aliases (
    alias_formula_key, formula_id, identity_hash, match_reason, source_url,
    metadata, updated_at
  ) VALUES
    (
      v_weight_gap_key, v_weight_current_id,
      encode(digest(v_weight_current_cache || '|target-weight','sha256'),'hex'),
      'manual_review',
      'https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-weight-control-chicken-brown-rice/',
      jsonb_build_object(
        'exact_formula_identity',true,'species_boundary','cat',
        'life_stage_boundary','adult','food_form_boundary','dry',
        'diet_boundary','weight control',
        'recipe_boundary','chicken and brown rice',
        'ingredient_hash_equality_verified',true,
        'target_tcin','52615631','target_upc','840243122523',
        'reviewed_at','2026-07-26'
      ),
      now()
    ),
    (
      v_hairball_gap_key, v_hairball_retailer_id,
      encode(digest(v_hairball_retailer_cache || '|target-hairball','sha256'),'hex'),
      'manual_review', v_hairball_url,
      jsonb_build_object(
        'exact_formula_identity',true,'species_boundary','cat',
        'life_stage_boundary','adult','food_form_boundary','dry',
        'diet_boundary','hairball control',
        'recipe_boundary','chicken and brown rice',
        'ingredient_hash_equality_verified',true,
        'formula_version_boundary',v_hairball_hash,
        'target_tcin','76366271','target_upc','840243101573',
        'reviewed_at','2026-07-26'
      ),
      now()
    ),
    (
      v_kitten_gap_key, v_kitten_current_id,
      encode(digest(v_kitten_current_cache || '|target-kitten','sha256'),'hex'),
      'manual_review',
      'https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-kitten-chicken-brown-rice/',
      jsonb_build_object(
        'exact_formula_identity',true,'species_boundary','cat',
        'life_stage_boundary','kitten','food_form_boundary','dry',
        'recipe_boundary','chicken and brown rice',
        'ingredient_hash_equality_verified',true,
        'target_tcin','52615638','target_upc','840243122547',
        'reviewed_at','2026-07-26'
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
  SET verification_status='quarantined', active=false,
      absent_since=COALESCE(absent_since,now()),
      promoted_cache_key=NULL, promoted_at=NULL,
      complete_food_evidence =
        'Exact Target package alias of the current manufacturer formula.',
      updated_at=now()
  WHERE id IN (v_weight_gap_id, v_kitten_gap_id);

  UPDATE public.catalog_formulas
  SET verification_status='quarantined', active=false,
      absent_since=COALESCE(absent_since,now()),
      promoted_cache_key=NULL, promoted_at=NULL,
      complete_food_evidence =
        'Exact Target package alias of the ingredient-identical retailer web version.',
      updated_at=now()
  WHERE id = v_hairball_gap_id;

  -- Reparent or create exact Target package SKUs.
  UPDATE public.catalog_skus
  SET formula_id=v_weight_current_id, gtin='840243122523',
      package_size='5 lb', package_count=1,
      source_slug='target-retail-label-manual',
      source_external_id='TCIN:52615631', source_url=v_weight_url,
      active=true, last_observed_at=v_observed_at, updated_at=now()
  WHERE source_url=v_weight_url;

  UPDATE public.catalog_skus
  SET formula_id=v_hairball_retailer_id, gtin='840243101573',
      package_size='7 lb', package_count=1,
      source_slug='target-retail-label-manual',
      source_external_id='TCIN:76366271', source_url=v_hairball_url,
      active=true, last_observed_at=v_observed_at, updated_at=now()
  WHERE source_url=v_hairball_url;

  INSERT INTO public.catalog_skus (
    formula_id,gtin,package_size,package_count,source_slug,
    source_external_id,source_url,active,first_observed_at,
    last_observed_at,updated_at
  ) VALUES
    (
      v_kitten_current_id,'840243122547','5 lb',1,
      'target-retail-label-manual','TCIN:52615638',v_kitten_url,true,
      v_observed_at,v_observed_at,now()
    ),
    (
      v_adult7_retailer_id,'859610000784','3 lb',1,
      'target-retail-label-manual','TCIN:76366297',v_adult7_url,true,
      v_observed_at,v_observed_at,now()
    )
  ON CONFLICT (source_slug,source_external_id,gtin,package_size)
  DO UPDATE SET formula_id=excluded.formula_id,source_url=excluded.source_url,
    active=true,last_observed_at=excluded.last_observed_at,updated_at=now();

  -- Record one bounded, auditable exact-evidence run.
  INSERT INTO public.catalog_source_runs (
    run_key,source_slug,source_type,coverage_role,status,started_at,
    finished_at,expected_count,observed_count,accepted_count,rejected_count,
    pagination_complete,source_content_hash,checkpoint,metadata,updated_at
  ) VALUES (
    'manual-exact-evidence:target:blue-tastefuls-controls:20260726',
    'target-retail-label-manual','retailer','verification','completed',
    v_observed_at,v_observed_at,4,4,4,0,true,
    encode(digest(
      v_weight_url||v_hairball_url||v_kitten_url||v_adult7_url||
      v_weight_hash||v_hairball_hash||v_kitten_hash||v_adult7_hash,
      'sha256'
    ),'hex'),
    '{}'::JSONB,
    jsonb_build_object(
      'manual_exact_evidence',true,'exact_package_count',4,
      'manufacturer_current_equivalent_count',2,
      'retailer_version_package_count',2,
      'cross_form_observation_repairs',true
    ),
    now()
  )
  ON CONFLICT (run_key) DO UPDATE
  SET status='completed',finished_at=excluded.finished_at,observed_count=4,
      accepted_count=4,rejected_count=0,pagination_complete=true,
      source_content_hash=excluded.source_content_hash,
      metadata=excluded.metadata,updated_at=now()
  RETURNING id INTO v_run_id;

  INSERT INTO public.catalog_observations (
    run_id,formula_id,source_slug,source_external_id,source_url,
    source_authority,gtin,manufacturer,brand,product_name,product_line,
    pet_type,life_stage,food_form,flavor,diet_condition,package_size,
    ingredient_text,front_image_url,is_complete_food,available_in_us,
    observed_at,content_hash,validation_status,validation_reasons,
    formula_evidence_tier,formula_version_provenance,raw_payload
  ) VALUES
    (
      v_run_id,v_weight_current_id,'target-retail-label-manual',
      'TCIN:52615631',v_weight_url,'retailer_verified','840243122523',
      'general mills','blue buffalo',
      'BLUE Tastefuls Adult Cat Weight Control Chicken & Brown Rice Recipe',
      'BLUE Tastefuls Adult Weight Control','cat','adult','dry',
      'chicken and brown rice','weight control','5 lb',
      v_weight_ingredients,v_weight_image,true,true,v_observed_at,
      encode(digest(v_weight_url||v_weight_ingredients||v_weight_image,'sha256'),'hex'),
      'accepted',ARRAY[]::TEXT[],'manufacturer_current_exact',
      jsonb_build_object(
        'version_status','manufacturer_current_equivalent_package',
        'manufacturer_current_equivalence',true,
        'package_gtin','840243122523','product_code','TCIN 52615631',
        'captured_at',v_observed_at,'ingredient_text_hash',v_weight_hash,
        'retailer_transcription_normalized',true
      ),
      jsonb_build_object(
        'target_tcin','52615631','target_upc','840243122523',
        'exact_official_ingredient_hash_match',true
      )
    ),
    (
      v_run_id,v_hairball_retailer_id,'target-retail-label-manual',
      'TCIN:76366271',v_hairball_url,'retailer_verified','840243101573',
      'blue buffalo','blue buffalo',
      'Blue Buffalo Tastefuls Adult Hairball Control Chicken & Brown Rice Dry Cat Food',
      'BLUE Tastefuls Adult Hairball Control','cat','adult','dry',
      'chicken and brown rice','hairball control','7 lb',
      v_hairball_ingredients,v_hairball_image,true,true,v_observed_at,
      encode(digest(v_hairball_url||v_hairball_ingredients||v_hairball_image,'sha256'),'hex'),
      'accepted',ARRAY[]::TEXT[],'retailer_web_version',
      jsonb_build_object(
        'version_status','source_versioned',
        'manufacturer_current_equivalence',false,
        'package_gtin','840243101573','product_code','TCIN 76366271',
        'captured_at',v_observed_at,'ingredient_text_hash',v_hairball_hash
      ),
      jsonb_build_object(
        'target_tcin','76366271','target_upc','840243101573',
        'ingredients_verbatim_from_exact_pdp',true
      )
    ),
    (
      v_run_id,v_kitten_current_id,'target-retail-label-manual',
      'TCIN:52615638',v_kitten_url,'retailer_verified','840243122547',
      'general mills','blue buffalo',
      'BLUE Tastefuls Kitten Chicken & Brown Rice Recipe',
      'BLUE Tastefuls Kitten','cat','kitten','dry',
      'chicken and brown rice','','5 lb',
      v_kitten_ingredients,v_kitten_image,true,true,v_observed_at,
      encode(digest(v_kitten_url||v_kitten_ingredients||v_kitten_image,'sha256'),'hex'),
      'accepted',ARRAY[]::TEXT[],'manufacturer_current_exact',
      jsonb_build_object(
        'version_status','manufacturer_current_equivalent_package',
        'manufacturer_current_equivalence',true,
        'package_gtin','840243122547','product_code','TCIN 52615638',
        'captured_at',v_observed_at,'ingredient_text_hash',v_kitten_hash,
        'retailer_transcription_normalized',true
      ),
      jsonb_build_object(
        'target_tcin','52615638','target_upc','840243122547',
        'exact_official_ingredient_hash_match',true
      )
    ),
    (
      v_run_id,v_adult7_retailer_id,'target-retail-label-manual',
      'TCIN:76366297',v_adult7_url,'retailer_verified','859610000784',
      'blue buffalo','blue buffalo',
      'Blue Buffalo Tastefuls Adult 7+ Chicken & Brown Rice Dry Cat Food',
      'BLUE Tastefuls Adult 7+ Healthy Aging','cat','senior','dry',
      'chicken and brown rice','','3 lb',
      v_adult7_ingredients,v_adult7_image,true,true,v_observed_at,
      encode(digest(v_adult7_url||v_adult7_ingredients||v_adult7_image,'sha256'),'hex'),
      'accepted',ARRAY[]::TEXT[],'retailer_web_version',
      jsonb_build_object(
        'version_status','source_versioned',
        'manufacturer_current_equivalence',false,
        'package_gtin','859610000784','product_code','TCIN 76366297',
        'captured_at',v_observed_at,'ingredient_text_hash',v_adult7_hash
      ),
      jsonb_build_object(
        'target_tcin','76366297','target_upc','859610000784',
        'ingredients_verbatim_except_obvious_label_transcription',true
      )
    )
  ON CONFLICT (run_id,source_slug,source_external_id,content_hash)
  DO UPDATE SET formula_id=excluded.formula_id,
    validation_status='accepted',validation_reasons=ARRAY[]::TEXT[],
    formula_evidence_tier=excluded.formula_evidence_tier,
    formula_version_provenance=excluded.formula_version_provenance,
    raw_payload=excluded.raw_payload,observed_at=excluded.observed_at;

  -- Repair every historical census copy, including the dry-to-wet mistakes.
  UPDATE public.catalog_observations
  SET formula_id=v_weight_current_id,gtin='840243122523',
      manufacturer='general mills',brand='blue buffalo',
      product_name='BLUE Tastefuls Adult Cat Weight Control Chicken & Brown Rice Recipe',
      product_line='BLUE Tastefuls Adult Weight Control',
      pet_type='cat',life_stage='adult',food_form='dry',
      flavor='chicken and brown rice',diet_condition='weight control',
      package_size='5 lb',ingredient_text=v_weight_ingredients,
      front_image_url=v_weight_image,is_complete_food=true,
      observed_at=v_observed_at,validation_status='accepted',
      validation_reasons=ARRAY[]::TEXT[],
      formula_evidence_tier='manufacturer_current_exact',
      formula_version_provenance=jsonb_build_object(
        'version_status','manufacturer_current_equivalent_package',
        'manufacturer_current_equivalence',true,
        'package_gtin','840243122523','product_code','TCIN 52615631',
        'captured_at',v_observed_at,'ingredient_text_hash',v_weight_hash
      ),
      raw_payload=COALESCE(raw_payload,'{}'::JSONB)||jsonb_build_object(
        'target_tcin','52615631','target_upc','840243122523',
        'exact_official_ingredient_hash_match',true
      )
  WHERE source_url=v_weight_url;

  UPDATE public.catalog_observations
  SET formula_id=v_hairball_retailer_id,gtin='840243101573',
      manufacturer='blue buffalo',brand='blue buffalo',
      product_name='Blue Buffalo Tastefuls Adult Hairball Control Chicken & Brown Rice Dry Cat Food',
      product_line='BLUE Tastefuls Adult Hairball Control',
      pet_type='cat',life_stage='adult',food_form='dry',
      flavor='chicken and brown rice',diet_condition='hairball control',
      package_size='7 lb',ingredient_text=v_hairball_ingredients,
      front_image_url=v_hairball_image,is_complete_food=true,
      observed_at=v_observed_at,validation_status='accepted',
      validation_reasons=ARRAY[]::TEXT[],
      formula_evidence_tier='retailer_web_version',
      formula_version_provenance=jsonb_build_object(
        'version_status','source_versioned',
        'manufacturer_current_equivalence',false,
        'package_gtin','840243101573','product_code','TCIN 76366271',
        'captured_at',v_observed_at,'ingredient_text_hash',v_hairball_hash
      ),
      raw_payload=COALESCE(raw_payload,'{}'::JSONB)||jsonb_build_object(
        'target_tcin','76366271','target_upc','840243101573',
        'ingredients_verbatim_from_exact_pdp',true
      )
  WHERE source_url=v_hairball_url;

  UPDATE public.catalog_observations
  SET formula_id=v_kitten_current_id,gtin='840243122547',
      manufacturer='general mills',brand='blue buffalo',
      product_name='BLUE Tastefuls Kitten Chicken & Brown Rice Recipe',
      product_line='BLUE Tastefuls Kitten',
      pet_type='cat',life_stage='kitten',food_form='dry',
      flavor='chicken and brown rice',diet_condition='',
      package_size='5 lb',ingredient_text=v_kitten_ingredients,
      front_image_url=v_kitten_image,is_complete_food=true,
      observed_at=v_observed_at,validation_status='accepted',
      validation_reasons=ARRAY[]::TEXT[],
      formula_evidence_tier='manufacturer_current_exact',
      formula_version_provenance=jsonb_build_object(
        'version_status','manufacturer_current_equivalent_package',
        'manufacturer_current_equivalence',true,
        'package_gtin','840243122547','product_code','TCIN 52615638',
        'captured_at',v_observed_at,'ingredient_text_hash',v_kitten_hash
      ),
      raw_payload=COALESCE(raw_payload,'{}'::JSONB)||jsonb_build_object(
        'target_tcin','52615638','target_upc','840243122547',
        'exact_official_ingredient_hash_match',true,
        'cross_form_attachment_repaired',true
      )
  WHERE source_url=v_kitten_url;

  UPDATE public.catalog_observations
  SET formula_id=v_adult7_retailer_id,gtin='859610000784',
      manufacturer='blue buffalo',brand='blue buffalo',
      product_name='Blue Buffalo Tastefuls Adult 7+ Chicken & Brown Rice Dry Cat Food',
      product_line='BLUE Tastefuls Adult 7+ Healthy Aging',
      pet_type='cat',life_stage='senior',food_form='dry',
      flavor='chicken and brown rice',diet_condition='',
      package_size='3 lb',ingredient_text=v_adult7_ingredients,
      front_image_url=v_adult7_image,is_complete_food=true,
      observed_at=v_observed_at,validation_status='accepted',
      validation_reasons=ARRAY[]::TEXT[],
      formula_evidence_tier='retailer_web_version',
      formula_version_provenance=jsonb_build_object(
        'version_status','source_versioned',
        'manufacturer_current_equivalence',false,
        'package_gtin','859610000784','product_code','TCIN 76366297',
        'captured_at',v_observed_at,'ingredient_text_hash',v_adult7_hash
      ),
      raw_payload=COALESCE(raw_payload,'{}'::JSONB)||jsonb_build_object(
        'target_tcin','76366297','target_upc','859610000784',
        'ingredients_verbatim_except_obvious_label_transcription',true,
        'cross_form_attachment_repaired',true
      )
  WHERE source_url=v_adult7_url;

  -- Generic search stays manufacturer-current-first; source-specific aliases
  -- and barcode identify the exact retailer package version.
  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key,alias_text,normalized_alias,source_url,source_authority,
    evidence_observed_at,provenance,active,created_at,updated_at
  ) VALUES
    (
      v_weight_current_cache,
      'Blue Buffalo Tastefuls with Chicken Weight Control Natural Adult Dry Cat Food',
      public.normalize_verified_product_search_query(
        'Blue Buffalo Tastefuls with Chicken Weight Control Natural Adult Dry Cat Food'
      ),
      'https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-weight-control-chicken-brown-rice/',
      'manufacturer',v_observed_at,
      jsonb_build_object('formula_evidence_tier','manufacturer_current_exact',
        'generic_name_prefers_manufacturer_current',true),
      true,now(),now()
    ),
    (
      v_hairball_current_cache,
      'Blue Buffalo Tastefuls Hairball Control Natural Adult Dry Cat Food with Chicken',
      public.normalize_verified_product_search_query(
        'Blue Buffalo Tastefuls Hairball Control Natural Adult Dry Cat Food with Chicken'
      ),
      'https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-indoor-hairball-control-chicken-brown-rice/',
      'manufacturer',v_observed_at,
      jsonb_build_object('formula_evidence_tier','manufacturer_current_exact',
        'generic_name_prefers_manufacturer_current',true),
      true,now(),now()
    ),
    (
      v_kitten_current_cache,
      'Blue Buffalo Tastefuls with Chicken Natural Kitten Dry Cat Food',
      public.normalize_verified_product_search_query(
        'Blue Buffalo Tastefuls with Chicken Natural Kitten Dry Cat Food'
      ),
      'https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-kitten-chicken-brown-rice/',
      'manufacturer',v_observed_at,
      jsonb_build_object('formula_evidence_tier','manufacturer_current_exact',
        'generic_name_prefers_manufacturer_current',true),
      true,now(),now()
    ),
    (
      v_adult7_current_cache,
      'Blue Buffalo Tastefuls with Chicken Adult 7 Natural Dry Cat Food',
      public.normalize_verified_product_search_query(
        'Blue Buffalo Tastefuls with Chicken Adult 7 Natural Dry Cat Food'
      ),
      'https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-mature-indoor-hairball-chicken/',
      'manufacturer',v_observed_at,
      jsonb_build_object('formula_evidence_tier','manufacturer_current_exact',
        'generic_name_prefers_manufacturer_current',true),
      true,now(),now()
    ),
    (
      v_hairball_retailer_cache,
      'Target TCIN 76366271 Blue Buffalo Tastefuls Hairball Chicken 7 lb',
      public.normalize_verified_product_search_query(
        'Target TCIN 76366271 Blue Buffalo Tastefuls Hairball Chicken 7 lb'
      ),
      v_hairball_url,'retailer_verified',v_observed_at,
      jsonb_build_object('formula_evidence_tier','retailer_web_version',
        'package_gtin','840243101573','product_code','TCIN 76366271',
        'manufacturer_current_equivalence',false),
      true,now(),now()
    ),
    (
      v_adult7_retailer_cache,
      'Target TCIN 76366297 Blue Buffalo Tastefuls Adult 7 Chicken 3 lb',
      public.normalize_verified_product_search_query(
        'Target TCIN 76366297 Blue Buffalo Tastefuls Adult 7 Chicken 3 lb'
      ),
      v_adult7_url,'retailer_verified',v_observed_at,
      jsonb_build_object('formula_evidence_tier','retailer_web_version',
        'package_gtin','859610000784','product_code','TCIN 76366297',
        'manufacturer_current_equivalence',false),
      true,now(),now()
    )
  ON CONFLICT (normalized_alias) WHERE active
  DO UPDATE SET cache_key=excluded.cache_key,alias_text=excluded.alias_text,
    source_url=excluded.source_url,source_authority=excluded.source_authority,
    evidence_observed_at=excluded.evidence_observed_at,
    provenance=excluded.provenance,active=true,updated_at=now();

  INSERT INTO public.catalog_product_evidence (
    cache_key,gtin,product_name,brand,pet_type,source,source_quality,
    source_url,ingredient_source_url,image_source_url,
    ingredient_verification_status,image_verification_status,
    raw_source_hash,content_hash,extractor_version,review_state,
    rejection_reason,evidence,updated_at
  ) VALUES
    (
      v_weight_current_cache,'840243122523',
      'BLUE Tastefuls Adult Cat Weight Control Chicken & Brown Rice Recipe',
      'Blue Buffalo','cat','target-retail-label-manual','retailer_verified',
      v_weight_url,v_weight_url,v_weight_image,'retailer_verified',
      'retailer_verified',
      encode(digest(v_weight_url||v_weight_image,'sha256'),'hex'),
      encode(digest(v_weight_ingredients||v_weight_image,'sha256'),'hex'),
      '2026-07-26-source-versioned-web-label-v1','promoted',NULL,
      jsonb_build_object('formula_evidence_tier','manufacturer_current_exact',
        'target_tcin','52615631','package_gtin','840243122523',
        'manufacturer_current_equivalence',true,'captured_at',v_observed_at),
      now()
    ),
    (
      v_hairball_retailer_cache,'840243101573',
      'Blue Buffalo Tastefuls Adult Hairball Control Chicken & Brown Rice Dry Cat Food',
      'Blue Buffalo','cat','target-retail-label-manual','retailer_verified',
      v_hairball_url,v_hairball_url,v_hairball_image,'retailer_verified',
      'retailer_verified',
      encode(digest(v_hairball_url||v_hairball_image,'sha256'),'hex'),
      encode(digest(v_hairball_ingredients||v_hairball_image,'sha256'),'hex'),
      '2026-07-26-source-versioned-web-label-v1','promoted',NULL,
      jsonb_build_object('formula_evidence_tier','retailer_web_version',
        'target_tcin','76366271','package_gtin','840243101573',
        'manufacturer_current_equivalence',false,'captured_at',v_observed_at),
      now()
    ),
    (
      v_kitten_current_cache,'840243122547',
      'BLUE Tastefuls Kitten Chicken & Brown Rice Recipe',
      'Blue Buffalo','cat','target-retail-label-manual','retailer_verified',
      v_kitten_url,v_kitten_url,v_kitten_image,'retailer_verified',
      'retailer_verified',
      encode(digest(v_kitten_url||v_kitten_image,'sha256'),'hex'),
      encode(digest(v_kitten_ingredients||v_kitten_image,'sha256'),'hex'),
      '2026-07-26-source-versioned-web-label-v1','promoted',NULL,
      jsonb_build_object('formula_evidence_tier','manufacturer_current_exact',
        'target_tcin','52615638','package_gtin','840243122547',
        'manufacturer_current_equivalence',true,'captured_at',v_observed_at),
      now()
    ),
    (
      v_adult7_retailer_cache,'859610000784',
      'Blue Buffalo Tastefuls Adult 7+ Chicken & Brown Rice Dry Cat Food',
      'Blue Buffalo','cat','target-retail-label-manual','retailer_verified',
      v_adult7_url,v_adult7_url,v_adult7_image,'retailer_verified',
      'retailer_verified',
      encode(digest(v_adult7_url||v_adult7_image,'sha256'),'hex'),
      encode(digest(v_adult7_ingredients||v_adult7_image,'sha256'),'hex'),
      '2026-07-26-source-versioned-web-label-v1','promoted',NULL,
      jsonb_build_object('formula_evidence_tier','retailer_web_version',
        'target_tcin','76366297','package_gtin','859610000784',
        'manufacturer_current_equivalence',false,'captured_at',v_observed_at),
      now()
    )
  ON CONFLICT DO NOTHING;

  -- Runtime acceptance.
  IF (
    SELECT cache_key FROM public.resolve_verified_product_by_gtin(
      '840243122523',8
    ) LIMIT 1
  ) IS DISTINCT FROM v_weight_current_cache
     OR (
       SELECT cache_key FROM public.resolve_verified_product_by_gtin(
         '840243101573',8
       ) LIMIT 1
     ) IS DISTINCT FROM v_hairball_retailer_cache
     OR (
       SELECT cache_key FROM public.resolve_verified_product_by_gtin(
         '840243122547',8
       ) LIMIT 1
     ) IS DISTINCT FROM v_kitten_current_cache
     OR (
       SELECT cache_key FROM public.resolve_verified_product_by_gtin(
         '859610000784',8
       ) LIMIT 1
     ) IS DISTINCT FROM v_adult7_retailer_cache
  THEN
    RAISE EXCEPTION 'Tastefuls control/life-stage barcode resolution failed';
  END IF;

  IF (
    SELECT cache_key FROM public.search_verified_products(
      'Blue Buffalo Tastefuls with Chicken Weight Control Natural Adult Dry Cat Food',1
    ) LIMIT 1
  ) IS DISTINCT FROM v_weight_current_cache
     OR (
       SELECT cache_key FROM public.search_verified_products(
         'Blue Buffalo Tastefuls Hairball Control Natural Adult Dry Cat Food with Chicken',1
       ) LIMIT 1
     ) IS DISTINCT FROM v_hairball_current_cache
     OR (
       SELECT cache_key FROM public.search_verified_products(
         'Blue Buffalo Tastefuls with Chicken Natural Kitten Dry Cat Food',1
       ) LIMIT 1
     ) IS DISTINCT FROM v_kitten_current_cache
     OR (
       SELECT cache_key FROM public.search_verified_products(
         'Blue Buffalo Tastefuls with Chicken Adult 7 Natural Dry Cat Food',1
       ) LIMIT 1
     ) IS DISTINCT FROM v_adult7_current_cache
  THEN
    RAISE EXCEPTION 'Tastefuls control/life-stage generic search failed';
  END IF;
END;
$$;
