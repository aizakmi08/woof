-- Reconcile exact Target 5 lb / 24 lb and PetSmart 30 lb packages into the
-- current Blue Buffalo Lamb & Brown Rice manufacturer formula. All three
-- retailer statements hash exactly to the current official ingredients.
-- The malformed Target 15 lb copy remains unlinked.

DO $$
DECLARE
  v_formula_id BIGINT;
  v_duplicate_formula_id BIGINT;
  v_target_5_run_id BIGINT;
  v_target_24_run_id BIGINT;
  v_cache_key TEXT :=
    'blue-buffalo-general-mills:blue buffalo life protection formula adult dry dog food - lamb brown rice life-protection-formula lamb-brown-rice-recipe';
  v_formula_key TEXT :=
    'general mills|blue buffalo|life protection formula adult dry dog food lamb and brown rice|dog|adult|dry|lamb and brown rice|';
  v_duplicate_key TEXT :=
    'blue buffalo|blue buffalo|blue buffalo life protection formula adult dry dog food lamb and brown rice|dog|adult|dry||';
  v_target_5_url TEXT :=
    'https://www.target.com/p/blue-buffalo-life-protection-formula-natural-adult-dry-dog-food-with-lamb-and-brown-rice/-/A-52768750';
  v_target_24_url TEXT :=
    'https://www.target.com/p/blue-buffalo-life-protection-formula-natural-adult-dry-dog-food-with-lamb-and-brown-rice-24lbs/-/A-53164808';
  v_target_5_image TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_7ce4deef-e4dd-40be-b8fc-b5af79ab6e9e';
  v_target_24_image TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_3f3b82ba-fa2b-4bf2-adaa-9a52cb905622';
  v_official_url TEXT :=
    'https://www.bluebuffalo.com/dry-dog-food/life-protection-formula/lamb-brown-rice-recipe/';
  v_observed_at TIMESTAMPTZ := '2026-07-26T23:45:00Z';
  v_ingredients TEXT;
  v_ingredient_hash TEXT;
