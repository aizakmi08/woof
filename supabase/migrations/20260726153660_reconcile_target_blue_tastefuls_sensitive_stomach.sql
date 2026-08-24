-- Reconcile Target TCIN 76366327 / UPC 859610006014 to the current
-- manufacturer BLUE Tastefuls Sensitive Stomach Chicken & Brown Rice formula.
-- PetSmart published a different ingredient version under the same UPC. Keep
-- that retailer version by source URL, but remove its ambiguous barcode claim.

DO $$
DECLARE
  v_current_formula_id BIGINT;
  v_target_gap_formula_id BIGINT;
  v_petsmart_formula_id BIGINT;
  v_run_id BIGINT;
  v_current_cache TEXT :=
    'blue-buffalo-general-mills:blue buffalo blue tastefuls adult cat sensitive stomach chicken brown rice recipe blue tastefuls-sensitive-stomach-chicken-brown-rice';
  v_petsmart_cache TEXT := 'petsmart-retail-catalog:859610006014';
  v_target_gap_key TEXT :=
    'blue buffalo|blue buffalo|blue buffalo tastefuls with chicken sensitive stomach natural adult dry cat food|cat|adult|dry||';
  v_target_url TEXT :=
    'https://www.target.com/p/blue-buffalo-tastefuls-with-chicken-sensitive-stomach-natural-adult-dry-cat-food-15lbs/-/A-76366327';
  v_official_url TEXT :=
    'https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-sensitive-stomach-chicken-brown-rice/';
  v_target_image TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_1d2f791c-68f0-4617-b968-13c48fb4665c';
  v_current_ingredients TEXT;
  v_current_hash TEXT;
  v_petsmart_hash TEXT;
  v_observed_at TIMESTAMPTZ := '2026-07-27T00:55:00Z';
