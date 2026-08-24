-- Promote one exact Target package version without asserting that its copied
-- label is the current Blue Buffalo manufacturer formula. The UPC, TCIN,
-- package image, full ingredients, and structured identity are all published
-- on the exact Target PDP.

DO $$
DECLARE
  v_formula_id BIGINT;
  v_run_id BIGINT;
  v_cache_key TEXT :=
    'target-retail-catalog:840243150427';
  v_formula_key TEXT :=
    'blue buffalo|blue buffalo|blue buffalo adult dry dog food with beef flavor|dog|adult|dry||';
  v_source_url TEXT :=
    'https://www.target.com/p/blue-buffalo-adult-dry-dog-food-with-beef-flavor-24lbs/-/A-88766776';
  v_image_url TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_7225180d-e18e-47d7-90b9-d3766558d4fc';
  v_ingredients TEXT :=
    'deboned beef, chicken meal, brown rice, barley, oatmeal, peas, chicken fat (preserved with mixed tocopherols), flaxseed (source of omega 6 fatty acids), natural flavor, fish meal (source of omega 3 fatty acids), dried tomato pomace, pea protein, salt, direct dehydrated alfalfa pellets, potassium chloride, dried chicory root, potatoes, pea fiber, alfalfa nutrient concentrate, calcium carbonate, l-threonine, choline chloride, dl-methionine, preserved with mixed tocopherols, sweet potatoes, carrols, garlic, taurine, zinc amino acid chelate, zinc sulfate, vegetable juice for color, ferrous sulfate, vitamin e supplement, iron amino acid chelate, blueberries, cranberries, barley grass, parsley, turmeric, dried kelp, glucosamine hydrochloride, yucca schidigera extract, niacin (vitamin b3), calcium pantothenate (vitamin b5), copper sulfate, l-ascorbyl-2-polyphosphate (source of vitamin c), l-lysine, biotin (vitamin b7), l-carnitine, vitamin a supplement, copper amino acid chelate, manganese sulfate, manganese amino acid chelate, thiamine mononitrate (vitamin b1), riboflavin (vitamin b2), vitamin d3 supplement, vitamin b12 supplement, pyridoxine hydrochloride (vitamin b6), calcium iodate, dried yeast, dried enterococcus faecium fermentation product, dried lactobacillus acidophilus fermentation product, dried aspergillus niger fermentation extract, dried trichoderma longibrachiatum fermentation extract, dried bacillus subtilis fermentation extract, folic acid (vitamin b9), sodium selenite, oil of rosemary';
