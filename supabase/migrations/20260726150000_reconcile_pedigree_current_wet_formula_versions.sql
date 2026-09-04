-- Reconcile five current Pedigree wet formulas that were already verified from
-- exact manufacturer PDPs but remained duplicated in the independent census.
--
-- The duplicate PetSmart rows use the same GTINs while carrying materially
-- different ingredient statements. Keep the current manufacturer formula,
-- quarantine the stale retailer formula version, and normalize the life-stage
-- boundary to adult because the current product-local PDPs say adult nutrition.

DO $$
DECLARE
  target RECORD;
  v_serving public.product_data%ROWTYPE;
  v_new_identity_hash TEXT;
  v_conflict_count INTEGER;
  v_barcode_top TEXT;
BEGIN
  FOR target IN
    SELECT *
    FROM (
      VALUES
        (
          36865::BIGINT,
          '023100015279'::TEXT,
          'pedigree-mars-petcare:023100015279'::TEXT,
          'petsmart-retail-catalog:023100015279'::TEXT,
          'mars petcare|pedigree|choice cuts in gravy adult wet dog food can beef|dog|adult senior|wet|beef|'::TEXT,
          'mars petcare|pedigree|choice cuts in gravy adult wet dog food can beef|dog|adult|wet|beef|'::TEXT,
          'pedigree|pedigree|choice cuts in gravy adult wet dog food can beef|dog|adult|wet|beef|'::TEXT,
          'beef'::TEXT
        ),
        (
          36868::BIGINT,
          '023100120553'::TEXT,
          'pedigree-mars-petcare:023100120553'::TEXT,
          'petsmart-retail-catalog:023100120553'::TEXT,
          'mars petcare|pedigree|choice cuts in gravy adult wet dog food can steak and vegetable|dog|adult senior|wet|steak and vegetable|'::TEXT,
          'mars petcare|pedigree|choice cuts in gravy adult wet dog food can steak and vegetable|dog|adult|wet|steak and vegetable|'::TEXT,
          'pedigree|pedigree|choice cuts in gravy adult wet dog food can steak and vegetable|dog|adult|wet|steak and vegetable|'::TEXT,
          'steak and vegetable'::TEXT
        ),
        (
          36873::BIGINT,
          '023100019079'::TEXT,
          'pedigree-mars-petcare:023100019079'::TEXT,
          'petsmart-retail-catalog:023100019079'::TEXT,
          'mars petcare|pedigree|chopped ground dinner adult wet dog food can chicken and rice dinner|dog|adult senior|wet|chicken and rice dinner|'::TEXT,
          'mars petcare|pedigree|chopped ground dinner adult wet dog food can chicken and rice dinner|dog|adult|wet|chicken and rice dinner|'::TEXT,
          'pedigree|pedigree|chopped ground dinner adult wet dog food can chicken and rice dinner|dog|adult|wet|chicken and rice dinner|'::TEXT,
          'chicken and rice dinner'::TEXT
        ),
        (
          36874::BIGINT,
          '023100010786'::TEXT,
          'pedigree-mars-petcare:023100010786'::TEXT,
          'petsmart-retail-catalog:023100010786'::TEXT,
          'mars petcare|pedigree|chopped ground dinner adult wet dog food can chicken liver and beef|dog|adult senior|wet|chicken liver and beef|'::TEXT,
          'mars petcare|pedigree|chopped ground dinner adult wet dog food can chicken liver and beef|dog|adult|wet|chicken liver and beef|'::TEXT,
          'pedigree|pedigree|chopped ground dinner adult wet dog food can chicken liver and beef|dog|adult|wet|chicken liver and beef|'::TEXT,
          'chicken liver and beef'::TEXT
        ),
        (
          36878::BIGINT,
          '023100011080'::TEXT,
          'pedigree-mars-petcare:023100011080'::TEXT,
          'petsmart-retail-catalog:023100011080'::TEXT,
          'mars petcare|pedigree|chopped ground dinner adult wet dog food can turkey and bacon|dog|adult senior|wet|turkey and bacon|'::TEXT,
          'mars petcare|pedigree|chopped ground dinner adult wet dog food can turkey and bacon|dog|adult|wet|turkey and bacon|'::TEXT,
          'pedigree|pedigree|chopped ground dinner adult wet dog food can turkey and bacon|dog|adult|wet|turkey and bacon|'::TEXT,
          'turkey and bacon'::TEXT
        )
    ) AS reviewed(
      formula_id,
      gtin,
      serving_cache_key,
      stale_retailer_cache_key,
      old_formula_key,
      canonical_formula_key,
      retailer_formula_key,
      canonical_flavor
    )
  LOOP
    SELECT *
    INTO STRICT v_serving
    FROM public.product_data
    WHERE cache_key = target.serving_cache_key
      AND regexp_replace(COALESCE(gtin, ''), '\D', '', 'g') = target.gtin
      AND pet_type = 'dog'
      AND food_form = 'wet'
      AND is_complete_food
      AND catalog_exclusion_reason IS NULL
      AND source_quality = 'manufacturer'
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND ingredient_count >= 5
      AND source_url LIKE 'https://www.pedigree.com/products/wet/%'
      AND NULLIF(btrim(image_url), '') IS NOT NULL
      AND NULLIF(btrim(ingredient_text), '') IS NOT NULL;

    IF NOT EXISTS (
      SELECT 1
      FROM public.catalog_formulas formula
      WHERE formula.id = target.formula_id
        AND formula.formula_key = target.old_formula_key
        AND formula.promoted_cache_key = target.serving_cache_key
        AND formula.verification_status = 'verified'
        AND formula.active
        AND public.catalog_normalize_ingredient_evidence(
              formula.ingredient_text
            ) =
            public.catalog_normalize_ingredient_evidence(
              v_serving.ingredient_text
            )
    ) THEN
      RAISE EXCEPTION
        'Pedigree current manufacturer formula precondition failed for GTIN %',
        target.gtin;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.product_data stale
      WHERE stale.cache_key = target.stale_retailer_cache_key
        AND regexp_replace(COALESCE(stale.gtin, ''), '\D', '', 'g') =
            target.gtin
        AND public.catalog_normalize_ingredient_evidence(
              stale.ingredient_text
            ) <>
            public.catalog_normalize_ingredient_evidence(
              v_serving.ingredient_text
            )
    ) THEN
      RAISE EXCEPTION
        'Pedigree stale retailer formula-version precondition failed for GTIN %',
        target.gtin;
    END IF;

    SELECT count(*)
    INTO v_conflict_count
    FROM public.catalog_formulas formula
    WHERE formula.formula_key = target.canonical_formula_key
      AND formula.id <> target.formula_id;

    IF v_conflict_count <> 0 THEN
      RAISE EXCEPTION
        'Pedigree canonical identity already belongs to a sibling for GTIN %',
        target.gtin;
    END IF;

    v_new_identity_hash :=
      encode(digest(target.canonical_formula_key, 'sha256'), 'hex');

    INSERT INTO public.catalog_formula_aliases (
      alias_formula_key,
      formula_id,
      identity_hash,
      match_reason,
      source_url,
      metadata,
      updated_at
    )
    VALUES
      (
        target.old_formula_key,
        target.formula_id,
        v_new_identity_hash,
        'manual_review',
        v_serving.source_url,
        jsonb_build_object(
          'reviewed_at', '2026-07-26',
          'review_reason',
            'current_official_pdp_is_adult_only_not_adult_senior',
          'gtin', target.gtin
        ),
        NOW()
      ),
      (
        target.retailer_formula_key,
        target.formula_id,
        v_new_identity_hash,
        'manual_review',
        v_serving.source_url,
        jsonb_build_object(
          'reviewed_at', '2026-07-26',
          'review_reason',
            'exact_gtin_and_recipe_identity_reconciled_to_current_manufacturer_formula',
          'stale_retailer_formula_version_quarantined', TRUE,
          'gtin', target.gtin
        ),
        NOW()
      )
    ON CONFLICT (alias_formula_key) DO UPDATE
    SET
      formula_id = EXCLUDED.formula_id,
      identity_hash = EXCLUDED.identity_hash,
      match_reason = EXCLUDED.match_reason,
      source_url = EXCLUDED.source_url,
      metadata = EXCLUDED.metadata,
      updated_at = NOW();

    UPDATE public.product_data
    SET
      life_stage = 'adult',
      flavor = target.canonical_flavor,
      updated_at = NOW()
    WHERE cache_key = target.serving_cache_key;

    UPDATE public.catalog_formulas
    SET
      formula_key = target.canonical_formula_key,
      identity_hash = v_new_identity_hash,
      life_stage = 'adult',
      flavor = target.canonical_flavor,
      complete_food_evidence =
        'Current exact Pedigree manufacturer PDP states 100% complete adult nutrition and publishes the full current ingredient statement and matching front-package images.',
      protected_terms = ARRAY[
        'Pedigree',
        CASE
          WHEN target.canonical_formula_key LIKE '%choice cuts%'
            THEN 'Choice Cuts in Gravy'
          ELSE 'Chopped Ground Dinner'
        END,
        'Adult',
        'Wet',
        target.canonical_flavor
      ]::TEXT[],
      last_observed_at = NOW(),
      updated_at = NOW()
    WHERE id = target.formula_id;

    UPDATE public.product_data
    SET
      is_complete_food = FALSE,
      catalog_exclusion_reason =
        'retailer_formula_version_conflicts_with_current_manufacturer_evidence',
      ingredient_verification_status = 'unverified',
      verified_at = NULL,
      updated_at = NOW()
    WHERE cache_key = target.stale_retailer_cache_key;

    UPDATE public.catalog_product_evidence
    SET
      review_state = 'rejected',
      rejection_reason =
        'retailer_formula_version_conflicts_with_current_manufacturer_evidence',
      ingredient_verification_status = 'unverified',
      updated_at = NOW()
    WHERE cache_key = target.stale_retailer_cache_key;

    UPDATE public.catalog_observations
    SET
      validation_status = 'rejected',
      validation_reasons = CASE
        WHEN 'retailer_formula_version_conflicts_with_current_manufacturer_evidence' =
             ANY(COALESCE(validation_reasons, ARRAY[]::TEXT[]))
          THEN validation_reasons
        ELSE array_append(
          COALESCE(validation_reasons, ARRAY[]::TEXT[]),
          'retailer_formula_version_conflicts_with_current_manufacturer_evidence'
        )
      END
    WHERE formula_id = target.formula_id
      AND source_slug = 'petsmart-retail-catalog'
      AND regexp_replace(COALESCE(gtin, ''), '\D', '', 'g') = target.gtin;

    UPDATE public.catalog_skus
    SET
      active = FALSE,
      updated_at = NOW()
    WHERE formula_id = target.formula_id
      AND source_slug = 'petsmart-retail-catalog'
      AND regexp_replace(COALESCE(gtin, ''), '\D', '', 'g') = target.gtin;

    UPDATE public.catalog_field_evidence
    SET accepted = FALSE
    WHERE formula_id = target.formula_id
      AND source_authority = 'retailer_verified'
      AND field_name = 'ingredient_text';

    PERFORM *
    FROM public.promote_catalog_formula(target.formula_id);

    SELECT resolved.cache_key
    INTO v_barcode_top
    FROM public.resolve_verified_product_by_gtin(target.gtin, 8) resolved
    LIMIT 1;

    IF v_barcode_top IS DISTINCT FROM target.serving_cache_key THEN
      RAISE EXCEPTION
        'Pedigree current manufacturer barcode resolution failed for GTIN %: expected %, found %',
        target.gtin,
        target.serving_cache_key,
        v_barcode_top;
    END IF;
  END LOOP;

  IF (
    SELECT count(*)
    FROM public.catalog_formulas formula
    JOIN public.product_data serving
      ON serving.cache_key = formula.promoted_cache_key
    WHERE formula.id IN (36865, 36868, 36873, 36874, 36878)
      AND formula.life_stage = 'adult'
      AND serving.life_stage = 'adult'
      AND formula.verification_status = 'verified'
      AND formula.active
      AND serving.is_complete_food
      AND serving.catalog_exclusion_reason IS NULL
      AND public.catalog_normalize_ingredient_evidence(
            formula.ingredient_text
          ) =
          public.catalog_normalize_ingredient_evidence(
            serving.ingredient_text
          )
  ) <> 5 THEN
    RAISE EXCEPTION
      'Pedigree five-formula current manufacturer reconciliation is incomplete';
  END IF;

  IF (
    SELECT count(*)
    FROM public.product_data stale
    WHERE stale.cache_key IN (
      'petsmart-retail-catalog:023100015279',
      'petsmart-retail-catalog:023100120553',
      'petsmart-retail-catalog:023100019079',
      'petsmart-retail-catalog:023100010786',
      'petsmart-retail-catalog:023100011080'
    )
      AND NOT stale.is_complete_food
      AND stale.catalog_exclusion_reason =
        'retailer_formula_version_conflicts_with_current_manufacturer_evidence'
      AND stale.ingredient_verification_status = 'unverified'
  ) <> 5 THEN
    RAISE EXCEPTION
      'Pedigree stale PetSmart formula-version quarantine is incomplete';
  END IF;
