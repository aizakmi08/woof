-- Repair four reviewed exact-official-URL cases without weakening identity.
--
-- 1. KASIKS 12.2z is a reviewed FirstMate title typo for 12.2 oz. The two
--    cat package sizes are SKU children of one formula; dog remains separate.
-- 2. Freshpet Vital GTIN 851893001731 is a distinct current ingredient/image
--    version, not a size alias of legacy GTIN 627975010348 and not the
--    conflicting PetSmart ingredient version that reuses the same GTIN.
-- 3. NutriSource Senior keeps the same GTIN and ingredient statement while
--    its current official URL and front image replace the stale `-copy` URL.
--
-- Every verified result below has already-existing exact manufacturer
-- ingredients and a matching image. New/repaired canonical records are also
-- staged through completed bounded exact-evidence runs before promotion.

DO $kasiks$
DECLARE
  v_cat_formula_id BIGINT;
  v_cat_size_formula_id BIGINT;
  v_dog_formula_id BIGINT;
  v_cat_cache CONSTANT TEXT :=
    'kasiks-firstmate:product-kasiks-grub-formula-cats-12-cans';
  v_cat_size_cache CONSTANT TEXT :=
    'kasiks-firstmate:product-kasiks-grub-formula-cats-24-cans';
  v_dog_cache CONSTANT TEXT :=
    'kasiks-firstmate:product-kasiks-grub-formula-dogs-12-cans';
  v_cat_url CONSTANT TEXT :=
    'https://firstmate.com/product/kasiks-grub-formula-cats-12-cans/';
  v_cat_size_url CONSTANT TEXT :=
    'https://firstmate.com/product/kasiks-grub-formula-cats-24-cans/';
  v_dog_url CONSTANT TEXT :=
    'https://firstmate.com/product/kasiks-grub-formula-dogs-12-cans/';
  v_cat_image CONSTANT TEXT :=
    'https://firstmate.com/wp-content/uploads/2017/02/Kasiks_Grub_Formula_CAT_Food_12.2oz_3D_Render_resized.png';
  v_cat_size_image CONSTANT TEXT :=
    'https://firstmate.com/wp-content/uploads/2017/02/Kasiks_Grub_Formula_CAT_Food_5.5oz_3D_Render_resized.png';
  v_dog_image CONSTANT TEXT :=
    'https://firstmate.com/wp-content/uploads/2017/02/Kasiks_Grub_Formula_DOG_Food_345g_V3_01.png';
  v_old_cat_key CONSTANT TEXT :=
    'firstmate|firstmate|kasiks fraser valley grub formula for cats 12 2z 12 cans|cat|unknown|unknown||';
  v_old_cat_size_key CONSTANT TEXT :=
    'firstmate|firstmate|kasiks fraser valley grub formula for cats 5 5oz 24 cans|cat|unknown|unknown||';
  v_old_dog_key CONSTANT TEXT :=
    'firstmate|firstmate|kasiks fraser valley grub formula for dogs 12 2z 12 cans|dog|unknown|unknown||';
  v_cat_key CONSTANT TEXT :=
    'kasiks|kasiks|fraser valley|cat|all life stages|wet|grub formula|';
  v_dog_key CONSTANT TEXT :=
    'kasiks|kasiks|fraser valley|dog|adult|wet|grub formula|';
  v_cat_identity CONSTANT TEXT :=
    '55a82b60c378bb2ff843b667a431890c610bdcc3f061a4d861a04af5eaa2f966';
  v_dog_identity CONSTANT TEXT :=
    '1a4a2b1a249216c2c42afc7ad967c93bd0520d58ab8facd1908d1944ecafe242';
  v_ingredient_hash CONSTANT TEXT :=
    '26730203a240b04bab14ba14d15db9cfe1228753d3cee27276d84631ee172460';
  v_run_key CONSTANT TEXT :=
    'firstmate:bounded-exact-evidence:kasiks-grub-size-repair:20260804:v1';
  v_run JSONB;
  v_payload JSONB;
  v_run_id BIGINT;
