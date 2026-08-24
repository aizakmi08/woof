-- Promote the first reviewed Target Purina ONE package wave as exact
-- retailer-web versions. The exact Target PDP supplies a matching front image,
-- a full ingredient statement, TCIN, package UPC, and capture timestamp.
--
-- A UPC that is already present on a different ingredient version is retained
-- as provenance but deliberately has no active catalog_skus owner. Barcode
-- lookup must abstain because a reused UPC cannot identify the formula version.

DO $$
DECLARE
  v_review_run_id BIGINT;
  v_reviewed_at TIMESTAMPTZ;
  v_conflict_gtins TEXT[];
  v_safe_gtins TEXT[];
  v_run JSONB;
  v_payload JSONB;
  v_stage JSONB;
  v_formula RECORD;
BEGIN
  SELECT id, started_at
  INTO STRICT v_review_run_id, v_reviewed_at
  FROM public.catalog_source_runs
  WHERE run_key =
    'target-purina-one-review-v119:b19cb135b211196563f26425';

  IF (
    SELECT count(*)
    FROM public.catalog_observations observation
    WHERE observation.run_id = v_review_run_id
      AND observation.source_slug = 'target-purina-one-review-v119'
      AND observation.validation_status = 'quarantined'
      AND observation.validation_reasons =
        ARRAY['manual_exact_version_review_required']::TEXT[]
      AND observation.source_authority = 'retailer_verified'
      AND observation.is_complete_food
      AND length(observation.ingredient_text) >= 500
      AND btrim(observation.front_image_url) <> ''
      AND btrim(observation.gtin) <> ''
      AND NOT public.catalog_has_unbalanced_parentheses(
        observation.ingredient_text
      )
      AND NOT public.catalog_has_ingredient_ocr_artifacts(
        observation.ingredient_text
      )
  ) <> 12 THEN
    RAISE EXCEPTION
      'Target Purina ONE review evidence changed or is incomplete';
  END IF;

  IF (
    SELECT count(DISTINCT
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
      ))
    )
    FROM public.catalog_observations observation
    WHERE observation.run_id = v_review_run_id
  ) <> 8 THEN
    RAISE EXCEPTION
      'Target Purina ONE review no longer contains eight exact formulas';
  END IF;

  SELECT
    COALESCE(
      array_agg(DISTINCT observation.gtin)
        FILTER (WHERE existing.cache_key IS NOT NULL),
      ARRAY[]::TEXT[]
    ),
    COALESCE(
      array_agg(DISTINCT observation.gtin)
        FILTER (WHERE existing.cache_key IS NULL),
      ARRAY[]::TEXT[]
    )
  INTO v_conflict_gtins, v_safe_gtins
  FROM public.catalog_observations observation
  LEFT JOIN LATERAL (
    SELECT serving.cache_key
    FROM public.product_data serving
    WHERE regexp_replace(COALESCE(serving.gtin, ''), '\D', '', 'g') =
        observation.gtin
      AND NULLIF(btrim(serving.ingredient_text), '') IS NOT NULL
      AND public.catalog_normalize_ingredient_evidence(
        serving.ingredient_text
      ) <> public.catalog_normalize_ingredient_evidence(
        observation.ingredient_text
      )
    LIMIT 1
  ) existing ON true
  WHERE observation.run_id = v_review_run_id;

  IF cardinality(v_conflict_gtins) <> 7
    OR cardinality(v_safe_gtins) <> 5
  THEN
    RAISE EXCEPTION
      'Target Purina ONE UPC conflict partition changed';
  END IF;

  v_run := jsonb_build_object(
    'run_key', 'target-purina-one-reviewed-source-versions-v120:20260726',
    'source_slug', 'target-purina-one-reviewed-v120',
    'source_type', 'retailer',
    'coverage_role', 'verification',
    'status', 'completed',
    'started_at', v_reviewed_at,
    'expected_count', 12,
    'pagination_complete', true,
    'truncated', false,
    'cap_reached', false,
    'source_content_hash', encode(
      digest(
        array_to_string(v_safe_gtins, '|') || '|' ||
        array_to_string(v_conflict_gtins, '|'),
        'sha256'
      ),
      'hex'
    ),
    'checkpoint', jsonb_build_object(
      'review_source_run_id', v_review_run_id,
      'review_policy',
        'exact Target PDP, full ingredients, matching front image, TCIN, UPC'
    ),
    'metadata', jsonb_build_object(
      'brand', 'Purina ONE',
      'formula_evidence_tier', 'retailer_web_version',
      'manufacturer_current_equivalence', false,
      'exact_formula_count', 8,
      'package_count', 12,
      'safe_barcode_count', cardinality(v_safe_gtins),
      'reused_barcode_conflict_count', cardinality(v_conflict_gtins)
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
      'source_slug', 'target-purina-one-reviewed-v120',
      'source_external_id', observation.source_external_id,
      'source_url', observation.source_url,
      'source_authority', 'retailer_verified',
      -- Reused UPCs remain in raw provenance but have no deterministic SKU
      -- owner because the barcode cannot distinguish ingredient versions.
      'gtin', CASE
        WHEN observation.gtin = ANY(v_conflict_gtins) THEN NULL
        ELSE observation.gtin
      END,
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
        observation.product_name,
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
          'review_source_run_id', v_review_run_id,
          'target_tcin', observation.source_external_id,
          'target_upc', observation.gtin,
          'exact_package_identity', true,
          'ingredients_verbatim_from_exact_pdp', true,
          'matching_front_package_image', true,
          'manufacturer_current_equivalence', false,
          'formula_evidence_tier', 'retailer_web_version',
          'barcode_resolution_policy', CASE
            WHEN observation.gtin = ANY(v_conflict_gtins)
              THEN 'abstain_reused_gtin_formula_conflict'
            ELSE 'exact_source_version'
          END
        )
    )
    ORDER BY observation.source_external_id
  )
  INTO v_payload
  FROM public.catalog_observations observation
  WHERE observation.run_id = v_review_run_id;

  SELECT public.stage_catalog_census_batch(v_run, v_payload)
  INTO v_stage;

  UPDATE public.catalog_formulas formula
  SET
    complete_food_evidence =
      'Exact Target PDP classifies this as dog or cat food and supplies a '
      || 'full fortified ingredient statement, guaranteed analysis, matching '
      || 'front-package image, TCIN, and package UPC.',
    formula_evidence_tier = 'retailer_web_version',
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
        ),
        'exact_package_identity', true,
        'review_source_run_id', v_review_run_id
      ),
    updated_at = now()
  WHERE formula.id IN (
    SELECT DISTINCT observation.formula_id
    FROM public.catalog_observations observation
    JOIN public.catalog_source_runs source_run
      ON source_run.id = observation.run_id
    WHERE source_run.run_key =
      'target-purina-one-reviewed-source-versions-v120:20260726'
  );

  UPDATE public.catalog_observations observation
  SET
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance =
      COALESCE(observation.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'package_gtin', observation.raw_payload->>'target_upc',
        'product_code', 'TCIN ' || observation.source_external_id,
        'captured_at', observation.observed_at,
        'front_image_url', observation.front_image_url,
        'ingredient_text_hash', encode(
          digest(
            public.catalog_normalize_ingredient_evidence(
              observation.ingredient_text
            ),
            'sha256'
          ),
          'hex'
        ),
        'exact_package_identity', true,
        'barcode_resolution_policy',
          observation.raw_payload->>'barcode_resolution_policy'
      )
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key =
      'target-purina-one-reviewed-source-versions-v120:20260726';

  FOR v_formula IN
    SELECT DISTINCT formula.id
    FROM public.catalog_formulas formula
    JOIN public.catalog_observations observation
      ON observation.formula_id = formula.id
    JOIN public.catalog_source_runs source_run
      ON source_run.id = observation.run_id
    WHERE source_run.run_key =
      'target-purina-one-reviewed-source-versions-v120:20260726'
    ORDER BY formula.id
  LOOP
    PERFORM *
    FROM public.promote_catalog_formula(v_formula.id);
  END LOOP;

  -- A UPC reused across ingredient versions must not resolve to either version.
  UPDATE public.catalog_skus
  SET
    active = false,
    last_observed_at = v_reviewed_at,
    updated_at = now()
  WHERE gtin = ANY(v_conflict_gtins)
    AND active;

  UPDATE public.product_data serving
  SET
    formula_version_provenance =
      COALESCE(serving.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'source_type', 'exact_retailer_package_page',
        'source_url', formula.source_url,
        'captured_at', formula.last_observed_at,
        'front_image_url', formula.front_image_url,
        'ingredient_text_hash', encode(
          digest(
            public.catalog_normalize_ingredient_evidence(
              formula.ingredient_text
            ),
            'sha256'
          ),
          'hex'
        ),
        'package_versions', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'product_code', 'TCIN ' || observation.source_external_id,
              'package_gtin', observation.raw_payload->>'target_upc',
              'package_size', observation.package_size,
              'source_url', observation.source_url,
              'barcode_resolution_policy',
                observation.raw_payload->>'barcode_resolution_policy'
            )
            ORDER BY observation.source_external_id
          )
          FROM public.catalog_observations observation
          JOIN public.catalog_source_runs source_run
            ON source_run.id = observation.run_id
          WHERE source_run.run_key =
              'target-purina-one-reviewed-source-versions-v120:20260726'
            AND observation.formula_id = formula.id
        ),
        'exact_package_identity', true
      ),
    updated_at = now()
  FROM public.catalog_formulas formula
  WHERE serving.cache_key = formula.promoted_cache_key
    AND formula.id IN (
      SELECT DISTINCT observation.formula_id
      FROM public.catalog_observations observation
      JOIN public.catalog_source_runs source_run
        ON source_run.id = observation.run_id
      WHERE source_run.run_key =
        'target-purina-one-reviewed-source-versions-v120:20260726'
    );

  UPDATE public.catalog_observations
  SET
    validation_reasons =
      ARRAY['superseded_by_accepted_review_run']::TEXT[],
    raw_payload = COALESCE(raw_payload, '{}'::JSONB) ||
      jsonb_build_object(
        'accepted_run_key',
          'target-purina-one-reviewed-source-versions-v120:20260726'
      )
  WHERE run_id = v_review_run_id;

  IF (
    SELECT count(*)
    FROM public.catalog_formulas formula
    WHERE formula.id IN (
      SELECT DISTINCT observation.formula_id
      FROM public.catalog_observations observation
      JOIN public.catalog_source_runs source_run
        ON source_run.id = observation.run_id
      WHERE source_run.run_key =
        'target-purina-one-reviewed-source-versions-v120:20260726'
    )
      AND formula.verification_status = 'verified'
      AND formula.active
      AND formula.formula_evidence_tier = 'retailer_web_version'
      AND formula.promoted_cache_key IS NOT NULL
  ) <> 8 THEN
    RAISE EXCEPTION
      'Not all Target Purina ONE source-version formulas were promoted';
  END IF;

  IF EXISTS (
    SELECT conflict.gtin
    FROM unnest(v_conflict_gtins) conflict(gtin)
    WHERE EXISTS (
      SELECT 1
      FROM public.resolve_verified_product_by_gtin(conflict.gtin, 8)
    )
  ) THEN
    RAISE EXCEPTION
      'A reused Target Purina ONE UPC resolved despite version conflict';
  END IF;

  IF EXISTS (
    SELECT safe.gtin
    FROM unnest(v_safe_gtins) safe(gtin)
    WHERE (
      SELECT count(*)
      FROM public.resolve_verified_product_by_gtin(safe.gtin, 8)
      WHERE nutritional_info->>'formula_evidence_tier' =
        'retailer_web_version'
    ) <> 1
  ) THEN
    RAISE EXCEPTION
      'A safe Target Purina ONE UPC did not resolve its exact source version';
  END IF;
END
$$;
