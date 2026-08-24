-- Preserve the exact Target 5 lb / Chewy 40 lb Blue Buffalo Beef & Brown Rice
-- package version as one formula with two SKU observations. Both exact PDPs
-- publish the same ordered ingredient statement. This version remains separate
-- from the PetSmart 30 lb and Target 24 lb versions, whose ingredients differ.

DO $$
DECLARE
  v_formula_id BIGINT;
  v_target_run_id BIGINT;
  v_chewy_run_id BIGINT;
  v_cache_key TEXT := 'target-retail-catalog:840243145256';
  v_formula_key TEXT :=
    'blue buffalo|blue buffalo|blue buffalo life protection formula natural adult dry dog food with beef and brown rice|dog|adult|dry||';
  v_target_url TEXT :=
    'https://www.target.com/p/blue-buffalo-life-protection-beef-brown-rice-recipe-adult-dry-dog-food/-/A-85968294';
  v_chewy_url TEXT :=
    'https://www.chewy.com/blue-buffalo-life-protection-formula/dp/4046574';
  v_target_image TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_2a2f4f4e-d715-4e84-8542-f4c92a963796';
  v_chewy_image TEXT :=
    'https://image.chewy.com/catalog/general/images/moe/069b9685-d045-79d6-8000-5dcbce74ecc5._AC_SX500_SY400_QL75_V1_.jpg';
  v_observed_at TIMESTAMPTZ := '2026-07-26T22:30:00Z';
  v_ingredients TEXT :=
    'deboned beef, chicken meal, brown rice, oatmeal, barley, peas, chicken fat (preserved with mixed tocopherols), flaxseed (source of omega 6 fatty acids), natural flavor, dried tomato pomace, fish meal (source of omega 3 fatty acids), dried yeast, salt, direct dehydrated alfalfa pellets, potassium chloride, calcium carbonate, dried chicory root, alfalfa nutrient concentrate, choline chloride, dl-methionine, preserved with mixed tocopherols, l-threonine, dried sweet potatoes, carrots, taurine, zinc amino acid chelate, zinc sulfate, vegetable juice for color, ferrous sulfate, vitamin e supplement, iron amino acid chelate, blueberries, cranberries, barley grass, parsley, turmeric, dried kelp, glucosamine hydrochloride, yucca schidigera extract, niacin (vitamin b3), calcium pantothenate (vitamin b5), copper sulfate, l-ascorbyl-2-polyphosphate (source of vitamin c), l-lysine, biotin (vitamin b7), vitamin a supplement, copper amino acid chelate, manganese sulfate, manganese amino acid chelate, thiamine mononitrate (vitamin b1), riboflavin (vitamin b2), vitamin d3 supplement, vitamin b12 supplement, pyridoxine hydrochloride (vitamin b6), calcium iodate, folic acid (vitamin b9), sodium selenite, oil of rosemary';
  v_ingredient_hash TEXT;