BEGIN
  SELECT id INTO STRICT v_cat_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_old_cat_key
    AND source_url = v_cat_url
    AND front_image_url = v_cat_image
    AND active
    AND verification_status = 'verified';

  SELECT id INTO STRICT v_cat_size_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_old_cat_size_key
    AND source_url = v_cat_size_url
    AND front_image_url = v_cat_size_image
    AND active
    AND verification_status = 'verified';

  SELECT id INTO STRICT v_dog_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_old_dog_key
    AND source_url = v_dog_url
    AND front_image_url = v_dog_image
    AND active
    AND verification_status = 'verified';

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    WHERE formula.id NOT IN (
      v_cat_formula_id, v_cat_size_formula_id, v_dog_formula_id
    )
      AND (
        formula.formula_key IN (v_cat_key, v_dog_key)
        OR (
          formula.active
          AND formula.identity_hash IN (v_cat_identity, v_dog_identity)
        )
      )
  ) THEN
    RAISE EXCEPTION 'KASIKS canonical identity is occupied by another formula';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_data serving
    WHERE serving.cache_key IN (v_cat_cache, v_cat_size_cache, v_dog_cache)
      AND (
        serving.source_url NOT IN (v_cat_url, v_cat_size_url, v_dog_url)
        OR serving.image_url NOT IN (
          v_cat_image, v_cat_size_image, v_dog_image
        )
        OR serving.ingredient_count <> 14
        OR encode(digest(
          regexp_replace(
            lower(COALESCE(serving.ingredient_text, '')),
            '[^a-z0-9]+', '', 'g'
          ), 'sha256'
        ), 'hex') <> v_ingredient_hash
        OR serving.ingredient_verification_status <> 'manufacturer'
        OR serving.image_verification_status <> 'manufacturer'
        OR serving.formula_evidence_tier <> 'manufacturer_current_exact'
        OR NOT serving.is_complete_food
      )
  ) OR (
    SELECT count(*)
    FROM public.product_data
    WHERE cache_key IN (v_cat_cache, v_cat_size_cache, v_dog_cache)
  ) <> 3 THEN
    RAISE EXCEPTION 'KASIKS exact serving evidence changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    WHERE formula.id IN (
      v_cat_formula_id, v_cat_size_formula_id, v_dog_formula_id
    )
      AND encode(digest(
        regexp_replace(
          lower(COALESCE(formula.ingredient_text, '')),
          '[^a-z0-9]+', '', 'g'
        ), 'sha256'
      ), 'hex') <> v_ingredient_hash
  ) THEN
    RAISE EXCEPTION 'KASIKS ledger ingredients changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_source_runs WHERE run_key = v_run_key
  ) THEN
    RAISE EXCEPTION 'KASIKS reviewed bounded run already exists';
  END IF;

  -- Package-count/title metadata from the 24-can cat page belongs to the
  -- canonical cat formula. Preserve the source observation, image, and SKU.
  UPDATE public.catalog_observations
  SET formula_id = v_cat_formula_id
  WHERE formula_id = v_cat_size_formula_id;

  UPDATE public.catalog_field_evidence
  SET formula_id = v_cat_formula_id
  WHERE formula_id = v_cat_size_formula_id;

  UPDATE public.catalog_skus
  SET formula_id = v_cat_formula_id,
      updated_at = NOW()
  WHERE formula_id = v_cat_size_formula_id;

  UPDATE public.catalog_formulas
  SET verification_status = 'quarantined',
      active = FALSE,
      absent_since = COALESCE(absent_since, NOW()),
      promoted_cache_key = NULL,
      promoted_at = NULL,
      complete_food_evidence =
        'Reviewed package-size duplicate of the canonical KASIKS Fraser Valley Grub Formula for Cats.',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB)
        || jsonb_build_object(
          'duplicate_of_formula_id', v_cat_formula_id,
          'same_formula_size_variant', TRUE,
          'package_size_is_sku_only', TRUE,
          'reconciled_at', NOW()
        ),
      updated_at = NOW()
  WHERE id = v_cat_size_formula_id;

  UPDATE public.catalog_formulas formula
  SET formula_key = v_cat_key,
      identity_hash = v_cat_identity,
      manufacturer = 'FirstMate Pet Foods',
      brand = 'Kasiks',
      product_name = 'Kasiks Fraser Valley Grub Formula for Cats',
      product_line = 'Fraser Valley',
      pet_type = 'cat',
      life_stage = 'all life stages',
      food_form = 'wet',
      flavor = 'Grub Formula',
      diet_condition = '',
      is_complete_food = TRUE,
      complete_food_evidence =
        'Exact official FirstMate KASIKS cat PDPs publish the same complete Grub Formula in two package sizes, with full ingredients and matching package images.',
      ingredient_text = serving.ingredient_text,
      ingredients = serving.ingredients,
      front_image_url = v_cat_image,
      source_url = v_cat_url,
      source_authority = 'manufacturer',
      ingredient_verification_status = 'manufacturer',
      image_verification_status = 'manufacturer',
      protected_terms = ARRAY[
        'Kasiks', 'Fraser Valley', 'Grub Formula',
        'cat', 'all life stages', 'wet'
      ]::TEXT[],
      verification_status = 'verified',
      active = TRUE,
      absent_since = NULL,
      promoted_cache_key = v_cat_cache,
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance = jsonb_build_object(
        'evidence_tier', 'manufacturer_current_exact',
        'source', 'firstmate',
        'source_url', v_cat_url,
        'captured_at', '2026-08-04T08:59:37Z'::TIMESTAMPTZ,
        'ingredient_text_hash', v_ingredient_hash,
        'front_image_url', v_cat_image,
        'consumer_brand', 'Kasiks',
        'same_formula_size_variant_url', v_cat_size_url,
        'package_size_is_sku_only', TRUE,
        'exact_formula_evidence', TRUE
      ),
      updated_at = NOW()
  FROM public.product_data serving
  WHERE formula.id = v_cat_formula_id
    AND serving.cache_key = v_cat_cache;

  UPDATE public.catalog_formulas formula
  SET formula_key = v_dog_key,
      identity_hash = v_dog_identity,
      manufacturer = 'FirstMate Pet Foods',
      brand = 'Kasiks',
      product_name = 'Kasiks Fraser Valley Grub Formula for Dogs',
      product_line = 'Fraser Valley',
      pet_type = 'dog',
      life_stage = 'adult',
      food_form = 'wet',
      flavor = 'Grub Formula',
      diet_condition = '',
      is_complete_food = TRUE,
      complete_food_evidence =
        'Exact official FirstMate KASIKS dog PDP publishes the complete Grub Formula with full ingredients and a matching front-package image.',
      ingredient_text = serving.ingredient_text,
      ingredients = serving.ingredients,
      front_image_url = v_dog_image,
      source_url = v_dog_url,
      source_authority = 'manufacturer',
      ingredient_verification_status = 'manufacturer',
      image_verification_status = 'manufacturer',
      protected_terms = ARRAY[
        'Kasiks', 'Fraser Valley', 'Grub Formula', 'dog', 'adult', 'wet'
      ]::TEXT[],
      verification_status = 'verified',
      active = TRUE,
      absent_since = NULL,
      promoted_cache_key = v_dog_cache,
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance = jsonb_build_object(
        'evidence_tier', 'manufacturer_current_exact',
        'source', 'firstmate',
        'source_url', v_dog_url,
        'captured_at', '2026-08-04T08:59:37Z'::TIMESTAMPTZ,
        'ingredient_text_hash', v_ingredient_hash,
        'front_image_url', v_dog_image,
        'consumer_brand', 'Kasiks',
        'package_size_is_sku_only', TRUE,
        'exact_formula_evidence', TRUE
      ),
      updated_at = NOW()
  FROM public.product_data serving
  WHERE formula.id = v_dog_formula_id
    AND serving.cache_key = v_dog_cache;

  UPDATE public.catalog_observations observation
  SET manufacturer = 'FirstMate Pet Foods',
      brand = 'Kasiks',
      product_line = 'Fraser Valley',
      life_stage = CASE
        WHEN formula_id = v_cat_formula_id THEN 'all life stages'
        ELSE 'adult'
      END,
      food_form = 'wet',
      flavor = 'Grub Formula',
      diet_condition = '',
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance =
        COALESCE(observation.formula_version_provenance, '{}'::JSONB)
        || jsonb_build_object(
          'consumer_brand', 'Kasiks',
          'canonical_product_line', 'Fraser Valley',
          'package_size_is_sku_only', TRUE,
          'identity_repair', 'reviewed_malformed_12_2z_package_title'
        )
  WHERE formula_id IN (v_cat_formula_id, v_dog_formula_id);

  UPDATE public.product_data serving
  SET product_name = 'Kasiks Fraser Valley Grub Formula for Cats',
      brand = 'Kasiks',
      product_line = 'Fraser Valley',
      pet_type = 'cat',
      life_stage = 'all life stages',
      food_form = 'wet',
      flavor = 'Grub Formula',
      is_complete_food = TRUE,
      catalog_exclusion_reason = CASE
        WHEN cache_key = v_cat_size_cache
          THEN 'duplicate_size_variant_of_verified_formula'
        ELSE NULL
      END,
      ingredient_verification_status = 'manufacturer',
      image_verification_status = 'manufacturer',
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB)
        || jsonb_build_object(
          'canonical_formula_id', v_cat_formula_id,
          'canonical_cache_key', v_cat_cache,
          'package_size_is_sku_only', TRUE,
          'reconciled_at', NOW()
        ),
      updated_at = NOW()
  WHERE cache_key IN (v_cat_cache, v_cat_size_cache);

  UPDATE public.product_data
  SET product_name = 'Kasiks Fraser Valley Grub Formula for Dogs',
      brand = 'Kasiks',
      product_line = 'Fraser Valley',
      pet_type = 'dog',
      life_stage = 'adult',
      food_form = 'wet',
      flavor = 'Grub Formula',
      is_complete_food = TRUE,
      catalog_exclusion_reason = NULL,
      ingredient_verification_status = 'manufacturer',
      image_verification_status = 'manufacturer',
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB)
        || jsonb_build_object(
          'canonical_formula_id', v_dog_formula_id,
          'package_size_is_sku_only', TRUE,
          'reconciled_at', NOW()
        ),
      updated_at = NOW()
  WHERE cache_key = v_dog_cache;

  INSERT INTO public.catalog_formula_aliases (
    alias_formula_key, formula_id, identity_hash, match_reason,
    source_url, metadata, updated_at
  ) VALUES
    (
      v_old_cat_key, v_cat_formula_id, v_cat_identity, 'manual_review',
      v_cat_url,
      jsonb_build_object(
        'consumer_brand', 'Kasiks',
        'species_boundary', 'cat',
        'same_formula_size_variant', TRUE,
        'reviewed_title_typo', '12.2z',
        'canonical_formula_key', v_cat_key,
        'reviewed_at', NOW()
      ), NOW()
    ),
    (
      v_old_cat_size_key, v_cat_formula_id, v_cat_identity, 'manual_review',
      v_cat_size_url,
      jsonb_build_object(
        'consumer_brand', 'Kasiks',
        'species_boundary', 'cat',
        'same_formula_size_variant', TRUE,
        'canonical_formula_key', v_cat_key,
        'reviewed_at', NOW()
      ), NOW()
    ),
    (
      v_old_dog_key, v_dog_formula_id, v_dog_identity, 'manual_review',
      v_dog_url,
      jsonb_build_object(
        'consumer_brand', 'Kasiks',
        'species_boundary', 'dog',
        'reviewed_title_typo', '12.2z',
        'canonical_formula_key', v_dog_key,
        'reviewed_at', NOW()
      ), NOW()
    )
  ON CONFLICT (alias_formula_key) DO UPDATE
  SET formula_id = EXCLUDED.formula_id,
      identity_hash = EXCLUDED.identity_hash,
      match_reason = EXCLUDED.match_reason,
      source_url = EXCLUDED.source_url,
      metadata = EXCLUDED.metadata,
      updated_at = NOW();

  SELECT jsonb_build_object(
    'run_key', v_run_key,
    'source_slug', 'firstmate',
    'source_type', 'manufacturer',
    'coverage_role', 'verification',
    'status', 'completed',
    'started_at', '2026-08-04T08:59:37Z',
    'expected_count', 3,
    'pagination_complete', TRUE,
    'truncated', FALSE,
    'cap_reached', FALSE,
    'source_content_hash', encode(digest(
      v_cat_url || '|' || v_cat_size_url || '|' || v_dog_url || '|'
      || v_ingredient_hash, 'sha256'
    ), 'hex'),
    'checkpoint', jsonb_build_object(
      'feed_row_count', 3,
      'accepted_observation_count', 3,
      'canonical_formula_count', 2
    ),
    'metadata', jsonb_build_object(
      'brand', 'Kasiks',
      'manufacturer', 'FirstMate Pet Foods',
      'source_authority', 'manufacturer',
      'bounded_exact_evidence', TRUE,
      'exact_formula_evidence', TRUE,
      'package_size_is_sku_only', TRUE,
      'reviewed_malformed_package_title', TRUE
    )
  ) INTO v_run;

  SELECT jsonb_agg(payload ORDER BY ordinal)
  INTO v_payload
  FROM (
    SELECT 1 AS ordinal, jsonb_build_object(
      'formula_key', v_cat_key,
      'identity_hash', v_cat_identity,
      'manufacturer', 'FirstMate Pet Foods',
      'brand', 'Kasiks',
      'product_name', 'KASIKS Fraser Valley Grub Formula for Cats 12.2z – 12 Cans',
      'product_line', 'Fraser Valley',
      'pet_type', 'cat',
      'life_stage', 'all life stages',
      'food_form', 'wet',
      'flavor', 'Grub Formula',
      'diet_condition', '',
      'source_slug', 'firstmate',
      'source_external_id', 'firstmate:kasiks-grub-formula-cats-12-cans:reviewed-20260804',
      'source_url', v_cat_url,
      'source_authority', 'manufacturer',
      'gtin', '',
      'package_size', '12 x 12.2 oz cans',
      'ingredient_text', serving.ingredient_text,
      'ingredients', to_jsonb(serving.ingredients),
      'front_image_url', v_cat_image,
      'is_complete_food', TRUE,
      'available_in_us', TRUE,
      'protected_terms', jsonb_build_array(
        'Kasiks', 'Fraser Valley', 'Grub Formula', 'cat', 'wet'
      ),
      'observed_at', '2026-08-04T08:59:37Z',
      'content_hash', encode(digest(
        v_cat_url || '|' || serving.ingredient_text || '|' || v_cat_image,
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
        'source', 'firstmate',
        'source_url', v_cat_url,
        'captured_at', '2026-08-04T08:59:37Z',
        'package_size_is_sku_only', TRUE,
        'exact_formula_evidence', TRUE
      ),
      'raw_payload', jsonb_build_object(
        'cache_key', v_cat_cache,
        'exact_formula_evidence', TRUE,
        'package_size_is_sku_only', TRUE
      )
    ) AS payload
    FROM public.product_data serving
    WHERE serving.cache_key = v_cat_cache

    UNION ALL

    SELECT 2, jsonb_build_object(
      'formula_key', v_cat_key,
      'identity_hash', v_cat_identity,
      'manufacturer', 'FirstMate Pet Foods',
      'brand', 'Kasiks',
      'product_name', 'KASIKS Fraser Valley Grub Formula for Cats 5.5oz – 24 Cans',
      'product_line', 'Fraser Valley',
      'pet_type', 'cat',
      'life_stage', 'all life stages',
      'food_form', 'wet',
      'flavor', 'Grub Formula',
      'diet_condition', '',
      'source_slug', 'firstmate',
      'source_external_id', 'firstmate:kasiks-grub-formula-cats-24-cans:reviewed-20260804',
      'source_url', v_cat_size_url,
      'source_authority', 'manufacturer',
      'gtin', '',
      'package_size', '24 x 5.5 oz cans',
      'ingredient_text', serving.ingredient_text,
      'ingredients', to_jsonb(serving.ingredients),
      'front_image_url', v_cat_size_image,
      'is_complete_food', TRUE,
      'available_in_us', TRUE,
      'protected_terms', jsonb_build_array(
        'Kasiks', 'Fraser Valley', 'Grub Formula', 'cat', 'wet'
      ),
      'observed_at', '2026-08-04T08:59:37Z',
      'content_hash', encode(digest(
        v_cat_size_url || '|' || serving.ingredient_text || '|'
        || v_cat_size_image, 'sha256'
      ), 'hex'),
      'validation_status', 'accepted',
      'validation_reasons', '[]'::JSONB,
      'ingredient_verification_status', 'manufacturer',
      'image_verification_status', 'manufacturer',
      'coverage_tier', 'tier_1_us_retail',
      'formula_evidence_tier', 'manufacturer_current_exact',
      'formula_version_provenance', jsonb_build_object(
        'version_status', 'manufacturer_current',
        'source', 'firstmate',
        'source_url', v_cat_size_url,
        'captured_at', '2026-08-04T08:59:37Z',
        'same_formula_size_variant', TRUE,
        'package_size_is_sku_only', TRUE,
        'exact_formula_evidence', TRUE
      ),
      'raw_payload', jsonb_build_object(
        'cache_key', v_cat_size_cache,
        'exact_formula_evidence', TRUE,
        'package_size_is_sku_only', TRUE
      )
    )
    FROM public.product_data serving
    WHERE serving.cache_key = v_cat_size_cache

    UNION ALL

    SELECT 3, jsonb_build_object(
      'formula_key', v_dog_key,
      'identity_hash', v_dog_identity,
      'manufacturer', 'FirstMate Pet Foods',
      'brand', 'Kasiks',
      'product_name', 'KASIKS Fraser Valley Grub Formula for Dogs 12.2z – 12 Cans',
      'product_line', 'Fraser Valley',
      'pet_type', 'dog',
      'life_stage', 'adult',
      'food_form', 'wet',
      'flavor', 'Grub Formula',
      'diet_condition', '',
      'source_slug', 'firstmate',
      'source_external_id', 'firstmate:kasiks-grub-formula-dogs-12-cans:reviewed-20260804',
      'source_url', v_dog_url,
      'source_authority', 'manufacturer',
      'gtin', '',
      'package_size', '12 x 12.2 oz cans',
      'ingredient_text', serving.ingredient_text,
      'ingredients', to_jsonb(serving.ingredients),
      'front_image_url', v_dog_image,
      'is_complete_food', TRUE,
      'available_in_us', TRUE,
      'protected_terms', jsonb_build_array(
        'Kasiks', 'Fraser Valley', 'Grub Formula', 'dog', 'adult', 'wet'
      ),
      'observed_at', '2026-08-04T08:59:37Z',
      'content_hash', encode(digest(
        v_dog_url || '|' || serving.ingredient_text || '|' || v_dog_image,
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
        'source', 'firstmate',
        'source_url', v_dog_url,
        'captured_at', '2026-08-04T08:59:37Z',
        'package_size_is_sku_only', TRUE,
        'exact_formula_evidence', TRUE
      ),
      'raw_payload', jsonb_build_object(
        'cache_key', v_dog_cache,
        'exact_formula_evidence', TRUE,
        'package_size_is_sku_only', TRUE
      )
    )
    FROM public.product_data serving
    WHERE serving.cache_key = v_dog_cache
  ) staged;

  IF jsonb_array_length(v_payload) <> 3 THEN
    RAISE EXCEPTION 'KASIKS bounded payload did not contain three packages';
  END IF;

  PERFORM public.stage_catalog_census_batch(v_run, v_payload);

  SELECT id INTO STRICT v_run_id
  FROM public.catalog_source_runs
  WHERE run_key = v_run_key
    AND status = 'completed'
    AND expected_count = 3
    AND observed_count = 3
    AND accepted_count = 3
    AND rejected_count = 0
    AND pagination_complete
    AND metadata->>'bounded_exact_evidence' = 'true'
    AND metadata->>'exact_formula_evidence' = 'true';

  UPDATE public.catalog_observations observation
  SET formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance =
        COALESCE(observation.formula_version_provenance, '{}'::JSONB)
        || jsonb_build_object(
          'evidence_tier', 'manufacturer_current_exact',
          'reviewed_malformed_package_title', TRUE,
          'package_size_is_sku_only', TRUE
        )
  WHERE observation.run_id = v_run_id
    AND observation.validation_status = 'accepted';

  -- Staging may observe the 24-can page last. Restore the reviewed canonical
  -- cat package while retaining both package observations and images.
  UPDATE public.catalog_formulas formula
  SET product_name = 'Kasiks Fraser Valley Grub Formula for Cats',
      source_url = v_cat_url,
      front_image_url = v_cat_image,
      promoted_cache_key = v_cat_cache,
      updated_at = NOW()
  WHERE formula.id = v_cat_formula_id;

  UPDATE public.catalog_formulas
  SET product_name = 'Kasiks Fraser Valley Grub Formula for Dogs',
      source_url = v_dog_url,
      front_image_url = v_dog_image,
      promoted_cache_key = v_dog_cache,
      updated_at = NOW()
  WHERE id = v_dog_formula_id;

  PERFORM * FROM public.promote_catalog_formula(v_cat_formula_id);
  PERFORM * FROM public.promote_catalog_formula(v_dog_formula_id);

  INSERT INTO public.catalog_field_evidence (
    formula_id, observation_id, field_name, field_value, source_url,
    source_authority, accepted, observed_at, content_hash
  )
  SELECT
    v_cat_formula_id,
    observation.id,
    'package_variant_identity',
    jsonb_build_object(
      'same_formula_size_variant', TRUE,
      'canonical_official_url', v_cat_url,
      'package_variant_official_url', v_cat_size_url,
      'package_size', '24 x 5.5 oz cans',
      'front_image_url', v_cat_size_image,
      'ingredient_text_hash', v_ingredient_hash
    ),
    v_cat_size_url,
    'manufacturer',
    TRUE,
    observation.observed_at,
    encode(digest(
      v_cat_size_url || '|package_variant|' || v_ingredient_hash,
      'sha256'
    ), 'hex')
  FROM public.catalog_observations observation
  WHERE observation.run_id = v_run_id
    AND observation.source_url = v_cat_size_url
    AND observation.formula_id = v_cat_formula_id
    AND observation.validation_status = 'accepted'
  ON CONFLICT (formula_id, field_name, source_url, content_hash)
  DO UPDATE SET observation_id = EXCLUDED.observation_id,
                field_value = EXCLUDED.field_value,
                accepted = TRUE,
                observed_at = EXCLUDED.observed_at;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_verified_product_search_aliases search_alias
    WHERE search_alias.active
      AND search_alias.normalized_alias IN (
        public.normalize_verified_product_search_query(
          'KASIKS Fraser Valley Grub Formula for Cats 12.2z – 12 Cans'
        ),
        public.normalize_verified_product_search_query(
          'KASIKS Fraser Valley Grub Formula for Cats 5.5oz – 24 Cans'
        ),
        public.normalize_verified_product_search_query(
          'KASIKS Fraser Valley Grub Formula for Dogs 12.2z – 12 Cans'
        )
      )
      AND search_alias.cache_key NOT IN (v_cat_cache, v_dog_cache)
  ) THEN
    RAISE EXCEPTION 'A KASIKS exact package alias belongs to a sibling';
  END IF;

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key, alias_text, normalized_alias, source_url, source_authority,
    evidence_observed_at, provenance
  ) VALUES
    (
      v_cat_cache,
      'KASIKS Fraser Valley Grub Formula for Cats 12.2z – 12 Cans',
      public.normalize_verified_product_search_query(
        'KASIKS Fraser Valley Grub Formula for Cats 12.2z – 12 Cans'
      ),
      v_cat_url, 'manufacturer', NOW(),
      jsonb_build_object(
        'reviewed_package_title_typo', TRUE,
        'species_boundary', 'cat',
        'package_size_is_sku_only', TRUE
      )
    ),
    (
      v_cat_cache,
      'KASIKS Fraser Valley Grub Formula for Cats 5.5oz – 24 Cans',
      public.normalize_verified_product_search_query(
        'KASIKS Fraser Valley Grub Formula for Cats 5.5oz – 24 Cans'
      ),
      v_cat_size_url, 'manufacturer', NOW(),
      jsonb_build_object(
        'same_formula_size_variant', TRUE,
        'species_boundary', 'cat',
        'package_size_is_sku_only', TRUE
      )
    ),
    (
      v_dog_cache,
      'KASIKS Fraser Valley Grub Formula for Dogs 12.2z – 12 Cans',
      public.normalize_verified_product_search_query(
        'KASIKS Fraser Valley Grub Formula for Dogs 12.2z – 12 Cans'
      ),
      v_dog_url, 'manufacturer', NOW(),
      jsonb_build_object(
        'reviewed_package_title_typo', TRUE,
        'species_boundary', 'dog',
        'package_size_is_sku_only', TRUE
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

  IF (
    SELECT count(*)
    FROM public.catalog_formulas formula
    WHERE formula.id IN (v_cat_formula_id, v_dog_formula_id)
      AND formula.active
      AND formula.verification_status = 'verified'
      AND formula.formula_evidence_tier = 'manufacturer_current_exact'
      AND formula.brand = 'Kasiks'
      AND formula.product_line = 'Fraser Valley'
      AND formula.food_form = 'wet'
      AND formula.flavor = 'Grub Formula'
      AND formula.promoted_cache_key IN (v_cat_cache, v_dog_cache)
  ) <> 2 OR EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = v_cat_size_formula_id
      AND (active OR verification_status <> 'quarantined')
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = v_cat_size_cache
      AND catalog_exclusion_reason =
        'duplicate_size_variant_of_verified_formula'
  ) THEN
    RAISE EXCEPTION 'KASIKS canonical package/formula postcondition failed';
  END IF;
END;
$kasiks$;

DO $freshpet$
DECLARE
  v_old_formula_id BIGINT;
  v_new_formula_id BIGINT;
  v_run_id BIGINT;
  v_current_cache CONSTANT TEXT := 'freshpet:851893001731';
  v_old_cache CONSTANT TEXT := 'freshpet:627975010348';
  v_current_url CONSTANT TEXT :=
    'https://www.freshpet.com/products/vital-grain-free-turkey-recipe-with-spinach-cranberries-blueberries';
  v_old_url CONSTANT TEXT :=
    'https://www.freshpet.com/products/grain-free-turkey-recipe-with-spinach-cranberries-blueberries';
  v_current_image CONSTANT TEXT :=
    'https://cdn.builder.io/api/v1/image/assets%2F1c8ef3f695f2487f915df3885427baf6%2F3557800706a6492bb667005398e5c749';
  v_old_image CONSTANT TEXT :=
    'https://cdn.builder.io/api/v1/image/assets%2F1c8ef3f695f2487f915df3885427baf6%2F2ea20f9955694dfab667852d10e1f609';
  v_current_hash CONSTANT TEXT :=
    '0fa71b90bbf900fc0ae92a907cfe34127552acb1e95c78bf619494fd09070029';
  v_old_hash CONSTANT TEXT :=
    'd1be51485143cc179096ac6cd82660b4bab00d6facaf388df3b3b36f11290704';
  v_new_key CONSTANT TEXT :=
    'freshpet|freshpet|vital|dog|all life stages|fresh|turkey recipe|';
  v_new_identity CONSTANT TEXT :=
    'f85abb83ed1685a89266b33ea5f20ea2480d5fcff667af68e292051d8b80704a';
  v_run_key CONSTANT TEXT :=
    'freshpet:bounded-exact-evidence:vital-turkey-current-version:20260804:v1';
  v_run JSONB;
  v_payload JSONB;
  v_serving public.product_data%ROWTYPE;
BEGIN
  SELECT id INTO STRICT v_old_formula_id
  FROM public.catalog_formulas
  WHERE promoted_cache_key = v_old_cache
    AND source_url = v_old_url
    AND front_image_url = v_old_image
    AND active
    AND verification_status = 'verified'
    AND formula_evidence_tier = 'manufacturer_current_exact';

  SELECT * INTO STRICT v_serving
  FROM public.product_data
  WHERE cache_key = v_current_cache
    AND gtin = '851893001731'
    AND source = 'freshpet'
    AND source_url = v_current_url
    AND image_url = v_current_image
    AND brand = 'Freshpet'
    AND pet_type = 'dog'
    AND ingredient_count = 11
    AND ingredient_verification_status = 'manufacturer'
    AND image_verification_status = 'manufacturer'
    AND formula_evidence_tier = 'unverified'
    AND catalog_exclusion_reason = 'sku_variant_of_canonical_formula'
    AND encode(digest(
      regexp_replace(
        lower(COALESCE(ingredient_text, '')),
        '[^a-z0-9]+', '', 'g'
      ), 'sha256'
    ), 'hex') = v_current_hash;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = v_old_cache
      AND gtin = '627975010348'
      AND source_url = v_old_url
      AND image_url = v_old_image
      AND encode(digest(
        regexp_replace(
          lower(COALESCE(ingredient_text, '')),
          '[^a-z0-9]+', '', 'g'
        ), 'sha256'
      ), 'hex') = v_old_hash
  ) THEN
    RAISE EXCEPTION 'Freshpet legacy formula-version precondition changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_formulas
    WHERE formula_key = v_new_key
       OR (active AND identity_hash = v_new_identity)
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_source_runs WHERE run_key = v_run_key
  ) THEN
    RAISE EXCEPTION 'Freshpet Vital current formula/run already exists';
  END IF;

  v_run := jsonb_build_object(
    'run_key', v_run_key,
    'source_slug', 'freshpet',
    'source_type', 'manufacturer',
    'coverage_role', 'verification',
    'status', 'completed',
    'started_at', '2026-08-04T08:59:37Z',
    'expected_count', 1,
    'pagination_complete', TRUE,
    'truncated', FALSE,
    'cap_reached', FALSE,
    'source_content_hash', encode(digest(
      v_current_url || '|' || v_current_hash || '|' || v_current_image,
      'sha256'
    ), 'hex'),
    'checkpoint', jsonb_build_object(
      'feed_row_count', 1,
      'accepted_observation_count', 1,
      'canonical_formula_count', 1
    ),
    'metadata', jsonb_build_object(
      'brand', 'Freshpet',
      'manufacturer', 'Freshpet',
      'source_authority', 'manufacturer',
      'bounded_exact_evidence', TRUE,
      'exact_formula_evidence', TRUE,
      'current_official_page_refresh', TRUE,
      'distinct_formula_version', TRUE,
      'package_size_is_sku_only', TRUE
    )
  );

  v_payload := jsonb_build_array(jsonb_build_object(
    'formula_key', v_new_key,
    'identity_hash', v_new_identity,
    'manufacturer', 'Freshpet',
    'brand', 'Freshpet',
    'product_name',
      'Grain Free Turkey Recipe with Spinach, Cranberries & Blueberries',
    'product_line', 'Vital',
    'pet_type', 'dog',
    'life_stage', 'all life stages',
    'food_form', 'fresh',
    'flavor', 'Turkey Recipe',
    'diet_condition', '',
    'source_slug', 'freshpet',
    'source_external_id', 'freshpet:851893001731:reviewed-20260804',
    'source_url', v_current_url,
    'source_authority', 'manufacturer',
    -- Stage without a GTIN so a stale legacy SKU link cannot rekey the new
    -- formula. The exact published GTIN is attached after the formula exists.
    'gtin', '',
    'package_size', '2 lb roll',
    'ingredient_text', v_serving.ingredient_text,
    'ingredients', to_jsonb(v_serving.ingredients),
    'front_image_url', v_current_image,
    'is_complete_food', TRUE,
    'available_in_us', TRUE,
    'protected_terms', jsonb_build_array(
      'Freshpet', 'Vital', 'Grain Free', 'Turkey Recipe',
      'Spinach', 'Cranberries', 'Blueberries', 'dog', 'fresh'
    ),
    'observed_at', '2026-08-04T08:59:37Z',
    'content_hash', encode(digest(
      v_current_url || '|' || v_serving.ingredient_text || '|'
      || v_current_image, 'sha256'
    ), 'hex'),
    'validation_status', 'accepted',
    'validation_reasons', '[]'::JSONB,
    'ingredient_verification_status', 'manufacturer',
    'image_verification_status', 'manufacturer',
    'coverage_tier', 'tier_1_us_retail',
    'formula_evidence_tier', 'manufacturer_current_exact',
    'formula_version_provenance', jsonb_build_object(
      'version_status', 'manufacturer_current',
      'source', 'freshpet',
      'source_url', v_current_url,
      'captured_at', '2026-08-04T08:59:37Z',
      'package_gtin', '851893001731',
      'ingredient_text_hash', v_current_hash,
      'front_image_url', v_current_image,
      'distinct_from_legacy_gtin', '627975010348',
      'exact_formula_evidence', TRUE
    ),
    'raw_payload', jsonb_build_object(
      'cache_key', v_current_cache,
      'published_gtin', '851893001731',
      'exact_formula_evidence', TRUE,
      'package_size_is_sku_only', TRUE,
      'distinct_formula_version', TRUE
    )
  ));

  PERFORM public.stage_catalog_census_batch(v_run, v_payload);

  SELECT id INTO STRICT v_run_id
  FROM public.catalog_source_runs
  WHERE run_key = v_run_key
    AND status = 'completed'
    AND expected_count = 1
    AND observed_count = 1
    AND accepted_count = 1
    AND rejected_count = 0
    AND pagination_complete
    AND metadata->>'bounded_exact_evidence' = 'true'
    AND metadata->>'exact_formula_evidence' = 'true';

  SELECT formula.id INTO STRICT v_new_formula_id
  FROM public.catalog_formulas formula
  JOIN public.catalog_observations observation
    ON observation.formula_id = formula.id
  WHERE observation.run_id = v_run_id
    AND observation.validation_status = 'accepted'
    AND formula.formula_key = v_new_key
    AND formula.identity_hash = v_new_identity
    AND formula.source_url = v_current_url;

  UPDATE public.catalog_observations observation
  SET formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance =
        COALESCE(observation.formula_version_provenance, '{}'::JSONB)
        || jsonb_build_object(
          'evidence_tier', 'manufacturer_current_exact',
          'package_gtin', '851893001731',
          'distinct_formula_version', TRUE,
          'gtin_resolution_policy', 'abstain_on_version_conflict'
        )
  WHERE observation.run_id = v_run_id
    AND observation.formula_id = v_new_formula_id
    AND observation.validation_status = 'accepted';

  UPDATE public.catalog_formulas
  SET manufacturer = 'Freshpet',
      brand = 'Freshpet',
      product_name =
        'Grain Free Turkey Recipe with Spinach, Cranberries & Blueberries',
      product_line = 'Vital',
      pet_type = 'dog',
      life_stage = 'all life stages',
      food_form = 'fresh',
      flavor = 'Turkey Recipe',
      diet_condition = '',
      is_complete_food = TRUE,
      complete_food_evidence =
        'Exact current Freshpet Vital PDP states complete and balanced nutrition for all life stages and publishes the full ingredient statement, GTIN 851893001731, and matching front image.',
      ingredient_text = v_serving.ingredient_text,
      ingredients = v_serving.ingredients,
      front_image_url = v_current_image,
      source_url = v_current_url,
      source_authority = 'manufacturer',
      ingredient_verification_status = 'manufacturer',
      image_verification_status = 'manufacturer',
      protected_terms = ARRAY[
        'Freshpet', 'Vital', 'Grain Free', 'Turkey Recipe',
        'Spinach', 'Cranberries', 'Blueberries', 'dog', 'fresh'
      ]::TEXT[],
      verification_status = 'verified',
      active = TRUE,
      absent_since = NULL,
      promoted_cache_key = v_current_cache,
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance = jsonb_build_object(
        'evidence_tier', 'manufacturer_current_exact',
        'version_status', 'manufacturer_current',
        'source', 'freshpet',
        'source_url', v_current_url,
        'captured_at', '2026-08-04T08:59:37Z'::TIMESTAMPTZ,
        'package_gtin', '851893001731',
        'ingredient_text_hash', v_current_hash,
        'front_image_url', v_current_image,
        'distinct_from_formula_id', v_old_formula_id,
        'distinct_from_legacy_gtin', '627975010348',
        'same_gtin_retailer_version_conflict', TRUE,
        'exact_formula_evidence', TRUE
      ),
      updated_at = NOW()
  WHERE id = v_new_formula_id;

  -- Move only the exact current manufacturer evidence. The legacy 627... row
  -- and its older URL/image/ingredients remain on the old formula.
  UPDATE public.catalog_observations observation
  SET formula_id = v_new_formula_id,
      manufacturer = 'Freshpet',
      brand = 'Freshpet',
      product_line = 'Vital',
      pet_type = 'dog',
      life_stage = 'all life stages',
      food_form = 'fresh',
      flavor = 'Turkey Recipe',
      diet_condition = '',
      formula_evidence_tier = CASE
        WHEN observation.validation_status = 'accepted'
          THEN 'manufacturer_current_exact'
        ELSE observation.formula_evidence_tier
      END,
      formula_version_provenance =
        COALESCE(observation.formula_version_provenance, '{}'::JSONB)
        || jsonb_build_object(
          'canonical_formula_id', v_new_formula_id,
          'package_gtin', '851893001731',
          'distinct_formula_version', TRUE,
          'reviewed_at', NOW()
        )
  WHERE observation.source_slug = 'freshpet'
    AND observation.source_url = v_current_url
    AND observation.gtin = '851893001731'
    AND observation.id <> (
      SELECT id
      FROM public.catalog_observations
      WHERE run_id = v_run_id
      LIMIT 1
    );

  INSERT INTO public.catalog_field_evidence (
    formula_id, observation_id, field_name, field_value, source_url,
    source_authority, accepted, observed_at, content_hash
  )
  SELECT
    v_new_formula_id,
    evidence.observation_id,
    evidence.field_name,
    evidence.field_value,
    evidence.source_url,
    evidence.source_authority,
    evidence.accepted,
    evidence.observed_at,
    evidence.content_hash
  FROM public.catalog_field_evidence evidence
  WHERE evidence.formula_id = v_old_formula_id
    AND evidence.source_url = v_current_url
  ON CONFLICT (formula_id, field_name, source_url, content_hash)
  DO UPDATE SET observation_id = EXCLUDED.observation_id,
                field_value = EXCLUDED.field_value,
                source_authority = EXCLUDED.source_authority,
                accepted = EXCLUDED.accepted,
                observed_at = EXCLUDED.observed_at;

  DELETE FROM public.catalog_field_evidence
  WHERE formula_id = v_old_formula_id
    AND source_url = v_current_url;

  UPDATE public.catalog_skus
  SET formula_id = v_new_formula_id,
      -- The same GTIN also identifies a materially different PetSmart
      -- ingredient version. Preserve the exact manufacturer package link but
      -- keep it inactive so barcode resolution must abstain on the conflict.
      active = FALSE,
      updated_at = NOW()
  WHERE formula_id = v_old_formula_id
    AND gtin = '851893001731'
    AND source_slug = 'freshpet'
    AND source_url = v_current_url;

  -- The PetSmart package reuses the GTIN but has a different 26-item
  -- ingredient statement. Preserve it as a separate retailer source version
  -- and never attach it to either manufacturer formula by GTIN alone.
  UPDATE public.catalog_observations
  SET formula_id = NULL,
      validation_status = 'quarantined',
      validation_reasons =
        ARRAY['same_gtin_conflicting_retailer_formula_version']::TEXT[],
      formula_evidence_tier = 'conflicted',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB)
        || jsonb_build_object(
          'package_gtin', '851893001731',
          'retailer_source_version_retained', TRUE,
          'must_not_merge_with_manufacturer_version', TRUE,
          'reviewed_at', NOW()
        )
  WHERE source_slug = 'petsmart-retail-catalog'
    AND gtin = '851893001731'
    AND source_url =
      'https://www.petsmart.com/dog/food/fresh-food/freshpet-vital-and-trade-grain-free-turkey-adult-dog-food-32283.html'
    AND encode(digest(
      regexp_replace(
        lower(COALESCE(ingredient_text, '')),
        '[^a-z0-9]+', '', 'g'
      ), 'sha256'
    ), 'hex') =
      'b834dec8c57739cf7c6d08c30afd40da5c98950f02434f43d3bb068ea76e8f69';

  UPDATE public.product_data
  SET product_name =
        'Grain Free Turkey Recipe with Spinach, Cranberries & Blueberries',
      brand = 'Freshpet',
      product_line = 'Vital',
      pet_type = 'dog',
      life_stage = 'all life stages',
      food_form = 'fresh',
      flavor = 'Turkey Recipe',
      package_size = '2 lb roll',
      source_quality = 'manufacturer',
      source_url = v_current_url,
      image_url = v_current_image,
      ingredient_verification_status = 'manufacturer',
      image_verification_status = 'manufacturer',
      verified_at = '2026-08-04T08:59:37Z'::TIMESTAMPTZ,
      is_complete_food = TRUE,
      catalog_exclusion_reason = NULL,
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance = jsonb_build_object(
        'evidence_tier', 'manufacturer_current_exact',
        'version_status', 'manufacturer_current',
        'source', 'freshpet',
        'source_url', v_current_url,
        'captured_at', '2026-08-04T08:59:37Z'::TIMESTAMPTZ,
        'package_gtin', '851893001731',
        'ingredient_text_hash', v_current_hash,
        'front_image_url', v_current_image,
        'distinct_from_legacy_gtin', '627975010348',
        'same_gtin_retailer_version_conflict', TRUE,
        'exact_formula_evidence', TRUE
      ),
      scraped_at = NOW(),
      expires_at = NOW() + INTERVAL '365 days',
      updated_at = NOW()
  WHERE cache_key = v_current_cache;

  PERFORM * FROM public.promote_catalog_formula(v_new_formula_id);

  -- Promotion intentionally had no active GTIN candidate because the GTIN is
  -- version-conflicted. Restore the published package identifier on the exact
  -- serving version; barcode lookup will see both verified ingredient
  -- versions and must abstain instead of choosing either one.
  UPDATE public.product_data
  SET gtin = '851893001731',
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB)
        || jsonb_build_object(
          'package_gtin', '851893001731',
          'gtin_resolution_policy', 'abstain_on_version_conflict',
          'same_gtin_retailer_version_conflict', TRUE
        ),
      updated_at = NOW()
  WHERE cache_key = v_current_cache;

  INSERT INTO public.catalog_field_evidence (
    formula_id, observation_id, field_name, field_value, source_url,
    source_authority, accepted, observed_at, content_hash
  )
  SELECT
    v_new_formula_id,
    observation.id,
    'gtin_version_conflict',
    jsonb_build_object(
      'gtin', '851893001731',
      'manufacturer_cache_key', v_current_cache,
      'retailer_cache_key', 'petsmart-retail-catalog:851893001731',
      'resolution_policy', 'abstain_on_version_conflict',
      'active_catalog_sku', FALSE,
      'versions_preserved_separately', TRUE
    ),
    v_current_url,
    'manufacturer',
    TRUE,
    observation.observed_at,
    encode(digest(
      '851893001731|freshpet-vital|abstain_on_version_conflict',
      'sha256'
    ), 'hex')
  FROM public.catalog_observations observation
  WHERE observation.run_id = v_run_id
    AND observation.formula_id = v_new_formula_id
    AND observation.validation_status = 'accepted'
  ON CONFLICT (formula_id, field_name, source_url, content_hash)
  DO UPDATE SET observation_id = EXCLUDED.observation_id,
                field_value = EXCLUDED.field_value,
                accepted = TRUE,
                observed_at = EXCLUDED.observed_at;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_verified_product_search_aliases
    WHERE active
      AND normalized_alias = public.normalize_verified_product_search_query(
        'Freshpet Vital Grain Free Turkey Recipe with Spinach, Cranberries & Blueberries'
      )
      AND cache_key <> v_current_cache
  ) THEN
    RAISE EXCEPTION 'Freshpet Vital exact search alias belongs to a sibling';
  END IF;

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key, alias_text, normalized_alias, source_url, source_authority,
    evidence_observed_at, provenance
  ) VALUES (
    v_current_cache,
    'Freshpet Vital Grain Free Turkey Recipe with Spinach, Cranberries & Blueberries',
    public.normalize_verified_product_search_query(
      'Freshpet Vital Grain Free Turkey Recipe with Spinach, Cranberries & Blueberries'
    ),
    v_current_url,
    'manufacturer',
    '2026-08-04T08:59:37Z'::TIMESTAMPTZ,
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'consumer_brand', 'Freshpet',
      'product_line', 'Vital',
      'species_boundary', 'dog',
      'food_form_boundary', 'fresh',
      'recipe_boundary', 'turkey recipe',
      'package_gtin', '851893001731',
      'same_gtin_retailer_version_conflict', TRUE
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    JOIN public.product_data serving
      ON serving.cache_key = formula.promoted_cache_key
    JOIN public.catalog_skus sku
      ON sku.formula_id = formula.id
     AND sku.gtin = '851893001731'
     AND NOT sku.active
    WHERE formula.id = v_new_formula_id
      AND formula.formula_key = v_new_key
      AND formula.identity_hash = v_new_identity
      AND formula.product_line = 'Vital'
      AND formula.pet_type = 'dog'
      AND formula.life_stage = 'all life stages'
      AND formula.food_form = 'fresh'
      AND formula.flavor = 'Turkey Recipe'
      AND formula.source_url = v_current_url
      AND formula.front_image_url = v_current_image
      AND formula.formula_evidence_tier = 'manufacturer_current_exact'
      AND formula.active
      AND formula.verification_status = 'verified'
      AND serving.cache_key = v_current_cache
      AND serving.gtin = '851893001731'
      AND serving.catalog_exclusion_reason IS NULL
      AND serving.formula_evidence_tier = 'manufacturer_current_exact'
      AND encode(digest(
        regexp_replace(
          lower(COALESCE(serving.ingredient_text, '')),
          '[^a-z0-9]+', '', 'g'
        ), 'sha256'
      ), 'hex') = v_current_hash
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    JOIN public.catalog_skus sku ON sku.formula_id = formula.id
    WHERE formula.id = v_old_formula_id
      AND formula.source_url = v_old_url
      AND formula.front_image_url = v_old_image
      AND formula.promoted_cache_key = v_old_cache
      AND sku.gtin = '627975010348'
      AND sku.active
  ) THEN
    RAISE EXCEPTION 'Freshpet source-version split postcondition failed';
  END IF;
