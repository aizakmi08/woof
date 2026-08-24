-- Preserve the exact Target Plus Purina Pro Plan UPC as a source-versioned
-- formula. Its ordered ingredient statement differs from Purina's current
-- manufacturer formula, so it must never overwrite or become a size child of
-- UPC 038100101686.

DO $$
DECLARE
  v_formula_id BIGINT;
  v_run_id BIGINT;
  v_cache_key TEXT := 'target-retail-catalog:038100130549';
  v_formula_key TEXT :=
    'purina pro plan|purina pro plan|purina pro plan shredded blend chicken rice flavor adult dry dog food|dog|adult|dry||';
  v_source_url TEXT :=
    'https://www.target.com/p/purina-pro-plan-shredded-blend-6-lb-chicken-rice-flavor-adult-dry-dog-food/-/A-1003611534';
  v_image_url TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_f11382da-54ae-4a0c-8cda-5afbefe29c8a';
  v_observed_at TIMESTAMPTZ := '2026-07-26T23:30:00Z';
  v_ingredients TEXT :=
    'chicken, rice flour, whole grain wheat, poultry by-product meal (source of glucosamine), soybean meal, beef tallow preserved with mixed-tocopherols, corn gluten meal, whole grain corn, fish meal (source of glucosamine), natural liver flavor, glycerin, wheat bran, mono and dicalcium phosphate, calcium carbonate, salt, dried egg product, soybean oil, potassium chloride, fish oil, minerals [zinc proteinate, manganese proteinate, ferrous sulfate, copper proteinate, calcium iodate, sodium selenite], vitamins [vitamin e supplement, niacin (vitamin b-3), vitamin a supplement, calcium pantothenate (vitamin b-5), thiamine mononitrate (vitamin b-1), vitamin b-12 supplement, riboflavin supplement (vitamin b-2), pyridoxine hydrochloride (vitamin b-6), folic acid (vitamin b-9), vitamin d-3 supplement, menadione sodium bisulfite complex (vitamin k), biotin (vitamin b-7)], choline chloride, l-ascorbyl-2-polyphosphate (vitamin c), dried bacillus coagulans fermentation product, l-lysine monohydrochloride, garlic oil';
  v_ingredient_hash TEXT;
  v_current_hash TEXT;
