-- Preserve Beneful Healthy Puppy Purina label code P409324 as its own
-- exact source version. The official PDP still exposes a materially different
-- older ingredient formula, and PetSmart preserves another older 14 lb
-- package version. Exact-name search can use the label version; reused GTINs
-- abstain until a package version can be distinguished safely.

DO $$
DECLARE
  v_formula_id BIGINT;
  v_run_id BIGINT;
  v_primary_cache_key TEXT;
  v_formula_key TEXT :=
    'beneful|beneful|healthy dry with real farm raised|dog|puppy|dry|chicken|';
  v_run_key TEXT :=
    'nestle-purina-beneful:bounded-exact-evidence:ff4a27e69fac163d145f1047';
  v_primary_source_id TEXT :=
    'nestle-purina-beneful:healthy-puppy-p409324-017800101639';
  v_large_source_id TEXT :=
    'nestle-purina-beneful:healthy-puppy-p409324-017800184519';
  v_pdp_url TEXT :=
    'https://www.purina.com/dogs/shop/beneful-healthy-puppy-chicken-dry-dog-food';
  v_label_url TEXT :=
    'https://www.purina.com/sites/default/files/product-label-deck-file/2025-03/4093_p409324_beneful_healthy_puppy_w_farm-raised_chicken_dry_dog_food_su1.pdf';
  v_image_url TEXT :=
    'https://www.purina.com/sites/default/files/products/2025-03/purina-beneful-healthy-puppy-dry-food-bag.jpg';
  v_observed_at TIMESTAMPTZ := '2026-08-04T12:06:02.705Z';
  v_ingredients TEXT :=
    'Chicken, whole grain corn, chicken by-product meal, soybean meal, corn protein meal, barley, rice, whole grain wheat, beef fat preserved with mixed-tocopherols, egg and chicken flavor, natural flavor, fish oil, mono and dicalcium phosphate, salt, calcium carbonate, glycerin, dried peas, dried carrots, annatto color, vegetable juice (color), choline chloride, MINERALS [zinc sulfate, ferrous sulfate, manganese sulfate, copper sulfate, calcium iodate, sodium selenite], VITAMINS [Vitamin E supplement, niacin (Vitamin B-3), Vitamin A supplement, calcium pantothenate (Vitamin B-5), thiamine mononitrate (Vitamin B-1), pyridoxine hydrochloride (Vitamin B-6), riboflavin supplement (Vitamin B-2), Vitamin B-12 supplement, folic acid (Vitamin B-9), menadione sodium bisulfite complex (Vitamin K), biotin (Vitamin B-7), Vitamin D-3 supplement], potassium chloride, L-Threonine, carmine.';
  v_ingredient_hash TEXT;
  v_current_provenance JSONB;
  v_legacy_provenance JSONB;
  v_legacy public.product_data%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_legacy
  FROM public.product_data
  WHERE cache_key = 'nestle-purina-beneful:017800101639'
    AND gtin = '017800101639'
    AND source_url = v_pdp_url
    AND catalog_exclusion_reason =
      'official_manufacturer_formula_version_conflict_page_vs_linked_pdf';

  IF public.catalog_normalize_ingredient_evidence(v_legacy.ingredient_text) =
     public.catalog_normalize_ingredient_evidence(v_ingredients) THEN
    RAISE EXCEPTION 'Beneful PDP/P409324 conflict unexpectedly disappeared';
  END IF;

  v_ingredient_hash := encode(
    digest(public.catalog_normalize_ingredient_evidence(v_ingredients), 'sha256'),
    'hex'
  );
  v_current_provenance := jsonb_build_object(
    'version_status', 'source_versioned_official_label',
    'manufacturer_current_equivalence', FALSE,
    'manufacturer_pdp_ingredient_conflict', TRUE,
    'source', 'Purina official March 2025 package label deck',
    'source_url', v_pdp_url,
    'ingredient_source_url', v_label_url,
    'image_source_url', v_image_url,
    'captured_at', v_observed_at,
    'label_code', 'P409324',
    'ingredient_text_hash', v_ingredient_hash,
    'canonical_formula_key', v_formula_key,
    'package_size_is_sku_only', TRUE,
    'allow_reused_gtin_version', TRUE,
    'gtin_resolution_policy', 'abstain_on_version_conflict'
  );
  v_legacy_provenance := jsonb_build_object(
    'version_status', 'legacy_manufacturer_page_version',
    'manufacturer_current_equivalence', FALSE,
    'source', 'Purina official product-page ingredient version',
    'source_url', v_pdp_url,
    'captured_at', v_legacy.verified_at,
    'superseded_by_label_code', 'P409324',
    'superseding_ingredient_source_url', v_label_url,
    'gtin_resolution_policy', 'abstain_on_version_conflict'
  );

  -- The staging contract accepts ingredient evidence only when it agrees with
  -- the canonical formula row. Switch the quarantined formula to the exact
  -- P409324 version inside this transaction before staging its accepted
  -- evidence; any later failure rolls this update back with the whole batch.
  SELECT id INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_formula_key;

  UPDATE public.catalog_formulas
  SET manufacturer = 'Beneful',
      brand = 'Beneful',
      product_name =
        'Beneful Healthy Puppy Dry Dog Food with Real Farm-Raised Chicken',
      product_line = 'Healthy Dry with Real Farm-Raised',
      pet_type = 'dog',
      life_stage = 'puppy',
      food_form = 'dry',
      flavor = 'Chicken',
      diet_condition = '',
      is_complete_food = TRUE,
      ingredient_text = v_ingredients,
      ingredients = public.catalog_split_ingredient_statement(v_ingredients),
      front_image_url = v_image_url,
      source_url = v_pdp_url,
      source_authority = 'manufacturer',
      ingredient_verification_status = 'label_ocr_verified',
      image_verification_status = 'manufacturer',
      verification_status = 'verified',
      active = TRUE,
      formula_evidence_tier = 'web_label_version',
      formula_version_provenance = v_current_provenance,
      last_observed_at = v_observed_at,
      updated_at = now()
  WHERE id = v_formula_id;

  PERFORM public.stage_catalog_census_batch(
    jsonb_build_object(
      'run_key', v_run_key,
      'source_slug', 'nestle-purina-beneful',
      'source_type', 'manufacturer',
      'coverage_role', 'verification',
      'status', 'completed',
      'started_at', v_observed_at,
      'expected_count', 1,
      'pagination_complete', FALSE,
      'truncated', FALSE,
      'cap_reached', FALSE,
      'source_content_hash',
        'ff4a27e69fac163d145f10478cebb7b484f8364b6041135fded525cf3ae4f630',
      'checkpoint', jsonb_build_object(
        'feed_row_count', 1,
        'accepted_observation_count', 1,
        'canonical_formula_count', 1
      ),
      'metadata', jsonb_build_object(
        'brand', 'Beneful',
        'manufacturer', 'Beneful',
        'source_authority', 'manufacturer',
        'exact_formula_evidence', TRUE,
        'package_size_is_sku_only', TRUE,
        'bounded_exact_evidence', TRUE,
        'official_inventory_full', FALSE,
        'source_feed_row_count', 2,
        'brand_scoped_feed_row_count', 2,
        'serving_evidence_include_count', 1,
        'sku_only_observation_count', 0,
        'sku_only_observation_cache_keys', '[]'::JSONB,
        'current_official_sku_cache_keys',
          jsonb_build_array(v_primary_source_id),
        'current_serving_cache_keys', jsonb_build_array(v_primary_source_id)
      )
    ),
    jsonb_build_array(
      jsonb_build_object(
        'formula_key', v_formula_key,
        'identity_hash',
          '491d64bd8cbaa61236a61097aeeb82059b612ed07559f8bf0a57db56ea2619e6',
        'manufacturer', 'Beneful',
        'brand', 'Beneful',
        'product_name',
          'Beneful Healthy Puppy Dry Dog Food with Real Farm-Raised Chicken',
        'product_line', 'Healthy Dry with Real Farm-Raised',
        'pet_type', 'dog',
        'life_stage', 'puppy',
        'food_form', 'dry',
        'flavor', 'Chicken',
        'diet_condition', '',
        'source_slug', 'nestle-purina-beneful',
        'source_external_id', v_primary_source_id,
        'source_url', v_pdp_url,
        'source_authority', 'manufacturer',
        'gtin', '017800101639',
        'package_size', '3.5 lb',
        'ingredient_text', v_ingredients,
        'ingredients', to_jsonb(
          public.catalog_split_ingredient_statement(v_ingredients)
        ),
        'front_image_url', v_image_url,
        'is_complete_food', TRUE,
        'available_in_us', TRUE,
        'protected_terms', jsonb_build_array(
          'Beneful', 'Healthy Puppy', 'Farm-Raised Chicken',
          'dog', 'puppy', 'dry', 'P409324'
        ),
        'observed_at', v_observed_at,
        'content_hash', encode(digest(
          v_formula_key || '|017800101639|' || v_ingredient_hash || '|' ||
          v_image_url,
          'sha256'
        ), 'hex'),
        'validation_status', 'accepted',
        'validation_reasons', '[]'::JSONB,
        'ingredient_verification_status', 'label_ocr_verified',
        'image_verification_status', 'manufacturer',
        'coverage_tier', 'tier_1_us_retail',
        'raw_payload', jsonb_build_object(
          'cache_key', v_primary_source_id,
          'ingredient_source_url', v_label_url,
          'image_source_url', v_image_url,
          'label_code', 'P409324',
          'exact_formula_evidence', TRUE,
          'package_size_is_sku_only', TRUE,
          'manufacturer_pdp_ingredient_conflict', TRUE
        )
      )
    )
  );

  SELECT id INTO STRICT v_run_id
  FROM public.catalog_source_runs
  WHERE run_key = v_run_key;

  SELECT id INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_formula_key;

  UPDATE public.catalog_formulas
  SET manufacturer = 'Beneful',
      brand = 'Beneful',
      product_name =
        'Beneful Healthy Puppy Dry Dog Food with Real Farm-Raised Chicken',
      product_line = 'Healthy Dry with Real Farm-Raised',
      pet_type = 'dog',
      life_stage = 'puppy',
      food_form = 'dry',
      flavor = 'Chicken',
      diet_condition = '',
      is_complete_food = TRUE,
      complete_food_evidence =
        'Purina official label deck P409324 provides a growth/reproduction AAFCO adequacy statement for this puppy formula.',
      ingredient_text = v_ingredients,
      ingredients = public.catalog_split_ingredient_statement(v_ingredients),
      front_image_url = v_image_url,
      source_url = v_pdp_url,
      source_authority = 'manufacturer',
      ingredient_verification_status = 'label_ocr_verified',
      image_verification_status = 'manufacturer',
      protected_terms = ARRAY[
        'Beneful', 'Healthy Puppy', 'Farm-Raised Chicken',
        'dog', 'puppy', 'dry', 'P409324'
      ]::TEXT[],
      verification_status = 'verified',
      active = TRUE,
      is_popular_brand = TRUE,
      absent_since = NULL,
      formula_evidence_tier = 'web_label_version',
      formula_version_provenance = v_current_provenance,
      last_observed_at = v_observed_at,
      updated_at = now()
  WHERE id = v_formula_id;

  UPDATE public.catalog_observations
  SET formula_evidence_tier = 'web_label_version',
      formula_version_provenance = v_current_provenance ||
        jsonb_build_object(
          'package_gtin', gtin,
          'package_size', package_size
        ),
      raw_payload = COALESCE(raw_payload, '{}'::JSONB) || jsonb_build_object(
        'ingredient_source_url', v_label_url,
        'image_source_url', v_image_url,
        'label_code', 'P409324',
        'manufacturer_pdp_ingredient_conflict', TRUE
      )
  WHERE run_id = v_run_id
    AND formula_id = v_formula_id
    AND gtin IN ('017800101639', '017800184519');

  INSERT INTO public.catalog_field_evidence (
    formula_id, observation_id, field_name, field_value, source_url,
    source_authority, accepted, observed_at, content_hash
  )
  SELECT
    v_formula_id,
    observation.id,
    evidence.field_name,
    evidence.field_value,
    evidence.source_url,
    'manufacturer',
    TRUE,
    v_observed_at,
    encode(digest(
      v_formula_id::TEXT || '|' || evidence.field_name || '|' ||
      evidence.source_url || '|' || evidence.field_value::TEXT,
      'sha256'
    ), 'hex')
  FROM public.catalog_observations observation
  CROSS JOIN LATERAL (VALUES
    ('ingredient_text', to_jsonb(v_ingredients), v_label_url),
    ('front_image_url', to_jsonb(v_image_url), v_image_url),
    ('complete_food_evidence', to_jsonb(
      'Purina official label deck P409324: AAFCO growth/reproduction adequacy statement.'::TEXT
    ), v_label_url)
  ) AS evidence(field_name, field_value, source_url)
  WHERE observation.run_id = v_run_id
    AND observation.formula_id = v_formula_id
    AND observation.gtin = '017800101639'
  ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
  SET observation_id = excluded.observation_id,
      field_value = excluded.field_value,
      source_authority = excluded.source_authority,
      accepted = TRUE,
      observed_at = excluded.observed_at;

  PERFORM * FROM public.promote_catalog_formula(v_formula_id);

  SELECT promoted_cache_key INTO STRICT v_primary_cache_key
  FROM public.catalog_formulas
  WHERE id = v_formula_id;

  IF v_primary_cache_key IS NULL
     OR v_primary_cache_key NOT LIKE 'census-version:%' THEN
    RAISE EXCEPTION 'Unexpected Beneful P409324 promoted cache key: %',
      v_primary_cache_key;
  END IF;

  PERFORM *
  FROM public.upsert_catalog_product_feed(jsonb_build_array(
    jsonb_build_object(
      'cache_key', v_large_source_id,
      'product_name',
        'Beneful Healthy Puppy Dry Dog Food with Real Farm-Raised Chicken',
      'brand', 'Beneful',
      'gtin', '017800184519',
      'product_line', 'Healthy Dry with Real Farm-Raised',
      'flavor', 'Chicken',
      'life_stage', 'puppy',
      'food_form', 'dry',
      'package_size', '14 lb',
      'pet_type', 'dog',
      'ingredients', to_jsonb(
        public.catalog_split_ingredient_statement(v_ingredients)
      ),
      'ingredient_text', v_ingredients,
      'source', 'nestle-purina-beneful',
      'source_quality', 'manufacturer',
      'ingredient_verification_status', 'label_ocr_verified',
      'image_verification_status', 'manufacturer',
      'verified_at', v_observed_at,
      'source_url', v_pdp_url,
      'scraped_at', v_observed_at,
      'expires_at', v_observed_at + INTERVAL '365 days',
      'image_url', v_image_url,
      'is_complete_food', TRUE,
      'formula_evidence_tier', 'web_label_version',
      'formula_version_provenance', v_current_provenance ||
        jsonb_build_object(
          'package_gtin', '017800184519',
          'package_size', '14 lb'
        )
    )
  ));

  UPDATE public.product_data current_version
  SET source_quality = 'manufacturer',
      ingredient_verification_status = 'label_ocr_verified',
      image_verification_status = 'manufacturer',
      is_complete_food = TRUE,
      catalog_exclusion_reason = NULL,
      formula_evidence_tier = 'web_label_version',
      formula_version_provenance = v_current_provenance ||
        jsonb_build_object(
          'package_gtin', package.gtin,
          'package_size', package.package_size
        ),
      updated_at = now()
  FROM (VALUES
    (v_primary_cache_key, '017800101639', '3.5 lb'),
    (v_large_source_id, '017800184519', '14 lb')
  ) AS package(cache_key, gtin, package_size)
  WHERE current_version.cache_key = package.cache_key
    AND current_version.gtin = package.gtin
    AND current_version.source_url = v_pdp_url
    AND current_version.image_url = v_image_url
    AND public.catalog_normalize_ingredient_evidence(
          current_version.ingredient_text
        ) = public.catalog_normalize_ingredient_evidence(v_ingredients);

  -- Promotion replaces stale same-source rows for a GTIN. Restore the exact
  -- official PDP ingredient version under its original cache key before
  -- classifying it as a separate source version.
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data legacy
    WHERE legacy.cache_key = v_legacy.cache_key
  ) THEN
    INSERT INTO public.product_data (
      id, cache_key, product_name, brand, ingredients, ingredient_text,
      ingredient_count, nutritional_info, source, source_url, scraped_at,
      expires_at, created_at, updated_at, image_url, nutrient_panel,
      has_published_nutrients, is_complete_food, catalog_exclusion_reason,
      pet_type, source_quality, ingredient_verification_status,
      image_verification_status, verified_at, gtin, product_line, flavor,
      life_stage, food_form, package_size, formula_evidence_tier,
      formula_version_provenance
    ) VALUES (
      v_legacy.id, v_legacy.cache_key, v_legacy.product_name, v_legacy.brand,
      v_legacy.ingredients, v_legacy.ingredient_text,
      v_legacy.ingredient_count, v_legacy.nutritional_info, v_legacy.source,
      v_legacy.source_url, v_legacy.scraped_at, v_legacy.expires_at,
      v_legacy.created_at, v_legacy.updated_at, v_legacy.image_url,
      v_legacy.nutrient_panel, v_legacy.has_published_nutrients,
      v_legacy.is_complete_food, v_legacy.catalog_exclusion_reason,
      v_legacy.pet_type, v_legacy.source_quality,
      v_legacy.ingredient_verification_status,
      v_legacy.image_verification_status, v_legacy.verified_at,
      v_legacy.gtin, v_legacy.product_line, v_legacy.flavor,
      v_legacy.life_stage, v_legacy.food_form, v_legacy.package_size,
      v_legacy.formula_evidence_tier, v_legacy.formula_version_provenance
    )
    ON CONFLICT (cache_key) DO NOTHING;
  END IF;

  UPDATE public.product_data legacy
  SET is_complete_food = TRUE,
      catalog_exclusion_reason = NULL,
      source_quality = 'manufacturer',
      ingredient_verification_status = 'manufacturer',
      image_verification_status = 'manufacturer',
      formula_evidence_tier = 'web_label_version',
      formula_version_provenance = v_legacy_provenance,
      updated_at = now()
  WHERE legacy.cache_key = v_legacy.cache_key
    AND legacy.gtin = v_legacy.gtin
    AND legacy.source_url = v_pdp_url
    AND public.catalog_normalize_ingredient_evidence(legacy.ingredient_text) =
        public.catalog_normalize_ingredient_evidence(v_legacy.ingredient_text);

  IF (
    SELECT count(*)
    FROM public.product_data serving
    WHERE serving.cache_key IN (v_primary_cache_key, v_large_source_id)
      AND serving.formula_evidence_tier = 'web_label_version'
      AND serving.formula_version_provenance
            ->>'canonical_formula_key' = v_formula_key
      AND serving.formula_version_provenance
            ->>'gtin_resolution_policy' = 'abstain_on_version_conflict'
      AND public.catalog_normalize_ingredient_evidence(
            serving.ingredient_text
          ) = public.catalog_normalize_ingredient_evidence(v_ingredients)
  ) <> 2 THEN
    RAISE EXCEPTION 'Beneful P409324 exact package versions were not preserved';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data legacy
    WHERE legacy.cache_key = v_legacy.cache_key
      AND legacy.formula_evidence_tier = 'web_label_version'
      AND legacy.formula_version_provenance
            ->>'version_status' = 'legacy_manufacturer_page_version'
      AND public.catalog_normalize_ingredient_evidence(
            legacy.ingredient_text
          ) <> public.catalog_normalize_ingredient_evidence(v_ingredients)
  ) THEN
    RAISE EXCEPTION 'Beneful legacy manufacturer page version was not preserved';
  END IF;

  -- The 14 lb GTIN is already bound to a different PetSmart ingredient
  -- version, so the generic stage guard correctly refuses to relink it.
  -- Record the exact P409324 package observation only after both source
  -- versions exist and the conflict-safe serving provenance is established.
  INSERT INTO public.catalog_observations (
    run_id, formula_id, source_slug, source_external_id, source_url,
    source_authority, gtin, manufacturer, brand, product_name, product_line,
    pet_type, life_stage, food_form, flavor, diet_condition, package_size,
    ingredient_text, front_image_url, is_complete_food, available_in_us,
    observed_at, content_hash, validation_status, validation_reasons,
    formula_evidence_tier, formula_version_provenance, raw_payload
  ) VALUES (
    v_run_id,
    v_formula_id,
    'nestle-purina-beneful',
    v_large_source_id,
    v_pdp_url,
    'manufacturer',
    '017800184519',
    'Beneful',
    'Beneful',
    'Beneful Healthy Puppy Dry Dog Food with Real Farm-Raised Chicken',
    'Healthy Dry with Real Farm-Raised',
    'dog',
    'puppy',
    'dry',
    'Chicken',
    '',
    '14 lb',
    v_ingredients,
    v_image_url,
    TRUE,
    TRUE,
    v_observed_at,
    encode(digest(
      v_formula_key || '|017800184519|' || v_ingredient_hash || '|' ||
      v_image_url,
      'sha256'
    ), 'hex'),
    'accepted',
    ARRAY[]::TEXT[],
    'web_label_version',
    v_current_provenance || jsonb_build_object(
      'package_gtin', '017800184519',
      'package_size', '14 lb'
    ),
    jsonb_build_object(
      'cache_key', v_large_source_id,
      'ingredient_source_url', v_label_url,
      'image_source_url', v_image_url,
      'label_code', 'P409324',
      'exact_formula_evidence', TRUE,
      'package_size_is_sku_only', TRUE,
      'manufacturer_pdp_ingredient_conflict', TRUE,
      'reused_gtin_version_preserved', TRUE
    )
  )
  ON CONFLICT (run_id, source_slug, source_external_id, content_hash) DO UPDATE
  SET formula_id = excluded.formula_id,
      source_url = excluded.source_url,
      source_authority = excluded.source_authority,
      gtin = excluded.gtin,
      package_size = excluded.package_size,
      ingredient_text = excluded.ingredient_text,
      front_image_url = excluded.front_image_url,
      validation_status = 'accepted',
      validation_reasons = ARRAY[]::TEXT[],
      formula_evidence_tier = excluded.formula_evidence_tier,
      formula_version_provenance = excluded.formula_version_provenance,
      raw_payload = excluded.raw_payload,
      observed_at = excluded.observed_at;

  UPDATE public.catalog_source_runs
  SET expected_count = 2,
      observed_count = 2,
      accepted_count = 2,
      rejected_count = 0,
      checkpoint = COALESCE(checkpoint, '{}'::JSONB) || jsonb_build_object(
        'feed_row_count', 2,
        'accepted_observation_count', 2,
        'canonical_formula_count', 1
      ),
      metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
        'all_published_gtins_staged', TRUE,
        'published_gtins', jsonb_build_array(
          '017800101639', '017800184519'
        ),
        'formula_evidence_tier', 'web_label_version',
        'manufacturer_pdp_ingredient_conflict', TRUE,
        'gtin_resolution_policy', 'abstain_on_version_conflict'
      ),
      updated_at = now()
  WHERE id = v_run_id;

  INSERT INTO public.catalog_skus (
    formula_id, gtin, package_size, package_count, source_slug,
    source_external_id, source_url, active, first_observed_at,
    last_observed_at, updated_at
  )
  SELECT
    v_formula_id,
    package.gtin,
    package.package_size,
    1,
    'nestle-purina-beneful',
    package.source_external_id,
    v_pdp_url,
    TRUE,
    v_observed_at,
    v_observed_at,
    now()
  FROM (VALUES
    ('017800101639', '3.5 lb', v_primary_source_id),
    ('017800184519', '14 lb', v_large_source_id)
  ) AS package(gtin, package_size, source_external_id)
  ON CONFLICT (source_slug, source_external_id, gtin, package_size) DO UPDATE
  SET formula_id = excluded.formula_id,
      source_url = excluded.source_url,
      active = TRUE,
      last_observed_at = excluded.last_observed_at,
      updated_at = now();

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key, alias_text, normalized_alias, source_url, source_authority,
    evidence_observed_at, provenance, active, created_at, updated_at
  ) VALUES (
    v_primary_cache_key,
    'Beneful Healthy Puppy Dry Dog Food with Real Farm-Raised Chicken',
    public.normalize_verified_product_search_query(
      'Beneful Healthy Puppy Dry Dog Food with Real Farm-Raised Chicken'
    ),
    v_pdp_url,
    'manufacturer',
    v_observed_at,
    v_current_provenance,
    TRUE,
    now(),
    now()
  )
  ON CONFLICT (normalized_alias) WHERE active DO UPDATE
  SET cache_key = excluded.cache_key,
      alias_text = excluded.alias_text,
      source_url = excluded.source_url,
      source_authority = excluded.source_authority,
      evidence_observed_at = excluded.evidence_observed_at,
      provenance = excluded.provenance,
      updated_at = now();

  INSERT INTO public.catalog_product_evidence (
    cache_key, gtin, product_name, brand, pet_type, source, source_quality,
    source_url, ingredient_source_url, image_source_url,
    ingredient_verification_status, image_verification_status,
    raw_source_hash, content_hash, extractor_version, review_state,
    rejection_reason, evidence, updated_at
  ) VALUES (
    v_primary_cache_key,
    '017800101639',
    'Beneful Healthy Puppy Dry Dog Food with Real Farm-Raised Chicken',
    'Beneful',
    'dog',
    'nestle-purina-beneful',
    'manufacturer',
    v_pdp_url,
    v_label_url,
    v_image_url,
    'label_ocr_verified',
    'manufacturer',
    encode(digest(v_label_url || '|P409324', 'sha256'), 'hex'),
    encode(digest(v_ingredient_hash || '|' || v_image_url, 'sha256'), 'hex'),
    '2026-08-04-official-label-source-version-v1',
    'promoted',
    NULL,
    v_current_provenance || jsonb_build_object(
      'published_gtins', jsonb_build_array(
        '017800101639', '017800184519'
      )
    ),
    now()
  )
  ON CONFLICT DO NOTHING;

  IF (
    SELECT count(*)
    FROM public.catalog_skus
    WHERE formula_id = v_formula_id
      AND active
      AND gtin IN ('017800101639', '017800184519')
  ) <> 2 THEN
    RAISE EXCEPTION 'Beneful P409324 is missing exact package SKUs';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin('017800101639', 8)
  ) OR EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin('017800184519', 8)
  ) THEN
    RAISE EXCEPTION 'Beneful reused GTIN did not abstain on version conflict';
  END IF;

  IF (
    SELECT cache_key
    FROM public.search_verified_products(
      'Beneful Healthy Puppy Dry Dog Food with Real Farm-Raised Chicken',
      1
    )
    LIMIT 1
  ) IS DISTINCT FROM v_primary_cache_key THEN
    RAISE EXCEPTION 'Beneful P409324 exact-name search did not rank first';
  END IF;
END;
$$;
