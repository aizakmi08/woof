-- Preserve the three known Moist & Meaty Burger With Cheddar ingredient
-- versions while correcting exact package metadata and recording that the
-- front package alone cannot select an ingredient version. This is a metadata
-- and resolver-safety repair only: ingredient text, evidence tiers, source
-- URLs, images, formula keys, and GTIN ownership remain unchanged.

DO $migration$
DECLARE
  v_manufacturer_cache CONSTANT TEXT :=
    'nestle-purina-moist-meaty:038100330772';
  v_large_cache CONSTANT TEXT :=
    'petsmart-retail-catalog:038100330482';
  v_small_cache CONSTANT TEXT :=
    'petsmart-retail-catalog:038100330222';
  v_manufacturer_url CONSTANT TEXT :=
    'https://www.purina.com/dogs/shop/moist-meaty-burger-with-cheddar-cheese-dog-food';
  v_large_url CONSTANT TEXT :=
    'https://www.petsmart.com/dog/food/dry-food/purina-moist-and-meaty-adult-dog-dry-food-2390.html';
  v_small_url CONSTANT TEXT :=
    'https://www.petsmart.com/dog/food/canned-food/moist-and-meaty-burger-cheddar-cheese-adult-semi-moist-dog-food-72-oz-84315.html';
  v_manufacturer_image CONSTANT TEXT :=
    'https://www.purina.com/sites/default/files/products/2023-06/dc_moistmeaty_burger-cheese_pack_1000x1000.png';
  v_large_image CONSTANT TEXT :=
    'https://s7d2.scene7.com/is/image/PetSmart/1211399';
  v_small_image CONSTANT TEXT :=
    'https://s7d2.scene7.com/is/image/PetSmart/5352499';
  v_manufacturer_hash CONSTANT TEXT :=
    'dfe01a2507337cb91f276ab247ce99645073427bf39a54e1968d7a41a5689f32';
  v_current_pdp_hash CONSTANT TEXT :=
    '7bd332b3c13ea688d3693295cde88237809d05445c3669679a5cf2a01a138868';
  v_small_hash CONSTANT TEXT :=
    '51a1b4f6c409d262d4b9862bee66713c5c74d5b0e0f73db15df141242d0e9664';
  v_large_name CONSTANT TEXT :=
    'Purina Moist & Meaty Burger With Cheddar Cheese Flavor Semi-Moist Dog Food - 13.5 lb (36 pouches)';
  v_small_name CONSTANT TEXT :=
    'Purina Moist & Meaty Burger With Cheddar Cheese Flavor Semi-Moist Dog Food - 72 oz (12 pouches)';
  v_product_line CONSTANT TEXT := 'Burger With Cheddar Cheese Flavor';
  v_fixture_path CONSTANT TEXT :=
    'outputs/audits/eric-nutritionist-2026-07-23/03-moist-meaty-wrong-results.png';
  v_conflict_provenance JSONB;
  v_large_provenance JSONB;
  v_small_provenance JSONB;
  v_large_top_cache TEXT;
  v_small_top_cache TEXT;
