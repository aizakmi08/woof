-- Promote only exact, complete manufacturer evidence from the private gap
-- extraction ledger. Retailer/marketplace versions intentionally use the
-- separate reviewed source-version lane.

CREATE OR REPLACE FUNCTION public.promote_ready_manufacturer_gap_evidence(
  p_extraction_run_key TEXT,
  p_accepted_run_key TEXT,
  p_expected_ready_count INTEGER,
  p_expected_new_formula_count INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_extraction_run public.catalog_gap_evidence_extraction_runs%ROWTYPE;
  v_observations JSONB;
  v_stage JSONB;
  v_new_formula_count INTEGER;
  v_promoted_count INTEGER := 0;
  v_formula RECORD;
BEGIN
  IF NULLIF(btrim(p_extraction_run_key), '') IS NULL
    OR NULLIF(btrim(p_accepted_run_key), '') IS NULL
    OR p_expected_ready_count < 1
    OR p_expected_new_formula_count < 1
  THEN
    RAISE EXCEPTION 'Invalid manufacturer gap promotion arguments';
  END IF;

  SELECT *
  INTO STRICT v_extraction_run
  FROM public.catalog_gap_evidence_extraction_runs
  WHERE run_key = p_extraction_run_key
  FOR UPDATE;

  IF v_extraction_run.status <> 'completed'
    OR v_extraction_run.completed_jobs <> v_extraction_run.total_jobs
    OR v_extraction_run.ready_for_promotion_count <> p_expected_ready_count
  THEN
    RAISE EXCEPTION
      'Extraction run is incomplete or ready count changed: %',
      p_extraction_run_key;
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_gap_evidence_extractions evidence
    WHERE evidence.run_id = v_extraction_run.id
      AND evidence.extraction_status = 'ready_for_promotion'
      AND evidence.source_authority = 'manufacturer'
      AND evidence.formula_evidence_tier_candidate =
        'manufacturer_current_exact'
      AND evidence.identity_match_status IN ('exact_gtin', 'exact_identity')
      AND evidence.ingredient_hash =
        encode(digest(btrim(evidence.ingredient_text), 'sha256'), 'hex')
      AND NULLIF(btrim(evidence.front_image_url), '') IS NOT NULL
      AND evidence.evidence->>'source_quality' = 'manufacturer'
      AND evidence.evidence->>'ingredient_verification_status' =
        'manufacturer'
      AND evidence.evidence->>'image_verification_status' = 'manufacturer'
      AND COALESCE(
        (evidence.evidence->>'is_complete_food')::BOOLEAN,
        FALSE
      )
  ) <> p_expected_ready_count THEN
    RAISE EXCEPTION
      'Ready manufacturer evidence changed or no longer passes strict gates';
  END IF;

  WITH ready AS (
    SELECT evidence.*
    FROM public.catalog_gap_evidence_extractions evidence
    WHERE evidence.run_id = v_extraction_run.id
      AND evidence.extraction_status = 'ready_for_promotion'
      AND evidence.source_authority = 'manufacturer'
      AND evidence.formula_evidence_tier_candidate =
        'manufacturer_current_exact'
      AND evidence.identity_match_status IN ('exact_gtin', 'exact_identity')
  ),
  new_evidence AS (
    SELECT ready.*
    FROM ready
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.catalog_formulas formula
      WHERE formula.formula_key = ready.formula_key
        OR formula.source_url = ready.canonical_source_url
    )
      AND NOT EXISTS (
        SELECT 1
        FROM public.product_data serving
        WHERE serving.source_url = ready.canonical_source_url
          OR (
            ready.package_identifier_type = 'gtin'
            AND lpad(
              regexp_replace(COALESCE(serving.gtin, ''), '\D', '', 'g'),
              14,
              '0'
            ) = ready.package_identifier
          )
      )
  )
  SELECT count(*)::INTEGER
  INTO v_new_formula_count
  FROM new_evidence;

  IF v_new_formula_count <> p_expected_new_formula_count THEN
    RAISE EXCEPTION
      'New manufacturer formula count changed: expected %, found %',
      p_expected_new_formula_count,
      v_new_formula_count;
  END IF;

  WITH ready AS (
    SELECT evidence.*
    FROM public.catalog_gap_evidence_extractions evidence
    WHERE evidence.run_id = v_extraction_run.id
      AND evidence.extraction_status = 'ready_for_promotion'
      AND evidence.source_authority = 'manufacturer'
      AND evidence.formula_evidence_tier_candidate =
        'manufacturer_current_exact'
      AND evidence.identity_match_status IN ('exact_gtin', 'exact_identity')
  ),
  new_evidence AS (
    SELECT ready.*
    FROM ready
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.catalog_formulas formula
      WHERE formula.formula_key = ready.formula_key
        OR formula.source_url = ready.canonical_source_url
    )
      AND NOT EXISTS (
        SELECT 1
        FROM public.product_data serving
        WHERE serving.source_url = ready.canonical_source_url
          OR (
            ready.package_identifier_type = 'gtin'
            AND lpad(
              regexp_replace(COALESCE(serving.gtin, ''), '\D', '', 'g'),
              14,
              '0'
            ) = ready.package_identifier
          )
      )
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'formula_key', evidence.formula_key,
      'identity_hash',
        encode(digest(evidence.formula_key, 'sha256'), 'hex'),
      'manufacturer',
        COALESCE(
          NULLIF(btrim(evidence.expected_identity->>'manufacturer'), ''),
          evidence.extracted_identity->>'brand'
        ),
      'brand', evidence.extracted_identity->>'brand',
      'product_name', evidence.extracted_identity->>'product_name',
      'product_line',
        COALESCE(
          NULLIF(btrim(evidence.extracted_identity->>'product_line'), ''),
          evidence.extracted_identity->>'product_name'
        ),
      'pet_type', evidence.extracted_identity->>'pet_type',
      'life_stage',
        COALESCE(
          NULLIF(btrim(evidence.extracted_identity->>'life_stage'), ''),
          NULLIF(btrim(evidence.expected_identity->>'life_stage'), ''),
          'unknown'
        ),
      'food_form',
        COALESCE(
          NULLIF(btrim(evidence.extracted_identity->>'food_form'), ''),
          NULLIF(btrim(evidence.expected_identity->>'food_form'), ''),
          'unknown'
        ),
      'flavor',
        COALESCE(evidence.extracted_identity->>'flavor', ''),
      'diet_condition',
        COALESCE(
          evidence.extracted_identity->>'diet_condition',
          evidence.expected_identity->>'diet_condition',
          ''
        ),
      'source_slug', 'gap-official-evidence-20260728',
      'source_external_id', evidence.id::TEXT,
      'source_url', evidence.canonical_source_url,
      'source_authority', 'manufacturer',
      'gtin',
        COALESCE(evidence.extracted_identity->>'gtin', ''),
      'package_size',
        COALESCE(evidence.extracted_identity->>'package_size', ''),
      'ingredient_text', evidence.ingredient_text,
      'ingredients',
        to_jsonb(
          public.catalog_split_ingredient_statement(
            evidence.ingredient_text
          )
        ),
      'front_image_url', evidence.front_image_url,
      'is_complete_food', TRUE,
      'available_in_us', TRUE,
      'protected_terms',
        jsonb_build_array(
          evidence.extracted_identity->>'brand',
          evidence.extracted_identity->>'product_name',
          evidence.extracted_identity->>'product_line',
          evidence.extracted_identity->>'flavor',
          evidence.extracted_identity->>'pet_type',
          evidence.extracted_identity->>'life_stage',
          evidence.extracted_identity->>'food_form'
        ),
      'observed_at', evidence.observed_at,
      'content_hash', evidence.source_content_hash,
      'validation_status', 'accepted',
      'validation_reasons', '[]'::JSONB,
      'ingredient_verification_status', 'manufacturer',
      'image_verification_status', 'manufacturer',
      'coverage_tier', 'tier_1_us_retail',
      'raw_payload',
        jsonb_build_object(
          'gap_evidence_extraction_id', evidence.id,
          'ingredient_hash', evidence.ingredient_hash,
          'identity_match_status', evidence.identity_match_status,
          'identity_score', evidence.identity_score,
          'formula_evidence_tier', 'manufacturer_current_exact',
          'source_version_policy',
            'exact manufacturer formula; package sizes remain SKU children'
        )
    )
    ORDER BY evidence.formula_key
  )
  INTO v_observations
  FROM new_evidence evidence;

  v_stage := public.stage_catalog_census_batch(
    jsonb_build_object(
      'run_key', p_accepted_run_key,
      'source_slug', 'gap-official-evidence-20260728',
      'source_type', 'manufacturer',
      'coverage_role', 'verification',
      'status', 'completed',
      'started_at', v_extraction_run.started_at,
      'expected_count', p_expected_new_formula_count,
      'pagination_complete', TRUE,
      'truncated', FALSE,
      'cap_reached', FALSE,
      'source_content_hash',
        encode(digest(v_observations::TEXT, 'sha256'), 'hex'),
      'checkpoint',
        jsonb_build_object(
          'source_extraction_run_key', p_extraction_run_key,
          'exact_formula_count', p_expected_new_formula_count
        ),
      'metadata',
        jsonb_build_object(
          'formula_evidence_tier', 'manufacturer_current_exact',
          'promotion_policy',
            'exact identity and complete manufacturer evidence only'
        )
    ),
    v_observations
  );

  UPDATE public.catalog_formulas formula
  SET
    formula_evidence_tier = 'manufacturer_current_exact',
    formula_version_provenance =
      COALESCE(formula.formula_version_provenance, '{}'::JSONB)
      || jsonb_build_object(
        'evidence_tier', 'manufacturer_current_exact',
        'source_run_key', p_accepted_run_key,
        'source_version_observed_at', evidence.observed_at,
        'source_version_url', evidence.canonical_source_url,
        'source_version_ingredient_hash', evidence.ingredient_hash,
        'gap_evidence_extraction_id', evidence.id
      ),
    updated_at = NOW()
  FROM public.catalog_gap_evidence_extractions evidence
  WHERE evidence.run_id = v_extraction_run.id
    AND evidence.formula_key = formula.formula_key
    AND evidence.extraction_status = 'ready_for_promotion'
    AND EXISTS (
      SELECT 1
      FROM public.catalog_observations observation
      JOIN public.catalog_source_runs source_run
        ON source_run.id = observation.run_id
      WHERE observation.formula_id = formula.id
        AND source_run.run_key = p_accepted_run_key
        AND observation.validation_status = 'accepted'
    );

  FOR v_formula IN
    SELECT formula.id, evidence.id AS extraction_id
    FROM public.catalog_formulas formula
    JOIN public.catalog_gap_evidence_extractions evidence
      ON evidence.formula_key = formula.formula_key
    JOIN public.catalog_observations observation
      ON observation.formula_id = formula.id
    JOIN public.catalog_source_runs source_run
      ON source_run.id = observation.run_id
    WHERE evidence.run_id = v_extraction_run.id
      AND evidence.extraction_status = 'ready_for_promotion'
      AND source_run.run_key = p_accepted_run_key
      AND observation.validation_status = 'accepted'
    ORDER BY formula.id
  LOOP
    PERFORM *
    FROM public.promote_catalog_formula(v_formula.id);

    UPDATE public.catalog_gap_evidence_extractions
    SET
      promoted_formula_id = v_formula.id,
      promoted_at = NOW(),
      updated_at = NOW()
    WHERE id = v_formula.extraction_id;

    v_promoted_count := v_promoted_count + 1;
  END LOOP;

  IF v_promoted_count <> p_expected_new_formula_count THEN
    RAISE EXCEPTION
      'Manufacturer formula promotion count mismatch: expected %, promoted %',
      p_expected_new_formula_count,
      v_promoted_count;
  END IF;

  RETURN jsonb_build_object(
    'extraction_run_key', p_extraction_run_key,
    'accepted_run_key', p_accepted_run_key,
    'ready_evidence_count', p_expected_ready_count,
    'new_formula_count', v_new_formula_count,
    'promoted_formula_count', v_promoted_count,
    'stage_result', v_stage
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.promote_ready_manufacturer_gap_evidence(TEXT, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.promote_ready_manufacturer_gap_evidence(TEXT, TEXT, INTEGER, INTEGER)
  TO service_role;