BEGIN
  SELECT id, ingredient_text, encode(
    digest(
      public.catalog_normalize_ingredient_evidence(
        COALESCE(ingredient_text, '')
      ),
      'sha256'
    ),
    'hex'
  )
  INTO STRICT
    v_current_formula_id, v_current_ingredients, v_current_hash
  FROM public.catalog_formulas
  WHERE promoted_cache_key = v_current_cache
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND verification_status = 'verified'
    AND active;

  SELECT id
  INTO STRICT v_target_gap_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_target_gap_key;

  SELECT id, encode(
    digest(
      public.catalog_normalize_ingredient_evidence(
        COALESCE(ingredient_text, '')
      ),
      'sha256'
    ),
    'hex'
  )
  INTO STRICT v_petsmart_formula_id, v_petsmart_hash
  FROM public.catalog_formulas
  WHERE promoted_cache_key = v_petsmart_cache
    AND formula_evidence_tier = 'retailer_web_version'
    AND verification_status = 'verified'
    AND active;

  IF v_current_hash <>
      '02ff6f48c9446b61b517ca088d62e497b2819763588dad5a8e313455118df179'
     OR v_petsmart_hash <>
      'faf1d6f40cf47685c03be74f9f9e5d4cd7ceccc1f0e64b9f4fbb5c43d9636cd4'
     OR v_current_hash = v_petsmart_hash
  THEN
    RAISE EXCEPTION
      'Tastefuls Sensitive Stomach formula-version precondition changed';
  END IF;

  -- UPC alone cannot distinguish the older PetSmart label from the current
  -- Target/manufacturer label. Preserve the older version by source evidence,
  -- but make barcode lookup deterministic and current-first.
  UPDATE public.product_data
  SET
    gtin = NULL,
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'package_gtin', '859610006014',
        'barcode_resolution_policy',
          'prefer_manufacturer_current_due_reused_gtin',
        'different_from_manufacturer_current_hash', v_current_hash,
        'ingredient_text_hash', v_petsmart_hash,
        'reconciled_at', v_observed_at
      ),
    nutritional_info =
      COALESCE(nutritional_info, '{}'::JSONB) ||
      jsonb_build_object(
        'formula_evidence_tier', 'retailer_web_version',
        'barcode_resolution_policy',
          'prefer_manufacturer_current_due_reused_gtin'
      ),
    updated_at = now()
  WHERE cache_key = v_petsmart_cache;

  UPDATE public.catalog_skus
  SET
    gtin = NULL,
    formula_id = v_petsmart_formula_id,
    active = true,
    last_observed_at = v_observed_at,
    updated_at = now()
  WHERE formula_id = v_petsmart_formula_id
    AND gtin = '859610006014';

  UPDATE public.catalog_formulas
  SET
    product_name =
      'BLUE Tastefuls Adult Cat Sensitive Stomach Chicken & Brown Rice Recipe',
    product_line = 'BLUE Tastefuls Adult Sensitive Stomach',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'chicken and brown rice',
    diet_condition = 'sensitive stomach',
    protected_terms = ARRAY[
      'blue buffalo', 'tastefuls', 'adult', 'cat', 'dry',
      'sensitive stomach', 'chicken', 'brown rice'
    ]::TEXT[],
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'manufacturer_current',
        'manufacturer_current_equivalence', true,
        'target_product_code', 'TCIN 76366327',
        'target_package_gtin', '859610006014',
        'target_ingredient_hash', v_current_hash,
        'target_captured_at', v_observed_at
      ),
    updated_at = now()
  WHERE id = v_current_formula_id;

  UPDATE public.product_data
  SET
    product_name =
      'BLUE Tastefuls Adult Cat Sensitive Stomach Chicken & Brown Rice Recipe',
    product_line = 'BLUE Tastefuls Adult Sensitive Stomach',
    flavor = 'chicken and brown rice',
    life_stage = 'adult',
    food_form = 'dry',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'manufacturer_current',
        'manufacturer_current_equivalence', true,
        'equivalent_exact_source_urls', jsonb_build_array(
          source_url,
          v_target_url
        ),
        'target_product_code', 'TCIN 76366327',
        'target_package_gtin', '859610006014',
        'target_ingredient_hash', v_current_hash,
        'target_captured_at', v_observed_at
      ),
    updated_at = now()
  WHERE cache_key = v_current_cache;

  UPDATE public.catalog_skus
  SET
    formula_id = v_current_formula_id,
    gtin = '859610006014',
    package_size = '15 lb',
    package_count = 1,
    source_slug = 'target-retail-label-manual',
    source_external_id = 'TCIN:76366327',
    source_url = v_target_url,
    active = true,
    last_observed_at = v_observed_at,
    updated_at = now()
  WHERE source_external_id = 'A-76366327'
    AND source_url = v_target_url;

  INSERT INTO public.catalog_formula_aliases (
    alias_formula_key, formula_id, identity_hash, match_reason, source_url,
    metadata, updated_at
  ) VALUES (
    v_target_gap_key,
    v_current_formula_id,
    encode(
      digest(
        'general mills|blue buffalo|blue tastefuls adult cat sensitive stomach chicken and brown rice recipe|cat|adult|dry|chicken and brown rice|sensitive stomach',
        'sha256'
      ),
      'hex'
    ),
    'manual_review',
    v_official_url,
    jsonb_build_object(
      'exact_formula_identity', true,
      'species_boundary', 'cat',
      'life_stage_boundary', 'adult',
      'food_form_boundary', 'dry',
      'diet_boundary', 'sensitive stomach',
      'recipe_boundary', 'chicken and brown rice',
      'ingredient_hash_equality_verified', true,
      'target_tcin', '76366327',
      'target_upc', '859610006014',
      'reused_gtin_version_conflict', true,
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
      'Exact Target package alias of the current manufacturer formula. UPC 859610006014 is retained on the current formula; the differing PetSmart ingredient version remains source-addressable without an ambiguous barcode.',
    updated_at = now()
  WHERE id = v_target_gap_formula_id;

  INSERT INTO public.catalog_source_runs (
    run_key, source_slug, source_type, coverage_role, status, started_at,
    finished_at, expected_count, observed_count, accepted_count,
    rejected_count, pagination_complete, source_content_hash, checkpoint,
    metadata, updated_at
  ) VALUES (
    'manual-exact-evidence:target:blue-tastefuls-sensitive-stomach:76366327:20260726',
    'target-retail-label-manual', 'retailer', 'verification', 'completed',
    v_observed_at, v_observed_at, 1, 1, 1, 0, true,
    encode(
      digest(
        v_target_url || '|859610006014|' || v_current_ingredients ||
        '|' || v_target_image,
        'sha256'
      ),
      'hex'
    ),
    '{}'::JSONB,
    jsonb_build_object(
      'evidence_tier', 'manufacturer_current_exact',
      'target_tcin', '76366327',
      'target_upc', '859610006014',
      'ingredient_hash', v_current_hash,
      'manufacturer_current_equivalence', true,
      'reused_gtin_version_conflict', true
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
    run_id, formula_id, source_slug, source_external_id, source_url,
    source_authority, gtin, manufacturer, brand, product_name, product_line,
    pet_type, life_stage, food_form, flavor, diet_condition, package_size,
    ingredient_text, front_image_url, is_complete_food, available_in_us,
    observed_at, content_hash, validation_status, validation_reasons,
    formula_evidence_tier, formula_version_provenance, raw_payload
  ) VALUES (
    v_run_id, v_current_formula_id, 'target-retail-label-manual',
    'TCIN:76366327', v_target_url, 'retailer_verified', '859610006014',
    'general mills', 'blue buffalo',
    'BLUE Tastefuls Adult Cat Sensitive Stomach Chicken & Brown Rice Recipe',
    'BLUE Tastefuls Adult Sensitive Stomach', 'cat', 'adult', 'dry',
    'chicken and brown rice', 'sensitive stomach', '15 lb',
    v_current_ingredients, v_target_image, true, true, v_observed_at,
    encode(
      digest(
        v_target_gap_key || '|859610006014|' || v_current_ingredients ||
        '|' || v_target_image,
        'sha256'
      ),
      'hex'
    ),
    'accepted', ARRAY[]::TEXT[], 'manufacturer_current_exact',
    jsonb_build_object(
      'version_status', 'manufacturer_current_equivalent_package',
      'manufacturer_current_equivalence', true,
      'package_gtin', '859610006014',
      'product_code', 'TCIN 76366327',
      'captured_at', v_observed_at,
      'ingredient_text_hash', v_current_hash,
      'reused_gtin_version_conflict', true
    ),
    jsonb_build_object(
      'target_tcin', '76366327',
      'target_upc', '859610006014',
      'front_image_url', v_target_image,
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
    formula_evidence_tier = 'manufacturer_current_exact',
    formula_version_provenance =
      excluded.formula_version_provenance,
    raw_payload = excluded.raw_payload,
    observed_at = excluded.observed_at;

  UPDATE public.catalog_observations
  SET
    formula_id = v_current_formula_id,
    gtin = '859610006014',
    manufacturer = 'general mills',
    brand = 'blue buffalo',
    product_name =
      'BLUE Tastefuls Adult Cat Sensitive Stomach Chicken & Brown Rice Recipe',
    product_line = 'BLUE Tastefuls Adult Sensitive Stomach',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'chicken and brown rice',
    diet_condition = 'sensitive stomach',
    package_size = '15 lb',
    ingredient_text = v_current_ingredients,
    front_image_url = v_target_image,
    is_complete_food = true,
    observed_at = v_observed_at,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    formula_evidence_tier = 'manufacturer_current_exact',
    formula_version_provenance = jsonb_build_object(
      'version_status', 'manufacturer_current_equivalent_package',
      'manufacturer_current_equivalence', true,
      'package_gtin', '859610006014',
      'product_code', 'TCIN 76366327',
      'captured_at', v_observed_at,
      'ingredient_text_hash', v_current_hash,
      'reused_gtin_version_conflict', true
    ),
    raw_payload = COALESCE(raw_payload, '{}'::JSONB) ||
      jsonb_build_object(
        'target_tcin', '76366327',
        'target_upc', '859610006014',
        'ingredients_verbatim_from_exact_pdp', true,
        'exact_official_ingredient_hash_match', true
      )
  WHERE source_url = v_target_url;

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key, alias_text, normalized_alias, source_url, source_authority,
    evidence_observed_at, provenance, active, created_at, updated_at
  ) VALUES
    (
      v_current_cache,
      'Blue Buffalo Tastefuls with Chicken Sensitive Stomach Natural Adult Dry Cat Food 15lbs',
      public.normalize_verified_product_search_query(
        'Blue Buffalo Tastefuls with Chicken Sensitive Stomach Natural Adult Dry Cat Food 15lbs'
      ),
      v_official_url, 'manufacturer', v_observed_at,
      jsonb_build_object(
        'formula_evidence_tier', 'manufacturer_current_exact',
        'target_tcin', '76366327',
        'package_gtin', '859610006014',
        'generic_name_prefers_manufacturer_current', true,
        'reused_gtin_version_conflict', true
      ),
      true, now(), now()
    ),
    (
      v_petsmart_cache,
      'PetSmart Blue Buffalo Tastefuls Sensitive Stomach Chicken Brown Rice 15 lb source version',
      public.normalize_verified_product_search_query(
        'PetSmart Blue Buffalo Tastefuls Sensitive Stomach Chicken Brown Rice 15 lb source version'
      ),
      (
        SELECT source_url
        FROM public.product_data
        WHERE cache_key = v_petsmart_cache
      ),
      'retailer_verified', v_observed_at,
      jsonb_build_object(
        'formula_evidence_tier', 'retailer_web_version',
        'package_gtin', '859610006014',
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
  ) VALUES (
    v_current_cache, '859610006014',
    'BLUE Tastefuls Adult Cat Sensitive Stomach Chicken & Brown Rice Recipe',
    'Blue Buffalo', 'cat', 'target-retail-label-manual',
    'retailer_verified', v_target_url, v_target_url, v_target_image,
    'retailer_verified', 'retailer_verified',
    encode(digest(v_target_url || '|' || v_target_image, 'sha256'), 'hex'),
    encode(digest(v_current_ingredients || '|' || v_target_image, 'sha256'), 'hex'),
    '2026-07-26-exact-retailer-current-equivalence-v1', 'promoted', NULL,
    jsonb_build_object(
      'formula_evidence_tier', 'manufacturer_current_exact',
      'target_tcin', '76366327',
      'package_gtin', '859610006014',
      'ingredient_hash', v_current_hash,
      'manufacturer_current_equivalence', true,
      'reused_gtin_version_conflict', true,
      'captured_at', v_observed_at
    ),
    now()
  )
  ON CONFLICT DO NOTHING;

  IF (
    SELECT cache_key
    FROM public.resolve_verified_product_by_gtin('859610006014', 8)
    LIMIT 1
  ) IS DISTINCT FROM v_current_cache
     OR EXISTS (
       SELECT 1
       FROM public.resolve_verified_product_by_gtin('859610006014', 8)
       WHERE cache_key = v_petsmart_cache
     )
  THEN
    RAISE EXCEPTION
      'Tastefuls Sensitive Stomach reused UPC did not prefer current';
  END IF;

  IF (
    SELECT cache_key
    FROM public.search_verified_products(
      'Blue Buffalo Tastefuls with Chicken Sensitive Stomach Natural Adult Dry Cat Food 15lbs',
      1
    )
    LIMIT 1
  ) IS DISTINCT FROM v_current_cache THEN
    RAISE EXCEPTION
      'Tastefuls Sensitive Stomach generic search did not prefer current';
  END IF;

  IF (
    SELECT cache_key
    FROM public.search_verified_products(
      'PetSmart Blue Buffalo Tastefuls Sensitive Stomach Chicken Brown Rice 15 lb source version',
      1
    )
    LIMIT 1
  ) IS DISTINCT FROM v_petsmart_cache THEN
    RAISE EXCEPTION
      'Tastefuls Sensitive Stomach source-version search failed';
  END IF;
END;
$$;
