-- Split Royal Canin breed foods that were incorrectly collapsed at the broad
-- Breed Health Nutrition / Feline Breed Nutrition line level.
--
-- The current official US product pages publish exact breed identity, current
-- ingredients, front-package images, complete-and-balanced evidence, and all
-- sellable GTIN/package variants. Breed is therefore a hard formula boundary;
-- package size remains a SKU child.

DO $$
DECLARE
  target RECORD;
  v_serving public.product_data%ROWTYPE;
  v_formula_id BIGINT;
  v_run_id BIGINT;
  v_top_cache_key TEXT;
  v_gtin TEXT;
  v_official_row_count INTEGER;
  v_distinct_ingredient_count INTEGER;
BEGIN
  CREATE TEMP TABLE rc_breed_targets (
    canonical_formula_key TEXT PRIMARY KEY,
    canonical_product_name TEXT NOT NULL,
    canonical_product_line TEXT NOT NULL,
    breed_name TEXT NOT NULL,
    pet_type TEXT NOT NULL,
    representative_cache_key TEXT NOT NULL,
    official_source_url TEXT NOT NULL,
    expected_official_sku_count INTEGER NOT NULL,
    expected_ingredient_count INTEGER NOT NULL,
    retailer_relation TEXT NOT NULL,
    exact_formula_aliases TEXT[] NOT NULL,
    exact_search_aliases TEXT[] NOT NULL,
    canonical_formula_id BIGINT
  ) ON COMMIT DROP;

  INSERT INTO rc_breed_targets (
    canonical_formula_key,
    canonical_product_name,
    canonical_product_line,
    breed_name,
    pet_type,
    representative_cache_key,
    official_source_url,
    expected_official_sku_count,
    expected_ingredient_count,
    retailer_relation,
    exact_formula_aliases,
    exact_search_aliases
  )
  VALUES
    (
      'royal canin|royal canin|german shepherd adult dry dog food|dog|adult|dry||',
      'Royal Canin Breed Health Nutrition German Shepherd Adult Dry Dog Food',
      'Breed Health Nutrition German Shepherd',
      'German Shepherd',
      'dog',
      'royal-canin-mars-petcare:1420600:030111520807',
      'https://www.royalcanin.com/us/dogs/products/retail-products/german-shepherd-adult-2518',
      3,
      50,
      'conflicting_older_formula_version',
      ARRAY[
        'royal canin|royal canin|royal canin breed health nutrition german shepherd adult dry dog food|dog|adult|dry||',
        'royal canin|royal canin|royal canin breed health nutrition german shepherd adult dry dog food|dog|adult|dry|chicken|'
      ]::TEXT[],
      ARRAY[
        'Royal Canin Breed Health Nutrition German Shepherd Adult Dry Dog Food',
        'Royal Canin German Shepherd Adult Dry Dog Food'
      ]::TEXT[]
    ),
    (
      'royal canin|royal canin|golden retriever adult dry dog food|dog|adult|dry||',
      'Royal Canin Breed Health Nutrition Golden Retriever Adult Dry Dog Food',
      'Breed Health Nutrition Golden Retriever',
      'Golden Retriever',
      'dog',
      'royal-canin-mars-petcare:1408264:030111169051',
      'https://www.royalcanin.com/us/dogs/products/retail-products/golden-retriever-adult-3970',
      3,
      52,
      'same_formula_localization_annotation',
      ARRAY[
        'royal canin|royal canin|royal canin breed health nutrition golden retriever adult dry dog food|dog|adult|dry||',
        'royal canin|royal canin|royal canin breed health nutrition golden retriever adult dry dog food|dog|adult|dry|chicken|',
        'royal canin|royal canin|royal canin breed health nutrition golden retriever adult dog dry food|dog|adult|dry|chicken|'
      ]::TEXT[],
      ARRAY[
        'Royal Canin Breed Health Nutrition Golden Retriever Adult Dry Dog Food',
        'Royal Canin Golden Retriever Adult Dry Dog Food'
      ]::TEXT[]
    ),
    (
      'royal canin|royal canin|american shorthair adult dry cat food|cat|adult|dry||',
      'Royal Canin Feline Breed Nutrition American Shorthair Adult Dry Cat Food',
      'Feline Breed Nutrition American Shorthair',
      'American Shorthair',
      'cat',
      'royal-canin-mars-petcare:338917:030111496317',
      'https://www.royalcanin.com/us/cats/products/retail-products/american-shorthair-adult-4350',
      1,
      48,
      'same_formula',
      ARRAY[
        'royal canin|royal canin|royal canin american shorthair adult cat food|cat|adult|dry||',
        'royal canin|royal canin|royal canin feline breed nutrition american shorthair adult dry cat food|cat|adult|dry||'
      ]::TEXT[],
      ARRAY[
        'Royal Canin Feline Breed Nutrition American Shorthair Adult Dry Cat Food',
        'Royal Canin American Shorthair Adult Dry Cat Food'
      ]::TEXT[]
    ),
    (
      'royal canin|royal canin|ragdoll adult dry cat food|cat|adult|dry||',
      'Royal Canin Feline Breed Nutrition Ragdoll Adult Dry Cat Food',
      'Feline Breed Nutrition Ragdoll',
      'Ragdoll',
      'cat',
      'royal-canin-mars-petcare:336836:030111542977',
      'https://www.royalcanin.com/us/cats/products/retail-products/ragdoll-adult-2515',
      1,
      52,
      'same_formula',
      ARRAY[
        'royal canin|royal canin|royal canin feline breed nutrition ragdoll adult dry cat food|cat|adult|dry||',
        'royal canin|royal canin|royal canin feline ragdoll adult dry cat food breed nutrition|cat|adult|dry||'
      ]::TEXT[],
      ARRAY[
        'Royal Canin Feline Breed Nutrition Ragdoll Adult Dry Cat Food',
        'Royal Canin Ragdoll Adult Dry Cat Food'
      ]::TEXT[]
    ),
    (
      'royal canin|royal canin|siamese adult dry cat food|cat|adult|dry||',
      'Royal Canin Feline Breed Nutrition Siamese Adult Dry Cat Food',
      'Feline Breed Nutrition Siamese',
      'Siamese',
      'cat',
      'royal-canin-mars-petcare:336838:030111543363',
      'https://www.royalcanin.com/us/cats/products/retail-products/siamese-adult-2551',
      1,
      48,
      'same_formula',
      ARRAY[
        'royal canin|royal canin|royal canin feline breed nutrition siamese adult dry cat food|cat|adult|dry||',
        'royal canin|royal canin|royal canin feline siamese adult dry cat food breed nutrition|cat|adult|dry||'
      ]::TEXT[],
      ARRAY[
        'Royal Canin Feline Breed Nutrition Siamese Adult Dry Cat Food',
        'Royal Canin Siamese Adult Dry Cat Food'
      ]::TEXT[]
    ),
    (
      'royal canin|royal canin|maine coon adult dry cat food|cat|adult|dry||',
      'Royal Canin Feline Breed Nutrition Maine Coon Adult Dry Cat Food',
      'Feline Breed Nutrition Maine Coon',
      'Maine Coon',
      'cat',
      'royal-canin-mars-petcare:336830:030111543943',
      'https://www.royalcanin.com/us/cats/products/retail-products/maine-coon-adult-2550',
      2,
      53,
      'conflicting_older_formula_version',
      ARRAY[
        'royal canin|royal canin|royal canin feline breed nutrition maine coon adult dry cat food|cat|adult|dry||',
        'royal canin|royal canin|royal canin feline maine coon adult dry cat food breed nutrition|cat|adult|dry|chicken|'
      ]::TEXT[],
      ARRAY[
        'Royal Canin Feline Breed Nutrition Maine Coon Adult Dry Cat Food',
        'Royal Canin Maine Coon Adult Dry Cat Food'
      ]::TEXT[]
    ),
    (
      'royal canin|royal canin|bengal adult dry cat food|cat|adult|dry||',
      'Royal Canin Feline Breed Nutrition Bengal Adult Dry Cat Food',
      'Feline Breed Nutrition Bengal',
      'Bengal',
      'cat',
      'royal-canin-mars-petcare:336828:030111549808',
      'https://www.royalcanin.com/us/cats/products/retail-products/bengal-adult-4370',
      1,
      46,
      'same_formula',
      ARRAY[
        'royal canin|royal canin|royal canin feline breed nutrition bengal adult dry cat food|cat|adult|dry||',
        'royal canin|royal canin|royal canin feline bengal adult dry cat food breed nutrition|cat|adult|dry|chicken|'
      ]::TEXT[],
      ARRAY[
        'Royal Canin Feline Breed Nutrition Bengal Adult Dry Cat Food',
        'Royal Canin Bengal Adult Dry Cat Food'
      ]::TEXT[]
    ),
    (
      'royal canin|royal canin|persian adult dry cat food|cat|adult|dry||',
      'Royal Canin Feline Breed Nutrition Persian Adult Dry Cat Food',
      'Feline Breed Nutrition Persian',
      'Persian',
      'cat',
      'royal-canin-mars-petcare:336834:030111843579',
      'https://www.royalcanin.com/us/cats/products/retail-products/persian-adult-2552',
      1,
      50,
      'conflicting_older_formula_version',
      ARRAY[
        'royal canin|royal canin|royal canin feline breed nutrition persian adult dry cat food|cat|adult|dry||',
        'royal canin|royal canin|royal canin feline breed nutrition persian adult dry cat food|cat|adult|dry|chicken|'
      ]::TEXT[],
      ARRAY[
        'Royal Canin Feline Breed Nutrition Persian Adult Dry Cat Food',
        'Royal Canin Persian Adult Dry Cat Food'
      ]::TEXT[]
    );

  IF (SELECT count(*) FROM rc_breed_targets) <> 8 THEN
    RAISE EXCEPTION 'Royal Canin breed target inventory is incomplete';
  END IF;

  SELECT count(*)
  INTO v_official_row_count
  FROM public.product_data serving
  JOIN rc_breed_targets inventory
    ON inventory.official_source_url = serving.source_url
  WHERE serving.source_quality = 'manufacturer'
    AND serving.ingredient_verification_status = 'manufacturer'
    AND serving.image_verification_status = 'manufacturer'
    AND serving.is_complete_food
    AND serving.catalog_exclusion_reason IS NULL
    AND serving.pet_type = inventory.pet_type
    AND serving.life_stage = 'adult'
    AND serving.food_form = 'dry'
    AND serving.ingredient_count = inventory.expected_ingredient_count
    AND NULLIF(btrim(serving.gtin), '') IS NOT NULL
    AND NULLIF(btrim(serving.ingredient_text), '') IS NOT NULL
    AND NULLIF(btrim(serving.image_url), '') IS NOT NULL;

  IF v_official_row_count <> 13 THEN
    RAISE EXCEPTION
      'Royal Canin breed official SKU inventory changed: expected 13, found %',
      v_official_row_count;
  END IF;

  INSERT INTO public.catalog_source_runs (
    run_key,
    source_slug,
    source_type,
    coverage_role,
    status,
    started_at,
    finished_at,
    expected_count,
    observed_count,
    accepted_count,
    rejected_count,
    pagination_complete,
    source_content_hash,
    checkpoint,
    error_summary,
    metadata,
    updated_at
  )
  VALUES (
    'manual-exact-evidence:royal-canin:breed-formula-split:20260726',
    'royal-canin-mars-petcare',
    'manufacturer',
    'verification',
    'completed',
    NOW(),
    NOW(),
    13,
    13,
    13,
    0,
    TRUE,
    encode(
      digest(
        (
          SELECT string_agg(
            inventory.official_source_url,
            '|'
            ORDER BY inventory.official_source_url
          )
          FROM rc_breed_targets inventory
        ),
        'sha256'
      ),
      'hex'
    ),
    '{}'::JSONB,
    NULL,
    jsonb_build_object(
      'manual_exact_evidence', TRUE,
      'identity_repair',
        'split broad Royal Canin breed-line collisions into exact breed formulas',
      'formula_count', 8,
      'official_sku_count', 13,
      'reviewed_at', '2026-07-26'
    ),
    NOW()
  )
  ON CONFLICT (run_key) DO UPDATE
  SET
    status = 'completed',
    finished_at = NOW(),
    expected_count = 13,
    observed_count = 13,
    accepted_count = 13,
    rejected_count = 0,
    pagination_complete = TRUE,
    source_content_hash = EXCLUDED.source_content_hash,
    error_summary = NULL,
    metadata = EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING id INTO v_run_id;

  -- Demote duplicate retailer serving rows before moving SKU ownership. The
  -- GTIN ingredient-version trigger intentionally refuses a canonical link
  -- while any competing retailer row is still marked as trusted ingredient
  -- evidence, even when the difference is only formatting or a localization
  -- annotation. The retailer observation and SKU provenance are retained
  -- below; the serving row no longer competes with current manufacturer truth.
  UPDATE public.product_data retailer
  SET
    product_line = inventory.canonical_product_line,
    pet_type = inventory.pet_type,
    life_stage = 'adult',
    food_form = 'dry',
    flavor = NULL,
    is_complete_food = FALSE,
    catalog_exclusion_reason = CASE
      WHEN inventory.retailer_relation =
           'conflicting_older_formula_version'
        THEN
          'retailer_formula_version_conflicts_with_current_manufacturer_evidence'
      ELSE 'duplicate_alias_of_verified_formula'
    END,
    ingredient_verification_status = 'unverified',
    verified_at = NULL,
    updated_at = NOW()
  FROM rc_breed_targets inventory
  JOIN public.product_data official
    ON official.source_url = inventory.official_source_url
   AND official.source_quality = 'manufacturer'
  WHERE retailer.cache_key LIKE 'petsmart-retail-catalog:%'
    AND ltrim(
          regexp_replace(COALESCE(retailer.gtin, ''), '[^0-9]', '', 'g'),
          '0'
        ) =
        ltrim(
          regexp_replace(COALESCE(official.gtin, ''), '[^0-9]', '', 'g'),
          '0'
        );

  FOR target IN
    SELECT *
    FROM rc_breed_targets
    ORDER BY canonical_formula_key
  LOOP
    SELECT *
    INTO STRICT v_serving
    FROM public.product_data
    WHERE cache_key = target.representative_cache_key
      AND source_url = target.official_source_url
      AND source_quality = 'manufacturer'
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND pet_type = target.pet_type
      AND life_stage = 'adult'
      AND food_form = 'dry'
      AND ingredient_count = target.expected_ingredient_count
      AND is_complete_food
      AND catalog_exclusion_reason IS NULL;

    SELECT
      count(*),
      count(
        DISTINCT public.catalog_normalize_ingredient_evidence(
          serving.ingredient_text
        )
      )
    INTO
      v_official_row_count,
      v_distinct_ingredient_count
    FROM public.product_data serving
    WHERE serving.source_url = target.official_source_url
      AND serving.source_quality = 'manufacturer'
      AND serving.ingredient_verification_status = 'manufacturer'
      AND serving.image_verification_status = 'manufacturer'
      AND serving.is_complete_food
      AND serving.catalog_exclusion_reason IS NULL;

    IF v_official_row_count <> target.expected_official_sku_count
       OR v_distinct_ingredient_count <> 1
    THEN
      RAISE EXCEPTION
        'Royal Canin exact formula evidence changed for %: rows %, ingredient versions %',
        target.breed_name,
        v_official_row_count,
        v_distinct_ingredient_count;
    END IF;

    INSERT INTO public.catalog_formulas (
      formula_key,
      manufacturer,
      brand,
      product_name,
      product_line,
      pet_type,
      life_stage,
      food_form,
      flavor,
      diet_condition,
      is_complete_food,
      complete_food_evidence,
      ingredient_text,
      ingredients,
      front_image_url,
      source_url,
      source_authority,
      ingredient_verification_status,
      image_verification_status,
      protected_terms,
      verification_status,
      active,
      is_popular_brand,
      first_observed_at,
      last_observed_at,
      promoted_cache_key,
      promoted_at,
      identity_hash,
      updated_at
    )
    VALUES (
      target.canonical_formula_key,
      'royal canin',
      'royal canin',
      target.canonical_product_name,
      lower(target.canonical_product_line),
      target.pet_type,
      'adult',
      'dry',
      '',
      '',
      TRUE,
      format(
        'Current exact Royal Canin US manufacturer PDP identifies %s adult dry %s food, publishes the full current ingredient statement and matching front-package image, and states complete and balanced maintenance nutrition.',
        target.breed_name,
        target.pet_type
      ),
      v_serving.ingredient_text,
      v_serving.ingredients,
      v_serving.image_url,
      target.official_source_url,
      'manufacturer',
      'manufacturer',
      'manufacturer',
      ARRAY[
        'royal canin',
        CASE
          WHEN target.pet_type = 'dog'
            THEN 'breed health nutrition'
          ELSE 'feline breed nutrition'
        END,
        lower(target.breed_name),
        'adult',
        'dry',
        target.pet_type,
        CASE
          WHEN target.pet_type = 'dog' THEN 'canine'
          ELSE 'feline'
        END
      ]::TEXT[],
      'verified',
      TRUE,
      TRUE,
      NOW(),
      NOW(),
      target.representative_cache_key,
      NOW(),
      encode(digest(target.canonical_formula_key, 'sha256'), 'hex'),
      NOW()
    )
    ON CONFLICT (formula_key) DO UPDATE
    SET
      manufacturer = EXCLUDED.manufacturer,
      brand = EXCLUDED.brand,
      product_name = EXCLUDED.product_name,
      product_line = EXCLUDED.product_line,
      pet_type = EXCLUDED.pet_type,
      life_stage = EXCLUDED.life_stage,
      food_form = EXCLUDED.food_form,
      flavor = EXCLUDED.flavor,
      diet_condition = EXCLUDED.diet_condition,
      is_complete_food = EXCLUDED.is_complete_food,
      complete_food_evidence = EXCLUDED.complete_food_evidence,
      ingredient_text = EXCLUDED.ingredient_text,
      ingredients = EXCLUDED.ingredients,
      front_image_url = EXCLUDED.front_image_url,
      source_url = EXCLUDED.source_url,
      source_authority = EXCLUDED.source_authority,
      ingredient_verification_status =
        EXCLUDED.ingredient_verification_status,
      image_verification_status = EXCLUDED.image_verification_status,
      protected_terms = EXCLUDED.protected_terms,
      verification_status = 'verified',
      active = TRUE,
      absent_since = NULL,
      is_popular_brand = TRUE,
      last_observed_at = NOW(),
      promoted_cache_key = target.representative_cache_key,
      promoted_at = COALESCE(
        public.catalog_formulas.promoted_at,
        NOW()
      ),
      identity_hash = EXCLUDED.identity_hash,
      updated_at = NOW()
    RETURNING id INTO v_formula_id;

    UPDATE rc_breed_targets
    SET canonical_formula_id = v_formula_id
    WHERE canonical_formula_key = target.canonical_formula_key;

    UPDATE public.product_data
    SET
      brand = 'Royal Canin',
      product_name = target.canonical_product_name,
      product_line = target.canonical_product_line,
      pet_type = target.pet_type,
      life_stage = 'adult',
      food_form = 'dry',
      flavor = NULL,
      is_complete_food = TRUE,
      source = 'royal-canin-mars-petcare',
      source_quality = 'manufacturer',
      ingredient_verification_status = 'manufacturer',
      image_verification_status = 'manufacturer',
      verified_at = COALESCE(verified_at, NOW()),
      catalog_exclusion_reason = NULL,
      updated_at = NOW()
    WHERE source_url = target.official_source_url
      AND source_quality = 'manufacturer';

    UPDATE public.catalog_observations
    SET
      formula_id = v_formula_id,
      manufacturer = 'royal canin',
      brand = 'royal canin',
      product_name = target.canonical_product_name,
      product_line = lower(target.canonical_product_line),
      pet_type = target.pet_type,
      life_stage = 'adult',
      food_form = 'dry',
      flavor = '',
      diet_condition = '',
      is_complete_food = TRUE,
      validation_status = 'accepted',
      validation_reasons = ARRAY[]::TEXT[],
      raw_payload =
        COALESCE(raw_payload, '{}'::JSONB) ||
        jsonb_build_object(
          'identity_reconciliation',
          jsonb_build_object(
            'status', 'exact_official_breed_formula',
            'canonical_formula_id', v_formula_id,
            'breed_boundary', target.breed_name,
            'species_boundary', target.pet_type,
            'life_stage_boundary', 'adult',
            'food_form_boundary', 'dry',
            'reconciled_at', NOW()
          )
        )
    WHERE source_url = target.official_source_url
      AND source_slug = 'royal-canin-mars-petcare';

    UPDATE public.catalog_skus
    SET
      formula_id = v_formula_id,
      active = TRUE,
      last_observed_at = NOW(),
      updated_at = NOW()
    WHERE source_url = target.official_source_url
      AND source_slug = 'royal-canin-mars-petcare';

    INSERT INTO public.catalog_observations (
      run_id,
      formula_id,
      source_slug,
      source_external_id,
      source_url,
      source_authority,
      gtin,
      manufacturer,
      brand,
      product_name,
      product_line,
      pet_type,
      life_stage,
      food_form,
      flavor,
      diet_condition,
      package_size,
      ingredient_text,
      front_image_url,
      is_complete_food,
      available_in_us,
      observed_at,
      content_hash,
      validation_status,
      validation_reasons,
      raw_payload
    )
    SELECT
      v_run_id,
      v_formula_id,
      'royal-canin-mars-petcare',
      serving.cache_key,
      serving.source_url,
      'manufacturer',
      serving.gtin,
      'royal canin',
      'royal canin',
      target.canonical_product_name,
      lower(target.canonical_product_line),
      target.pet_type,
      'adult',
      'dry',
      '',
      '',
      serving.package_size,
      serving.ingredient_text,
      serving.image_url,
      TRUE,
      TRUE,
      NOW(),
      encode(
        digest(
          serving.cache_key || '|' ||
          serving.ingredient_text || '|' ||
          serving.image_url,
          'sha256'
        ),
        'hex'
      ),
      'accepted',
      ARRAY[]::TEXT[],
      jsonb_build_object(
        'official_product_page', serving.source_url,
        'official_front_image', serving.image_url,
        'official_gtin', serving.gtin,
        'official_package_size', serving.package_size,
        'ingredient_count', serving.ingredient_count,
        'breed_boundary', target.breed_name,
        'species_boundary', target.pet_type,
        'life_stage_boundary', 'adult',
        'food_form_boundary', 'dry',
        'reviewed_at', '2026-07-26'
      )
    FROM public.product_data serving
    WHERE serving.source_url = target.official_source_url
      AND serving.source_quality = 'manufacturer'
    ON CONFLICT (
      run_id,
      source_slug,
      source_external_id,
      content_hash
    ) DO UPDATE
    SET
      formula_id = EXCLUDED.formula_id,
      validation_status = 'accepted',
      validation_reasons = ARRAY[]::TEXT[],
      raw_payload = EXCLUDED.raw_payload,
      observed_at = NOW();

    INSERT INTO public.catalog_skus (
      formula_id,
      gtin,
      package_size,
      package_count,
      source_slug,
      source_external_id,
      source_url,
      active,
      first_observed_at,
      last_observed_at,
      updated_at
    )
    SELECT
      v_formula_id,
      serving.gtin,
      serving.package_size,
      1,
      'royal-canin-mars-petcare',
      serving.cache_key,
      serving.source_url,
      TRUE,
      NOW(),
      NOW(),
      NOW()
    FROM public.product_data serving
    WHERE serving.source_url = target.official_source_url
      AND serving.source_quality = 'manufacturer'
    ON CONFLICT (
      source_slug,
      source_external_id,
      gtin,
      package_size
    ) DO UPDATE
    SET
      formula_id = EXCLUDED.formula_id,
      package_count = 1,
      source_url = EXCLUDED.source_url,
      active = TRUE,
      last_observed_at = NOW(),
      updated_at = NOW();

    INSERT INTO public.catalog_formula_aliases (
      alias_formula_key,
      formula_id,
      identity_hash,
      match_reason,
      source_url,
      metadata,
      updated_at
    )
    SELECT
      alias_formula_key,
      v_formula_id,
      encode(digest(target.canonical_formula_key, 'sha256'), 'hex'),
      'manual_review',
      target.official_source_url,
      jsonb_build_object(
        'exact_formula_identity', TRUE,
        'breed_boundary', target.breed_name,
        'species_boundary', target.pet_type,
        'life_stage_boundary', 'adult',
        'food_form_boundary', 'dry',
        'official_current_formula', TRUE,
        'reviewed_at', '2026-07-26'
      ),
      NOW()
    FROM unnest(target.exact_formula_aliases) AS alias_formula_key
    ON CONFLICT (alias_formula_key) DO UPDATE
    SET
      formula_id = EXCLUDED.formula_id,
      identity_hash = EXCLUDED.identity_hash,
      match_reason = EXCLUDED.match_reason,
      source_url = EXCLUDED.source_url,
      metadata = EXCLUDED.metadata,
      updated_at = NOW();

    INSERT INTO public.catalog_verified_product_search_aliases (
      cache_key,
      alias_text,
      normalized_alias,
      source_url,
      source_authority,
      evidence_observed_at,
      provenance
    )
    SELECT
      target.representative_cache_key,
      alias_text,
      public.normalize_verified_product_search_query(alias_text),
      target.official_source_url,
      'manufacturer',
      NOW(),
      jsonb_build_object(
        'exact_official_breed_identity', TRUE,
        'breed_boundary', target.breed_name,
        'species_boundary', target.pet_type,
        'life_stage_boundary', 'adult',
        'food_form_boundary', 'dry',
        'reviewed_at', '2026-07-26'
      )
    FROM unnest(target.exact_search_aliases) AS alias_text
    ON CONFLICT (normalized_alias) WHERE active DO UPDATE
    SET
      cache_key = EXCLUDED.cache_key,
      alias_text = EXCLUDED.alias_text,
      source_url = EXCLUDED.source_url,
      source_authority = EXCLUDED.source_authority,
      evidence_observed_at = EXCLUDED.evidence_observed_at,
      provenance = EXCLUDED.provenance,
      updated_at = NOW();

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
      v_formula_id,
      NULL,
      evidence.field_name,
      to_jsonb(evidence.field_value),
      target.official_source_url,
      'manufacturer',
      TRUE,
      NOW(),
      encode(
        digest(
          v_formula_id::TEXT || '|' ||
          evidence.field_name || '|' ||
          evidence.field_value || '|' ||
          target.official_source_url,
          'sha256'
        ),
        'hex'
      )
    FROM (
      VALUES
        ('breed', target.breed_name),
        ('species', target.pet_type),
        ('life_stage', 'adult'),
        ('food_form', 'dry'),
        ('ingredient_count', target.expected_ingredient_count::TEXT),
        ('formula_version', 'current_official_2026-07-26'),
        ('complete_food', 'complete_and_balanced_maintenance')
    ) evidence(field_name, field_value)
    ON CONFLICT (
      formula_id,
      field_name,
      source_url,
      content_hash
    ) DO UPDATE
    SET
      accepted = TRUE,
      observed_at = EXCLUDED.observed_at;

    INSERT INTO public.catalog_manual_evidence_reviews (
      review_key,
      target_formula_key,
      corrected_formula_key,
      brand,
      product_name,
      search_query,
      discovery_urls,
      authoritative_source_url,
      authoritative_source_type,
      expected_identity,
      resolved_identity,
      evidence_status,
      quarantine_reason,
      authoritative_content_hash,
      ingredient_text_hash,
      front_image_url_hash,
      observed_at,
      formula_id,
      promoted_cache_key,
      attempt_count,
      review_notes,
      updated_at
    )
    VALUES (
      'manual-search:royal-canin:' ||
        regexp_replace(lower(target.breed_name), '[^a-z0-9]+', '-', 'g') ||
        '-adult-dry:20260726',
      target.canonical_formula_key,
      target.canonical_formula_key,
      'Royal Canin',
      target.canonical_product_name,
      target.canonical_product_name || ' ingredients',
      jsonb_build_array(target.official_source_url),
      target.official_source_url,
      'manufacturer_page',
      jsonb_build_object(
        'brand', 'Royal Canin',
        'breed', target.breed_name,
        'pet_type', target.pet_type,
        'life_stage', 'adult',
        'food_form', 'dry'
      ),
      jsonb_build_object(
        'formula_id', v_formula_id,
        'official_sku_count', target.expected_official_sku_count,
        'ingredient_count', target.expected_ingredient_count
      ),
      'promoted',
      NULL,
      encode(
        digest(
          target.official_source_url || '|' ||
          v_serving.ingredient_text || '|' ||
          v_serving.image_url,
          'sha256'
        ),
        'hex'
      ),
      encode(digest(v_serving.ingredient_text, 'sha256'), 'hex'),
      encode(digest(v_serving.image_url, 'sha256'), 'hex'),
      NOW(),
      v_formula_id,
      target.representative_cache_key,
      1,
      format(
        'Exact current official %s formula promoted. Breed, species, adult life stage, dry form, ingredients, front image, completeness, and %s SKU GTIN(s) are protected.',
        target.breed_name,
        target.expected_official_sku_count
      ),
      NOW()
    )
    ON CONFLICT (review_key) DO UPDATE
    SET
      corrected_formula_key = EXCLUDED.corrected_formula_key,
      authoritative_source_url = EXCLUDED.authoritative_source_url,
      expected_identity = EXCLUDED.expected_identity,
      resolved_identity = EXCLUDED.resolved_identity,
      evidence_status = 'promoted',
      quarantine_reason = NULL,
      authoritative_content_hash =
        EXCLUDED.authoritative_content_hash,
      ingredient_text_hash = EXCLUDED.ingredient_text_hash,
      front_image_url_hash = EXCLUDED.front_image_url_hash,
      observed_at = EXCLUDED.observed_at,
      formula_id = EXCLUDED.formula_id,
      promoted_cache_key = EXCLUDED.promoted_cache_key,
      attempt_count =
        public.catalog_manual_evidence_reviews.attempt_count + 1,
      review_notes = EXCLUDED.review_notes,
      updated_at = NOW();
  END LOOP;

  -- Reconcile PetSmart package evidence to the exact current manufacturer
  -- formula. Equal ingredient copies and the Golden Retriever localization-only
  -- annotation remain valid SKU evidence. Materially different German Shepherd,
  -- Maine Coon, and Persian ingredient versions are retained but quarantined.
  UPDATE public.product_data retailer
  SET
    product_line = inventory.canonical_product_line,
    pet_type = inventory.pet_type,
    life_stage = 'adult',
    food_form = 'dry',
    flavor = NULL,
    is_complete_food = FALSE,
    catalog_exclusion_reason = CASE
      WHEN inventory.retailer_relation =
           'conflicting_older_formula_version'
        THEN
          'retailer_formula_version_conflicts_with_current_manufacturer_evidence'
      ELSE 'duplicate_alias_of_verified_formula'
    END,
    ingredient_verification_status = 'unverified',
    verified_at = NULL,
    updated_at = NOW()
  FROM rc_breed_targets inventory
  JOIN public.product_data official
    ON official.source_url = inventory.official_source_url
   AND official.source_quality = 'manufacturer'
  WHERE retailer.cache_key LIKE 'petsmart-retail-catalog:%'
    AND ltrim(
          regexp_replace(COALESCE(retailer.gtin, ''), '[^0-9]', '', 'g'),
          '0'
        ) =
        ltrim(
          regexp_replace(COALESCE(official.gtin, ''), '[^0-9]', '', 'g'),
          '0'
        );

  UPDATE public.catalog_product_evidence evidence
  SET
    review_state = 'rejected',
    rejection_reason =
      'retailer_formula_version_conflicts_with_current_manufacturer_evidence',
    ingredient_verification_status = 'unverified',
    updated_at = NOW()
  FROM rc_breed_targets inventory
  JOIN public.product_data official
    ON official.source_url = inventory.official_source_url
   AND official.source_quality = 'manufacturer'
  JOIN public.product_data retailer
    ON retailer.cache_key LIKE 'petsmart-retail-catalog:%'
   AND ltrim(
         regexp_replace(COALESCE(retailer.gtin, ''), '[^0-9]', '', 'g'),
         '0'
       ) =
       ltrim(
         regexp_replace(COALESCE(official.gtin, ''), '[^0-9]', '', 'g'),
         '0'
       )
  WHERE inventory.retailer_relation =
        'conflicting_older_formula_version'
    AND evidence.cache_key = retailer.cache_key;

  UPDATE public.catalog_observations observation
  SET
    formula_id = inventory.canonical_formula_id,
    product_line = lower(inventory.canonical_product_line),
    pet_type = inventory.pet_type,
    life_stage = 'adult',
    food_form = 'dry',
    flavor = '',
    validation_status = CASE
      WHEN inventory.retailer_relation =
           'conflicting_older_formula_version'
        THEN 'rejected'
      ELSE 'accepted'
    END,
    validation_reasons = CASE
      WHEN inventory.retailer_relation =
           'conflicting_older_formula_version'
        THEN ARRAY[
          'retailer_formula_version_conflicts_with_current_manufacturer_evidence'
        ]::TEXT[]
      ELSE ARRAY[]::TEXT[]
    END,
    raw_payload =
      COALESCE(observation.raw_payload, '{}'::JSONB) ||
      jsonb_build_object(
        'identity_reconciliation',
        jsonb_build_object(
          'canonical_formula_id', inventory.canonical_formula_id,
          'breed_boundary', inventory.breed_name,
          'retailer_relation', inventory.retailer_relation,
          'current_manufacturer_source', inventory.official_source_url,
          'reconciled_at', NOW()
        )
      )
  FROM rc_breed_targets inventory
  JOIN public.product_data official
    ON official.source_url = inventory.official_source_url
   AND official.source_quality = 'manufacturer'
  WHERE observation.source_slug = 'petsmart-retail-catalog'
    AND ltrim(
          regexp_replace(COALESCE(observation.gtin, ''), '[^0-9]', '', 'g'),
          '0'
        ) =
        ltrim(
          regexp_replace(COALESCE(official.gtin, ''), '[^0-9]', '', 'g'),
          '0'
        );

  UPDATE public.catalog_skus sku
  SET
    formula_id = inventory.canonical_formula_id,
    active =
      inventory.retailer_relation <>
        'conflicting_older_formula_version',
    last_observed_at = NOW(),
    updated_at = NOW()
  FROM rc_breed_targets inventory
  JOIN public.product_data official
    ON official.source_url = inventory.official_source_url
   AND official.source_quality = 'manufacturer'
  WHERE sku.source_slug = 'petsmart-retail-catalog'
    AND ltrim(
          regexp_replace(COALESCE(sku.gtin, ''), '[^0-9]', '', 'g'),
          '0'
        ) =
        ltrim(
          regexp_replace(COALESCE(official.gtin, ''), '[^0-9]', '', 'g'),
          '0'
        );

  -- The broad line formulas also absorbed unrelated puppy, kitten, and 5+
  -- Chewy listings. Put those source records back on their exact discovered
  -- identities instead of silently merging them into the adult formula.
  WITH exact_chewy_moves (
    source_external_id,
    target_formula_key
  ) AS (
    VALUES
      (
        '115780',
        'royal canin|royal canin|german shepherd adult dry dog food|dog|adult|dry||'
      ),
      (
        '260511',
        'royal canin|royal canin|german shepherd adult 5 dry dog food|dog|adult|dry||'
      ),
      (
        '3284078',
        'royal canin|royal canin|german shepherd puppy dry dog food|dog|puppy|dry||'
      ),
      (
        '3800614',
        'royal canin|royal canin|golden retriever adult dry dog food|dog|adult|dry||'
      ),
      (
        '3800638',
        'royal canin|royal canin|golden retriever puppy dry dog food|dog|puppy|dry||'
      ),
      (
        '55298',
        'royal canin|royal canin|ragdoll adult dry cat food|cat|adult|dry||'
      ),
      (
        '53321',
        'royal canin|royal canin|siamese adult dry cat food|cat|adult|dry||'
      ),
      (
        '153469',
        'royal canin|royal canin|bengal adult dry cat food|cat|adult|dry||'
      ),
      (
        '53323',
        'royal canin|royal canin|persian adult dry cat food|cat|adult|dry||'
      ),
      (
        '103359',
        'royal canin|royal canin|persian kitten dry cat food|cat|kitten|dry||'
      )
  )
  UPDATE public.catalog_observations observation
  SET
    formula_id = exact_formula.id,
    raw_payload =
      COALESCE(observation.raw_payload, '{}'::JSONB) ||
      jsonb_build_object(
        'identity_reconciliation',
        jsonb_build_object(
          'status', 'exact_chewy_breed_life_stage_reassignment',
          'canonical_formula_id', exact_formula.id,
          'reconciled_at', NOW()
        )
      )
  FROM exact_chewy_moves move
  JOIN public.catalog_formulas exact_formula
    ON exact_formula.formula_key = move.target_formula_key
  WHERE observation.source_slug = 'chewy-public-sitemap'
    AND observation.source_external_id = move.source_external_id;

  WITH exact_chewy_moves (
    source_external_id,
    target_formula_key
  ) AS (
    VALUES
      (
        '115780',
        'royal canin|royal canin|german shepherd adult dry dog food|dog|adult|dry||'
      ),
      (
        '260511',
        'royal canin|royal canin|german shepherd adult 5 dry dog food|dog|adult|dry||'
      ),
      (
        '3284078',
        'royal canin|royal canin|german shepherd puppy dry dog food|dog|puppy|dry||'
      ),
      (
        '3800614',
        'royal canin|royal canin|golden retriever adult dry dog food|dog|adult|dry||'
      ),
      (
        '3800638',
        'royal canin|royal canin|golden retriever puppy dry dog food|dog|puppy|dry||'
      ),
      (
        '55298',
        'royal canin|royal canin|ragdoll adult dry cat food|cat|adult|dry||'
      ),
      (
        '53321',
        'royal canin|royal canin|siamese adult dry cat food|cat|adult|dry||'
      ),
      (
        '153469',
        'royal canin|royal canin|bengal adult dry cat food|cat|adult|dry||'
      ),
      (
        '53323',
        'royal canin|royal canin|persian adult dry cat food|cat|adult|dry||'
      ),
      (
        '103359',
        'royal canin|royal canin|persian kitten dry cat food|cat|kitten|dry||'
      )
  )
  UPDATE public.catalog_skus sku
  SET
    formula_id = exact_formula.id,
    updated_at = NOW()
  FROM exact_chewy_moves move
  JOIN public.catalog_formulas exact_formula
    ON exact_formula.formula_key = move.target_formula_key
  WHERE sku.source_slug = 'chewy-public-sitemap'
    AND sku.source_external_id = move.source_external_id;

  -- Retire the broad and retailer-derived formula nodes only after all exact
  -- observations and SKU children have been reassigned.
  UPDATE public.catalog_formulas old_formula
  SET
    verification_status = 'quarantined',
    active = FALSE,
    absent_since = COALESCE(absent_since, NOW()),
    promoted_cache_key = NULL,
    promoted_at = NULL,
    complete_food_evidence =
      'Superseded by exact current Royal Canin manufacturer breed formula. This broad or retailer-derived identity is retained only for audit history.',
    updated_at = NOW()
  WHERE old_formula.formula_key =
          'royal canin|royal canin|feline breed nutrition|cat|adult|dry||'
     OR EXISTS (
          SELECT 1
          FROM rc_breed_targets inventory
          WHERE old_formula.formula_key =
                ANY(inventory.exact_formula_aliases)
            AND old_formula.id <> inventory.canonical_formula_id
        );

  -- Exact official formula search and every current manufacturer GTIN must now
  -- resolve to the canonical representative serving row.
  FOR target IN
    SELECT *
    FROM rc_breed_targets inventory
    ORDER BY canonical_formula_key
  LOOP
    SELECT result.cache_key
    INTO v_top_cache_key
    FROM public.search_verified_products(
      target.exact_search_aliases[1],
      8
    ) result
    ORDER BY result.rank DESC
    LIMIT 1;

    IF v_top_cache_key IS DISTINCT FROM target.representative_cache_key THEN
      RAISE EXCEPTION
        'Royal Canin breed exact search regression for %: expected %, found %',
        target.breed_name,
        target.representative_cache_key,
        v_top_cache_key;
    END IF;

    FOR v_gtin IN
      SELECT serving.gtin
      FROM public.product_data serving
      WHERE serving.source_url = target.official_source_url
        AND serving.source_quality = 'manufacturer'
      ORDER BY serving.gtin
    LOOP
      SELECT result.cache_key
      INTO v_top_cache_key
      FROM public.resolve_verified_product_by_gtin(v_gtin, 8) result
      ORDER BY result.rank DESC
      LIMIT 1;

      IF v_top_cache_key IS DISTINCT FROM target.representative_cache_key THEN
        RAISE EXCEPTION
          'Royal Canin breed GTIN regression for % / %: expected %, found %',
          target.breed_name,
          v_gtin,
          target.representative_cache_key,
          v_top_cache_key;
      END IF;
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM rc_breed_targets inventory
    LEFT JOIN public.catalog_formulas formula
      ON formula.id = inventory.canonical_formula_id
    LEFT JOIN public.product_data serving
      ON serving.cache_key = formula.promoted_cache_key
    WHERE formula.id IS NULL
       OR NOT formula.active
       OR formula.verification_status <> 'verified'
       OR formula.promoted_cache_key <>
          inventory.representative_cache_key
       OR formula.pet_type <> inventory.pet_type
       OR formula.life_stage <> 'adult'
       OR formula.food_form <> 'dry'
       OR NULLIF(btrim(formula.flavor), '') IS NOT NULL
       OR formula.ingredient_verification_status <> 'manufacturer'
       OR formula.image_verification_status <> 'manufacturer'
       OR public.catalog_normalize_ingredient_evidence(
            formula.ingredient_text
          ) <>
          public.catalog_normalize_ingredient_evidence(
            serving.ingredient_text
          )
  ) THEN
    RAISE EXCEPTION 'Royal Canin exact breed canonical formula regression';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    WHERE formula.formula_key =
            'royal canin|royal canin|feline breed nutrition|cat|adult|dry||'
      AND (
        formula.active
        OR formula.verification_status <> 'quarantined'
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.catalog_skus sku
    JOIN public.catalog_formulas formula
      ON formula.id = sku.formula_id
    WHERE sku.active
      AND formula.formula_key =
          'royal canin|royal canin|feline breed nutrition|cat|adult|dry||'
  ) THEN
    RAISE EXCEPTION
      'Royal Canin broad Feline Breed Nutrition collision remains active';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_observations observation
    WHERE observation.source_slug = 'chewy-public-sitemap'
      AND observation.source_external_id IN (
        '260511',
        '3284078',
        '3800638',
        '103359'
      )
      AND observation.formula_id IN (
        SELECT formula.id
        FROM public.catalog_formulas formula
        WHERE formula.formula_key IN (
          'royal canin|royal canin|german shepherd adult dry dog food|dog|adult|dry||',
          'royal canin|royal canin|golden retriever adult dry dog food|dog|adult|dry||',
          'royal canin|royal canin|feline breed nutrition|cat|adult|dry||'
        )
      )
  ) THEN
    RAISE EXCEPTION
      'Royal Canin puppy, kitten, or 5+ source collision remains attached to adult formula';
  END IF;
END
$$;
