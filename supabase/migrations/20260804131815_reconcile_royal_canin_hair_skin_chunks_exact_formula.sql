-- Reconcile Royal Canin Hair & Skin Care Chunks in Gravy from the historically
-- over-broad Feline Care Nutrition wet formula. The current and legacy
-- official pages publish the same GTIN and normalized ingredient statement,
-- but the old observation/SKU was attached to a formula that also owns
-- unrelated Digestive, Urinary, Weight, and Appetite Care evidence.
--
-- This migration stages the exact current package first, moves only the one
-- Hair & Skin observation/SKU selected by URL + GTIN + ingredient hash, and
-- promotes through the existing gated catalog path. No sibling evidence is
-- copied and the broad historical formula remains intact for later repair.

DO $migration$
DECLARE
  v_run_key CONSTANT TEXT :=
    'royal-canin:bounded-exact-evidence:hair-skin-chunks-gravy:20260804:v1';
  v_current_cache CONSTANT TEXT :=
    'royal-canin-mars-petcare:1053796:030111152855';
  v_legacy_cache CONSTANT TEXT :=
    'royal-canin-mars-petcare:976267:030111152855';
  v_current_url CONSTANT TEXT :=
    'https://www.royalcanin.com/us/cats/products/retail-products/hair&skin-care-chunks-in-gravy-4071';
  v_legacy_url CONSTANT TEXT :=
    'https://www.royalcanin.com/us/cats/products/retail-products/intense-beauty-gravy-4071';
  v_current_image CONSTANT TEXT :=
    'https://cdn.royalcanin-weshare-online.io/_FYcoIcBBKJuub5qYfou/v20/00030111152855-cf';
  v_legacy_image CONSTANT TEXT :=
    'https://cdn.royalcanin-weshare-online.io/LVbWU4QBBKJuub5qtPEq/v49/fcn-intense-beauty-3-oz-pouch-p715285b-030111152855';
  v_gtin CONSTANT TEXT := '030111152855';
  v_formula_key CONSTANT TEXT :=
    'royal canin|royal canin|hair and skin care chunks in gravy pouch|cat|adult|wet||';
  v_identity_hash CONSTANT TEXT :=
    'c13a8c8717f4058811d7896777293575a6adb1e9c010300557297b38710be78c';
  v_expected_ingredient_hash CONSTANT TEXT :=
    '452f0b86c199086a96fc577f881511bc14aa539a7d001729cf99099e19354481';
  v_current public.product_data%ROWTYPE;
  v_legacy public.product_data%ROWTYPE;
  v_broad_formula_id BIGINT;
  v_formula_id BIGINT;
  v_legacy_observation_id BIGINT;
  v_legacy_sku_id BIGINT;
  v_run_id BIGINT;
  v_broad_observation_count_before INTEGER;
  v_broad_sku_count_before INTEGER;
  v_payload JSONB;
  v_observed_at TIMESTAMPTZ;
  v_top_cache TEXT;
  v_barcode_cache TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.catalog_source_runs WHERE run_key = v_run_key
  ) THEN
    RAISE EXCEPTION 'Royal Canin Hair & Skin exact run already exists';
  END IF;

  SELECT * INTO STRICT v_current
  FROM public.product_data
  WHERE cache_key = v_current_cache
    AND gtin = v_gtin
    AND brand = 'Royal Canin'
    AND pet_type = 'cat'
    AND food_form = 'wet'
    AND product_name = 'Hair & Skin Care Chunks in gravy pouch'
    AND product_line = 'Feline Care Nutrition'
    AND source = 'royal-canin-mars-petcare'
    AND source_quality = 'manufacturer'
    AND source_url = v_current_url
    AND image_url = v_current_image
    AND is_complete_food
    AND catalog_exclusion_reason IS NULL
    AND ingredient_verification_status = 'manufacturer'
    AND image_verification_status = 'manufacturer'
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND ingredient_count = 45
    AND encode(digest(
      public.catalog_normalize_ingredient_evidence(ingredient_text),
      'sha256'
    ), 'hex') = v_expected_ingredient_hash;

  SELECT * INTO STRICT v_legacy
  FROM public.product_data
  WHERE cache_key = v_legacy_cache
    AND gtin = v_gtin
    AND brand = 'Royal Canin'
    AND pet_type = 'cat'
    AND food_form = 'wet'
    AND source_url = v_legacy_url
    AND image_url = v_legacy_image
    AND NOT is_complete_food
    AND catalog_exclusion_reason =
      'duplicate_canonical_gtin_verified_catalog_row'
    AND encode(digest(
      public.catalog_normalize_ingredient_evidence(ingredient_text),
      'sha256'
    ), 'hex') = v_expected_ingredient_hash;

  SELECT id INTO STRICT v_broad_formula_id
  FROM public.catalog_formulas
  WHERE id = 8765
    AND formula_key =
      'royal canin|royal canin|feline care nutrition|cat|unknown|wet||'
    AND verification_status = 'verified'
    AND active
    AND product_name ILIKE '%Digestive Care%'
    AND public.catalog_normalize_ingredient_evidence(ingredient_text) <>
        public.catalog_normalize_ingredient_evidence(v_current.ingredient_text);

  SELECT id INTO STRICT v_legacy_observation_id
  FROM public.catalog_observations
  WHERE formula_id = v_broad_formula_id
    AND source_external_id = v_legacy_cache
    AND source_url = v_legacy_url
    AND gtin = v_gtin
    AND product_name = 'Hair & Skin Care Chunks In Gravy Pouch'
    AND validation_status = 'accepted'
    AND encode(digest(
      public.catalog_normalize_ingredient_evidence(ingredient_text),
      'sha256'
    ), 'hex') = v_expected_ingredient_hash;

  SELECT id INTO STRICT v_legacy_sku_id
  FROM public.catalog_skus
  WHERE formula_id = v_broad_formula_id
    AND gtin = v_gtin
    AND source_external_id = v_legacy_cache
    AND source_url = v_legacy_url
    AND active;

  SELECT count(*) INTO v_broad_observation_count_before
  FROM public.catalog_observations
  WHERE formula_id = v_broad_formula_id;

  SELECT count(*) INTO v_broad_sku_count_before
  FROM public.catalog_skus
  WHERE formula_id = v_broad_formula_id;

  IF EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE formula_key = v_formula_key
  ) OR v_broad_observation_count_before < 2 OR v_broad_sku_count_before < 2
  THEN
    RAISE EXCEPTION 'Royal Canin Hair & Skin split baseline changed';
  END IF;

  v_observed_at := COALESCE(
    v_current.verified_at,
    v_current.scraped_at,
    NOW()
  );

  v_payload := jsonb_build_array(jsonb_build_object(
    'formula_key', v_formula_key,
    'identity_hash', v_identity_hash,
    'manufacturer', 'Royal Canin',
    'brand', 'Royal Canin',
    'product_name', 'Hair & Skin Care Chunks in Gravy Pouch',
    'product_line', 'Hair & Skin Care Chunks in Gravy Pouch',
    'pet_type', 'cat',
    'life_stage', 'adult',
    'food_form', 'wet',
    'flavor', '',
    'diet_condition', '',
    'source_slug', 'royal-canin-mars-petcare',
    'source_external_id', v_current_cache,
    'source_url', v_current_url,
    'source_authority', 'manufacturer',
    'gtin', v_gtin,
    'package_size', '85 g pouch',
    'ingredient_text', v_current.ingredient_text,
    'ingredients', to_jsonb(v_current.ingredients),
    'front_image_url', v_current_image,
    'is_complete_food', TRUE,
    'available_in_us', TRUE,
    'protected_terms', jsonb_build_array(
      'Royal Canin', 'Hair & Skin Care', 'Chunks in Gravy', 'Pouch',
      'Feline Care Nutrition', 'cat', 'adult', 'wet'
    ),
    'observed_at', v_observed_at,
    'content_hash', encode(digest(
      v_formula_key || '|' || v_gtin || '|' ||
      v_expected_ingredient_hash || '|' || v_current_image,
      'sha256'
    ), 'hex'),
    'validation_status', 'accepted',
    'validation_reasons', '[]'::JSONB,
    'ingredient_verification_status', 'manufacturer',
    'image_verification_status', 'manufacturer',
    'coverage_tier', 'tier_1_us_retail',
    'formula_evidence_tier', 'manufacturer_current_exact',
    'formula_version_provenance', jsonb_build_object(
      'version_status', 'manufacturer_current',
      'source', 'royal-canin-mars-petcare',
      'source_url', v_current_url,
      'legacy_source_url', v_legacy_url,
      'captured_at', v_observed_at,
      'package_gtin', v_gtin,
      'ingredient_text_hash', v_expected_ingredient_hash,
      'legacy_ingredient_text_hash', v_expected_ingredient_hash,
      'same_gtin', TRUE,
      'normalized_ingredient_equality', TRUE,
      'legacy_and_current_package_images_preserved', TRUE,
      'package_size_is_sku_only', TRUE,
      'canonical_formula_key', v_formula_key
    ),
    'raw_payload', jsonb_build_object(
      'cache_key', v_current_cache,
      'ingredient_source_url', v_current_url,
      'image_source_url', v_current_image,
      'official_legacy_url', v_legacy_url,
      'official_legacy_image_url', v_legacy_image,
      'exact_formula_evidence', TRUE,
      'package_size_is_sku_only', TRUE,
      'canonical_formula_key', v_formula_key
    )
  ));

  PERFORM public.stage_catalog_census_batch(
    jsonb_build_object(
      'run_key', v_run_key,
      'source_slug', 'royal-canin-mars-petcare',
      'source_type', 'manufacturer',
      'coverage_role', 'verification',
      'status', 'completed',
      'started_at', v_observed_at,
      'expected_count', 1,
      'pagination_complete', FALSE,
      'truncated', FALSE,
      'cap_reached', FALSE,
      'source_content_hash', encode(digest(
        v_current_url || '|' || v_expected_ingredient_hash || '|' ||
        v_current_image,
        'sha256'
      ), 'hex'),
      'checkpoint', jsonb_build_object(
        'feed_row_count', 1,
        'accepted_observation_count', 1,
        'canonical_formula_count', 1
      ),
      'metadata', jsonb_build_object(
        'brand', 'Royal Canin',
        'manufacturer', 'Royal Canin',
        'source_authority', 'manufacturer',
        'exact_formula_evidence', TRUE,
        'bounded_exact_evidence', TRUE,
        'official_inventory_full', FALSE,
        'package_size_is_sku_only', TRUE,
        'current_official_sku_cache_keys', jsonb_build_array(v_current_cache),
        'current_serving_cache_keys', jsonb_build_array(v_current_cache)
      )
    ),
    v_payload
  );

  SELECT id INTO STRICT v_run_id
  FROM public.catalog_source_runs
  WHERE run_key = v_run_key
    AND source_slug = 'royal-canin-mars-petcare'
    AND expected_count = 1
    AND observed_count = 1
    AND accepted_count = 1
    AND rejected_count = 0
    AND metadata->>'bounded_exact_evidence' = 'true';

  SELECT id INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_formula_key
    AND identity_hash = v_identity_hash
    AND id <> v_broad_formula_id;

  UPDATE public.catalog_formulas
  SET manufacturer = 'Royal Canin',
      brand = 'Royal Canin',
      product_name = 'Hair & Skin Care Chunks in Gravy Pouch',
      product_line = 'Hair & Skin Care Chunks in Gravy Pouch',
      pet_type = 'cat',
      life_stage = 'adult',
      food_form = 'wet',
      flavor = '',
      diet_condition = '',
      is_complete_food = TRUE,
      complete_food_evidence =
        'Royal Canin official product evidence states complete and balanced nutrition for adult cats and AAFCO maintenance.',
      ingredient_text = v_current.ingredient_text,
      ingredients = v_current.ingredients,
      front_image_url = v_current_image,
      source_url = v_current_url,
      source_authority = 'manufacturer',
      ingredient_verification_status = 'manufacturer',
      image_verification_status = 'manufacturer',
      protected_terms = ARRAY[
        'Royal Canin', 'Hair & Skin Care', 'Chunks in Gravy', 'Pouch',
        'Feline Care Nutrition', 'cat', 'adult', 'wet'
      ]::TEXT[],
      verification_status = 'verified',
      active = TRUE,
      absent_since = NULL,
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance = jsonb_build_object(
        'version_status', 'manufacturer_current',
        'source', 'royal-canin-mars-petcare',
        'source_url', v_current_url,
        'legacy_source_url', v_legacy_url,
        'captured_at', v_observed_at,
        'package_gtin', v_gtin,
        'ingredient_text_hash', v_expected_ingredient_hash,
        'legacy_ingredient_text_hash', v_expected_ingredient_hash,
        'same_gtin', TRUE,
        'normalized_ingredient_equality', TRUE,
        'legacy_and_current_package_images_preserved', TRUE,
        'package_size_is_sku_only', TRUE,
        'canonical_formula_key', v_formula_key
      ),
      last_observed_at = v_observed_at,
      updated_at = NOW()
  WHERE id = v_formula_id;

  UPDATE public.catalog_observations
  SET formula_id = v_formula_id,
      product_name = 'Hair & Skin Care Chunks In Gravy Pouch',
      product_line = 'Hair & Skin Care Chunks in Gravy Pouch',
      pet_type = 'cat',
      life_stage = 'adult',
      food_form = 'wet',
      flavor = '',
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance = jsonb_build_object(
        'version_status', 'manufacturer_legacy_package_same_formula',
        'source', 'royal-canin-mars-petcare',
        'source_url', v_legacy_url,
        'canonical_current_url', v_current_url,
        'package_gtin', v_gtin,
        'ingredient_text_hash', v_expected_ingredient_hash,
        'normalized_ingredient_equality', TRUE,
        'package_size_is_sku_only', TRUE,
        'canonical_formula_key', v_formula_key
      ),
      raw_payload = COALESCE(raw_payload, '{}'::JSONB) || jsonb_build_object(
        'canonical_formula_key', v_formula_key,
        'canonical_current_url', v_current_url,
        'legacy_exact_package_preserved', TRUE,
        'reconciled_at', NOW()
      )
  WHERE id = v_legacy_observation_id
    AND formula_id = v_broad_formula_id;

  UPDATE public.catalog_skus
  SET formula_id = v_formula_id,
      package_size = '85 g pouch',
      active = FALSE,
      last_observed_at = v_observed_at,
      updated_at = NOW()
  WHERE id = v_legacy_sku_id
    AND formula_id = v_broad_formula_id;

  -- Staging created the one active current-package SKU. Keep the legacy SKU
  -- row for provenance, but inactive, so one GTIN never has two active SKU
  -- owners even when the old and current package evidence is equivalent.
  IF (
    SELECT count(*)
    FROM public.catalog_skus
    WHERE formula_id = v_formula_id
      AND gtin = v_gtin
      AND source_external_id = v_current_cache
      AND source_url = v_current_url
      AND active
  ) <> 1 THEN
    RAISE EXCEPTION 'Royal Canin current Hair & Skin SKU was not staged once';
  END IF;

  UPDATE public.catalog_observations
  SET formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        jsonb_build_object(
          'version_status', 'manufacturer_current',
          'source_url', v_current_url,
          'legacy_source_url', v_legacy_url,
          'package_gtin', v_gtin,
          'ingredient_text_hash', v_expected_ingredient_hash,
          'normalized_ingredient_equality', TRUE,
          'canonical_formula_key', v_formula_key
        )
  WHERE run_id = v_run_id
    AND formula_id = v_formula_id
    AND source_external_id = v_current_cache
    AND validation_status = 'accepted';

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
    ('ingredient_text', to_jsonb(v_current.ingredient_text), v_current_url),
    ('front_image_url', to_jsonb(v_current_image), v_current_url),
    ('official_gtin', to_jsonb(v_gtin), v_current_url),
    ('complete_food_evidence', to_jsonb(
      'Complete and balanced nutrition for adult cats; AAFCO maintenance.'::TEXT
    ), v_current_url),
    ('legacy_package_equivalence', jsonb_build_object(
      'legacy_url', v_legacy_url,
      'legacy_image_url', v_legacy_image,
      'current_url', v_current_url,
      'current_image_url', v_current_image,
      'gtin', v_gtin,
      'normalized_ingredient_hash', v_expected_ingredient_hash,
      'same_formula', TRUE
    ), v_legacy_url)
  ) AS evidence(field_name, field_value, source_url)
  WHERE observation.run_id = v_run_id
    AND observation.formula_id = v_formula_id
    AND observation.source_external_id = v_current_cache
  ON CONFLICT (formula_id, field_name, source_url, content_hash)
  DO UPDATE SET observation_id = EXCLUDED.observation_id,
                field_value = EXCLUDED.field_value,
                source_authority = EXCLUDED.source_authority,
                accepted = TRUE,
                observed_at = EXCLUDED.observed_at;

  PERFORM * FROM public.promote_catalog_formula(v_formula_id);

  -- Promotion activates formula-owned SKUs. Restore the intentional invariant:
  -- the current official package row is the sole active owner of this GTIN,
  -- while the legacy same-formula package remains preserved but inactive.
  UPDATE public.catalog_skus
  SET active = FALSE,
      updated_at = NOW()
  WHERE id = v_legacy_sku_id
    AND formula_id = v_formula_id
    AND gtin = v_gtin
    AND source_external_id = v_legacy_cache
    AND source_url = v_legacy_url;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_verified_product_search_aliases search_alias
    WHERE search_alias.active
      AND search_alias.normalized_alias IN (
        public.normalize_verified_product_search_query(
          'Royal Canin Hair & Skin Care Chunks in Gravy Pouch'
        ),
        public.normalize_verified_product_search_query(
          'Royal Canin Feline Care Nutrition Hair & Skin Care Chunks in Gravy Pouch'
        ),
        public.normalize_verified_product_search_query(
          'Royal Canin Intense Beauty Chunks in Gravy Pouch'
        )
      )
      AND search_alias.cache_key <> v_current_cache
  ) THEN
    RAISE EXCEPTION 'Royal Canin Hair & Skin alias belongs to a sibling';
  END IF;

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key, alias_text, normalized_alias, source_url, source_authority,
    evidence_observed_at, provenance
  ) VALUES
    (
      v_current_cache,
      'Royal Canin Hair & Skin Care Chunks in Gravy Pouch',
      public.normalize_verified_product_search_query(
        'Royal Canin Hair & Skin Care Chunks in Gravy Pouch'
      ),
      v_current_url, 'manufacturer', v_observed_at,
      jsonb_build_object(
        'exact_formula_identity', TRUE,
        'species_boundary', 'cat',
        'life_stage_boundary', 'adult',
        'form_boundary', 'wet',
        'presentation_boundary', 'chunks in gravy pouch'
      )
    ),
    (
      v_current_cache,
      'Royal Canin Feline Care Nutrition Hair & Skin Care Chunks in Gravy Pouch',
      public.normalize_verified_product_search_query(
        'Royal Canin Feline Care Nutrition Hair & Skin Care Chunks in Gravy Pouch'
      ),
      v_current_url, 'manufacturer', v_observed_at,
      jsonb_build_object(
        'exact_formula_identity', TRUE,
        'species_boundary', 'cat',
        'life_stage_boundary', 'adult',
        'form_boundary', 'wet',
        'presentation_boundary', 'chunks in gravy pouch'
      )
    ),
    (
      v_current_cache,
      'Royal Canin Intense Beauty Chunks in Gravy Pouch',
      public.normalize_verified_product_search_query(
        'Royal Canin Intense Beauty Chunks in Gravy Pouch'
      ),
      v_legacy_url, 'manufacturer', v_observed_at,
      jsonb_build_object(
        'exact_legacy_package_alias', TRUE,
        'canonical_current_url', v_current_url,
        'same_gtin', TRUE,
        'normalized_ingredient_equality', TRUE,
        'presentation_boundary', 'chunks in gravy pouch'
      )
    )
  ON CONFLICT (normalized_alias) WHERE active DO UPDATE
  SET cache_key = EXCLUDED.cache_key,
      alias_text = EXCLUDED.alias_text,
      source_url = EXCLUDED.source_url,
      source_authority = EXCLUDED.source_authority,
      evidence_observed_at = EXCLUDED.evidence_observed_at,
      provenance = EXCLUDED.provenance,
      updated_at = NOW();

  SELECT cache_key INTO v_top_cache
  FROM public.search_verified_products(
    'Royal Canin Hair & Skin Care Chunks in Gravy Pouch', 8
  )
  ORDER BY rank DESC
  LIMIT 1;

  SELECT cache_key INTO v_barcode_cache
  FROM public.resolve_verified_product_by_gtin(v_gtin, 8)
  ORDER BY rank DESC
  LIMIT 1;

  IF v_top_cache IS DISTINCT FROM v_current_cache
     OR v_barcode_cache IS DISTINCT FROM v_current_cache
     OR NOT EXISTS (
       SELECT 1 FROM public.catalog_formulas
       WHERE id = v_formula_id
         AND formula_key = v_formula_key
         AND identity_hash = v_identity_hash
         AND product_name = 'Hair & Skin Care Chunks in Gravy Pouch'
         AND product_line = 'Hair & Skin Care Chunks in Gravy Pouch'
         AND pet_type = 'cat'
         AND life_stage = 'adult'
         AND food_form = 'wet'
         AND flavor = ''
         AND verification_status = 'verified'
         AND active
         AND formula_evidence_tier = 'manufacturer_current_exact'
         AND promoted_cache_key = v_current_cache
         AND encode(digest(
           public.catalog_normalize_ingredient_evidence(ingredient_text),
           'sha256'
         ), 'hex') = v_expected_ingredient_hash
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.product_data
       WHERE cache_key = v_current_cache
         AND gtin = v_gtin
         AND catalog_exclusion_reason IS NULL
         AND is_complete_food
         AND ingredient_verification_status = 'manufacturer'
         AND image_verification_status = 'manufacturer'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.product_data
       WHERE cache_key = v_legacy_cache
         AND gtin = v_gtin
         AND catalog_exclusion_reason =
           'duplicate_canonical_gtin_verified_catalog_row'
         AND NOT is_complete_food
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.catalog_observations
       WHERE id = v_legacy_observation_id
         AND formula_id = v_formula_id
         AND source_url = v_legacy_url
         AND gtin = v_gtin
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.catalog_skus
       WHERE id = v_legacy_sku_id
         AND formula_id = v_formula_id
         AND gtin = v_gtin
         AND source_external_id = v_legacy_cache
         AND source_url = v_legacy_url
         AND NOT active
     )
     OR (SELECT count(*) FROM public.catalog_skus
         WHERE gtin = v_gtin AND active) <> 1
     OR (SELECT count(*) FROM public.catalog_observations
         WHERE formula_id = v_broad_formula_id) <>
        v_broad_observation_count_before - 1
     OR (SELECT count(*) FROM public.catalog_skus
         WHERE formula_id = v_broad_formula_id) <>
        v_broad_sku_count_before - 1
     OR NOT EXISTS (
       SELECT 1 FROM public.catalog_formulas
       WHERE id = v_broad_formula_id
         AND active
         AND verification_status = 'verified'
         AND formula_key =
           'royal canin|royal canin|feline care nutrition|cat|unknown|wet||'
         AND product_name ILIKE '%Digestive Care%'
     )
  THEN
    RAISE EXCEPTION
      'Royal Canin Hair & Skin postcondition failed: search %, barcode %',
      v_top_cache,
      v_barcode_cache;
  END IF;
END
$migration$;