BEGIN
  -- Exact serving-row preconditions. These checks deliberately include the
  -- ingredient hashes and images so the migration fails closed if any source
  -- version changes before application.
  PERFORM 1
  FROM public.product_data
  WHERE cache_key = v_manufacturer_cache
    AND gtin = '038100330772'
    AND brand = 'Moist & Meaty'
    AND pet_type = 'dog'
    AND food_form = 'semi-moist'
    AND source_url = v_manufacturer_url
    AND image_url = v_manufacturer_image
    AND formula_evidence_tier = 'unverified'
    AND ingredient_verification_status = 'unverified'
    AND image_verification_status = 'manufacturer'
    AND NOT is_complete_food
    AND catalog_exclusion_reason =
      'official_manufacturer_formula_version_conflict_page_vs_linked_pdf'
    AND encode(digest(
      public.catalog_normalize_ingredient_evidence(ingredient_text),
      'sha256'
    ), 'hex') = v_manufacturer_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Moist & Meaty manufacturer conflict row changed';
  END IF;

  PERFORM 1
  FROM public.product_data
  WHERE cache_key = v_large_cache
    AND gtin = '038100330482'
    AND brand = 'Moist & Meaty'
    AND pet_type = 'dog'
    AND food_form = 'dry'
    AND package_size = '13.5 Lb'
    AND source_url = v_large_url
    AND image_url = v_large_image
    AND formula_evidence_tier = 'retailer_web_version'
    AND ingredient_verification_status = 'retailer_verified'
    AND image_verification_status = 'retailer_verified'
    AND is_complete_food
    AND catalog_exclusion_reason IS NULL
    AND formula_version_provenance->>'gtin_resolution_policy' =
      'abstain_on_version_conflict'
    AND formula_version_provenance->>'manufacturer_version_conflict' = 'true'
    AND encode(digest(
      public.catalog_normalize_ingredient_evidence(ingredient_text),
      'sha256'
    ), 'hex') = v_manufacturer_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Moist & Meaty 36-pouch source version changed';
  END IF;

  PERFORM 1
  FROM public.product_data
  WHERE cache_key = v_small_cache
    AND gtin = '038100330222'
    AND brand = 'Moist & Meaty'
    AND pet_type = 'dog'
    AND food_form = 'semi moist'
    AND COALESCE(package_size, '') = ''
    AND source_url = v_small_url
    AND image_url = v_small_image
    AND formula_evidence_tier = 'retailer_web_version'
    AND ingredient_verification_status = 'retailer_verified'
    AND image_verification_status = 'retailer_verified'
    AND is_complete_food
    AND catalog_exclusion_reason IS NULL
    AND formula_version_provenance->>'gtin_resolution_policy' =
      'abstain_on_version_conflict'
    AND formula_version_provenance->>'manufacturer_version_conflict' = 'true'
    AND encode(digest(
      public.catalog_normalize_ingredient_evidence(ingredient_text),
      'sha256'
    ), 'hex') = v_small_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Moist & Meaty 12-pouch source version changed';
  END IF;

  -- Canonical-ledger and package-child preconditions.
  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id = 6163
      AND NOT active
      AND verification_status = 'quarantined'
      AND formula_evidence_tier = 'unverified'
      AND promoted_cache_key IS NULL
      AND source_url = v_manufacturer_url
      AND encode(digest(
        public.catalog_normalize_ingredient_evidence(ingredient_text),
        'sha256'
      ), 'hex') = v_manufacturer_hash
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id = 38978
      AND formula_key =
        'retailer-package-version:b63c4a9efe31213fb7ff5c95c6fe7c4bbabba3a9e664fa584b1b5e3f5d9a1e8e'
      AND identity_hash =
        '9dc282c94142d56198f132c56dc4203a9289a5fb194bc9b77d877ca01138d0fe'
      AND promoted_cache_key = v_large_cache
      AND active
      AND verification_status = 'verified'
      AND formula_evidence_tier = 'retailer_web_version'
      AND encode(digest(
        public.catalog_normalize_ingredient_evidence(ingredient_text),
        'sha256'
      ), 'hex') = v_manufacturer_hash
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id = 38980
      AND formula_key =
        'retailer-package-version:0c5a4dc1968baf0b8f1e1c12921e0f891c41249edcdb3a08d4daad018d08b40b'
      AND identity_hash =
        '779ae6f24acfb26d0a5624148a0b53dbaeacc8624c392789c1e50b68ec14eeb5'
      AND promoted_cache_key = v_small_cache
      AND active
      AND verification_status = 'verified'
      AND formula_evidence_tier = 'retailer_web_version'
      AND encode(digest(
        public.catalog_normalize_ingredient_evidence(ingredient_text),
        'sha256'
      ), 'hex') = v_small_hash
  ) THEN
    RAISE EXCEPTION 'Moist & Meaty canonical formula baseline changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE id = 8615 AND formula_id = 38978
      AND source_external_id = v_large_cache
      AND gtin = '038100330482' AND source_url = v_large_url
      AND validation_status = 'accepted'
      AND encode(digest(
        public.catalog_normalize_ingredient_evidence(ingredient_text),
        'sha256'
      ), 'hex') = v_manufacturer_hash
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE id = 9173 AND formula_id = 38980
      AND source_external_id = v_small_cache
      AND gtin = '038100330222' AND source_url = v_small_url
      AND validation_status = 'accepted'
      AND encode(digest(
        public.catalog_normalize_ingredient_evidence(ingredient_text),
        'sha256'
      ), 'hex') = v_small_hash
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE id = 33073 AND formula_id = 6163
      AND source_url = v_manufacturer_url
      AND validation_status = 'rejected'
      AND encode(digest(
        public.catalog_normalize_ingredient_evidence(ingredient_text),
        'sha256'
      ), 'hex') = v_current_pdp_hash
  ) THEN
    RAISE EXCEPTION 'Moist & Meaty exact observation baseline changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_skus
    WHERE id = 38569 AND formula_id = 38978
      AND gtin = '038100330482' AND active
      AND package_size = '13.5 Lb' AND package_count = 1
  ) OR NOT EXISTS (
    SELECT 1 FROM public.catalog_skus
    WHERE id = 38570 AND formula_id = 38980
      AND gtin = '038100330222' AND active
      AND COALESCE(package_size, '') = '' AND package_count = 1
  ) THEN
    RAISE EXCEPTION 'Moist & Meaty active package-child baseline changed';
  END IF;

  v_conflict_provenance := jsonb_build_object(
    'manufacturer_version_conflict', TRUE,
    'manufacturer_conflict_source_url', v_manufacturer_url,
    'manufacturer_conflict_ingredient_hashes', jsonb_build_array(
      v_manufacturer_hash, v_current_pdp_hash, v_small_hash
    ),
    'gtin_resolution_policy', 'abstain_on_version_conflict',
    'front_label_version_collision', TRUE,
    'front_label_resolution_policy',
      'safe_abstain_require_barcode_or_ingredient_panel',
    'front_label_conflicting_cache_keys', jsonb_build_array(
      v_manufacturer_cache, v_large_cache, v_small_cache
    ),
    'eric_fixture_path', v_fixture_path,
    'reviewed_at', '2026-08-04T14:05:00-07:00'
  );
  v_large_provenance := v_conflict_provenance || jsonb_build_object(
    'package_gtin', '038100330482',
    'package_size', '13.5 lb (36 pouches)',
    'package_count', 36,
    'exact_package_selection_paths', jsonb_build_array(
      'barcode', 'ingredient_panel', 'exact_package_search'
    )
  );
  v_small_provenance := v_conflict_provenance || jsonb_build_object(
    'package_gtin', '038100330222',
    'package_size', '72 oz (12 pouches)',
    'package_count', 12,
    'exact_package_selection_paths', jsonb_build_array(
      'barcode', 'ingredient_panel', 'exact_package_search'
    )
  );

  -- Record the conflict on the quarantined manufacturer package without
  -- making it searchable/scorable or assigning the current PDP version.
  UPDATE public.product_data
  SET formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        v_conflict_provenance || jsonb_build_object(
          'package_gtin', '038100330772',
          'package_size', '72 oz (12 pouches)'
        ),
      nutritional_info = jsonb_set(
        COALESCE(nutritional_info, '{}'::JSONB),
        '{formula_version_provenance}',
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
          v_conflict_provenance || jsonb_build_object(
            'package_gtin', '038100330772',
            'package_size', '72 oz (12 pouches)'
          ),
        TRUE
      ),
      updated_at = NOW()
  WHERE cache_key = v_manufacturer_cache;

  UPDATE public.catalog_formulas
  SET formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        v_conflict_provenance || jsonb_build_object(
          'package_gtin', '038100330772',
          'package_size', '72 oz (12 pouches)'
        ),
      updated_at = NOW()
  WHERE id = 6163;

  UPDATE public.catalog_observations
  SET formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        v_conflict_provenance,
      raw_payload = COALESCE(raw_payload, '{}'::JSONB) || jsonb_build_object(
        'front_label_version_collision', TRUE,
        'front_label_resolution_policy',
          'safe_abstain_require_barcode_or_ingredient_panel',
        'eric_fixture_path', v_fixture_path
      )
  WHERE id IN (6587, 33073) AND formula_id = 6163;

  -- Normalize the two exact retailer packages but retain their independent
  -- ingredient versions and opaque source-version formula identities.
  UPDATE public.product_data
  SET product_name = v_large_name,
      product_line = v_product_line,
      flavor = v_product_line,
      food_form = 'semi-moist',
      package_size = '13.5 lb (36 pouches)',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        v_large_provenance,
      nutritional_info = jsonb_set(
        COALESCE(nutritional_info, '{}'::JSONB),
        '{formula_version_provenance}',
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
          v_large_provenance,
        TRUE
      ),
      updated_at = NOW()
  WHERE cache_key = v_large_cache;

  UPDATE public.product_data
  SET product_name = v_small_name,
      product_line = v_product_line,
      flavor = v_product_line,
      food_form = 'semi-moist',
      package_size = '72 oz (12 pouches)',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        v_small_provenance,
      nutritional_info = jsonb_set(
        COALESCE(nutritional_info, '{}'::JSONB),
        '{formula_version_provenance}',
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
          v_small_provenance,
        TRUE
      ),
      updated_at = NOW()
  WHERE cache_key = v_small_cache;

  UPDATE public.catalog_formulas
  SET product_name = v_large_name,
      product_line = lower(v_product_line),
      flavor = lower(v_product_line),
      food_form = 'semi-moist',
      protected_terms = ARRAY[
        'Purina', 'Moist & Meaty', 'Burger With Cheddar Cheese Flavor',
        'semi-moist', 'dog', 'adult', '13.5 lb', '36 pouches'
      ]::TEXT[],
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        v_large_provenance,
      updated_at = NOW()
  WHERE id = 38978;

  UPDATE public.catalog_formulas
  SET product_name = v_small_name,
      product_line = lower(v_product_line),
      flavor = lower(v_product_line),
      food_form = 'semi-moist',
      protected_terms = ARRAY[
        'Purina', 'Moist & Meaty', 'Burger With Cheddar Cheese Flavor',
        'semi-moist', 'dog', 'adult', '72 oz', '12 pouches'
      ]::TEXT[],
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        v_small_provenance,
      updated_at = NOW()
  WHERE id = 38980;

  UPDATE public.catalog_observations
  SET product_name = v_large_name,
      product_line = lower(v_product_line),
      flavor = lower(v_product_line),
      food_form = 'semi-moist',
      package_size = '13.5 lb (36 pouches)',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        v_large_provenance,
      raw_payload = COALESCE(raw_payload, '{}'::JSONB) || jsonb_build_object(
        'product_name', v_large_name,
        'product_line', v_product_line,
        'flavor', v_product_line,
        'food_form', 'semi-moist',
        'package_size', '13.5 lb (36 pouches)',
        'package_count', 36,
        'formula_version_provenance',
          COALESCE(formula_version_provenance, '{}'::JSONB) ||
          v_large_provenance
      )
  WHERE id = 8615 AND formula_id = 38978;

  UPDATE public.catalog_observations
  SET product_name = v_small_name,
      product_line = lower(v_product_line),
      flavor = lower(v_product_line),
      food_form = 'semi-moist',
      package_size = '72 oz (12 pouches)',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        v_small_provenance,
      raw_payload = COALESCE(raw_payload, '{}'::JSONB) || jsonb_build_object(
        'product_name', v_small_name,
        'product_line', v_product_line,
        'flavor', v_product_line,
        'food_form', 'semi-moist',
        'package_size', '72 oz (12 pouches)',
        'package_count', 12,
        'formula_version_provenance',
          COALESCE(formula_version_provenance, '{}'::JSONB) ||
          v_small_provenance
      )
  WHERE id = 9173 AND formula_id = 38980;

  UPDATE public.catalog_skus
  SET package_size = '13.5 lb (36 pouches)',
      package_count = 36,
      updated_at = NOW()
  WHERE id = 38569 AND formula_id = 38978
    AND gtin = '038100330482' AND active;

  UPDATE public.catalog_skus
  SET package_size = '72 oz (12 pouches)',
      package_count = 12,
      updated_at = NOW()
  WHERE id = 38570 AND formula_id = 38980
    AND gtin = '038100330222' AND active;

  -- Only package-specific aliases are safe. A generic front-label alias must
  -- not silently select either ingredient version.
  IF EXISTS (
    SELECT 1
    FROM public.catalog_verified_product_search_aliases search_alias
    WHERE search_alias.active
      AND search_alias.normalized_alias IN (
        public.normalize_verified_product_search_query(
          'Purina Moist & Meaty Burger With Cheddar Cheese Flavor 13.5 lb 36 pouches'
        ),
        public.normalize_verified_product_search_query(
          'Purina Moist & Meaty Burger With Cheddar Cheese Flavor 72 oz 12 pouches'
        )
      )
      AND search_alias.cache_key NOT IN (v_large_cache, v_small_cache)
  ) THEN
    RAISE EXCEPTION 'Moist & Meaty package-specific alias belongs to a sibling';
  END IF;

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key, alias_text, normalized_alias, source_url, source_authority,
    evidence_observed_at, provenance, active, updated_at
  ) VALUES
    (
      v_large_cache,
      'Purina Moist & Meaty Burger With Cheddar Cheese Flavor 13.5 lb 36 pouches',
      public.normalize_verified_product_search_query(
        'Purina Moist & Meaty Burger With Cheddar Cheese Flavor 13.5 lb 36 pouches'
      ),
      v_large_url, 'retailer_verified',
      '2026-07-16T21:07:41.461Z'::TIMESTAMPTZ,
      v_large_provenance || jsonb_build_object(
        'exact_package_alias', TRUE,
        'generic_front_label_must_abstain', TRUE
      ),
      TRUE, NOW()
    ),
    (
      v_small_cache,
      'Purina Moist & Meaty Burger With Cheddar Cheese Flavor 72 oz 12 pouches',
      public.normalize_verified_product_search_query(
        'Purina Moist & Meaty Burger With Cheddar Cheese Flavor 72 oz 12 pouches'
      ),
      v_small_url, 'retailer_verified',
      '2026-07-16T21:07:41.748Z'::TIMESTAMPTZ,
      v_small_provenance || jsonb_build_object(
        'exact_package_alias', TRUE,
        'generic_front_label_must_abstain', TRUE
      ),
      TRUE, NOW()
    )
  ON CONFLICT (normalized_alias) WHERE active DO UPDATE
  SET cache_key = EXCLUDED.cache_key,
      alias_text = EXCLUDED.alias_text,
      source_url = EXCLUDED.source_url,
      source_authority = EXCLUDED.source_authority,
      evidence_observed_at = EXCLUDED.evidence_observed_at,
      provenance = EXCLUDED.provenance,
      updated_at = NOW();

  -- Ingredient/version invariants and serving behavior after the metadata
  -- update. Exact barcodes remain usable, while the conflicted manufacturer
  -- GTIN remains a safe abstention.
  IF (SELECT count(*) FROM public.product_data
      WHERE cache_key IN (v_manufacturer_cache, v_large_cache)
        AND encode(digest(
          public.catalog_normalize_ingredient_evidence(ingredient_text),
          'sha256'
        ), 'hex') = v_manufacturer_hash) <> 2
     OR (SELECT count(*) FROM public.product_data
         WHERE cache_key = v_small_cache
           AND encode(digest(
             public.catalog_normalize_ingredient_evidence(ingredient_text),
             'sha256'
           ), 'hex') = v_small_hash) <> 1
     OR v_manufacturer_hash = v_small_hash
  THEN
    RAISE EXCEPTION 'Moist & Meaty ingredient versions changed or merged';
  END IF;

  IF (SELECT count(*) FROM public.resolve_verified_product_by_gtin(
        '038100330772', 8
      )) <> 0
     OR (SELECT count(*) FROM public.resolve_verified_product_by_gtin(
        '038100330482', 8
      ) WHERE cache_key = v_large_cache) <> 1
     OR (SELECT count(*) FROM public.resolve_verified_product_by_gtin(
        '038100330222', 8
      ) WHERE cache_key = v_small_cache) <> 1
  THEN
    RAISE EXCEPTION 'Moist & Meaty exact barcode abstention/resolution changed';
  END IF;

  SELECT cache_key INTO v_large_top_cache
  FROM public.search_verified_products(
    'Purina Moist & Meaty Burger With Cheddar Cheese Flavor 13.5 lb 36 pouches',
    8
  )
  ORDER BY rank DESC
  LIMIT 1;

  SELECT cache_key INTO v_small_top_cache
  FROM public.search_verified_products(
    'Purina Moist & Meaty Burger With Cheddar Cheese Flavor 72 oz 12 pouches',
    8
  )
  ORDER BY rank DESC
  LIMIT 1;

  IF v_large_top_cache IS DISTINCT FROM v_large_cache
     OR v_small_top_cache IS DISTINCT FROM v_small_cache
     OR EXISTS (
       SELECT 1
       FROM public.search_verified_products(
         'Purina Moist & Meaty Burger With Cheddar Cheese Flavor 72 oz 12 pouches',
         8
       )
       WHERE brand <> 'Moist & Meaty'
          OR pet_type <> 'dog'
          OR food_form <> 'semi-moist'
     )
  THEN
    RAISE EXCEPTION
      'Moist & Meaty exact package search regression: large %, small %',
      v_large_top_cache, v_small_top_cache;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id = 6163 AND NOT active
      AND verification_status = 'quarantined'
      AND formula_evidence_tier = 'unverified'
      AND promoted_cache_key IS NULL
  ) OR (SELECT count(*) FROM public.catalog_formulas
        WHERE id IN (38978, 38980)
          AND active
          AND verification_status = 'verified'
          AND formula_evidence_tier = 'retailer_web_version'
          AND food_form = 'semi-moist'
          AND formula_version_provenance->>'front_label_resolution_policy' =
            'safe_abstain_require_barcode_or_ingredient_panel') <> 2
     OR (SELECT count(*) FROM public.catalog_skus
         WHERE (id, package_size, package_count) IN (
           (38569, '13.5 lb (36 pouches)', 36),
           (38570, '72 oz (12 pouches)', 12)
         ) AND active) <> 2
  THEN
    RAISE EXCEPTION 'Moist & Meaty final metadata invariants failed';
  END IF;
END
$migration$;
