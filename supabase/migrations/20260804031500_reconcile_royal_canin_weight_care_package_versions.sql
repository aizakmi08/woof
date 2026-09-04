-- Reconcile the two official Royal Canin Weight Care Loaf package-page
-- variants to their existing species-specific canonical formulas.
--
-- Royal Canin publishes one exact formula through multiple package-size URLs:
--   * cat /1478/1 and /1478/2 have the same 39-ingredient statement;
--   * dog /1166/1 and /1166/2 have the same 42-ingredient statement.
-- Every published GTIN is already a child of the correct canonical formula.
-- This migration records the reviewed URL/formula equivalence without
-- weakening the exact-manufacturer-URL reconciliation rule.

DO $$
DECLARE
  v_cat_formula BIGINT;
  v_dog_formula BIGINT;
  v_cat_identity_hash TEXT;
  v_dog_identity_hash TEXT;
  v_cat_cache CONSTANT TEXT :=
    'royal-canin-mars-petcare:1053824:030111411082';
  v_dog_cache CONSTANT TEXT :=
    'royal-canin-mars-petcare:344518:030111425416';
  v_cat_key CONSTANT TEXT :=
    'royal canin|royal canin|feline care nutrition weight care|cat|adult|wet|loaf in sauce|weight care';
  v_dog_key CONSTANT TEXT :=
    'royal canin|royal canin|canine care nutrition weight care|dog|adult|wet|loaf in sauce|weight care';
  v_cat_alias CONSTANT TEXT :=
    'royal canin|royal canin|weight care loaf in sauce|cat|unknown|wet||';
  v_dog_alias CONSTANT TEXT :=
    'royal canin|royal canin|weight care loaf in sauce canned dog food|dog|unknown|wet||';
  v_cat_canonical_url CONSTANT TEXT :=
    'https://www.royalcanin.com/us/cats/products/retail-products/weight-care-loaf-in-sauce-1478/1';
  v_cat_variant_url CONSTANT TEXT :=
    'https://www.royalcanin.com/us/cats/products/retail-products/weight-care-loaf-in-sauce-1478/2';
  v_dog_canonical_url CONSTANT TEXT :=
    'https://www.royalcanin.com/us/dogs/products/retail-products/weight-care-loaf-in-sauce-1166/2';
  v_dog_variant_url CONSTANT TEXT :=
    'https://www.royalcanin.com/us/dogs/products/retail-products/weight-care-loaf-in-sauce-1166/1';
  v_cat_ingredient_hash CONSTANT TEXT :=
    'fd04f5e08de4cfa20febd11b3e9e81150001f333f99ee6101415599a2d387ffa';
  v_dog_ingredient_hash CONSTANT TEXT :=
    '5c0295b1937ebd18db7018d8bafe2753ad746be83c7570961dadff86d8b80343';