BEGIN
  v_ingredient_hash := encode(
    digest(
      public.catalog_normalize_ingredient_evidence(v_ingredients),
      'sha256'
    ),
    'hex'
  );

  SELECT encode(
    digest(
      public.catalog_normalize_ingredient_evidence(
        COALESCE(product.ingredient_text, '')
      ),
      'sha256'
    ),
    'hex'
  )
  INTO STRICT v_current_hash
  FROM public.product_data product
  WHERE product.cache_key = 'nestle-purina-pro-plan:038100101686'
    AND product.formula_evidence_tier = 'manufacturer_current_exact';

  IF v_ingredient_hash = v_current_hash THEN
    RAISE EXCEPTION
      'Target Pro Plan source version unexpectedly equals manufacturer current';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_skus sku
    WHERE ltrim(
      regexp_replace(COALESCE(sku.gtin, ''), '[^0-9]', '', 'g'),
      '0'
    ) = ltrim('038100130549', '0')
      AND sku.active
      AND sku.formula_id <> COALESCE(
        (
          SELECT id
          FROM public.catalog_formulas
          WHERE formula_key = v_formula_key
        ),
        -1
      )
  ) THEN
    RAISE EXCEPTION
      'Target Pro Plan UPC already belongs to another active formula';
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
    'Purina Pro Plan Adult Shredded Blend Chicken & Rice Flavor Dry Dog Food',
    'Purina Pro Plan',
    public.catalog_split_ingredient_statement(v_ingredients),
    v_ingredients,
    cardinality(public.catalog_split_ingredient_statement(v_ingredients)),
    'target-plus-exact-package-manual',
    v_source_url,
    v_observed_at,
    now() + INTERVAL '180 days',
    v_image_url,
    jsonb_build_object(
      'protein', 26,
      'fat', 16,
      'fiber', 3,
      'moisture', 12,
      'basis', 'Target Plus exact UPC PDP',
      'source_url', v_source_url
    ),
    true,
    true,
    NULL,
    'dog',
    'retailer_verified',
    'retailer_verified',
    'retailer_verified',
    v_observed_at,
    '038100130549',
    'Shredded Blend',
    'Chicken & Rice',
    'adult',
    'dry',
    '6.06 lb',
    'retailer_web_version',
    jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'source', 'Target Plus / Jupiter Sales',
      'source_url', v_source_url,
      'captured_at', v_observed_at,
      'package_gtin', '038100130549',
      'product_code', 'TCIN 1003611534',
      'package_size', '6.06 lb',
      'front_image_url', v_image_url,
      'ingredient_text_hash', v_ingredient_hash,
      'different_from_manufacturer_current_hash', v_current_hash
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

  UPDATE public.catalog_formulas
  SET
    manufacturer = 'nestle purina petcare',
    brand = 'purina pro plan',
    product_name =
      'Purina Pro Plan Adult Shredded Blend Chicken & Rice Flavor Dry Dog Food',
    product_line = 'shredded blend',
    pet_type = 'dog',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'chicken and rice',
    diet_condition = '',
    is_complete_food = true,
    complete_food_evidence =
      'Exact Target Plus UPC PDP identifies Purina Pro Plan adult dry dog food and publishes the full label ingredient statement and guaranteed analysis.',
    ingredient_text = v_ingredients,
    ingredients = public.catalog_split_ingredient_statement(v_ingredients),
    front_image_url = v_image_url,
    source_url = v_source_url,
    source_authority = 'retailer_verified',
    ingredient_verification_status = 'retailer_verified',
    image_verification_status = 'retailer_verified',
    protected_terms = ARRAY[
      'purina pro plan', 'shredded blend', 'adult', 'dog', 'dry',
      'chicken', 'rice'
    ]::TEXT[],
    verification_status = 'verified',
    active = true,
    is_popular_brand = true,
    last_observed_at = v_observed_at,
    promoted_cache_key = v_cache_key,
    promoted_at = now(),
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance = jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'source', 'Target Plus / Jupiter Sales',
      'source_url', v_source_url,
      'captured_at', v_observed_at,
      'package_gtin', '038100130549',
      'product_code', 'TCIN 1003611534',
      'front_image_url', v_image_url,
      'ingredient_text_hash', v_ingredient_hash,
      'different_from_manufacturer_current_hash', v_current_hash
    ),
    updated_at = now()
  WHERE formula_key = v_formula_key
  RETURNING id INTO v_formula_id;

  IF v_formula_id IS NULL THEN
    RAISE EXCEPTION
      'Expected Target Pro Plan census formula is missing';
  END IF;

  INSERT INTO public.catalog_skus (
    formula_id, gtin, package_size, package_count, source_slug,
    source_external_id, source_url, active, first_observed_at,
    last_observed_at, updated_at
  ) VALUES (
    v_formula_id, '038100130549', '6.06 lb', 1,
    'target-retail-label-manual', 'TCIN:1003611534', v_source_url,
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
    'manual-exact-evidence:target-plus:pro-plan-shredded-blend:1003611534:20260726',
    'target-retail-label-manual',
    'retailer',
    'verification',
    'completed',
    v_observed_at,
    v_observed_at,
    1, 1, 1, 0, true,
    encode(
      digest(v_source_url || '|038100130549|' || v_ingredients, 'sha256'),
      'hex'
    ),
    '{}'::JSONB,
    jsonb_build_object(
      'evidence_tier', 'retailer_web_version',
      'retailer_channel', 'Target Plus',
      'seller', 'Jupiter Sales',
      'tcin', '1003611534',
      'upc', '038100130549',
      'package_size', '6.06 lb',
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

  UPDATE public.catalog_observations
  SET
    formula_id = v_formula_id,
    gtin = '038100130549',
    manufacturer = 'nestle purina petcare',
    brand = 'purina pro plan',
    product_name =
      'Purina Pro Plan Adult Shredded Blend Chicken & Rice Flavor Dry Dog Food',
    product_line = 'shredded blend',
    pet_type = 'dog',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'chicken and rice',
    diet_condition = '',
    package_size = '6.06 lb',
    ingredient_text = v_ingredients,
    front_image_url = v_image_url,
    is_complete_food = true,
    observed_at = v_observed_at,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance = jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'package_gtin', '038100130549',
      'product_code', 'TCIN 1003611534',
      'captured_at', v_observed_at,
      'ingredient_text_hash', v_ingredient_hash
    ),
    raw_payload = COALESCE(raw_payload, '{}'::JSONB) || jsonb_build_object(
      'target_tcin', '1003611534',
      'target_upc', '038100130549',
      'seller', 'Jupiter Sales',
      'front_image_url', v_image_url,
      'ingredients_verbatim_from_exact_pdp', true
    )
  WHERE source_slug = 'target-public-sitemap'
    AND source_external_id = 'A-1003611534';

  INSERT INTO public.catalog_observations (
    run_id, formula_id, source_slug, source_external_id, source_url,
    source_authority, gtin, manufacturer, brand, product_name, product_line,
    pet_type, life_stage, food_form, flavor, diet_condition, package_size,
    ingredient_text, front_image_url, is_complete_food, available_in_us,
    observed_at, content_hash, validation_status, validation_reasons,
    formula_evidence_tier, formula_version_provenance, raw_payload
  ) VALUES (
    v_run_id, v_formula_id, 'target-retail-label-manual',
    'TCIN:1003611534', v_source_url, 'retailer_verified', '038100130549',
    'nestle purina petcare', 'purina pro plan',
    'Purina Pro Plan Adult Shredded Blend Chicken & Rice Flavor Dry Dog Food',
    'shredded blend', 'dog', 'adult', 'dry', 'chicken and rice', '',
    '6.06 lb', v_ingredients, v_image_url, true, true, v_observed_at,
    encode(
      digest(v_formula_key || '|038100130549|' || v_ingredient_hash, 'sha256'),
      'hex'
    ),
    'accepted', ARRAY[]::TEXT[], 'retailer_web_version',
    jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', false,
      'package_gtin', '038100130549',
      'product_code', 'TCIN 1003611534',
      'captured_at', v_observed_at,
      'ingredient_text_hash', v_ingredient_hash
    ),
    jsonb_build_object(
      'target_tcin', '1003611534',
      'target_upc', '038100130549',
      'seller', 'Jupiter Sales',
      'front_image_url', v_image_url,
      'ingredients_verbatim_from_exact_pdp', true
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

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key, alias_text, normalized_alias, source_url, source_authority,
    evidence_observed_at, provenance, active, created_at, updated_at
  ) VALUES (
    v_cache_key,
    'Purina Pro Plan Shredded Blend 6 lb Chicken & Rice Flavor Adult Dry Dog Food',
    public.normalize_verified_product_search_query(
      'Purina Pro Plan Shredded Blend 6 lb Chicken & Rice Flavor Adult Dry Dog Food'
    ),
    v_source_url,
    'retailer_verified',
    v_observed_at,
    jsonb_build_object(
      'evidence_tier', 'retailer_web_version',
      'package_gtin', '038100130549',
      'product_code', 'TCIN 1003611534',
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
    '038100130549',
    'Purina Pro Plan Adult Shredded Blend Chicken & Rice Flavor Dry Dog Food',
    'Purina Pro Plan',
    'dog',
    'target-plus-exact-package-manual',
    'retailer_verified',
    v_source_url,
    v_source_url,
    v_image_url,
    'retailer_verified',
    'retailer_verified',
    encode(digest(v_source_url || '|038100130549', 'sha256'), 'hex'),
    encode(digest(v_ingredient_hash || '|' || v_image_url, 'sha256'), 'hex'),
    '2026-07-26-source-versioned-web-label-v3',
    'promoted',
    NULL,
    jsonb_build_object(
      'formula_evidence_tier', 'retailer_web_version',
      'target_tcin', '1003611534',
      'package_gtin', '038100130549',
      'package_size', '6.06 lb',
      'seller', 'Jupiter Sales',
      'manufacturer_current_equivalence', false,
      'captured_at', v_observed_at,
      'ingredient_text_hash', v_ingredient_hash
    ),
    now()
  )
  ON CONFLICT DO NOTHING;

  IF (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('038100130549', 8)
    WHERE cache_key = v_cache_key
      AND nutritional_info->>'formula_evidence_tier' =
        'retailer_web_version'
  ) <> 1 THEN
    RAISE EXCEPTION
      'Target Pro Plan exact barcode did not resolve its source version';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE gtin = '038100130549'
      AND formula_id = (
        SELECT id
        FROM public.catalog_formulas
        WHERE promoted_cache_key = 'nestle-purina-pro-plan:038100101686'
      )
  ) THEN
    RAISE EXCEPTION
      'Target Pro Plan source version was merged into manufacturer current';
  END IF;

  IF (
    SELECT cache_key
    FROM public.search_verified_products(
      'Purina Pro Plan Shredded Blend 6 lb Chicken Rice Flavor Adult Dry Dog Food',
      1
    )
    LIMIT 1
  ) IS DISTINCT FROM v_cache_key THEN
    RAISE EXCEPTION
      'Target Pro Plan exact package search did not rank first';
  END IF;
END;
$$;