BEGIN
  SELECT id, ingredient_text
  INTO STRICT v_formula_id, v_ingredients
  FROM public.catalog_formulas
  WHERE formula_key = v_formula_key
    AND promoted_cache_key = v_cache_key
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND verification_status = 'verified'
    AND active;

  SELECT id
  INTO STRICT v_duplicate_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_duplicate_key;

  v_ingredient_hash := encode(
    digest(
      public.catalog_normalize_ingredient_evidence(v_ingredients),
      'sha256'
    ),
    'hex'
  );

  IF v_ingredient_hash <>
    '168b577e6fade709883d46a079c534c3962e458c0ca76fd71a47b98e37cd2b1a'
  THEN
    RAISE EXCEPTION
      'Blue Buffalo Lamb & Brown Rice current formula hash changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas duplicate
    WHERE duplicate.id = v_duplicate_formula_id
      AND duplicate.pet_type = 'dog'
      AND duplicate.life_stage = 'adult'
      AND duplicate.food_form = 'dry'
      AND encode(
        digest(
          public.catalog_normalize_ingredient_evidence(
            COALESCE(duplicate.ingredient_text, '')
          ),
          'sha256'
        ),
        'hex'
      ) = v_ingredient_hash
  ) THEN
    RAISE EXCEPTION
      'PetSmart Lamb & Brown Rice evidence does not equal current formula';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_skus sku
    WHERE ltrim(
      regexp_replace(COALESCE(sku.gtin, ''), '[^0-9]', '', 'g'),
      '0'
    ) IN (
      ltrim('840243144099', '0'),
      ltrim('840243141678', '0')
    )
      AND sku.active
      AND sku.formula_id <> v_formula_id
  ) THEN
    RAISE EXCEPTION
      'A Target Blue Lamb UPC already belongs to another active formula';
  END IF;

  -- Remove the duplicate serving row from generic search before its SKU is
  -- reparented. Exact barcode resolution will now use the canonical formula.
  UPDATE public.product_data
  SET
    is_complete_food = false,
    catalog_exclusion_reason = 'duplicate_alias_of_verified_formula',
    ingredient_verification_status = 'unverified',
    verified_at = NULL,
    updated_at = now()
  WHERE cache_key = 'petsmart-retail-catalog:859610000371';

  UPDATE public.catalog_skus
  SET
    formula_id = v_formula_id,
    source_url =
      'https://www.petsmart.com/dog/food/dry-food/blue-buffalo-life-protection-formula-adult-dry-dog-food-lamb-and-brown-rice-46640.html',
    active = true,
    last_observed_at = v_observed_at,
    updated_at = now()
  WHERE formula_id = v_duplicate_formula_id
    AND gtin = '859610000371';

  UPDATE public.catalog_observations
  SET
    formula_id = v_formula_id,
    manufacturer = 'general mills',
    brand = 'blue buffalo',
    product_name =
      'Blue Buffalo Life Protection Formula Adult Lamb & Brown Rice Recipe Dry Dog Food',
    product_line = 'life protection formula',
    pet_type = 'dog',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'lamb and brown rice',
    diet_condition = '',
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'manufacturer_current_equivalence', true,
        'manufacturer_current_formula_key', v_formula_key,
        'ingredient_text_hash', v_ingredient_hash,
        'reconciled_at', v_observed_at
      )
  WHERE formula_id = v_duplicate_formula_id
    AND gtin = '859610000371';

  INSERT INTO public.catalog_formula_aliases (
    alias_formula_key, formula_id, identity_hash, match_reason, source_url,
    metadata, updated_at
  ) VALUES (
    v_duplicate_key,
    v_formula_id,
    encode(digest(v_formula_key, 'sha256'), 'hex'),
    'manual_review',
    v_official_url,
    jsonb_build_object(
      'exact_formula_identity', true,
      'species_boundary', 'dog',
      'life_stage_boundary', 'adult',
      'food_form_boundary', 'dry',
      'recipe_boundary', 'lamb and brown rice',
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
      'Ingredient-identical PetSmart package alias. The current manufacturer formula and every reviewed package GTIN are represented by the canonical formula.',
    updated_at = now()
  WHERE id = v_duplicate_formula_id;

  INSERT INTO public.catalog_skus (
    formula_id, gtin, package_size, package_count, source_slug,
    source_external_id, source_url, active, first_observed_at,
    last_observed_at, updated_at
  ) VALUES
    (
      v_formula_id, '840243144099', '5 lb', 1,
      'target-retail-label-manual', 'TCIN:52616101', v_target_5_url,
      true, v_observed_at, v_observed_at, now()
    ),
    (
      v_formula_id, '840243141678', '24 lb', 1,
      'target-retail-label-manual', 'TCIN:53164808', v_target_24_url,
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
    'manual-exact-evidence:target:blue-lamb-brown-rice:52616101:20260726',
    'target-retail-label-manual',
    'retailer',
    'verification',
    'completed',
    v_observed_at,
    v_observed_at,
    1, 1, 1, 0, true,
    encode(
      digest(v_target_5_url || '|840243144099|' || v_ingredients, 'sha256'),
      'hex'
    ),
    '{}'::JSONB,
    jsonb_build_object(
      'evidence_tier', 'manufacturer_current_exact',
      'tcin', '52616101',
      'upc', '840243144099',
      'package_size', '5 lb',
      'manual_exact_evidence', true,
      'manufacturer_current_equivalence', true,
      'ingredient_text_hash', v_ingredient_hash
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
  RETURNING id INTO v_target_5_run_id;

  INSERT INTO public.catalog_source_runs (
    run_key, source_slug, source_type, coverage_role, status, started_at,
    finished_at, expected_count, observed_count, accepted_count,
    rejected_count, pagination_complete, source_content_hash, checkpoint,
    metadata, updated_at
  ) VALUES (
    'manual-exact-evidence:target:blue-lamb-brown-rice:53164808:20260726',
    'target-retail-label-manual',
    'retailer',
    'verification',
    'completed',
    v_observed_at,
    v_observed_at,
    1, 1, 1, 0, true,
    encode(
      digest(v_target_24_url || '|840243141678|' || v_ingredients, 'sha256'),
      'hex'
    ),
    '{}'::JSONB,
    jsonb_build_object(
      'evidence_tier', 'manufacturer_current_exact',
      'tcin', '53164808',
      'upc', '840243141678',
      'package_size', '24 lb',
      'manual_exact_evidence', true,
      'manufacturer_current_equivalence', true,
      'ingredient_text_hash', v_ingredient_hash
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
  RETURNING id INTO v_target_24_run_id;

  INSERT INTO public.catalog_observations (
    run_id, formula_id, source_slug, source_external_id, source_url,
    source_authority, gtin, manufacturer, brand, product_name, product_line,
    pet_type, life_stage, food_form, flavor, diet_condition, package_size,
    ingredient_text, front_image_url, is_complete_food, available_in_us,
    observed_at, content_hash, validation_status, validation_reasons,
    formula_evidence_tier, formula_version_provenance, raw_payload
  ) VALUES
    (
      v_target_5_run_id, v_formula_id, 'target-retail-label-manual',
      'TCIN:52616101', v_target_5_url, 'retailer_verified', '840243144099',
      'general mills', 'blue buffalo',
      'Blue Buffalo Life Protection Formula Natural Adult Dry Dog Food with Lamb and Brown Rice - 5 lb',
      'life protection formula', 'dog', 'adult', 'dry',
      'lamb and brown rice', '', '5 lb', v_ingredients, v_target_5_image,
      true, true, v_observed_at,
      encode(
        digest(v_formula_key || '|840243144099|' || v_ingredient_hash, 'sha256'),
        'hex'
      ),
      'accepted', ARRAY[]::TEXT[], 'manufacturer_current_exact',
      jsonb_build_object(
        'version_status', 'manufacturer_current_equivalent_package',
        'manufacturer_current_equivalence', true,
        'package_gtin', '840243144099',
        'product_code', 'TCIN 52616101',
        'captured_at', v_observed_at,
        'ingredient_text_hash', v_ingredient_hash
      ),
      jsonb_build_object(
        'target_tcin', '52616101',
        'target_upc', '840243144099',
        'front_image_url', v_target_5_image,
        'ingredients_verbatim_from_exact_pdp', true,
        'exact_official_ingredient_hash_match', true
      )
    ),
    (
      v_target_24_run_id, v_formula_id, 'target-retail-label-manual',
      'TCIN:53164808', v_target_24_url, 'retailer_verified', '840243141678',
      'general mills', 'blue buffalo',
      'Blue Buffalo Life Protection Formula Natural Adult Dry Dog Food with Lamb and Brown Rice - 24 lb',
      'life protection formula', 'dog', 'adult', 'dry',
      'lamb and brown rice', '', '24 lb', v_ingredients, v_target_24_image,
      true, true, v_observed_at,
      encode(
        digest(v_formula_key || '|840243141678|' || v_ingredient_hash, 'sha256'),
        'hex'
      ),
      'accepted', ARRAY[]::TEXT[], 'manufacturer_current_exact',
      jsonb_build_object(
        'version_status', 'manufacturer_current_equivalent_package',
        'manufacturer_current_equivalence', true,
        'package_gtin', '840243141678',
        'product_code', 'TCIN 53164808',
        'captured_at', v_observed_at,
        'ingredient_text_hash', v_ingredient_hash
      ),
      jsonb_build_object(
        'target_tcin', '53164808',
        'target_upc', '840243141678',
        'front_image_url', v_target_24_image,
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
    'Blue Buffalo Life Protection Formula Natural Adult Dry Dog Food with Lamb and Brown Rice',
    public.normalize_verified_product_search_query(
      'Blue Buffalo Life Protection Formula Natural Adult Dry Dog Food with Lamb and Brown Rice'
    ),
    v_target_5_url,
    'retailer_verified',
    v_observed_at,
    jsonb_build_object(
      'evidence_tier', 'manufacturer_current_exact',
      'manufacturer_current_equivalence', true,
      'package_variants', jsonb_build_array(
        jsonb_build_object(
          'package_gtin', '840243144099',
          'product_code', 'TCIN 52616101',
          'package_size', '5 lb',
          'source_url', v_target_5_url
        ),
        jsonb_build_object(
          'package_gtin', '840243141678',
          'product_code', 'TCIN 53164808',
          'package_size', '24 lb',
          'source_url', v_target_24_url
        ),
        jsonb_build_object(
          'package_gtin', '859610000371',
          'product_code', 'PetSmart 46640',
          'package_size', '30 lb'
        )
      )
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE formula_id = v_formula_id
      AND active
      AND gtin IN ('840243144099', '840243141678', '859610000371')
    GROUP BY formula_id
    HAVING count(DISTINCT gtin) = 3
  ) THEN
    RAISE EXCEPTION
      'Blue Buffalo Lamb & Brown Rice exact GTIN inventory is incomplete';
  END IF;

  IF (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('840243144099', 8)
    WHERE cache_key = v_cache_key
      AND nutritional_info->>'formula_evidence_tier' =
        'manufacturer_current_exact'
  ) <> 1 THEN
    RAISE EXCEPTION
      'Target Blue Lamb 5 lb exact barcode did not resolve current formula';
  END IF;

  IF (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('840243141678', 8)
    WHERE cache_key = v_cache_key
      AND nutritional_info->>'formula_evidence_tier' =
        'manufacturer_current_exact'
  ) <> 1 THEN
    RAISE EXCEPTION
      'Target Blue Lamb 24 lb exact barcode did not resolve current formula';
  END IF;

  IF (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('859610000371', 8)
    WHERE cache_key = v_cache_key
      AND nutritional_info->>'formula_evidence_tier' =
        'manufacturer_current_exact'
  ) <> 1 THEN
    RAISE EXCEPTION
      'PetSmart Blue Lamb 30 lb exact barcode did not resolve current formula';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE gtin = '859610000357'
      AND formula_id = v_formula_id
      AND active
  ) THEN
    RAISE EXCEPTION
      'Malformed Target 15 lb evidence was incorrectly attached';
  END IF;
END;
$$;