END;
$freshpet$;

DO $nutrisource$
DECLARE
  v_formula_id BIGINT;
  v_run_id BIGINT;
  v_cache CONSTANT TEXT := 'nutrisource:073893041016';
  v_gtin CONSTANT TEXT := '073893041016';
  v_old_url CONSTANT TEXT :=
    'https://discovernutrisource.com/products/chicken-rice-senior-dog-formula-copy';
  v_current_url CONSTANT TEXT :=
    'https://discovernutrisource.com/products/chicken-rice-senior-dog-formula';
  v_old_image CONSTANT TEXT :=
    'https://cdn.shopify.com/s/files/1/0051/2131/0794/files/NSDogCan_Senior_b1e76a8b-4d53-46c3-97b6-77ece8263a14.png?v=1777998750';
  v_current_image CONSTANT TEXT :=
    'https://cdn.shopify.com/s/files/1/0051/2131/0794/files/NS_DogCan_Senior_mod7-16.png?v=1784218788';
  v_formula_key CONSTANT TEXT :=
    'nutrisource|nutrisource|chicken and rice senior wet dog food|dog|senior|wet|chicken and rice|';
  v_identity_hash CONSTANT TEXT :=
    '6ff72adf75ae729335aebd941fa32f66bc580341e6440112f002cbbad00c4546';
  v_ingredient_hash CONSTANT TEXT :=
    '8cfb9be693bee6f46a45c7abae30f0ca3bcc004fdde31f4db95a728e17e4b952';
  v_run_key CONSTANT TEXT :=
    'nutrisource:bounded-exact-evidence:senior-current-url:20260804:v1';
  v_run JSONB;
  v_payload JSONB;
  v_serving public.product_data%ROWTYPE;