BEGIN
  SELECT id, identity_hash
  INTO STRICT v_cat_formula, v_cat_identity_hash
  FROM public.catalog_formulas
  WHERE formula_key = v_cat_key
    AND active
    AND verification_status = 'verified'
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND promoted_cache_key = v_cat_cache
    AND pet_type = 'cat'
    AND life_stage = 'adult'
    AND food_form = 'wet'
    AND flavor = 'loaf in sauce'
    AND diet_condition = 'weight care'
    AND source_url = v_cat_canonical_url
    AND cardinality(ingredients) = 39
    AND encode(digest(ingredient_text, 'sha256'), 'hex') =
        v_cat_ingredient_hash;

  SELECT id, identity_hash
  INTO STRICT v_dog_formula, v_dog_identity_hash
  FROM public.catalog_formulas
  WHERE formula_key = v_dog_key
    AND active
    AND verification_status = 'verified'
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND promoted_cache_key = v_dog_cache
    AND pet_type = 'dog'
    AND life_stage = 'adult'
    AND food_form = 'wet'
    AND flavor = 'loaf in sauce'
    AND diet_condition = 'weight care'
    AND source_url = v_dog_canonical_url
    AND cardinality(ingredients) = 42
    AND encode(digest(ingredient_text, 'sha256'), 'hex') =
        v_dog_ingredient_hash;

  IF (
    SELECT count(*)
    FROM public.product_data
    WHERE source_url = v_cat_variant_url
      AND pet_type = 'cat'
      AND food_form = 'wet'
      AND ingredient_count = 39
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND image_url <> ''
      AND encode(digest(ingredient_text, 'sha256'), 'hex') =
          v_cat_ingredient_hash
      AND catalog_exclusion_reason = 'duplicate_alias_of_verified_formula'
  ) <> 2 THEN
    RAISE EXCEPTION
      'Royal Canin cat Weight Care package-variant evidence changed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.product_data
    WHERE source_url = v_dog_variant_url
      AND pet_type = 'dog'
      AND food_form = 'wet'
      AND ingredient_count = 42
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND image_url <> ''
      AND encode(digest(ingredient_text, 'sha256'), 'hex') =
          v_dog_ingredient_hash
      AND catalog_exclusion_reason = 'duplicate_alias_of_verified_formula'
  ) <> 2 THEN
    RAISE EXCEPTION
      'Royal Canin dog Weight Care package-variant evidence changed';
  END IF;

  IF (
    SELECT count(DISTINCT gtin)
    FROM public.catalog_skus
    WHERE formula_id = v_cat_formula
      AND active
      AND gtin IN (
        '030111411082', '10030111911091',
        '030111410412', '10030111941074'
      )
  ) <> 4 THEN
    RAISE EXCEPTION 'Royal Canin cat Weight Care GTIN family incomplete';
  END IF;

  IF (
    SELECT count(DISTINCT gtin)
    FROM public.catalog_skus
    WHERE formula_id = v_dog_formula
      AND active
      AND gtin IN (
        '030111425416', '030111425492',
        '030111495013', '10030111995015'
      )
  ) <> 4 THEN
    RAISE EXCEPTION 'Royal Canin dog Weight Care GTIN family incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_observations
    WHERE source_url = v_cat_variant_url
      AND formula_id = v_cat_formula
      AND validation_status = 'accepted'
      AND formula_evidence_tier = 'manufacturer_current_exact'
      AND pet_type = 'cat'
      AND food_form = 'wet'
      AND encode(digest(ingredient_text, 'sha256'), 'hex') =
          v_cat_ingredient_hash
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.catalog_observations
    WHERE source_url = v_dog_variant_url
      AND formula_id = v_dog_formula
      AND validation_status = 'accepted'
      AND formula_evidence_tier = 'manufacturer_current_exact'
      AND pet_type = 'dog'
      AND food_form = 'wet'
      AND encode(digest(ingredient_text, 'sha256'), 'hex') =
          v_dog_ingredient_hash
  ) THEN
    RAISE EXCEPTION
      'Royal Canin Weight Care accepted package observations missing';
  END IF;

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
      v_cat_alias,
      v_cat_formula,
      v_cat_identity_hash,
      'manual_review',
      v_cat_variant_url,
      jsonb_build_object(
        'exact_formula_identity', TRUE,
        'same_formula_size_variant', TRUE,
        'consumer_brand_boundary', 'royal canin',
        'species_boundary', 'cat',
        'food_form_boundary', 'wet',
        'texture_boundary', 'loaf in sauce',
        'condition_boundary', 'weight care',
        'canonical_official_url', v_cat_canonical_url,
        'package_variant_official_url', v_cat_variant_url,
        'ingredient_text_hash', v_cat_ingredient_hash,
        'gtins', jsonb_build_array(
          '030111411082', '10030111911091',
          '030111410412', '10030111941074'
        ),
        'reviewed_at', now()
      ),
      now()
    ),
    (
      v_dog_alias,
      v_dog_formula,
      v_dog_identity_hash,
      'manual_review',
      v_dog_variant_url,
      jsonb_build_object(
        'exact_formula_identity', TRUE,
        'same_formula_size_variant', TRUE,
        'consumer_brand_boundary', 'royal canin',
        'species_boundary', 'dog',
        'food_form_boundary', 'wet',
        'texture_boundary', 'loaf in sauce',
        'condition_boundary', 'weight care',
        'canonical_official_url', v_dog_canonical_url,
        'package_variant_official_url', v_dog_variant_url,
        'ingredient_text_hash', v_dog_ingredient_hash,
        'gtins', jsonb_build_array(
          '030111425416', '030111425492',
          '030111495013', '10030111995015'
        ),
        'reviewed_at', now()
      ),
      now()
    )
  ON CONFLICT (alias_formula_key) DO UPDATE
  SET formula_id = excluded.formula_id,
      identity_hash = excluded.identity_hash,
      match_reason = excluded.match_reason,
      source_url = excluded.source_url,
      metadata = excluded.metadata,
      updated_at = now();

  WITH exact_package_observations AS (
    SELECT DISTINCT ON (target.formula_id, observation.gtin)
      target.formula_id,
      target.canonical_url,
      target.variant_url,
      target.ingredient_hash,
      observation.id AS observation_id,
      observation.gtin,
      observation.package_size,
      observation.front_image_url,
      observation.observed_at
    FROM (
      VALUES
        (
          v_cat_formula, v_cat_canonical_url, v_cat_variant_url,
          v_cat_ingredient_hash
        ),
        (
          v_dog_formula, v_dog_canonical_url, v_dog_variant_url,
          v_dog_ingredient_hash
        )
    ) AS target(formula_id, canonical_url, variant_url, ingredient_hash)
    JOIN public.catalog_observations observation
      ON observation.source_url = target.variant_url
     AND observation.formula_id = target.formula_id
     AND observation.validation_status = 'accepted'
     AND observation.formula_evidence_tier = 'manufacturer_current_exact'
    ORDER BY
      target.formula_id,
      observation.gtin,
      observation.observed_at DESC,
      observation.id DESC
  )
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
    observation.observation_id,
    'package_variant_identity',
    jsonb_build_object(
      'same_formula_size_variant', TRUE,
      'canonical_official_url', observation.canonical_url,
      'package_variant_official_url', observation.variant_url,
      'gtin', observation.gtin,
      'package_size', observation.package_size,
      'ingredient_text_hash', observation.ingredient_hash,
      'front_image_url', observation.front_image_url
    ),
    observation.variant_url,
    'manufacturer',
    TRUE,
    observation.observed_at,
    encode(digest(
      observation.variant_url || '|' || observation.gtin || '|'
      || observation.ingredient_hash,
      'sha256'
    ), 'hex')
  FROM exact_package_observations observation
  ON CONFLICT (
    formula_id, field_name, source_url, content_hash
  ) DO UPDATE
  SET observation_id = excluded.observation_id,
      field_value = excluded.field_value,
      source_authority = excluded.source_authority,
      accepted = TRUE,
      observed_at = excluded.observed_at;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_verified_product_search_aliases
    WHERE active
      AND normalized_alias IN (
        public.normalize_verified_product_search_query(
          'Royal Canin Weight Care Loaf in Sauce Canned Dog Food'
        ),
        public.normalize_verified_product_search_query(
          'Royal Canin Weight Care Loaf in Sauce Wet Cat Food'
        )
      )
      AND cache_key NOT IN (v_cat_cache, v_dog_cache)
  ) THEN
    RAISE EXCEPTION
      'Royal Canin Weight Care exact search alias occupied by sibling';
  END IF;

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key,
    alias_text,
    normalized_alias,
    source_url,
    source_authority,
    evidence_observed_at,
    provenance
  ) VALUES
    (
      v_cat_cache,
      'Royal Canin Weight Care Loaf in Sauce Wet Cat Food',
      public.normalize_verified_product_search_query(
        'Royal Canin Weight Care Loaf in Sauce Wet Cat Food'
      ),
      v_cat_variant_url,
      'manufacturer',
      now(),
      jsonb_build_object(
        'same_formula_size_variant', TRUE,
        'species_boundary', 'cat',
        'texture_boundary', 'loaf in sauce',
        'condition_boundary', 'weight care'
      )
    ),
    (
      v_dog_cache,
      'Royal Canin Weight Care Loaf in Sauce Canned Dog Food',
      public.normalize_verified_product_search_query(
        'Royal Canin Weight Care Loaf in Sauce Canned Dog Food'
      ),
      v_dog_variant_url,
      'manufacturer',
      now(),
      jsonb_build_object(
        'same_formula_size_variant', TRUE,
        'species_boundary', 'dog',
        'texture_boundary', 'loaf in sauce',
        'condition_boundary', 'weight care'
      )
    )
  ON CONFLICT (normalized_alias) WHERE active DO UPDATE
  SET cache_key = excluded.cache_key,
      alias_text = excluded.alias_text,
      source_url = excluded.source_url,
      source_authority = excluded.source_authority,
      evidence_observed_at = excluded.evidence_observed_at,
      provenance = excluded.provenance,
      updated_at = now();

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
    checkpoint,
    error_summary,
    metadata,
    updated_at
  ) VALUES (
    'manual-review:royal-canin-weight-care-package-versions:20260803',
    'royal-canin-mars-petcare',
    'manufacturer',
    'verification',
    'completed',
    now(),
    now(),
    2,
    2,
    2,
    0,
    TRUE,
    '{}'::jsonb,
    NULL,
    jsonb_build_object(
      'bounded_exact_evidence', TRUE,
      'market_census_complete', FALSE,
      'formula_count', 2,
      'package_variant_urls', jsonb_build_array(
        v_cat_variant_url, v_dog_variant_url
      ),
      'canonical_urls', jsonb_build_array(
        v_cat_canonical_url, v_dog_canonical_url
      ),
      'identity_invariants', jsonb_build_array(
        'consumer_brand', 'species', 'life_stage', 'food_form',
        'texture', 'diet_condition', 'ingredient_hash'
      )
    ),
    now()
  )
  ON CONFLICT (run_key) DO UPDATE
  SET status = 'completed',
      finished_at = now(),
      expected_count = 2,
      observed_count = 2,
      accepted_count = 2,
      rejected_count = 0,
      pagination_complete = TRUE,
      error_summary = NULL,
      metadata = excluded.metadata,
      updated_at = now();

  IF (
    SELECT count(*)
    FROM public.catalog_formula_aliases
    WHERE (alias_formula_key = v_cat_alias
           AND formula_id = v_cat_formula
           AND source_url = v_cat_variant_url)
       OR (alias_formula_key = v_dog_alias
           AND formula_id = v_dog_formula
           AND source_url = v_dog_variant_url)
  ) <> 2 THEN
    RAISE EXCEPTION 'Royal Canin Weight Care alias reconciliation failed';
  END IF;

  IF (
    SELECT cache_key
    FROM public.search_verified_products(
      'Royal Canin Weight Care Loaf in Sauce Wet Cat Food', 1
    )
  ) IS DISTINCT FROM v_cat_cache OR (
    SELECT cache_key
    FROM public.search_verified_products(
      'Royal Canin Weight Care Loaf in Sauce Canned Dog Food', 1
    )
  ) IS DISTINCT FROM v_dog_cache THEN
    RAISE EXCEPTION
      'Royal Canin Weight Care exact search verification failed';
  END IF;
END;
$$;