BEGIN
  SELECT formula.id
  INTO STRICT v_formula_id
  FROM public.catalog_formulas formula
  WHERE formula.formula_key = v_formula_key
    AND formula.source_url = v_source_url;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_skus sku
    WHERE ltrim(
      regexp_replace(COALESCE(sku.gtin, ''), '[^0-9]', '', 'g'),
      '0'
    ) = ltrim('840243150427', '0')
      AND sku.formula_id <> v_formula_id
      AND sku.active
  ) THEN
    RAISE EXCEPTION
      'Target Blue Beef UPC already belongs to another active formula';
  END IF;

  INSERT INTO public.product_data (
    cache_key,
    product_name,
    brand,
    ingredients,
    ingredient_text,
    ingredient_count,
    source,
    source_url,
    scraped_at,
    expires_at,
    image_url,
    nutrient_panel,
    has_published_nutrients,
    is_complete_food,
    catalog_exclusion_reason,
    pet_type,
    source_quality,
    ingredient_verification_status,
    image_verification_status,
    verified_at,
    gtin,
    product_line,
    flavor,
    life_stage,
    food_form,
    package_size,
    formula_evidence_tier,
    formula_version_provenance,
    updated_at
  ) VALUES (
    v_cache_key,
    'Blue Buffalo Life Protection Formula Adult Beef & Brown Rice Dry Dog Food',
    'Blue Buffalo',
    public.catalog_split_ingredient_statement(v_ingredients),
    v_ingredients,
    cardinality(
      public.catalog_split_ingredient_statement(v_ingredients)
    ),
    'target-retail-label-manual',
    v_source_url,
    '2026-07-26T21:10:00Z'::TIMESTAMPTZ,
    now() + INTERVAL '180 days',
    v_image_url,
    jsonb_build_object(
      'protein', 24,
      'fat', 14,
      'fiber', 5,
      'moisture', 10,
      'basis', 'Target exact package label'
    ),
    true,
    true,
    NULL,
    'dog',
    'retailer_verified',
    'retailer_verified',
    'retailer_verified',
    '2026-07-26T21:10:00Z'::TIMESTAMPTZ,
    '840243150427',
    'Life Protection Formula',
    'Beef & Brown Rice',
    'adult',
    'dry',
    '24 lb',
    'retailer_web_version',
    jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'source', 'target-retail-label-manual',
      'source_url', v_source_url,
      'captured_at', '2026-07-26T21:10:00Z'::TIMESTAMPTZ,
      'package_gtin', '840243150427',
      'product_code', 'TCIN 88766776',
      'package_size', '24 lb',
      'front_image_url', v_image_url,
      'ingredient_text_hash',
        encode(
          digest(
            public.catalog_normalize_ingredient_evidence(
              v_ingredients
            ),
            'sha256'
          ),
          'hex'
        )
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

  UPDATE public.catalog_formulas formula
  SET
    manufacturer = 'blue buffalo',
    brand = 'blue buffalo',
    product_name =
      'Blue Buffalo Life Protection Formula Adult Beef & Brown Rice Dry Dog Food',
    product_line = 'life protection formula',
    pet_type = 'dog',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'beef and brown rice',
    diet_condition = '',
    is_complete_food = true,
    complete_food_evidence =
      'Exact Target TCIN 88766776 PDP identifies adult dog dry kibble and describes a balanced recipe; the same page publishes UPC 840243150427 and the full package ingredient statement.',
    ingredient_text = v_ingredients,
    ingredients =
      public.catalog_split_ingredient_statement(v_ingredients),
    front_image_url = v_image_url,
    source_url = v_source_url,
    source_authority = 'retailer_verified',
    ingredient_verification_status = 'retailer_verified',
    image_verification_status = 'retailer_verified',
    protected_terms = ARRAY[
      'blue buffalo',
      'life protection formula',
      'adult',
      'dog',
      'dry',
      'beef',
      'brown rice'
    ]::TEXT[],
    verification_status = 'verified',
    active = true,
    promoted_cache_key = v_cache_key,
    promoted_at = now(),
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance =
      formula.formula_version_provenance ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'source', 'target-retail-label-manual',
        'source_url', v_source_url,
        'captured_at', '2026-07-26T21:10:00Z'::TIMESTAMPTZ,
        'package_gtin', '840243150427',
        'product_code', 'TCIN 88766776',
        'package_size', '24 lb',
        'front_image_url', v_image_url,
        'ingredient_text_hash',
          encode(
            digest(
              public.catalog_normalize_ingredient_evidence(
                v_ingredients
              ),
              'sha256'
            ),
            'hex'
          )
      ),
    last_observed_at = '2026-07-26T21:10:00Z'::TIMESTAMPTZ,
    updated_at = now()
  WHERE formula.id = v_formula_id;

  UPDATE public.catalog_skus sku
  SET
    gtin = '840243150427',
    package_size = '24 lb',
    package_count = 1,
    source_slug = 'target-retail-label-manual',
    source_external_id = 'TCIN:88766776',
    source_url = v_source_url,
    active = true,
    last_observed_at = '2026-07-26T21:10:00Z'::TIMESTAMPTZ,
    updated_at = now()
  WHERE sku.formula_id = v_formula_id
    AND sku.source_external_id = 'A-88766776';

  IF NOT FOUND THEN
    INSERT INTO public.catalog_skus (
      formula_id,
      gtin,
      package_size,
      package_count,
      source_slug,
      source_external_id,
      source_url,
      active,
      first_observed_at,
      last_observed_at,
      updated_at
    ) VALUES (
      v_formula_id,
      '840243150427',
      '24 lb',
      1,
      'target-retail-label-manual',
      'TCIN:88766776',
      v_source_url,
      true,
      '2026-07-26T21:10:00Z'::TIMESTAMPTZ,
      '2026-07-26T21:10:00Z'::TIMESTAMPTZ,
      now()
    );
  END IF;

  INSERT INTO public.catalog_source_runs (
    run_key,
    source_slug,
    source_type,
    coverage_role,
    status,
    started_at,
    finished_at,
    expected_count,
    observed_count,
    accepted_count,
    rejected_count,
    pagination_complete,
    source_content_hash,
    checkpoint,
    metadata,
    updated_at
  ) VALUES (
    'manual-exact-evidence:target:blue-life-protection-beef:88766776:20260726',
    'target-retail-label-manual',
    'retailer',
    'verification',
    'completed',
    '2026-07-26T21:10:00Z'::TIMESTAMPTZ,
    '2026-07-26T21:10:00Z'::TIMESTAMPTZ,
    1,
    1,
    1,
    0,
    true,
    encode(
      digest(
        v_source_url || '|840243150427|' || v_ingredients || '|' ||
        v_image_url,
        'sha256'
      ),
      'hex'
    ),
    '{}'::JSONB,
    jsonb_build_object(
      'evidence_tier', 'retailer_web_version',
      'tcin', '88766776',
      'upc', '840243150427',
      'package_size', '24 lb',
      'manual_exact_evidence', true,
      'manufacturer_current_equivalence', false
    ),
    now()
  )
  ON CONFLICT (run_key) DO UPDATE
  SET
    status = 'completed',
    finished_at = excluded.finished_at,
    observed_count = 1,
    accepted_count = 1,
    rejected_count = 0,
    pagination_complete = true,
    source_content_hash = excluded.source_content_hash,
    metadata = excluded.metadata,
    updated_at = now()
  RETURNING id INTO v_run_id;

  INSERT INTO public.catalog_observations (
    run_id,
    formula_id,
    source_slug,
    source_external_id,
    source_url,
    source_authority,
    gtin,
    manufacturer,
    brand,
    product_name,
    product_line,
    pet_type,
    life_stage,
    food_form,
    flavor,
    diet_condition,
    package_size,
    ingredient_text,
    front_image_url,
    is_complete_food,
    available_in_us,
    observed_at,
    content_hash,
    validation_status,
    validation_reasons,
    formula_evidence_tier,
    formula_version_provenance,
    raw_payload
  ) VALUES (
    v_run_id,
    v_formula_id,
    'target-retail-label-manual',
    'TCIN:88766776',
    v_source_url,
    'retailer_verified',
    '840243150427',
    'blue buffalo',
    'blue buffalo',
    'Blue Buffalo Life Protection Formula Adult Beef & Brown Rice Dry Dog Food',
    'life protection formula',
    'dog',
    'adult',
    'dry',
    'beef and brown rice',
    '',
    '24 lb',
    v_ingredients,
    v_image_url,
    true,
    true,
    '2026-07-26T21:10:00Z'::TIMESTAMPTZ,
    encode(
      digest(
        v_formula_key || '|840243150427|' || v_ingredients || '|' ||
        v_image_url,
        'sha256'
      ),
      'hex'
    ),
    'accepted',
    ARRAY[]::TEXT[],
    'retailer_web_version',
    jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'package_gtin', '840243150427',
      'product_code', 'TCIN 88766776',
      'captured_at', '2026-07-26T21:10:00Z'::TIMESTAMPTZ
    ),
    jsonb_build_object(
      'target_tcin', '88766776',
      'target_upc', '840243150427',
      'target_item_number', '083-06-0110',
      'front_image_url', v_image_url,
      'ingredients_verbatim_from_exact_pdp', true
    )
  )
  ON CONFLICT (
    run_id,
    source_slug,
    source_external_id,
    content_hash
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

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key,
    alias_text,
    normalized_alias,
    source_url,
    source_authority,
    evidence_observed_at,
    provenance,
    active,
    created_at,
    updated_at
  ) VALUES (
    v_cache_key,
    'Blue Buffalo Adult Dry Dog Food with Beef Flavor 24 lb',
    public.normalize_verified_product_search_query(
      'Blue Buffalo Adult Dry Dog Food with Beef Flavor 24 lb'
    ),
    v_source_url,
    'retailer_verified',
    '2026-07-26T21:10:00Z'::TIMESTAMPTZ,
    jsonb_build_object(
      'evidence_tier', 'retailer_web_version',
      'package_gtin', '840243150427',
      'product_code', 'TCIN 88766776',
      'manufacturer_current_equivalence', false
    ),
    true,
    now(),
    now()
  )
  ON CONFLICT (normalized_alias)
    WHERE active
  DO UPDATE
  SET
    cache_key = excluded.cache_key,
    source_url = excluded.source_url,
    source_authority = excluded.source_authority,
    evidence_observed_at = excluded.evidence_observed_at,
    provenance = excluded.provenance,
    active = true,
    updated_at = now();

  INSERT INTO public.catalog_product_evidence (
    cache_key,
    gtin,
    product_name,
    brand,
    pet_type,
    source,
    source_quality,
    source_url,
    ingredient_source_url,
    image_source_url,
    ingredient_verification_status,
    image_verification_status,
    raw_source_hash,
    content_hash,
    extractor_version,
    review_state,
    rejection_reason,
    evidence,
    updated_at
  ) VALUES (
    v_cache_key,
    '840243150427',
    'Blue Buffalo Life Protection Formula Adult Beef & Brown Rice Dry Dog Food',
    'Blue Buffalo',
    'dog',
    'target-retail-label-manual',
    'retailer_verified',
    v_source_url,
    v_source_url,
    v_image_url,
    'retailer_verified',
    'retailer_verified',
    encode(digest(v_source_url || '|' || v_image_url, 'sha256'), 'hex'),
    encode(digest(v_ingredients || '|' || v_image_url, 'sha256'), 'hex'),
    '2026-07-26-source-versioned-web-label-v1',
    'promoted',
    NULL,
    jsonb_build_object(
      'formula_evidence_tier', 'retailer_web_version',
      'target_tcin', '88766776',
      'package_gtin', '840243150427',
      'package_size', '24 lb',
      'manufacturer_current_equivalence', false,
      'captured_at', '2026-07-26T21:10:00Z'::TIMESTAMPTZ
    ),
    now()
  )
  ON CONFLICT DO NOTHING;

  IF (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('840243150427', 8)
    WHERE cache_key = v_cache_key
      AND nutritional_info->>'formula_evidence_tier' =
        'retailer_web_version'
  ) <> 1 THEN
    RAISE EXCEPTION
      'Target Blue Beef exact package barcode did not resolve';
  END IF;

  IF (
    SELECT cache_key
    FROM public.search_verified_products(
      'Blue Buffalo Adult Dry Dog Food with Beef Flavor 24 lb',
      1
    )
    LIMIT 1
  ) IS DISTINCT FROM v_cache_key THEN
    RAISE EXCEPTION
      'Target Blue Beef exact package search did not rank first';
  END IF;
END;
$$;