BEGIN
  v_ingredient_hash := encode(
    digest(
      public.catalog_normalize_ingredient_evidence(v_ingredients),
      'sha256'
    ),
    'hex'
  );

  IF EXISTS (
    SELECT 1
    FROM public.catalog_skus sku
    WHERE ltrim(
      regexp_replace(COALESCE(sku.gtin, ''), '[^0-9]', '', 'g'),
      '0'
    ) = ltrim('840243145256', '0')
      AND sku.active
  ) THEN
    RAISE EXCEPTION
      'Target Blue Beef 5 lb UPC already belongs to an active formula';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_data product
    WHERE product.cache_key = 'petsmart-retail-catalog:840243145294'
      AND encode(
        digest(
          public.catalog_normalize_ingredient_evidence(
            COALESCE(product.ingredient_text, '')
          ),
          'sha256'
        ),
        'hex'
      ) = v_ingredient_hash
  ) THEN
    RAISE EXCEPTION
      'PetSmart 30 lb version unexpectedly shares the new version hash';
  END IF;

  INSERT INTO public.product_data (
    cache_key, product_name, brand, ingredients, ingredient_text,
    ingredient_count, source, source_url, scraped_at, expires_at, image_url,
    nutrient_panel, has_published_nutrients, is_complete_food,
    catalog_exclusion_reason, pet_type, source_quality,
    ingredient_verification_status, image_verification_status, verified_at,
    gtin, product_line, flavor, life_stage, food_form, package_size,
    formula_evidence_tier, formula_version_provenance, updated_at
  ) VALUES (
    v_cache_key,
    'Blue Buffalo Life Protection Formula Adult Beef & Brown Rice Recipe Dry Dog Food',
    'Blue Buffalo',
    public.catalog_split_ingredient_statement(v_ingredients),
    v_ingredients,
    cardinality(public.catalog_split_ingredient_statement(v_ingredients)),
    'target-chewy-exact-package-manual',
    v_target_url,
    v_observed_at,
    now() + INTERVAL '180 days',
    v_target_image,
    jsonb_build_object(
      'protein', 24,
      'fat', 14,
      'fiber', 5,
      'moisture', 10,
      'basis', 'Chewy exact 40 lb PDP',
      'source_url', v_chewy_url
    ),
    true,
    true,
    NULL,
    'dog',
    'retailer_verified',
    'retailer_verified',
    'retailer_verified',
    v_observed_at,
    '840243145256',
    'Life Protection Formula',
    'Beef & Brown Rice',
    'adult',
    'dry',
    '5 lb',
    'retailer_web_version',
    jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'source', 'target-chewy-exact-package-manual',
      'source_url', v_target_url,
      'captured_at', v_observed_at,
      'package_gtin', '840243145256',
      'product_code', 'TCIN 84279055',
      'package_size', '5 lb',
      'front_image_url', v_target_image,
      'ingredient_text_hash', v_ingredient_hash,
      'package_variants', jsonb_build_array(
        jsonb_build_object(
          'source', 'Target',
          'product_code', 'TCIN 84279055',
          'gtin', '840243145256',
          'package_size', '5 lb',
          'source_url', v_target_url,
          'image_url', v_target_image
        ),
        jsonb_build_object(
          'source', 'Chewy',
          'product_code', 'Chewy DP 4046574',
          'package_size', '40 lb',
          'source_url', v_chewy_url,
          'image_url', v_chewy_image
        )
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

  INSERT INTO public.catalog_formulas (
    formula_key, manufacturer, brand, product_name, product_line, pet_type,
    life_stage, food_form, flavor, diet_condition, is_complete_food,
    complete_food_evidence, ingredient_text, ingredients, front_image_url,
    source_url, source_authority, ingredient_verification_status,
    image_verification_status, protected_terms, verification_status, active,
    is_popular_brand, first_observed_at, last_observed_at, promoted_cache_key,
    promoted_at, identity_hash, formula_evidence_tier,
    formula_version_provenance, created_at, updated_at
  ) VALUES (
    v_formula_key,
    'blue buffalo',
    'blue buffalo',
    'Blue Buffalo Life Protection Formula Adult Beef & Brown Rice Recipe Dry Dog Food',
    'life protection formula',
    'dog',
    'adult',
    'dry',
    'beef and brown rice',
    '',
    true,
    'Exact Target 5 lb and Chewy 40 lb PDPs identify adult dog dry Beef & Brown Rice and publish the same complete ordered ingredient statement; Chewy describes it as a balanced diet.',
    v_ingredients,
    public.catalog_split_ingredient_statement(v_ingredients),
    v_target_image,
    v_target_url,
    'retailer_verified',
    'retailer_verified',
    'retailer_verified',
    ARRAY[
      'blue buffalo', 'life protection formula', 'adult', 'dog', 'dry',
      'beef', 'brown rice'
    ]::TEXT[],
    'verified',
    true,
    true,
    v_observed_at,
    v_observed_at,
    v_cache_key,
    now(),
    encode(digest(v_formula_key, 'sha256'), 'hex'),
    'retailer_web_version',
    jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'source', 'target-chewy-exact-package-manual',
      'source_url', v_target_url,
      'captured_at', v_observed_at,
      'package_gtin', '840243145256',
      'product_code', 'TCIN 84279055',
      'front_image_url', v_target_image,
      'ingredient_text_hash', v_ingredient_hash,
      'equivalent_exact_source_urls', jsonb_build_array(
        v_target_url,
        v_chewy_url
      )
    ),
    now(),
    now()
  )
  ON CONFLICT (formula_key) DO UPDATE
  SET
    ingredient_text = excluded.ingredient_text,
    ingredients = excluded.ingredients,
    front_image_url = excluded.front_image_url,
    source_url = excluded.source_url,
    source_authority = excluded.source_authority,
    ingredient_verification_status =
      excluded.ingredient_verification_status,
    image_verification_status = excluded.image_verification_status,
    verification_status = 'verified',
    active = true,
    promoted_cache_key = excluded.promoted_cache_key,
    promoted_at = now(),
    formula_evidence_tier = excluded.formula_evidence_tier,
    formula_version_provenance =
      excluded.formula_version_provenance,
    last_observed_at = excluded.last_observed_at,
    updated_at = now()
  RETURNING id INTO v_formula_id;

  INSERT INTO public.catalog_skus (
    formula_id, gtin, package_size, package_count, source_slug,
    source_external_id, source_url, active, first_observed_at,
    last_observed_at, updated_at
  ) VALUES
    (
      v_formula_id, '840243145256', '5 lb', 1,
      'target-retail-label-manual', 'TCIN:84279055', v_target_url,
      true, v_observed_at, v_observed_at, now()
    ),
    (
      v_formula_id, NULL, '40 lb', 1,
      'chewy-retail-label-manual', 'CHEWY-DP:4046574', v_chewy_url,
      true, v_observed_at, v_observed_at, now()
    )
  ON CONFLICT (source_slug, source_external_id, gtin, package_size) DO UPDATE
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
    'manual-exact-evidence:target:blue-life-protection-beef:84279055:20260726',
    'target-retail-label-manual',
    'retailer',
    'verification',
    'completed',
    v_observed_at,
    v_observed_at,
    1, 1, 1, 0, true,
    encode(
      digest(v_target_url || '|840243145256|' || v_ingredients, 'sha256'),
      'hex'
    ),
    '{}'::JSONB,
    jsonb_build_object(
      'evidence_tier', 'retailer_web_version',
      'tcin', '84279055',
      'upc', '840243145256',
      'package_size', '5 lb',
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
  RETURNING id INTO v_target_run_id;

  INSERT INTO public.catalog_source_runs (
    run_key, source_slug, source_type, coverage_role, status, started_at,
    finished_at, expected_count, observed_count, accepted_count,
    rejected_count, pagination_complete, source_content_hash, checkpoint,
    metadata, updated_at
  ) VALUES (
    'manual-exact-evidence:chewy:blue-life-protection-beef:4046574:20260726',
    'chewy-retail-label-manual',
    'retailer',
    'verification',
    'completed',
    v_observed_at,
    v_observed_at,
    1, 1, 1, 0, true,
    encode(
      digest(v_chewy_url || '|CHEWY-DP:4046574|' || v_ingredients, 'sha256'),
      'hex'
    ),
    '{}'::JSONB,
    jsonb_build_object(
      'evidence_tier', 'retailer_web_version',
      'chewy_dp', '4046574',
      'package_size', '40 lb',
      'manual_exact_evidence', true,
      'ingredient_hash_matches_target_5_lb', true,
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
  RETURNING id INTO v_chewy_run_id;

  INSERT INTO public.catalog_observations (
    run_id, formula_id, source_slug, source_external_id, source_url,
    source_authority, gtin, manufacturer, brand, product_name, product_line,
    pet_type, life_stage, food_form, flavor, diet_condition, package_size,
    ingredient_text, front_image_url, is_complete_food, available_in_us,
    observed_at, content_hash, validation_status, validation_reasons,
    formula_evidence_tier, formula_version_provenance, raw_payload
  ) VALUES
    (
      v_target_run_id, v_formula_id, 'target-retail-label-manual',
      'TCIN:84279055', v_target_url, 'retailer_verified', '840243145256',
      'blue buffalo', 'blue buffalo',
      'Blue Buffalo Life Protection Formula Natural Adult Dry Dog Food with Beef and Brown Rice - 5 lb',
      'life protection formula', 'dog', 'adult', 'dry',
      'beef and brown rice', '', '5 lb', v_ingredients, v_target_image,
      true, true, v_observed_at,
      encode(
        digest(v_formula_key || '|840243145256|' || v_ingredient_hash, 'sha256'),
        'hex'
      ),
      'accepted', ARRAY[]::TEXT[], 'retailer_web_version',
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'package_gtin', '840243145256',
        'product_code', 'TCIN 84279055',
        'captured_at', v_observed_at
      ),
      jsonb_build_object(
        'target_tcin', '84279055',
        'target_upc', '840243145256',
        'target_item_number', '083-06-8122',
        'front_image_url', v_target_image,
        'ingredients_verbatim_from_exact_pdp', true
      )
    ),
    (
      v_chewy_run_id, v_formula_id, 'chewy-retail-label-manual',
      'CHEWY-DP:4046574', v_chewy_url, 'retailer_verified', NULL,
      'blue buffalo', 'blue buffalo',
      'Blue Buffalo Life Protection Formula Adult Beef & Brown Rice Recipe Dry Dog Food - 40 lb',
      'life protection formula', 'dog', 'adult', 'dry',
      'beef and brown rice', '', '40 lb', v_ingredients, v_chewy_image,
      true, true, v_observed_at,
      encode(
        digest(v_formula_key || '|CHEWY-DP:4046574|' || v_ingredient_hash, 'sha256'),
        'hex'
      ),
      'accepted', ARRAY[]::TEXT[], 'retailer_web_version',
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'product_code', 'Chewy DP 4046574',
        'captured_at', v_observed_at,
        'ingredient_text_hash', v_ingredient_hash
      ),
      jsonb_build_object(
        'chewy_dp', '4046574',
        'front_image_url', v_chewy_image,
        'ingredients_verbatim_from_exact_pdp', true,
        'same_ordered_ingredient_hash_as_target_5_lb', true
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

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key, alias_text, normalized_alias, source_url, source_authority,
    evidence_observed_at, provenance, active, created_at, updated_at
  ) VALUES
    (
      v_cache_key,
      'Blue Buffalo Life Protection Formula Natural Adult Dry Dog Food with Beef and Brown Rice 5 lb',
      public.normalize_verified_product_search_query(
        'Blue Buffalo Life Protection Formula Natural Adult Dry Dog Food with Beef and Brown Rice 5 lb'
      ),
      v_target_url,
      'retailer_verified',
      v_observed_at,
      jsonb_build_object(
        'evidence_tier', 'retailer_web_version',
        'package_gtin', '840243145256',
        'product_code', 'TCIN 84279055',
        'manufacturer_current_equivalence', false
      ),
      true, now(), now()
    ),
    (
      v_cache_key,
      'Blue Buffalo Life Protection Formula Adult Beef & Brown Rice Recipe Dry Dog Food 40 lb',
      public.normalize_verified_product_search_query(
        'Blue Buffalo Life Protection Formula Adult Beef & Brown Rice Recipe Dry Dog Food 40 lb'
      ),
      v_chewy_url,
      'retailer_verified',
      v_observed_at,
      jsonb_build_object(
        'evidence_tier', 'retailer_web_version',
        'product_code', 'Chewy DP 4046574',
        'package_size', '40 lb',
        'manufacturer_current_equivalence', false
      ),
      true, now(), now()
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
    cache_key, gtin, product_name, brand, pet_type, source, source_quality,
    source_url, ingredient_source_url, image_source_url,
    ingredient_verification_status, image_verification_status,
    raw_source_hash, content_hash, extractor_version, review_state,
    rejection_reason, evidence, updated_at
  ) VALUES (
    v_cache_key,
    '840243145256',
    'Blue Buffalo Life Protection Formula Adult Beef & Brown Rice Recipe Dry Dog Food',
    'Blue Buffalo',
    'dog',
    'target-chewy-exact-package-manual',
    'retailer_verified',
    v_target_url,
    v_target_url,
    v_target_image,
    'retailer_verified',
    'retailer_verified',
    encode(digest(v_target_url || '|' || v_chewy_url, 'sha256'), 'hex'),
    encode(digest(v_ingredient_hash || '|' || v_target_image, 'sha256'), 'hex'),
    '2026-07-26-source-versioned-web-label-v2',
    'promoted',
    NULL,
    jsonb_build_object(
      'formula_evidence_tier', 'retailer_web_version',
      'target_tcin', '84279055',
      'package_gtin', '840243145256',
      'target_package_size', '5 lb',
      'chewy_dp', '4046574',
      'chewy_package_size', '40 lb',
      'manufacturer_current_equivalence', false,
      'captured_at', v_observed_at,
      'ingredient_text_hash', v_ingredient_hash
    ),
    now()
  )
  ON CONFLICT DO NOTHING;

  IF (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('840243145256', 8)
    WHERE cache_key = v_cache_key
      AND nutritional_info->>'formula_evidence_tier' =
        'retailer_web_version'
  ) <> 1 THEN
    RAISE EXCEPTION
      'Target Blue Beef 5 lb exact barcode did not resolve';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_skus
    WHERE formula_id = v_formula_id
      AND active
      AND (
        (gtin = '840243145256' AND package_size = '5 lb')
        OR (
          gtin IS NULL
          AND source_external_id = 'CHEWY-DP:4046574'
          AND package_size = '40 lb'
        )
      )
  ) <> 2 THEN
    RAISE EXCEPTION
      'Target/Chewy exact package variants were not preserved';
  END IF;

  IF (
    SELECT cache_key
    FROM public.search_verified_products(
      'Blue Buffalo Life Protection Formula Adult Beef Brown Rice Dry Dog Food',
      1
    )
    LIMIT 1
  ) IS DISTINCT FROM v_cache_key THEN
    RAISE EXCEPTION
      'Target/Chewy Blue Beef exact search did not rank first';
  END IF;
END;
$$;
