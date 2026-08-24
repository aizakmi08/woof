-- Promote the exact Target 3 oz Wellness Complete Health Sliced Salmon
-- package as a retailer source version. Its ingredients differ from the
-- manufacturer-current page, so both versions remain separate.
-- Also correct the 95% Turkey can: the package front says "mixer or topper",
-- making it non-complete and ineligible for Woof scoring.

DO $$
DECLARE
  v_source public.catalog_observations%ROWTYPE;
  v_run JSONB;
  v_payload JSONB;
  v_stage JSONB;
  v_formula_id BIGINT;
  v_cache_key TEXT;
  v_formula_key TEXT;
  v_identity_hash TEXT;
  v_source_hash TEXT;
  v_current_hash TEXT;
  v_current_cache CONSTANT TEXT :=
    'wellness-pet-company:wellness wellness complete health sliced salmon entr e cuts in rich gravy';
BEGIN
  SELECT observation.*
  INTO STRICT v_source
  FROM public.catalog_observations observation
  WHERE observation.source_slug = 'target-wellness-review-v116'
    AND observation.source_external_id = '1003676359'
  ORDER BY observation.id DESC
  LIMIT 1;

  v_source_hash := encode(
    digest(
      public.catalog_normalize_ingredient_evidence(
        v_source.ingredient_text
      ),
      'sha256'
    ),
    'hex'
  );
  IF v_source.gtin <> '076344036661'
    OR v_source.front_image_url <>
      'https://target.scene7.com/is/image/Target/GUEST_79e4eeea-8932-4d67-9088-058b68247d40'
    OR v_source_hash <>
      '06f2b1146ab6b4f2458ba89cd11a11f5d5fa99ae63f259e7925dd7acf3eb6a1d'
    OR length(v_source.ingredient_text) < 600
    OR public.catalog_has_unbalanced_parentheses(v_source.ingredient_text)
    OR public.catalog_has_ingredient_ocr_artifacts(v_source.ingredient_text)
  THEN
    RAISE EXCEPTION
      'Target Wellness Sliced Salmon package evidence changed';
  END IF;

  SELECT encode(
    digest(
      public.catalog_normalize_ingredient_evidence(ingredient_text),
      'sha256'
    ),
    'hex'
  )
  INTO STRICT v_current_hash
  FROM public.product_data
  WHERE cache_key = v_current_cache
    AND formula_evidence_tier = 'manufacturer_current_exact';

  IF v_current_hash = v_source_hash THEN
    RAISE EXCEPTION
      'Target Wellness Sliced Salmon unexpectedly equals current formula';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE regexp_replace(COALESCE(gtin, ''), '[^0-9]', '', 'g')
      = '076344036661'
  ) THEN
    RAISE EXCEPTION
      'Target Wellness Sliced Salmon UPC already has a serving row';
  END IF;

  v_identity_hash := encode(
    digest(
      lower(concat_ws(
        '|',
        'Wellness Pet Company',
        'Wellness',
        'Wellness Complete Health Sliced Salmon Entrée Cuts in Rich Gravy',
        'cat',
        'adult',
        'wet',
        'Salmon Entrée',
        '',
        public.catalog_normalize_ingredient_evidence(v_source.ingredient_text)
      )),
      'sha256'
    ),
    'hex'
  );
  v_formula_key := 'target-retailer-version:' || v_identity_hash;

  v_run := jsonb_build_object(
    'run_key', 'target-wellness-sliced-salmon-v117:20260726',
    'source_slug', 'target-wellness-reviewed-v117',
    'source_type', 'retailer',
    'coverage_role', 'verification',
    'status', 'completed',
    'started_at', v_source.observed_at,
    'expected_count', 1,
    'pagination_complete', true,
    'truncated', false,
    'cap_reached', false,
    'source_content_hash', v_source.content_hash,
    'checkpoint', jsonb_build_object(
      'review_source_run_id', v_source.run_id,
      'target_tcin', '1003676359'
    ),
    'metadata', jsonb_build_object(
      'brand', 'Wellness',
      'formula_evidence_tier', 'retailer_web_version',
      'manufacturer_current_equivalence', false
    )
  );

  v_payload := jsonb_build_array(jsonb_build_object(
    'formula_key', v_formula_key,
    'identity_hash', v_identity_hash,
    'manufacturer', 'Wellness Pet Company',
    'brand', 'Wellness',
    'product_name',
      'Wellness Complete Health Sliced Salmon Entrée Cuts in Rich Gravy',
    'product_line', 'Wellness Complete Health Sliced',
    'pet_type', 'cat',
    'life_stage', 'adult',
    'food_form', 'wet',
    'flavor', 'Salmon Entrée',
    'diet_condition', '',
    'source_slug', 'target-wellness-reviewed-v117',
    'source_external_id', '1003676359',
    'source_url', v_source.source_url,
    'source_authority', 'retailer_verified',
    'gtin', v_source.gtin,
    'package_size', '3 oz',
    'ingredient_text', v_source.ingredient_text,
    'ingredients', to_jsonb(
      public.catalog_split_ingredient_statement(v_source.ingredient_text)
    ),
    'front_image_url', v_source.front_image_url,
    'is_complete_food', true,
    'available_in_us', true,
    'protected_terms', jsonb_build_array(
      'Wellness',
      'Complete Health',
      'Sliced',
      'Salmon Entrée',
      'cat',
      'adult',
      'wet'
    ),
    'observed_at', v_source.observed_at,
    'content_hash', encode(
      digest(
        v_source.source_url || '|' ||
        v_source.gtin || '|' ||
        v_source.front_image_url || '|' ||
        v_source_hash,
        'sha256'
      ),
      'hex'
    ),
    'validation_status', 'accepted',
    'validation_reasons', '[]'::JSONB,
    'ingredient_verification_status', 'retailer_verified',
    'image_verification_status', 'retailer_verified',
    'coverage_tier', 'tier_1_us_retail',
    'raw_payload', jsonb_build_object(
      'target_tcin', '1003676359',
      'target_upc', v_source.gtin,
      'exact_package_identity', true,
      'ingredients_verbatim_from_exact_pdp', true,
      'matching_front_package_image', true,
      'manufacturer_current_equivalence', false,
      'different_from_manufacturer_current_hash', v_current_hash,
      'formula_evidence_tier', 'retailer_web_version',
      'completeness_support_url',
        'https://www.wellnesspetfood.com/product-catalog/'
        || 'wellness-complete-health-sliced-sliced-salmon-entree/'
    )
  ));

  SELECT public.stage_catalog_census_batch(v_run, v_payload)
  INTO v_stage;

  SELECT id
  INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_formula_key;

  UPDATE public.catalog_formulas
  SET
    complete_food_evidence =
      'Exact Target package is Wellness Complete Health Sliced Salmon cat '
      || 'food with full fortification and guaranteed analysis; the official '
      || 'product family is explicitly complete and balanced.',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'source_type', 'exact_retailer_package_page',
        'source_url', v_source.source_url,
        'captured_at', v_source.observed_at,
        'package_gtin', v_source.gtin,
        'product_code', 'TCIN 1003676359',
        'front_image_url', v_source.front_image_url,
        'ingredient_text_hash', v_source_hash,
        'different_from_manufacturer_current_hash', v_current_hash,
        'completeness_support_url',
          'https://www.wellnesspetfood.com/product-catalog/'
          || 'wellness-complete-health-sliced-sliced-salmon-entree/',
        'exact_package_identity', true
      ),
    updated_at = now()
  WHERE id = v_formula_id;

  UPDATE public.catalog_observations observation
  SET
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance =
      COALESCE(observation.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'package_gtin', v_source.gtin,
        'product_code', 'TCIN 1003676359',
        'captured_at', v_source.observed_at,
        'ingredient_text_hash', v_source_hash,
        'different_from_manufacturer_current_hash', v_current_hash
      )
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key =
      'target-wellness-sliced-salmon-v117:20260726';

  PERFORM *
  FROM public.promote_catalog_formula(v_formula_id);

  SELECT promoted_cache_key
  INTO STRICT v_cache_key
  FROM public.catalog_formulas
  WHERE id = v_formula_id;

  UPDATE public.product_data
  SET
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'source_type', 'exact_retailer_package_page',
        'source_url', v_source.source_url,
        'captured_at', v_source.observed_at,
        'package_gtin', v_source.gtin,
        'product_code', 'TCIN 1003676359',
        'front_image_url', v_source.front_image_url,
        'ingredient_text_hash', v_source_hash,
        'different_from_manufacturer_current_hash', v_current_hash,
        'exact_package_identity', true
      ),
    updated_at = now()
  WHERE cache_key = v_cache_key;

  -- The 95% Turkey package front explicitly says "As a mixer or topper."
  UPDATE public.catalog_observations
  SET
    is_complete_food = false,
    validation_status = 'quarantined',
    validation_reasons = ARRAY[
      'non_complete_mixer_topper_confirmed_from_package_front'
    ]::TEXT[],
    formula_evidence_tier = 'unverified',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'classification', 'non_complete_confirmed',
        'classification_evidence',
          'Front package text: As a mixer or topper',
        'target_tcin', '1008430044',
        'package_gtin', '076344894537',
        'reviewed_at', '2026-07-26'
      )
  WHERE source_slug = 'target-wellness-review-v116'
    AND source_external_id = '1008430044';

  UPDATE public.catalog_formulas
  SET
    is_complete_food = false,
    verification_status = 'quarantined',
    active = false,
    absent_since = COALESCE(absent_since, now()),
    promoted_cache_key = NULL,
    promoted_at = NULL,
    complete_food_evidence =
      'Non-complete confirmed from exact package front: As a mixer or topper.',
    formula_evidence_tier = 'unverified',
    updated_at = now()
  WHERE id IN (
    SELECT formula_id
    FROM public.catalog_observations
    WHERE source_slug = 'target-wellness-review-v116'
      AND source_external_id = '1008430044'
      AND formula_id IS NOT NULL
  );

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key,
    alias_text,
    normalized_alias,
    source_url,
    source_authority,
    evidence_observed_at,
    provenance,
    active,
    created_at,
    updated_at
  )
  SELECT
    current.cache_key,
    'Wellness Complete Health Sliced Salmon Entree Wet Cat Food',
    public.normalize_verified_product_search_query(
      'Wellness Complete Health Sliced Salmon Entree Wet Cat Food'
    ),
    current.source_url,
    'manufacturer',
    current.verified_at,
    jsonb_build_object(
      'evidence_tier', 'manufacturer_current_exact',
      'generic_search_preference', true,
      'retailer_package_version_cache_key', v_cache_key
    ),
    true,
    now(),
    now()
  FROM public.product_data current
  WHERE current.cache_key = v_current_cache
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

  IF (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('076344036661', 8)
    WHERE cache_key = v_cache_key
      AND nutritional_info->>'formula_evidence_tier' =
        'retailer_web_version'
      AND nutritional_info->'formula_version_provenance'
        ->>'product_code' = 'TCIN 1003676359'
  ) <> 1 THEN
    RAISE EXCEPTION
      'Wellness Target Sliced Salmon UPC did not resolve exact source version';
  END IF;

  IF (
    SELECT cache_key
    FROM public.search_verified_products(
      'Wellness Complete Health Sliced Salmon Entree Wet Cat Food',
      1
    )
    LIMIT 1
  ) IS DISTINCT FROM v_current_cache THEN
    RAISE EXCEPTION
      'Generic Wellness Sliced Salmon search no longer prefers current';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin('076344894537', 8)
  ) THEN
    RAISE EXCEPTION
      'Non-complete Wellness 95%% Turkey unexpectedly resolves as food';
  END IF;
END;
$$;
