-- Reconcile Health Extension's Air Dried Complete Sample Shopify parent page.
-- The page is not one formula: it publishes exact Beef, Chicken, and Salmon
-- one-ounce variants, each with its own GTIN and matching package image. The
-- three ingredient statements exactly match the corresponding current
-- full-size Air Dried Superfoods formulas. Preserve the samples as SKU children
-- and never let the ambiguous parent title resolve to Beef by default.

DO $migration$
DECLARE
  v_parent_url CONSTANT TEXT :=
    'https://www.healthextension.com/products/air-dried-complete-samples';
  v_run_key CONSTANT TEXT :=
    'health-extension:bounded-exact-evidence:air-dried-sample-variants:20260804:v1';
  v_observed_at CONSTANT TIMESTAMPTZ :=
    '2026-06-26T21:13:45.780Z'::TIMESTAMPTZ;
  v_html_hash CONSTANT TEXT :=
    'b3593eb7b45e695aeab46b077e467d96a5a23ccbd367ba6e47c1c240f7489dc0';
  v_shopify_hash CONSTANT TEXT :=
    '069f090c8036c36366414275b0570b45e2597897e8b143c6774570bf7df46366';
  v_parent_key CONSTANT TEXT :=
    'health extension|health extension|air dried complete sample|dog|all life stages|air dried||';
  v_beef_key CONSTANT TEXT :=
    'health extension|health extension|air dried superfoods|dog|all life stages|air dried|beef recipe|';
  v_chicken_key CONSTANT TEXT :=
    'health extension|health extension|air dried superfoods|dog|all life stages|air dried|chicken recipe|';
  v_salmon_key CONSTANT TEXT :=
    'health extension|health extension|air dried superfoods|dog|all life stages|air dried|salmon recipe|';
  v_parent_id BIGINT;
  v_beef_id BIGINT;
  v_chicken_id BIGINT;
  v_salmon_id BIGINT;
  v_run_id BIGINT;
  v_payload JSONB;
  v_top TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.catalog_source_runs WHERE run_key = v_run_key
  ) THEN
    RAISE EXCEPTION 'Health Extension sample reconciliation run already exists';
  END IF;

  SELECT id INTO STRICT v_parent_id
  FROM public.catalog_formulas
  WHERE formula_key = v_parent_key
    AND identity_hash =
      '88dc9d920d9491cc39b10d9b1cb40d0e48f8ffecd19ffb9e3fb2e7f1ddcc79b0'
    AND source_url = v_parent_url
    AND verification_status = 'verified'
    AND active
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND flavor = ''
    AND promoted_cache_key IS NULL
    AND encode(digest(ingredient_text, 'sha256'), 'hex') =
      '6288722a89971b88515cc0465538b97d83bff44a48c750c41aafd3e67651e06f';

  SELECT id INTO STRICT v_beef_id
  FROM public.catalog_formulas
  WHERE formula_key = v_beef_key
    AND identity_hash =
      'e45284b5e8fefca68b89545275f6d5cb20a1c31f7d4c8972ab7b456f4e834148'
    AND verification_status = 'verified'
    AND active
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND promoted_cache_key IS NULL
    AND cardinality(ingredients) = 53
    AND encode(digest(ingredient_text, 'sha256'), 'hex') =
      '6288722a89971b88515cc0465538b97d83bff44a48c750c41aafd3e67651e06f';

  SELECT id INTO STRICT v_chicken_id
  FROM public.catalog_formulas
  WHERE formula_key = v_chicken_key
    AND identity_hash =
      '8cc7516963e571a68b9e0d9047ce452823e9f7b5f3f3390aad62d4a0572edd4b'
    AND verification_status = 'verified'
    AND active
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND promoted_cache_key IS NULL
    AND cardinality(ingredients) = 52
    AND encode(digest(ingredient_text, 'sha256'), 'hex') =
      'b7a15d5451574a1b94a7db331ec2a167f75c25410f78704b5d91686166681e56';

  SELECT id INTO STRICT v_salmon_id
  FROM public.catalog_formulas
  WHERE formula_key = v_salmon_key
    AND identity_hash =
      '41035fe96b01fbbcd4af55327f58ba2c3fb2c4e81482c67fcdf1b5d0f3508806'
    AND verification_status = 'verified'
    AND active
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND promoted_cache_key IS NULL
    AND cardinality(ingredients) = 51
    AND encode(digest(ingredient_text, 'sha256'), 'hex') =
      'e01afe9f50bbcc593b595c6734f08dfaec99f11fdd2d98ab7191da5e6a320b5a';

  IF (
    SELECT count(*)
    FROM public.product_data
    WHERE cache_key IN (
      'health-extension:810120991269',
      'health-extension:810120991252',
      'health-extension:810120991276'
    )
      AND source = 'health-extension'
      AND source_quality = 'manufacturer'
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND formula_evidence_tier = 'manufacturer_current_exact'
      AND is_complete_food
      AND catalog_exclusion_reason IS NULL
      AND expires_at > NOW()
  ) <> 3 OR NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key = 'health-extension:810120991269'
      AND gtin = '810120991269'
      AND pet_type = 'dog'
      AND flavor = 'Beef Recipe'
      AND encode(digest(ingredient_text, 'sha256'), 'hex') =
        '6288722a89971b88515cc0465538b97d83bff44a48c750c41aafd3e67651e06f'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key = 'health-extension:810120991252'
      AND gtin = '810120991252'
      AND pet_type = 'dog'
      AND flavor = 'Chicken Recipe'
      AND encode(digest(ingredient_text, 'sha256'), 'hex') =
        'b7a15d5451574a1b94a7db331ec2a167f75c25410f78704b5d91686166681e56'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key = 'health-extension:810120991276'
      AND gtin = '810120991276'
      AND pet_type = 'dog'
      AND flavor = 'Salmon Recipe'
      AND encode(digest(ingredient_text, 'sha256'), 'hex') =
        'e01afe9f50bbcc593b595c6734f08dfaec99f11fdd2d98ab7191da5e6a320b5a'
  ) THEN
    RAISE EXCEPTION 'Health Extension canonical serving rows changed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_observations
    WHERE formula_id = v_parent_id
      AND source_url = v_parent_url
      AND source_external_id = 'health-extension:810120991153'
      AND gtin = '810120991153'
      AND validation_status = 'accepted'
      AND flavor = ''
      AND package_size = '1 ounce Sample: Beef'
  ) <> 1 OR (
    SELECT count(*)
    FROM public.catalog_skus
    WHERE formula_id = v_parent_id
      AND gtin = '810120991153'
      AND package_size = '1 ounce Sample: Beef'
      AND active
  ) <> 1 OR EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE gtin IN ('810120991160', '810120991146')
  ) THEN
    RAISE EXCEPTION 'Health Extension sample SKU baseline changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key =
      'health-extension:health extension air dried complete sample'
      AND source_url = v_parent_url
      AND product_name = 'Air Dried Complete Sample'
      AND formula_evidence_tier = 'unverified'
      AND NOT is_complete_food
      AND catalog_exclusion_reason = 'non_single_formula_or_non_complete'
      AND encode(digest(ingredient_text, 'sha256'), 'hex') =
        '6288722a89971b88515cc0465538b97d83bff44a48c750c41aafd3e67651e06f'
  ) THEN
    RAISE EXCEPTION 'Health Extension ambiguous serving artifact changed';
  END IF;

  -- Repair the old default-Beef staging evidence before adding the complete
  -- three-variant batch. This changes no serving result and removes the GTIN
  -- collision that the exact-identity staging guard is designed to reject.
  UPDATE public.catalog_observations
  SET formula_id = v_beef_id,
      product_name = 'Air Dried Superfoods Beef Recipe',
      product_line = 'Air Dried Superfoods',
      flavor = 'Beef Recipe',
      package_size = '1 oz',
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance = jsonb_build_object(
        'version_status', 'manufacturer_current',
        'source', 'health-extension',
        'source_url', v_parent_url,
        'captured_at', v_observed_at,
        'package_gtin', '810120991153',
        'shopify_variant_id', 44676229923054,
        'recipe_boundary', 'Beef Recipe',
        'ingredient_equivalent_to_canonical_formula', TRUE,
        'package_size_is_sku_only', TRUE,
        'parent_page_is_multi_formula', TRUE
      ),
      raw_payload = COALESCE(raw_payload, '{}'::JSONB) || jsonb_build_object(
        'parent_page_is_multi_formula', TRUE,
        'canonical_formula_key', v_beef_key,
        'variant_title', '1 ounce Sample: Beef',
        'shopify_variant_id', 44676229923054,
        'sample_package_reconciled_at', NOW()
      )
  WHERE formula_id = v_parent_id
    AND source_url = v_parent_url
    AND source_external_id = 'health-extension:810120991153'
    AND gtin = '810120991153';

  UPDATE public.catalog_skus
  SET formula_id = v_beef_id,
      package_size = '1 oz',
      source_external_id = 'health-extension:810120991153',
      source_url = v_parent_url,
      last_observed_at = v_observed_at,
      updated_at = NOW()
  WHERE formula_id = v_parent_id
    AND gtin = '810120991153';

  UPDATE public.catalog_formulas
  SET verification_status = 'quarantined',
      active = FALSE,
      absent_since = COALESCE(absent_since, NOW()),
      promoted_cache_key = NULL,
      promoted_at = NULL,
      complete_food_evidence =
        'Official Shopify parent page contains three distinct Beef, Chicken, and Salmon formulas. The prior generic parent identity was split into exact recipe formulas and cannot be served.',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        jsonb_build_object(
          'quarantine_reason', 'multi_formula_parent_split',
          'canonical_formula_ids',
            jsonb_build_array(v_beef_id, v_chicken_id, v_salmon_id),
          'reconciled_at', NOW()
        ),
      updated_at = NOW()
  WHERE id = v_parent_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'formula_key', variant.formula_key,
      'identity_hash', formula.identity_hash,
      'manufacturer', 'Health Extension',
      'brand', 'Health Extension',
      'product_name', formula.product_name,
      'product_line', 'Air Dried Superfoods',
      'pet_type', 'dog',
      'life_stage', 'all life stages',
      'food_form', 'air dried',
      'flavor', variant.flavor,
      'diet_condition', '',
      'source_slug', 'health-extension',
      'source_external_id', 'health-extension:' || variant.gtin,
      'source_url', v_parent_url,
      'source_authority', 'manufacturer',
      'gtin', variant.gtin,
      'package_size', '1 oz',
      'ingredient_text', formula.ingredient_text,
      'ingredients', to_jsonb(formula.ingredients),
      'front_image_url', variant.image_url,
      'is_complete_food', TRUE,
      'available_in_us', TRUE,
      'protected_terms', jsonb_build_array(
        'Health Extension', 'Air Dried Superfoods', variant.flavor,
        'dog', 'all life stages', 'air dried'
      ),
      'observed_at', v_observed_at,
      'content_hash', encode(digest(
        variant.formula_key || '|' || variant.gtin || '|' ||
        encode(digest(formula.ingredient_text, 'sha256'), 'hex') || '|' ||
        variant.image_url,
        'sha256'
      ), 'hex'),
      'validation_status', 'accepted',
      'validation_reasons', '[]'::JSONB,
      'ingredient_verification_status', 'manufacturer',
      'image_verification_status', 'manufacturer',
      'coverage_tier', 'tier_2_us_retail',
      'raw_payload', jsonb_build_object(
        'cache_key', 'health-extension:' || variant.gtin,
        'parent_product_title', 'Air Dried Complete Sample',
        'variant_title', variant.variant_title,
        'shopify_product_id', 8247178264814,
        'shopify_variant_id', variant.shopify_variant_id,
        'ingredient_source_url', v_parent_url,
        'image_source_url', variant.image_url,
        'official_html_content_hash', v_html_hash,
        'official_shopify_json_content_hash', v_shopify_hash,
        'canonical_formula_key', variant.formula_key,
        'exact_formula_evidence', TRUE,
        'ingredient_equivalent_to_canonical_formula', TRUE,
        'package_size_is_sku_only', TRUE,
        'parent_page_is_multi_formula', TRUE
      )
    ) ORDER BY variant.gtin
  ) INTO v_payload
  FROM (VALUES
    (
      v_beef_key,
      '810120991153',
      'Beef Recipe',
      '1 ounce Sample: Beef',
      44676229923054::BIGINT,
      'https://cdn.shopify.com/s/files/1/0085/8898/4416/files/HE_AD_1oz_BEEF_Front.png?v=1778853007'
    ),
    (
      v_chicken_key,
      '810120991160',
      'Chicken Recipe',
      '1 ounce Sample: Chicken',
      44676372496622::BIGINT,
      'https://cdn.shopify.com/s/files/1/0085/8898/4416/files/HE_AD_1oz_CHICKEN_Front.png?v=1778853014'
    ),
    (
      v_salmon_key,
      '810120991146',
      'Salmon Recipe',
      '1 ounce Sample: Salmon',
      44676372529390::BIGINT,
      'https://cdn.shopify.com/s/files/1/0085/8898/4416/files/HE_AD_1oz_SALMON_Front.png?v=1778853026'
    )
  ) AS variant(
    formula_key, gtin, flavor, variant_title,
    shopify_variant_id, image_url
  )
  JOIN public.catalog_formulas formula
    ON formula.formula_key = variant.formula_key;

  PERFORM public.stage_catalog_census_batch(
    jsonb_build_object(
      'run_key', v_run_key,
      'source_slug', 'health-extension',
      'source_type', 'manufacturer',
      'coverage_role', 'verification',
      'status', 'completed',
      'started_at', v_observed_at,
      'expected_count', 3,
      'pagination_complete', FALSE,
      'truncated', FALSE,
      'cap_reached', FALSE,
      'source_content_hash', v_shopify_hash,
      'checkpoint', jsonb_build_object(
        'feed_row_count', 3,
        'accepted_observation_count', 3,
        'canonical_formula_count', 3
      ),
      'metadata', jsonb_build_object(
        'brand', 'Health Extension',
        'manufacturer', 'Health Extension',
        'source_authority', 'manufacturer',
        'exact_formula_evidence', TRUE,
        'package_size_is_sku_only', TRUE,
        'parent_page_is_multi_formula', TRUE,
        'official_inventory_full', FALSE,
        'bounded_exact_evidence', TRUE,
        'official_html_content_hash', v_html_hash,
        'current_official_sku_cache_keys', jsonb_build_array(
          'health-extension:810120991153',
          'health-extension:810120991160',
          'health-extension:810120991146'
        ),
        'current_serving_cache_keys', jsonb_build_array(
          'health-extension:810120991269',
          'health-extension:810120991252',
          'health-extension:810120991276'
        )
      )
    ),
    v_payload
  );

  SELECT id INTO STRICT v_run_id
  FROM public.catalog_source_runs
  WHERE run_key = v_run_key
    AND source_slug = 'health-extension'
    AND expected_count = 3
    AND observed_count = 3
    AND accepted_count = 3
    AND rejected_count = 0
    AND metadata->>'bounded_exact_evidence' = 'true'
    AND metadata->>'parent_page_is_multi_formula' = 'true';

  UPDATE public.catalog_observations observation
  SET formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance = jsonb_build_object(
        'version_status', 'manufacturer_current',
        'source', 'health-extension',
        'source_url', v_parent_url,
        'captured_at', v_observed_at,
        'package_gtin', observation.gtin,
        'package_size', observation.package_size,
        'variant_title', observation.raw_payload->>'variant_title',
        'shopify_variant_id', observation.raw_payload->>'shopify_variant_id',
        'recipe_boundary', observation.flavor,
        'ingredient_text_hash', encode(digest(
          public.catalog_normalize_ingredient_evidence(
            observation.ingredient_text
          ),
          'sha256'
        ), 'hex'),
        'ingredient_equivalent_to_canonical_formula', TRUE,
        'package_size_is_sku_only', TRUE,
        'parent_page_is_multi_formula', TRUE
      )
  WHERE observation.run_id = v_run_id;

  INSERT INTO public.catalog_field_evidence (
    formula_id,
    observation_id,
    field_name,
    field_value,
    source_url,
    source_authority,
    accepted,
    observed_at,
    content_hash
  )
  SELECT
    observation.formula_id,
    observation.id,
    'official_sample_package_equivalence',
    jsonb_build_object(
      'parent_product_title', 'Air Dried Complete Sample',
      'variant_title', observation.raw_payload->>'variant_title',
      'gtin', observation.gtin,
      'package_size', observation.package_size,
      'front_image_url', observation.front_image_url,
      'canonical_formula_key', formula.formula_key,
      'recipe_boundary', formula.flavor,
      'ingredient_text_hash', encode(digest(
        public.catalog_normalize_ingredient_evidence(
          observation.ingredient_text
        ),
        'sha256'
      ), 'hex'),
      'ingredient_equivalent_to_canonical_formula', TRUE,
      'package_size_is_sku_only', TRUE,
      'parent_page_is_multi_formula', TRUE
    ),
    v_parent_url,
    'manufacturer',
    TRUE,
    v_observed_at,
    encode(digest(
      'official_sample_package_equivalence|' || observation.gtin || '|' ||
      formula.formula_key || '|' || observation.front_image_url,
      'sha256'
    ), 'hex')
  FROM public.catalog_observations observation
  JOIN public.catalog_formulas formula
    ON formula.id = observation.formula_id
  WHERE observation.run_id = v_run_id;

  UPDATE public.catalog_formulas formula
  SET promoted_cache_key = mapping.cache_key,
      promoted_at = COALESCE(formula.promoted_at, NOW()),
      last_observed_at = GREATEST(formula.last_observed_at, v_observed_at),
      updated_at = NOW()
  FROM (VALUES
    (v_beef_id, 'health-extension:810120991269'),
    (v_chicken_id, 'health-extension:810120991252'),
    (v_salmon_id, 'health-extension:810120991276')
  ) AS mapping(formula_id, cache_key)
  WHERE formula.id = mapping.formula_id
    AND EXISTS (
      SELECT 1 FROM public.product_data serving
      WHERE serving.cache_key = mapping.cache_key
        AND serving.source = 'health-extension'
        AND serving.source_quality = 'manufacturer'
        AND serving.ingredient_verification_status = 'manufacturer'
        AND serving.image_verification_status = 'manufacturer'
        AND serving.formula_evidence_tier = 'manufacturer_current_exact'
        AND serving.is_complete_food
        AND serving.catalog_exclusion_reason IS NULL
        AND serving.expires_at > NOW()
        AND public.catalog_normalize_ingredient_evidence(
              serving.ingredient_text
            ) = public.catalog_normalize_ingredient_evidence(
              formula.ingredient_text
            )
    );

  IF EXISTS (
    SELECT 1
    FROM public.catalog_verified_product_search_aliases search_alias
    JOIN (VALUES
      (
        'Health Extension Air Dried Complete 1 Ounce Sample Beef',
        'health-extension:810120991269'
      ),
      (
        'Health Extension Air Dried Complete 1 Ounce Sample Chicken',
        'health-extension:810120991252'
      ),
      (
        'Health Extension Air Dried Complete 1 Ounce Sample Salmon',
        'health-extension:810120991276'
      )
    ) AS expected(alias_text, cache_key)
      ON search_alias.normalized_alias =
        public.normalize_verified_product_search_query(expected.alias_text)
    WHERE search_alias.active
      AND search_alias.cache_key <> expected.cache_key
  ) THEN
    RAISE EXCEPTION 'Health Extension sample search alias conflict';
  END IF;

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key,
    alias_text,
    normalized_alias,
    source_url,
    source_authority,
    evidence_observed_at,
    provenance,
    active,
    updated_at
  )
  SELECT
    alias.cache_key,
    alias.alias_text,
    public.normalize_verified_product_search_query(alias.alias_text),
    v_parent_url,
    'manufacturer',
    v_observed_at,
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'manufacturer_current', TRUE,
      'formula_id', alias.formula_id,
      'recipe_boundary', alias.recipe,
      'species_boundary', 'dog',
      'food_form_boundary', 'air dried',
      'sample_package', TRUE,
      'package_size_is_sku_only', TRUE,
      'captured_at', v_observed_at
    ),
    TRUE,
    NOW()
  FROM (VALUES
    (
      'Health Extension Air Dried Complete 1 Ounce Sample Beef',
      'health-extension:810120991269', v_beef_id, 'Beef Recipe'
    ),
    (
      'Health Extension Air Dried Complete 1 Ounce Sample Chicken',
      'health-extension:810120991252', v_chicken_id, 'Chicken Recipe'
    ),
    (
      'Health Extension Air Dried Complete 1 Ounce Sample Salmon',
      'health-extension:810120991276', v_salmon_id, 'Salmon Recipe'
    )
  ) AS alias(alias_text, cache_key, formula_id, recipe)
  ON CONFLICT (normalized_alias) WHERE active DO UPDATE
  SET cache_key = EXCLUDED.cache_key,
      alias_text = EXCLUDED.alias_text,
      source_url = EXCLUDED.source_url,
      source_authority = EXCLUDED.source_authority,
      evidence_observed_at = EXCLUDED.evidence_observed_at,
      provenance = EXCLUDED.provenance,
      updated_at = NOW();

  UPDATE public.product_data
  SET catalog_exclusion_reason =
        'multi_formula_parent_page_split_into_exact_sample_variants',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        jsonb_build_object(
          'parent_page_is_multi_formula', TRUE,
          'exact_variant_gtins', jsonb_build_array(
            '810120991153', '810120991160', '810120991146'
          ),
          'canonical_serving_cache_keys', jsonb_build_array(
            'health-extension:810120991269',
            'health-extension:810120991252',
            'health-extension:810120991276'
          ),
          'reconciled_at', NOW()
        ),
      updated_at = NOW()
  WHERE cache_key =
    'health-extension:health extension air dried complete sample';

  IF EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE id = v_parent_id
      AND (active OR verification_status <> 'quarantined')
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_observations WHERE formula_id = v_parent_id
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_skus WHERE formula_id = v_parent_id
  ) THEN
    RAISE EXCEPTION 'Health Extension ambiguous parent formula survived';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_observations
    WHERE run_id = v_run_id
      AND validation_status = 'accepted'
      AND formula_evidence_tier = 'manufacturer_current_exact'
      AND gtin IN ('810120991153', '810120991160', '810120991146')
  ) <> 3 OR (
    SELECT count(*)
    FROM public.catalog_field_evidence evidence
    JOIN public.catalog_observations observation
      ON observation.id = evidence.observation_id
    WHERE observation.run_id = v_run_id
      AND evidence.field_name = 'official_sample_package_equivalence'
      AND evidence.accepted
  ) <> 3 THEN
    RAISE EXCEPTION 'Health Extension sample evidence staging failed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_skus
    WHERE active
      AND (
        (formula_id = v_beef_id AND gtin = '810120991153' AND package_size = '1 oz')
        OR (formula_id = v_chicken_id AND gtin = '810120991160' AND package_size = '1 oz')
        OR (formula_id = v_salmon_id AND gtin = '810120991146' AND package_size = '1 oz')
      )
  ) <> 3 OR EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE gtin IN ('810120991153', '810120991160', '810120991146')
      AND formula_id NOT IN (v_beef_id, v_chicken_id, v_salmon_id)
  ) THEN
    RAISE EXCEPTION 'Health Extension sample SKU/formula links failed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('810120991153', 8)
  ) <> 1 OR (
    SELECT cache_key
    FROM public.resolve_verified_product_by_gtin('810120991153', 1)
  ) IS DISTINCT FROM 'health-extension:810120991269' OR (
    SELECT package_size
    FROM public.resolve_verified_product_by_gtin('810120991153', 1)
  ) IS DISTINCT FROM '1 oz' OR (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('810120991160', 8)
  ) <> 1 OR (
    SELECT cache_key
    FROM public.resolve_verified_product_by_gtin('810120991160', 1)
  ) IS DISTINCT FROM 'health-extension:810120991252' OR (
    SELECT package_size
    FROM public.resolve_verified_product_by_gtin('810120991160', 1)
  ) IS DISTINCT FROM '1 oz' OR (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('810120991146', 8)
  ) <> 1 OR (
    SELECT cache_key
    FROM public.resolve_verified_product_by_gtin('810120991146', 1)
  ) IS DISTINCT FROM 'health-extension:810120991276' OR (
    SELECT package_size
    FROM public.resolve_verified_product_by_gtin('810120991146', 1)
  ) IS DISTINCT FROM '1 oz' THEN
    RAISE EXCEPTION 'Health Extension exact sample barcode lookup failed';
  END IF;

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'Health Extension Air Dried Complete 1 Ounce Sample Beef', 1
  );
  IF v_top IS DISTINCT FROM 'health-extension:810120991269' THEN
    RAISE EXCEPTION 'Health Extension Beef sample exact search failed: %', v_top;
  END IF;

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'Health Extension Air Dried Complete 1 Ounce Sample Chicken', 1
  );
  IF v_top IS DISTINCT FROM 'health-extension:810120991252' THEN
    RAISE EXCEPTION 'Health Extension Chicken sample exact search failed: %', v_top;
  END IF;

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'Health Extension Air Dried Complete 1 Ounce Sample Salmon', 1
  );
  IF v_top IS DISTINCT FROM 'health-extension:810120991276' THEN
    RAISE EXCEPTION 'Health Extension Salmon sample exact search failed: %', v_top;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key =
      'health-extension:health extension air dried complete sample'
      AND NOT is_complete_food
      AND formula_evidence_tier = 'unverified'
      AND catalog_exclusion_reason =
        'multi_formula_parent_page_split_into_exact_sample_variants'
  ) THEN
    RAISE EXCEPTION 'Health Extension ambiguous serving exclusion failed';
  END IF;
END;
$migration$;