BEGIN
  SELECT formula.id INTO STRICT v_formula_id
  FROM public.catalog_formulas formula
  WHERE formula.formula_key = v_formula_key
    AND formula.identity_hash = v_identity_hash
    AND formula.source_url = v_old_url
    AND formula.front_image_url = v_old_image
    AND formula.active
    AND formula.verification_status = 'verified'
    AND formula.formula_evidence_tier = 'manufacturer_current_exact';

  SELECT * INTO STRICT v_serving
  FROM public.product_data
  WHERE cache_key = v_cache
    AND gtin = v_gtin
    AND source_url = v_old_url
    AND image_url = v_old_image
    AND brand = 'NutriSource'
    AND pet_type = 'dog'
    AND life_stage = 'senior'
    AND food_form = 'wet'
    AND flavor = 'Chicken & Rice'
    AND ingredient_count = 38
    AND ingredient_verification_status = 'manufacturer'
    AND image_verification_status = 'manufacturer'
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND catalog_exclusion_reason IS NULL
    AND encode(digest(
      regexp_replace(
        lower(COALESCE(ingredient_text, '')),
        '[^a-z0-9]+', '', 'g'
      ), 'sha256'
    ), 'hex') = v_ingredient_hash;

  IF EXISTS (
    SELECT 1 FROM public.catalog_source_runs WHERE run_key = v_run_key
  ) THEN
    RAISE EXCEPTION 'NutriSource current-URL bounded run already exists';
  END IF;

  v_run := jsonb_build_object(
    'run_key', v_run_key,
    'source_slug', 'nutrisource',
    'source_type', 'manufacturer',
    'coverage_role', 'verification',
    'status', 'completed',
    'started_at', '2026-08-04T08:59:37Z',
    'expected_count', 1,
    'pagination_complete', TRUE,
    'truncated', FALSE,
    'cap_reached', FALSE,
    'source_content_hash', encode(digest(
      v_current_url || '|' || v_ingredient_hash || '|' || v_current_image,
      'sha256'
    ), 'hex'),
    'checkpoint', jsonb_build_object(
      'feed_row_count', 1,
      'accepted_observation_count', 1,
      'canonical_formula_count', 1
    ),
    'metadata', jsonb_build_object(
      'brand', 'NutriSource',
      'manufacturer', 'KLN Family Brands',
      'source_authority', 'manufacturer',
      'bounded_exact_evidence', TRUE,
      'exact_formula_evidence', TRUE,
      'current_official_page_refresh', TRUE,
      'same_formula_ingredient_version', TRUE,
      'package_size_is_sku_only', TRUE
    )
  );

  v_payload := jsonb_build_array(jsonb_build_object(
    'formula_key', v_formula_key,
    'identity_hash', v_identity_hash,
    'manufacturer', 'NutriSource',
    'brand', 'NutriSource',
    'product_name', 'Chicken & Rice Senior Wet Dog Food',
    'product_line', 'Chicken & Rice Senior Wet Dog Food',
    'pet_type', 'dog',
    'life_stage', 'senior',
    'food_form', 'wet',
    'flavor', 'Chicken & Rice',
    'diet_condition', '',
    'source_slug', 'nutrisource',
    'source_external_id', 'nutrisource:073893041016:current-url-20260804',
    'source_url', v_current_url,
    'source_authority', 'manufacturer',
    'gtin', v_gtin,
    'package_size', '12 / 12.3oz',
    'ingredient_text', v_serving.ingredient_text,
    'ingredients', to_jsonb(v_serving.ingredients),
    'front_image_url', v_current_image,
    'is_complete_food', TRUE,
    'available_in_us', TRUE,
    'protected_terms', jsonb_build_array(
      'NutriSource', 'Chicken & Rice', 'Senior', 'dog', 'wet'
    ),
    'observed_at', '2026-08-04T08:59:37Z',
    'content_hash', encode(digest(
      v_current_url || '|' || v_serving.ingredient_text || '|'
      || v_current_image, 'sha256'
    ), 'hex'),
    'validation_status', 'accepted',
    'validation_reasons', '[]'::JSONB,
    'ingredient_verification_status', 'manufacturer',
    'image_verification_status', 'manufacturer',
    'coverage_tier', 'tier_1_us_retail',
    'formula_evidence_tier', 'manufacturer_current_exact',
    'formula_version_provenance', jsonb_build_object(
      'version_status', 'manufacturer_current',
      'source', 'nutrisource',
      'source_url', v_current_url,
      'captured_at', '2026-08-04T08:59:37Z',
      'package_gtin', v_gtin,
      'ingredient_text_hash', v_ingredient_hash,
      'front_image_url', v_current_image,
      'official_url_and_package_image_refresh', TRUE,
      'exact_formula_evidence', TRUE
    ),
    'raw_payload', jsonb_build_object(
      'cache_key', v_cache,
      'exact_formula_evidence', TRUE,
      'package_size_is_sku_only', TRUE,
      'current_official_page_refresh', TRUE
    )
  ));

  PERFORM public.stage_catalog_census_batch(v_run, v_payload);

  SELECT id INTO STRICT v_run_id
  FROM public.catalog_source_runs
  WHERE run_key = v_run_key
    AND status = 'completed'
    AND expected_count = 1
    AND observed_count = 1
    AND accepted_count = 1
    AND rejected_count = 0
    AND pagination_complete
    AND metadata->>'bounded_exact_evidence' = 'true'
    AND metadata->>'exact_formula_evidence' = 'true';

  UPDATE public.catalog_observations observation
  SET formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance =
        COALESCE(observation.formula_version_provenance, '{}'::JSONB)
        || jsonb_build_object(
          'evidence_tier', 'manufacturer_current_exact',
          'official_url_and_package_image_refresh', TRUE,
          'same_formula_ingredient_version', TRUE
        )
  WHERE observation.run_id = v_run_id
    AND observation.formula_id = v_formula_id
    AND observation.validation_status = 'accepted';

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_observations
    WHERE run_id = v_run_id
      AND formula_id = v_formula_id
      AND source_url = v_current_url
      AND gtin = v_gtin
      AND front_image_url = v_current_image
      AND validation_status = 'accepted'
      AND formula_evidence_tier = 'manufacturer_current_exact'
      AND encode(digest(
        regexp_replace(
          lower(COALESCE(ingredient_text, '')),
          '[^a-z0-9]+', '', 'g'
        ), 'sha256'
      ), 'hex') = v_ingredient_hash
  ) THEN
    RAISE EXCEPTION 'NutriSource current exact observation was not staged';
  END IF;

  UPDATE public.catalog_formulas
  SET manufacturer = 'NutriSource',
      brand = 'NutriSource',
      source_url = v_current_url,
      front_image_url = v_current_image,
      promoted_cache_key = v_cache,
      complete_food_evidence =
        'Exact current NutriSource PDP publishes the same complete Chicken & Rice Senior formula, GTIN 073893041016, full 38-item ingredient statement, and refreshed front-package image.',
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB)
        || jsonb_build_object(
          'evidence_tier', 'manufacturer_current_exact',
          'version_status', 'manufacturer_current',
          'source', 'nutrisource',
          'source_url', v_current_url,
          'previous_source_url', v_old_url,
          'captured_at', '2026-08-04T08:59:37Z'::TIMESTAMPTZ,
          'package_gtin', v_gtin,
          'ingredient_text_hash', v_ingredient_hash,
          'front_image_url', v_current_image,
          'previous_front_image_url', v_old_image,
          'official_url_and_package_image_refresh', TRUE,
          'exact_formula_evidence', TRUE
        ),
      verification_status = 'verified',
      active = TRUE,
      absent_since = NULL,
      updated_at = NOW()
  WHERE id = v_formula_id;

  UPDATE public.product_data
  SET source_url = v_current_url,
      image_url = v_current_image,
      source_quality = 'manufacturer',
      ingredient_verification_status = 'manufacturer',
      image_verification_status = 'manufacturer',
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB)
        || jsonb_build_object(
          'evidence_tier', 'manufacturer_current_exact',
          'version_status', 'manufacturer_current',
          'source', 'nutrisource',
          'source_url', v_current_url,
          'previous_source_url', v_old_url,
          'captured_at', '2026-08-04T08:59:37Z'::TIMESTAMPTZ,
          'package_gtin', v_gtin,
          'ingredient_text_hash', v_ingredient_hash,
          'front_image_url', v_current_image,
          'previous_front_image_url', v_old_image,
          'official_url_and_package_image_refresh', TRUE,
          'exact_formula_evidence', TRUE
        ),
      verified_at = '2026-08-04T08:59:37Z'::TIMESTAMPTZ,
      scraped_at = NOW(),
      expires_at = NOW() + INTERVAL '365 days',
      updated_at = NOW()
  WHERE cache_key = v_cache;

  UPDATE public.catalog_skus
  SET source_url = v_current_url,
      updated_at = NOW()
  WHERE formula_id = v_formula_id
    AND gtin = v_gtin
    AND source_slug = 'nutrisource';

  PERFORM * FROM public.promote_catalog_formula(v_formula_id);

  IF EXISTS (
    SELECT 1
    FROM public.catalog_verified_product_search_aliases
    WHERE active
      AND normalized_alias = public.normalize_verified_product_search_query(
        'NutriSource Chicken & Rice Senior Wet Dog Food'
      )
      AND cache_key <> v_cache
  ) THEN
    RAISE EXCEPTION 'NutriSource Senior exact search alias belongs to a sibling';
  END IF;

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key, alias_text, normalized_alias, source_url, source_authority,
    evidence_observed_at, provenance
  ) VALUES (
    v_cache,
    'NutriSource Chicken & Rice Senior Wet Dog Food',
    public.normalize_verified_product_search_query(
      'NutriSource Chicken & Rice Senior Wet Dog Food'
    ),
    v_current_url,
    'manufacturer',
    '2026-08-04T08:59:37Z'::TIMESTAMPTZ,
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'species_boundary', 'dog',
      'life_stage_boundary', 'senior',
      'food_form_boundary', 'wet',
      'recipe_boundary', 'chicken and rice',
      'package_gtin', v_gtin,
      'official_url_and_package_image_refresh', TRUE
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    JOIN public.product_data serving
      ON serving.cache_key = formula.promoted_cache_key
    JOIN public.catalog_skus sku
      ON sku.formula_id = formula.id
     AND sku.gtin = v_gtin
     AND sku.active
    WHERE formula.id = v_formula_id
      AND formula.source_url = v_current_url
      AND formula.front_image_url = v_current_image
      AND formula.formula_evidence_tier = 'manufacturer_current_exact'
      AND formula.verification_status = 'verified'
      AND formula.active
      AND serving.cache_key = v_cache
      AND serving.source_url = v_current_url
      AND serving.image_url = v_current_image
      AND serving.ingredient_count = 38
      AND serving.formula_evidence_tier = 'manufacturer_current_exact'
      AND serving.catalog_exclusion_reason IS NULL
      AND encode(digest(
        regexp_replace(
          lower(COALESCE(serving.ingredient_text, '')),
          '[^a-z0-9]+', '', 'g'
        ), 'sha256'
      ), 'hex') = v_ingredient_hash
  ) THEN
    RAISE EXCEPTION 'NutriSource current URL/image refresh postcondition failed';
  END IF;
END;
$nutrisource$;