END
$$;

DO $$
DECLARE
  test RECORD;
  v_search_top TEXT;
BEGIN
  FOR test IN
    SELECT *
    FROM (
      VALUES
        (
          'Pedigree Choice Cuts in Gravy Adult Wet Dog Food Can Beef'::TEXT,
          'pedigree-mars-petcare:023100015279'::TEXT
        ),
        (
          'Pedigree Choice Cuts in Gravy Adult Wet Dog Food Can Steak and Vegetable'::TEXT,
          'pedigree-mars-petcare:023100120553'::TEXT
        ),
        (
          'Pedigree Chopped Ground Dinner Adult Wet Dog Food Can Chicken and Rice Dinner'::TEXT,
          'pedigree-mars-petcare:023100019079'::TEXT
        ),
        (
          'Pedigree Chopped Ground Dinner Adult Wet Dog Food Can Chicken Liver and Beef'::TEXT,
          'pedigree-mars-petcare:023100010786'::TEXT
        ),
        (
          'Pedigree Chopped Ground Dinner Adult Wet Dog Food Can Turkey and Bacon'::TEXT,
          'pedigree-mars-petcare:023100011080'::TEXT
        )
    ) reviewed(query_text, expected_cache_key)
  LOOP
    SELECT result.cache_key
    INTO v_search_top
    FROM public.search_verified_products(test.query_text, 5) result
    ORDER BY result.rank DESC
    LIMIT 1;

    IF v_search_top IS DISTINCT FROM test.expected_cache_key THEN
      RAISE EXCEPTION
        'Pedigree exact search regression for "%": expected %, found %',
        test.query_text,
        test.expected_cache_key,
        v_search_top;
    END IF;
  END LOOP;
END
$$;
