-- Split two current Tiki Cat Baby products that share the same recipe name
-- but have different visible textures, packages, and ingredient formulas.
--
-- Official manufacturer pages prove both exact current versions:
--   * Baby Pâté, 2.4 oz can
--   * Baby Mousse & Shreds, 1.9 oz can / 3-count box
--
-- The legacy staging formula had accepted evidence from both pages under one
-- generic title. Keep the versions separate, preserve the exact Chewy package
-- listings as SKU/alias evidence, and promote only through the existing
-- verified catalog gate.

DO $migration$
DECLARE
  v_pate_id CONSTANT BIGINT := 36405;
  v_mousse_id CONSTANT BIGINT := 10158;
  v_chewy_pate_id CONSTANT BIGINT := 12639;
  v_chewy_mousse_id CONSTANT BIGINT := 12733;
  v_pate_old_key CONSTANT TEXT :=
    'whitebridge pet brands|tiki cat|chicken salmon and chicken liver recipe tiki cat wet food mousse shreds kitten chicken salmon chicken liver|cat|kitten|wet|salmon and chicken liver recipe|';
  v_mousse_old_key CONSTANT TEXT :=
    'tiki cat|tiki cat|chicken salmon and chicken liver recipe|cat|kitten|wet|salmon and chicken liver recipe|';
  v_pate_key CONSTANT TEXT :=
    'whitebridge pet brands|tiki cat|tiki cat baby pate chicken salmon and chicken liver recipe tiki cat wet food mousse shreds kitten chicken salmon chicken liver|cat|kitten|wet|chicken salmon and chicken liver recipe|';
  v_mousse_key CONSTANT TEXT :=
    'whitebridge pet brands|tiki cat|tiki cat baby mousse and shreds chicken salmon and chicken liver recipe tiki cat wet food mousse shreds kitten kitten chicken salmon chicken liver|cat|kitten|wet|chicken salmon and chicken liver recipe|';
  v_chewy_pate_key CONSTANT TEXT :=
    'tiki cat|tiki cat|tiki cat baby chicken salmon and chicken liver pate grain free wet kitten food|cat|kitten|wet||';
  v_chewy_mousse_key CONSTANT TEXT :=
    'tiki cat|tiki cat|tiki cat baby chicken salmon and chicken liver recipe trial pack grain free mousse and shreds wet kitten food|cat|kitten|wet||';
  v_pate_url CONSTANT TEXT :=
    'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/mousse-shreds/kitten/chicken-salmon-chicken-liver/';
  v_mousse_url CONSTANT TEXT :=
    'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/mousse-shreds/kitten/kitten-chicken-salmon-chicken-liver/';
  v_chewy_pate_url CONSTANT TEXT :=
    'https://www.chewy.com/tiki-cat-baby-chicken-salmon-chicken/dp/1043318';
  v_chewy_mousse_url CONSTANT TEXT :=
    'https://www.chewy.com/tiki-cat-baby-grain-free-chicken/dp/526110';
  v_pate_cache CONSTANT TEXT :=
    'tiki-pets:tiki cat chicken salmon chicken liver recipe kitten chicken-salmon-chicken-liver';
  v_mousse_cache CONSTANT TEXT :=
    'tiki-pets:tiki-cat-baby-mousse-shreds-chicken-salmon-chicken-liver';
  v_run_key CONSTANT TEXT :=
    'tiki-pets:bounded-exact-evidence:84c0df743bb69c986d1fb92d';
  v_captured_at CONSTANT TIMESTAMPTZ :=
    '2026-08-04T09:46:51.648Z'::TIMESTAMPTZ;
  v_run_id BIGINT;
  v_pate_observation_id BIGINT;
  v_mousse_observation_id BIGINT;
  v_top TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.catalog_source_runs WHERE run_key = v_run_key
  ) THEN
    RAISE EXCEPTION 'Tiki Baby texture exact-evidence run already exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = v_pate_id
      AND formula_key = v_pate_old_key
      AND active
      AND verification_status = 'verified'
      AND promoted_cache_key = v_pate_cache
      AND source_url = v_pate_url
      AND front_image_url =
        'https://tikipets.com/wp-content/uploads/2024/03/Babypatesalmongroupimage.png'
      AND md5(ingredient_text) = '81e5c1d751a966c53203b2aaa693d4ff'
      AND cardinality(ingredients) = 32
  ) THEN
    RAISE EXCEPTION 'Tiki Baby Pâté formula precondition changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = v_mousse_id
      AND formula_key = v_mousse_old_key
      AND active
      AND verification_status = 'verified'
      AND promoted_cache_key IS NULL
      AND source_url = v_mousse_url
      AND front_image_url =
        'https://tikipets.com/wp-content/uploads/2021/08/BABY_MOUSSE_SHRED_FRONT.png'
      AND md5(ingredient_text) = 'f45cd0df4dceb4f77ad690d3e30f1c2b'
      AND cardinality(ingredients) = 31
  ) THEN
    RAISE EXCEPTION 'Tiki Baby Mousse & Shreds formula precondition changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = v_pate_cache
      AND source_url = v_pate_url
      AND brand = 'Tiki Cat'
      AND pet_type = 'cat'
      AND food_form = 'wet'
      AND life_stage = 'kitten'
      AND md5(ingredient_text) = '81e5c1d751a966c53203b2aaa693d4ff'
      AND image_url =
        'https://tikipets.com/wp-content/uploads/2024/03/Babypatesalmongroupimage.png'
      AND is_complete_food
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Tiki Baby Pâté serving precondition changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE formula_key IN (v_pate_key, v_mousse_key)
      AND id NOT IN (v_pate_id, v_mousse_id)
  ) THEN
    RAISE EXCEPTION 'A reviewed Tiki Baby texture formula key already belongs to another formula';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = v_chewy_pate_id
      AND formula_key = v_chewy_pate_key
      AND source_url = v_chewy_pate_url
      AND verification_status = 'discovered'
      AND ingredient_text = ''
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = v_chewy_mousse_id
      AND formula_key = v_chewy_mousse_key
      AND source_url = v_chewy_mousse_url
      AND verification_status = 'discovered'
      AND ingredient_text = ''
  ) THEN
    RAISE EXCEPTION 'Tiki Baby Chewy package alias preconditions changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_observations
    WHERE id = 10952
      AND formula_id = v_mousse_id
      AND source_url = v_pate_url
      AND md5(ingredient_text) = '81e5c1d751a966c53203b2aaa693d4ff'
      AND validation_status = 'accepted'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.catalog_observations
    WHERE id = 10956
      AND formula_id = v_mousse_id
      AND source_url = v_mousse_url
      AND md5(ingredient_text) = 'f45cd0df4dceb4f77ad690d3e30f1c2b'
      AND validation_status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Legacy mixed-texture observation preconditions changed';
  END IF;

  -- Remove only the duplicate Pâté field rows from the Mousse formula. The
  -- same exact Pâté source/value evidence already exists on formula 36405.
  DELETE FROM public.catalog_field_evidence
  WHERE formula_id = v_mousse_id
    AND source_url = v_pate_url
    AND field_name IN ('ingredient_text', 'front_image_url')
    AND EXISTS (
      SELECT 1
      FROM public.catalog_field_evidence retained
      WHERE retained.formula_id = v_pate_id
        AND retained.source_url = v_pate_url
        AND retained.field_name = catalog_field_evidence.field_name
        AND retained.accepted
    );

  UPDATE public.catalog_observations
  SET formula_id = v_pate_id
  WHERE id = 10952;

  INSERT INTO public.catalog_formula_aliases (
    alias_formula_key,
    formula_id,
    identity_hash,
    match_reason,
    source_url,
    metadata,
    updated_at
  ) VALUES
    (
      v_pate_old_key,
      v_pate_id,
      encode(digest(v_pate_old_key, 'sha256'), 'hex'),
      'manual_review',
      v_pate_url,
      jsonb_build_object(
        'reason', 'legacy official Pâté identity lacked the visible texture label',
        'reviewed_at', v_captured_at,
        'ingredient_hash_equality_verified', TRUE,
        'image_equality_verified', TRUE
      ),
      NOW()
    ),
    (
      v_chewy_pate_key,
      v_pate_id,
      encode(digest(v_chewy_pate_key, 'sha256'), 'hex'),
      'manual_review',
      v_chewy_pate_url,
      jsonb_build_object(
        'reason', 'exact Chewy Pâté package title and full ingredient page match the current manufacturer Pâté formula',
        'reviewed_at', v_captured_at,
        'package_size_is_sku_only', TRUE
      ),
      NOW()
    ),
    (
      v_chewy_mousse_key,
      v_mousse_id,
      encode(digest(v_chewy_mousse_key, 'sha256'), 'hex'),
      'manual_review',
      v_chewy_mousse_url,
      jsonb_build_object(
        'reason', 'exact Chewy Mousse & Shreds package title and full ingredient page match the current manufacturer formula',
        'reviewed_at', v_captured_at,
        'package_size_is_sku_only', TRUE
      ),
      NOW()
    )
  ON CONFLICT (alias_formula_key) DO UPDATE
  SET formula_id = EXCLUDED.formula_id,
      identity_hash = EXCLUDED.identity_hash,
      match_reason = EXCLUDED.match_reason,
      source_url = EXCLUDED.source_url,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
  WHERE catalog_formula_aliases.formula_id = EXCLUDED.formula_id;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formula_aliases
    WHERE alias_formula_key IN (
      v_pate_old_key,
      v_chewy_pate_key,
      v_chewy_mousse_key
    )
      AND formula_id NOT IN (v_pate_id, v_mousse_id)
  ) THEN
    RAISE EXCEPTION 'A Tiki Baby reviewed alias belongs to an incompatible formula';
  END IF;

  UPDATE public.catalog_formulas
  SET formula_key = v_pate_key,
      manufacturer = 'Whitebridge Pet Brands',
      product_name =
        'Tiki Cat Baby Pâté Chicken, Salmon & Chicken Liver Recipe',
      product_line = 'Tiki Cat Baby Pâté',
      flavor = 'Chicken, Salmon & Chicken Liver Recipe',
      complete_food_evidence =
        'Current exact Tiki Cat Baby Pâté page identifies a 2.4 oz complete and balanced kitten food, full ingredients, guaranteed analysis, feeding guidance, and matching manufacturer package image.',
      protected_terms = ARRAY[
        'Tiki Cat', 'Baby', 'Pâté', 'Chicken', 'Salmon',
        'Chicken Liver', 'Recipe', 'kitten', 'wet'
      ]::TEXT[],
      identity_hash =
        'daa3b3b75a9c7b4644abf7816b0e6ee4bd0c860a656d56414a7cae939d687ee4',
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance = jsonb_build_object(
        'version_status', 'manufacturer_current',
        'source', 'tiki-pets',
        'source_url', v_pate_url,
        'captured_at', v_captured_at,
        'ingredient_text_hash',
          encode(digest(ingredient_text, 'sha256'), 'hex'),
        'front_image_url', front_image_url,
        'texture', 'pâté',
        'exact_formula_evidence', TRUE,
        'package_size_is_sku_only', TRUE
      ),
      ingredient_verification_status = 'manufacturer',
      image_verification_status = 'manufacturer',
      verification_status = 'verified',
      active = TRUE,
      is_popular_brand = TRUE,
      last_observed_at = v_captured_at,
      absent_since = NULL,
      updated_at = NOW()
  WHERE id = v_pate_id;

  UPDATE public.catalog_formulas
  SET formula_key = v_mousse_key,
      manufacturer = 'Whitebridge Pet Brands',
      product_name =
        'Tiki Cat Baby Mousse & Shreds Chicken, Salmon & Chicken Liver Recipe',
      product_line = 'Tiki Cat Baby Mousse & Shreds',
      flavor = 'Chicken, Salmon & Chicken Liver Recipe',
      complete_food_evidence =
        'Current exact Tiki Cat Baby Mousse & Shreds page identifies the 1.9 oz 3-count kitten package, full ingredients, guaranteed analysis, feeding guidance, and matching manufacturer front image.',
      protected_terms = ARRAY[
        'Tiki Cat', 'Baby', 'Mousse', 'Shreds', 'Chicken', 'Salmon',
        'Chicken Liver', 'Recipe', 'kitten', 'wet'
      ]::TEXT[],
      identity_hash =
        '2819e051f44fd916df687e6a6adb39bad54e1e380b03b24896982627018506f0',
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance = jsonb_build_object(
        'version_status', 'manufacturer_current',
        'source', 'tiki-pets',
        'source_url', v_mousse_url,
        'captured_at', v_captured_at,
        'ingredient_text_hash',
          encode(digest(ingredient_text, 'sha256'), 'hex'),
        'front_image_url', front_image_url,
        'texture', 'mousse_and_shreds',
        'exact_formula_evidence', TRUE,
        'package_size_is_sku_only', TRUE
      ),
      ingredient_verification_status = 'manufacturer',
      image_verification_status = 'manufacturer',
      verification_status = 'verified',
      active = TRUE,
      is_popular_brand = TRUE,
      last_observed_at = v_captured_at,
      absent_since = NULL,
      updated_at = NOW()
  WHERE id = v_mousse_id;

  -- Correct the already-promoted Pâté serving metadata before invoking the
  -- promotion gate so the exact evidence version is reused instead of copied.
  UPDATE public.product_data
  SET product_name =
        'Tiki Cat Baby Pâté Chicken, Salmon & Chicken Liver Recipe',
      product_line = 'Tiki Cat Baby Pâté',
      flavor = 'Chicken, Salmon & Chicken Liver Recipe',
      package_size = '2.4 oz can',
      life_stage = 'kitten',
      food_form = 'wet',
      pet_type = 'cat',
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance = jsonb_build_object(
        'version_status', 'manufacturer_current',
        'source', 'tiki-pets',
        'source_url', v_pate_url,
        'captured_at', v_captured_at,
        'texture', 'pâté',
        'exact_formula_evidence', TRUE,
        'package_size_is_sku_only', TRUE
      ),
      updated_at = NOW()
  WHERE cache_key = v_pate_cache;

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
  ) VALUES (
    v_run_key,
    'tiki-pets',
    'manufacturer',
    'verification',
    'quarantined',
    v_captured_at,
    v_captured_at,
    2,
    2,
    2,
    0,
    FALSE,
    '84c0df743bb69c986d1fb92dbd34dda259731b57874c6e3d9a4151bfb09e63e1',
    jsonb_build_object(
      'feed_row_count', 2,
      'accepted_observation_count', 2,
      'canonical_formula_count', 2
    ),
    'run_not_proven_complete',
    jsonb_build_object(
      'brand', 'Tiki Cat',
      'manufacturer', 'Whitebridge Pet Brands',
      'source_authority', 'manufacturer',
      'bounded_exact_evidence', TRUE,
      'exact_formula_evidence', TRUE,
      'package_size_is_sku_only', TRUE,
      'texture_identity_split', TRUE,
      'official_inventory_full', FALSE
    ),
    NOW()
  )
  RETURNING id INTO v_run_id;

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
    raw_payload,
    formula_evidence_tier,
    formula_version_provenance
  )
  SELECT
    v_run_id,
    formula.id,
    'tiki-pets',
    CASE formula.id
      WHEN v_pate_id THEN
        'tiki-pets:tiki-cat-baby-pate-chicken-salmon-chicken-liver'
      ELSE
        'tiki-pets:tiki-cat-baby-mousse-shreds-chicken-salmon-chicken-liver'
    END,
    formula.source_url,
    'manufacturer',
    NULL,
    formula.manufacturer,
    formula.brand,
    formula.product_name,
    formula.product_line,
    formula.pet_type,
    formula.life_stage,
    formula.food_form,
    formula.flavor,
    formula.diet_condition,
    CASE formula.id
      WHEN v_pate_id THEN '2.4 oz can'
      ELSE '1.9 oz can - 3 count box'
    END,
    formula.ingredient_text,
    formula.front_image_url,
    TRUE,
    TRUE,
    v_captured_at,
    encode(digest(concat_ws(
      '|', formula.formula_key, formula.source_url,
      formula.ingredient_text, formula.front_image_url
    ), 'sha256'), 'hex'),
    'accepted',
    ARRAY[]::TEXT[],
    jsonb_build_object(
      'cache_key', CASE formula.id
        WHEN v_pate_id THEN
          'tiki-pets:tiki-cat-baby-pate-chicken-salmon-chicken-liver'
        ELSE v_mousse_cache
      END,
      'canonical_formula_identity', jsonb_build_object(
        'manufacturer', lower(formula.manufacturer),
        'brand', lower(formula.brand),
        'product_line', lower(formula.product_line),
        'pet_type', formula.pet_type,
        'life_stage', formula.life_stage,
        'food_form', formula.food_form,
        'flavor', lower(formula.flavor),
        'diet_condition', formula.diet_condition
      ),
      'exact_formula_evidence', TRUE,
      'package_size_is_sku_only', TRUE,
      'ingredient_source_url', formula.source_url,
      'image_source_url', formula.source_url
    ),
    'manufacturer_current_exact',
    formula.formula_version_provenance
  FROM public.catalog_formulas formula
  WHERE formula.id IN (v_pate_id, v_mousse_id);

  SELECT id INTO STRICT v_pate_observation_id
  FROM public.catalog_observations
  WHERE run_id = v_run_id
    AND formula_id = v_pate_id;

  SELECT id INTO STRICT v_mousse_observation_id
  FROM public.catalog_observations
  WHERE run_id = v_run_id
    AND formula_id = v_mousse_id;

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
    field.field_name,
    field.field_value,
    observation.source_url,
    'manufacturer',
    TRUE,
    v_captured_at,
    observation.content_hash
  FROM public.catalog_observations observation
  CROSS JOIN LATERAL (
    VALUES
      ('ingredient_text'::TEXT, to_jsonb(observation.ingredient_text)),
      ('front_image_url'::TEXT, to_jsonb(observation.front_image_url))
  ) field(field_name, field_value)
  WHERE observation.run_id = v_run_id
  ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
  SET observation_id = EXCLUDED.observation_id,
      field_value = EXCLUDED.field_value,
      source_authority = EXCLUDED.source_authority,
      accepted = TRUE,
      observed_at = EXCLUDED.observed_at;

  -- The exact Chewy pages expose the same package texture, recipe, species,
  -- life stage, and full ingredient statement as their manufacturer formula.
  -- Move only their observations/SKUs and retain each retailer URL as alias
  -- provenance; package count does not create another formula.
  UPDATE public.catalog_observations
  SET formula_id = CASE
        WHEN formula_id = v_chewy_pate_id THEN v_pate_id
        WHEN formula_id = v_chewy_mousse_id THEN v_mousse_id
        ELSE formula_id
      END
  WHERE formula_id IN (v_chewy_pate_id, v_chewy_mousse_id);

  UPDATE public.catalog_skus
  SET formula_id = CASE
        WHEN formula_id = v_chewy_pate_id THEN v_pate_id
        WHEN formula_id = v_chewy_mousse_id THEN v_mousse_id
        ELSE formula_id
      END,
      updated_at = NOW()
  WHERE formula_id IN (v_chewy_pate_id, v_chewy_mousse_id);

  UPDATE public.catalog_formulas
  SET active = FALSE,
      absent_since = COALESCE(absent_since, v_captured_at),
      updated_at = NOW()
  WHERE id IN (v_chewy_pate_id, v_chewy_mousse_id)
    AND verification_status = 'discovered'
    AND ingredient_text = '';

  INSERT INTO public.catalog_formula_identity_conflicts (
    identity_hash,
    canonical_formula_id,
    conflicting_formula_id,
    incoming_formula_key,
    source_url,
    conflict_reasons,
    incoming_identity,
    status,
    updated_at
  ) VALUES (
    encode(digest(v_mousse_old_key, 'sha256'), 'hex'),
    v_mousse_id,
    v_pate_id,
    v_mousse_old_key,
    '',
    ARRAY[
      'legacy_generic_identity_combined_pate_and_mousse_shreds',
      'texture_boundary',
      'ingredient_formula_version_boundary'
    ]::TEXT[],
    jsonb_build_object(
      'resolved_formula_keys', jsonb_build_array(v_pate_key, v_mousse_key),
      'do_not_alias_generic_key', TRUE,
      'reviewed_at', v_captured_at
    ),
    'resolved',
    NOW()
  )
  ON CONFLICT (
    identity_hash,
    canonical_formula_id,
    conflicting_formula_id,
    incoming_formula_key
  ) DO UPDATE
  SET conflict_reasons = EXCLUDED.conflict_reasons,
      incoming_identity = EXCLUDED.incoming_identity,
      status = 'resolved',
      updated_at = NOW();

  PERFORM * FROM public.promote_catalog_formula(v_pate_id);
  PERFORM * FROM public.promote_catalog_formula(v_mousse_id);

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_source_runs
    WHERE id = v_run_id
      AND run_key = v_run_key
      AND status = 'quarantined'
      AND error_summary = 'run_not_proven_complete'
      AND expected_count = 2
      AND observed_count = 2
      AND accepted_count = 2
      AND rejected_count = 0
      AND NOT pagination_complete
      AND metadata->>'bounded_exact_evidence' = 'true'
      AND metadata->>'exact_formula_evidence' = 'true'
  ) THEN
    RAISE EXCEPTION 'Tiki Baby bounded source run postcondition failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    JOIN public.product_data serving
      ON serving.cache_key = formula.promoted_cache_key
    WHERE formula.id = v_pate_id
      AND formula.formula_key = v_pate_key
      AND formula.product_line = 'Tiki Cat Baby Pâté'
      AND formula.flavor = 'Chicken, Salmon & Chicken Liver Recipe'
      AND formula.promoted_cache_key = v_pate_cache
      AND md5(formula.ingredient_text) = '81e5c1d751a966c53203b2aaa693d4ff'
      AND serving.product_line = formula.product_line
      AND serving.flavor = formula.flavor
      AND md5(serving.ingredient_text) = md5(formula.ingredient_text)
      AND serving.image_url = formula.front_image_url
      AND serving.formula_evidence_tier = 'manufacturer_current_exact'
  ) THEN
    RAISE EXCEPTION 'Tiki Baby Pâté exact serving postcondition failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    JOIN public.product_data serving
      ON serving.cache_key = formula.promoted_cache_key
    WHERE formula.id = v_mousse_id
      AND formula.formula_key = v_mousse_key
      AND formula.product_line = 'Tiki Cat Baby Mousse & Shreds'
      AND formula.flavor = 'Chicken, Salmon & Chicken Liver Recipe'
      AND formula.promoted_cache_key = v_mousse_cache
      AND md5(formula.ingredient_text) = 'f45cd0df4dceb4f77ad690d3e30f1c2b'
      AND serving.product_line = formula.product_line
      AND serving.flavor = formula.flavor
      AND md5(serving.ingredient_text) = md5(formula.ingredient_text)
      AND serving.image_url = formula.front_image_url
      AND serving.formula_evidence_tier = 'manufacturer_current_exact'
  ) THEN
    RAISE EXCEPTION 'Tiki Baby Mousse & Shreds exact serving postcondition failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id IN (v_chewy_pate_id, v_chewy_mousse_id)
      AND active
  ) OR EXISTS (
    SELECT 1
    FROM public.catalog_observations
    WHERE formula_id IN (v_chewy_pate_id, v_chewy_mousse_id)
  ) OR EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE formula_id IN (v_chewy_pate_id, v_chewy_mousse_id)
  ) THEN
    RAISE EXCEPTION 'Tiki Baby retailer aliases were not fully canonicalized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_observations
    WHERE id = 10952
      AND formula_id = v_pate_id
  ) OR EXISTS (
    SELECT 1
    FROM public.catalog_field_evidence
    WHERE formula_id = v_mousse_id
      AND source_url = v_pate_url
      AND accepted
  ) THEN
    RAISE EXCEPTION 'Tiki Baby legacy mixed-texture evidence remains contaminated';
  END IF;

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'Tiki Cat Baby Pate Chicken Salmon Chicken Liver Recipe Wet Kitten Food',
    5
  )
  ORDER BY rank DESC
  LIMIT 1;
  IF v_top IS DISTINCT FROM v_pate_cache THEN
    RAISE EXCEPTION 'Tiki Baby Pâté exact search returned %', v_top;
  END IF;

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'Tiki Cat Baby Mousse and Shreds Chicken Salmon Chicken Liver Recipe Wet Kitten Food',
    5
  )
  ORDER BY rank DESC
  LIMIT 1;
  IF v_top IS DISTINCT FROM v_mousse_cache THEN
    RAISE EXCEPTION 'Tiki Baby Mousse & Shreds exact search returned %', v_top;
  END IF;

  IF (
    SELECT count(DISTINCT cache_key)
    FROM public.search_verified_products(
      'Tiki Cat Baby Chicken Salmon Chicken Liver Recipe',
      8
    )
    WHERE cache_key IN (v_pate_cache, v_mousse_cache)
  ) <> 0 THEN
    RAISE EXCEPTION 'Tiki Baby generic recipe search did not abstain across incompatible textures';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_observations
    WHERE run_id = v_run_id
      AND validation_status = 'accepted'
      AND formula_evidence_tier = 'manufacturer_current_exact'
  ) <> 2 OR (
    SELECT count(*)
    FROM public.catalog_field_evidence
    WHERE observation_id IN (
      v_pate_observation_id,
      v_mousse_observation_id
    )
      AND accepted
      AND field_name IN ('ingredient_text', 'front_image_url')
  ) <> 4 THEN
    RAISE EXCEPTION 'Tiki Baby exact observation/evidence counts are incomplete';
  END IF;
END
$migration$;
