-- Promote six exact Target Blue Buffalo package versions whose full readable
-- ingredient statements and matching front-package images are captured in the
-- completed review-only run. These are source-versioned formulas: they do not
-- claim manufacturer-current equivalence and never overwrite another version.

DO $$
DECLARE
  v_run JSONB;
  v_observations JSONB;
  v_result JSONB;
  v_formula RECORD;
  v_tcins CONSTANT TEXT[] := ARRAY[
    '52619385',
    '52619694',
    '52619696',
    '76400794',
    '87393270',
    '94939946'
  ];
BEGIN
  IF (
    SELECT count(*)
    FROM public.catalog_observations observation
    WHERE observation.run_id = 1217
      AND observation.source_slug = 'target-blue-buffalo-review-v113'
      AND observation.source_external_id = ANY(v_tcins)
      AND observation.validation_status = 'quarantined'
      AND observation.validation_reasons =
        ARRAY['manual_exact_version_review_required']::TEXT[]
      AND observation.is_complete_food
      AND observation.source_authority = 'retailer_verified'
      AND length(observation.ingredient_text) >= 500
      AND btrim(observation.front_image_url) <> ''
      AND NOT public.catalog_has_unbalanced_parentheses(
        observation.ingredient_text
      )
      AND NOT public.catalog_has_ingredient_ocr_artifacts(
        observation.ingredient_text
      )
  ) <> cardinality(v_tcins) THEN
    RAISE EXCEPTION
      'Target Blue package review evidence changed or is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_data serving
    WHERE regexp_replace(COALESCE(serving.gtin, ''), '[^0-9]', '', 'g')
      IN (
        '840243120437',
        '840243104949',
        '840243104963',
        '840243105564',
        '840243148486',
        '840243159949'
      )
  ) THEN
    RAISE EXCEPTION
      'A reviewed Target Blue UPC already has a serving row';
  END IF;

  v_run := jsonb_build_object(
    'run_key',
      'target-blue-buffalo-reviewed-source-versions-v114:20260726',
    'source_slug', 'target-blue-buffalo-reviewed-v114',
    'source_type', 'retailer',
    'coverage_role', 'verification',
    'status', 'completed',
    'started_at', '2026-07-26T23:44:10.733Z',
    'expected_count', cardinality(v_tcins),
    'pagination_complete', true,
    'truncated', false,
    'cap_reached', false,
    'source_content_hash', encode(
      digest(array_to_string(v_tcins, '|'), 'sha256'),
      'hex'
    ),
    'checkpoint', jsonb_build_object(
      'review_source_run_id', 1217,
      'review_policy',
        'exact Target package identity, full ingredients, and matching image'
    ),
    'metadata', jsonb_build_object(
      'brand', 'Blue Buffalo',
      'formula_evidence_tier', 'retailer_web_version',
      'manufacturer_current_equivalence', false
    )
  );

  SELECT jsonb_agg(
    jsonb_build_object(
      'formula_key',
        'target-retailer-version:' ||
        encode(
          digest(
            lower(concat_ws(
              '|',
              observation.manufacturer,
              observation.brand,
              observation.product_line,
              observation.pet_type,
              observation.life_stage,
              observation.food_form,
              observation.flavor,
              observation.diet_condition,
              public.catalog_normalize_ingredient_evidence(
                observation.ingredient_text
              )
            )),
            'sha256'
          ),
          'hex'
        ),
      'identity_hash',
        encode(
          digest(
            lower(concat_ws(
              '|',
              observation.manufacturer,
              observation.brand,
              observation.product_line,
              observation.pet_type,
              observation.life_stage,
              observation.food_form,
              observation.flavor,
              observation.diet_condition,
              public.catalog_normalize_ingredient_evidence(
                observation.ingredient_text
              )
            )),
            'sha256'
          ),
          'hex'
        ),
      'manufacturer', observation.manufacturer,
      'brand', observation.brand,
      'product_name', observation.product_name,
      'product_line', observation.product_line,
      'pet_type', observation.pet_type,
      'life_stage', observation.life_stage,
      'food_form', observation.food_form,
      'flavor', observation.flavor,
      'diet_condition', observation.diet_condition,
      'source_slug', 'target-blue-buffalo-reviewed-v114',
      'source_external_id', observation.source_external_id,
      'source_url', observation.source_url,
      'source_authority', 'retailer_verified',
      'gtin', observation.gtin,
      'package_size', observation.package_size,
      'ingredient_text', observation.ingredient_text,
      'ingredients', to_jsonb(
        public.catalog_split_ingredient_statement(
          observation.ingredient_text
        )
      ),
      'front_image_url', observation.front_image_url,
      'is_complete_food', true,
      'available_in_us', true,
      'protected_terms', to_jsonb(ARRAY[
        observation.brand,
        observation.product_line,
        observation.flavor,
        observation.pet_type,
        observation.life_stage,
        observation.food_form
      ]),
      'observed_at', observation.observed_at,
      'content_hash', encode(
        digest(
          observation.source_url || '|' ||
          observation.gtin || '|' ||
          observation.front_image_url || '|' ||
          public.catalog_normalize_ingredient_evidence(
            observation.ingredient_text
          ),
          'sha256'
        ),
        'hex'
      ),
      'validation_status', 'accepted',
      'validation_reasons', '[]'::JSONB,
      'ingredient_verification_status', 'retailer_verified',
      'image_verification_status', 'retailer_verified',
      'coverage_tier', 'tier_1_us_retail',
      'raw_payload', COALESCE(observation.raw_payload, '{}'::JSONB) ||
        jsonb_build_object(
          'review_source_run_id', 1217,
          'target_tcin', observation.source_external_id,
          'target_upc', observation.gtin,
          'exact_package_identity', true,
          'ingredients_verbatim_from_exact_pdp', true,
          'matching_front_package_image', true,
          'manufacturer_current_equivalence', false,
          'formula_evidence_tier', 'retailer_web_version'
        )
    )
    ORDER BY observation.source_external_id
  )
  INTO v_observations
  FROM public.catalog_observations observation
  WHERE observation.run_id = 1217
    AND observation.source_slug = 'target-blue-buffalo-review-v113'
    AND observation.source_external_id = ANY(v_tcins);

  SELECT public.stage_catalog_census_batch(v_run, v_observations)
  INTO v_result;

  UPDATE public.catalog_formulas formula
  SET
    complete_food_evidence =
      'Exact Target PDP identifies this as dog food and provides a full '
      || 'fortified ingredient statement plus matching front-package image.',
    formula_version_provenance =
      COALESCE(formula.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'source_type', 'exact_retailer_package_page',
        'captured_at', formula.last_observed_at,
        'ingredient_text_hash', encode(
          digest(
            public.catalog_normalize_ingredient_evidence(
              formula.ingredient_text
            ),
            'sha256'
          ),
          'hex'
        )
      ),
    updated_at = now()
  WHERE formula.formula_key LIKE 'target-retailer-version:%'
    AND formula.source_url IN (
      SELECT observation.source_url
      FROM public.catalog_observations observation
      JOIN public.catalog_source_runs source_run
        ON source_run.id = observation.run_id
      WHERE source_run.run_key =
        'target-blue-buffalo-reviewed-source-versions-v114:20260726'
    );

  UPDATE public.catalog_observations observation
  SET
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance =
      COALESCE(observation.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'package_gtin', observation.gtin,
        'product_code', 'TCIN ' || observation.source_external_id,
        'captured_at', observation.observed_at,
        'ingredient_text_hash', encode(
          digest(
            public.catalog_normalize_ingredient_evidence(
              observation.ingredient_text
            ),
            'sha256'
          ),
          'hex'
        )
      )
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key =
      'target-blue-buffalo-reviewed-source-versions-v114:20260726';

  FOR v_formula IN
    SELECT formula.id
    FROM public.catalog_formulas formula
    WHERE formula.formula_key LIKE 'target-retailer-version:%'
      AND formula.source_url IN (
        SELECT observation.source_url
        FROM public.catalog_observations observation
        JOIN public.catalog_source_runs source_run
          ON source_run.id = observation.run_id
        WHERE source_run.run_key =
          'target-blue-buffalo-reviewed-source-versions-v114:20260726'
      )
    ORDER BY formula.id
  LOOP
    PERFORM *
    FROM public.promote_catalog_formula(v_formula.id);
  END LOOP;

  UPDATE public.catalog_observations
  SET
    validation_reasons =
      ARRAY['superseded_by_accepted_review_run']::TEXT[],
    raw_payload = COALESCE(raw_payload, '{}'::JSONB) ||
      jsonb_build_object(
        'accepted_run_key',
          'target-blue-buffalo-reviewed-source-versions-v114:20260726'
      )
  WHERE run_id = 1217
    AND source_slug = 'target-blue-buffalo-review-v113'
    AND source_external_id = ANY(v_tcins);

  IF (
    SELECT count(*)
    FROM public.catalog_formulas formula
    WHERE formula.formula_key LIKE 'target-retailer-version:%'
      AND formula.source_url IN (
        SELECT observation.source_url
        FROM public.catalog_observations observation
        JOIN public.catalog_source_runs source_run
          ON source_run.id = observation.run_id
        WHERE source_run.run_key =
          'target-blue-buffalo-reviewed-source-versions-v114:20260726'
      )
      AND formula.verification_status = 'verified'
      AND formula.active
      AND formula.formula_evidence_tier = 'retailer_web_version'
      AND formula.promoted_cache_key IS NOT NULL
  ) <> cardinality(v_tcins) THEN
    RAISE EXCEPTION
      'Not all Target Blue source-version formulas were promoted';
  END IF;

  IF EXISTS (
    SELECT reviewed.gtin
    FROM (
      SELECT observation.gtin
      FROM public.catalog_observations observation
      JOIN public.catalog_source_runs source_run
        ON source_run.id = observation.run_id
      WHERE source_run.run_key =
        'target-blue-buffalo-reviewed-source-versions-v114:20260726'
    ) reviewed
    WHERE (
      SELECT count(*)
      FROM public.resolve_verified_product_by_gtin(reviewed.gtin, 8)
      WHERE nutritional_info->>'formula_evidence_tier' =
        'retailer_web_version'
    ) <> 1
  ) THEN
    RAISE EXCEPTION
      'A Target Blue source-version UPC is not uniquely resolvable';
  END IF;
END;
$$;
