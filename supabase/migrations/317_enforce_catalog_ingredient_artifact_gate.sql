-- Apply the same ingredient-artifact rules to census staging and promotion
-- that already protect product_data. A staged record cannot become verified
-- merely because its source status is trusted when the evidence itself fails.

ALTER FUNCTION public.stage_catalog_census_batch(JSONB, JSONB)
  RENAME TO stage_catalog_census_batch_without_ingredient_artifact_gate;

CREATE OR REPLACE FUNCTION public.stage_catalog_census_batch(
  p_run JSONB,
  p_observations JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_run_id BIGINT;
  v_flagged_count INTEGER;
BEGIN
  v_result := public.stage_catalog_census_batch_without_ingredient_artifact_gate(
    p_run,
    p_observations
  );

  SELECT id
  INTO v_run_id
  FROM public.catalog_source_runs
  WHERE run_key = p_run->>'run_key';

  WITH incoming_keys AS (
    SELECT DISTINCT item->>'formula_key' AS formula_key
    FROM jsonb_array_elements(COALESCE(p_observations, '[]'::JSONB)) item
    WHERE NULLIF(btrim(item->>'formula_key'), '') IS NOT NULL
  ),
  flagged AS (
    SELECT formula.id
    FROM incoming_keys incoming
    JOIN public.catalog_formulas formula
      ON formula.formula_key = incoming.formula_key
    WHERE public.catalog_has_unbalanced_parentheses(formula.ingredient_text)
       OR public.catalog_has_ingredient_ocr_artifacts(formula.ingredient_text)
  ),
  demoted AS (
    UPDATE public.catalog_formulas formula
    SET
      verification_status = 'quarantined',
      promoted_cache_key = NULL,
      promoted_at = NULL,
      updated_at = NOW()
    FROM flagged
    WHERE formula.id = flagged.id
    RETURNING formula.id
  )
  SELECT count(*)::INTEGER INTO v_flagged_count FROM demoted;

  UPDATE public.catalog_observations observation
  SET
    validation_status = 'quarantined',
    validation_reasons = ARRAY(
      SELECT DISTINCT reason
      FROM unnest(
        observation.validation_reasons
        || ARRAY['ingredient_artifact_gate_failed']::TEXT[]
      ) reason
    )
  FROM public.catalog_formulas formula
  WHERE observation.run_id = v_run_id
    AND observation.formula_id = formula.id
    AND (
      public.catalog_has_unbalanced_parentheses(formula.ingredient_text)
      OR public.catalog_has_ingredient_ocr_artifacts(formula.ingredient_text)
    );

  UPDATE public.catalog_field_evidence evidence
  SET accepted = FALSE
  FROM public.catalog_formulas formula
  WHERE evidence.formula_id = formula.id
    AND evidence.field_name = 'ingredient_text'
    AND (
      public.catalog_has_unbalanced_parentheses(formula.ingredient_text)
      OR public.catalog_has_ingredient_ocr_artifacts(formula.ingredient_text)
    );

  UPDATE public.catalog_source_runs source_run
  SET
    accepted_count = (
      SELECT count(*)::INTEGER
      FROM public.catalog_observations observation
      WHERE observation.run_id = source_run.id
        AND observation.validation_status = 'accepted'
    ),
    rejected_count = (
      SELECT count(*)::INTEGER
      FROM public.catalog_observations observation
      WHERE observation.run_id = source_run.id
        AND observation.validation_status <> 'accepted'
    ),
    updated_at = NOW()
  WHERE source_run.id = v_run_id;

  RETURN v_result || jsonb_build_object(
    'ingredient_artifact_quarantines',
    COALESCE(v_flagged_count, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stage_catalog_census_batch_without_ingredient_artifact_gate(
  JSONB,
  JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stage_catalog_census_batch_without_ingredient_artifact_gate(
  JSONB,
  JSONB
) FROM anon;
REVOKE ALL ON FUNCTION public.stage_catalog_census_batch_without_ingredient_artifact_gate(
  JSONB,
  JSONB
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.stage_catalog_census_batch_without_ingredient_artifact_gate(
  JSONB,
  JSONB
) TO service_role;

REVOKE ALL ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.promote_catalog_formula(p_formula_id BIGINT)
RETURNS TABLE (
  cache_key TEXT,
  product_name TEXT,
  brand TEXT,
  source_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_observations observation
    JOIN public.catalog_source_runs source_run
      ON source_run.id = observation.run_id
    WHERE observation.formula_id = p_formula_id
      AND observation.validation_status = 'accepted'
      AND source_run.status = 'completed'
      AND source_run.pagination_complete
  ) THEN
    RAISE EXCEPTION
      'Catalog formula % lacks an accepted observation from a completed source run',
      p_formula_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    WHERE formula.id = p_formula_id
      AND (
        public.catalog_has_unbalanced_parentheses(formula.ingredient_text)
        OR public.catalog_has_ingredient_ocr_artifacts(formula.ingredient_text)
      )
  ) THEN
    RAISE EXCEPTION
      'Catalog formula % fails the ingredient artifact gate',
      p_formula_id;
  END IF;

  RETURN QUERY
  SELECT promoted.cache_key, promoted.product_name, promoted.brand, promoted.source_url
  FROM public.promote_catalog_formula_without_completed_run_gate(p_formula_id) promoted;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    JOIN public.product_data serving
      ON serving.cache_key = formula.promoted_cache_key
    WHERE formula.id = p_formula_id
      AND serving.is_complete_food
      AND COALESCE(serving.catalog_exclusion_reason, '') = ''
      AND serving.source_quality IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
      AND serving.ingredient_verification_status IN (
        'gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified'
      )
      AND serving.image_verification_status IN (
        'official', 'manufacturer', 'retailer_verified'
      )
      AND serving.ingredient_count >= 5
      AND btrim(serving.ingredient_text) <> ''
      AND btrim(serving.image_url) <> ''
      AND lower(COALESCE(serving.pet_type, '')) = lower(formula.pet_type)
      AND lower(COALESCE(serving.product_line, '')) = lower(formula.product_line)
      AND lower(COALESCE(serving.life_stage, 'unknown')) = lower(formula.life_stage)
      AND lower(COALESCE(serving.food_form, 'unknown')) = lower(formula.food_form)
      AND lower(COALESCE(serving.flavor, '')) = lower(formula.flavor)
  ) THEN
    RAISE EXCEPTION
      'Catalog formula % did not produce an exact verified serving row',
      p_formula_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_catalog_formula(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.promote_catalog_formula(BIGINT) FROM anon;
REVOKE ALL ON FUNCTION public.promote_catalog_formula(BIGINT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.promote_catalog_formula(BIGINT) TO service_role;

WITH flagged AS (
  SELECT id
  FROM public.catalog_formulas
  WHERE public.catalog_has_unbalanced_parentheses(ingredient_text)
     OR public.catalog_has_ingredient_ocr_artifacts(ingredient_text)
)
UPDATE public.catalog_formulas formula
SET
  verification_status = 'quarantined',
  promoted_cache_key = NULL,
  promoted_at = NULL,
  updated_at = NOW()
FROM flagged
WHERE formula.id = flagged.id;

WITH flagged AS (
  SELECT id
  FROM public.catalog_formulas
  WHERE public.catalog_has_unbalanced_parentheses(ingredient_text)
     OR public.catalog_has_ingredient_ocr_artifacts(ingredient_text)
)
UPDATE public.catalog_observations observation
SET
  validation_status = 'quarantined',
  validation_reasons = ARRAY(
    SELECT DISTINCT reason
    FROM unnest(
      observation.validation_reasons
      || ARRAY['ingredient_artifact_gate_failed']::TEXT[]
    ) reason
  )
FROM flagged
WHERE observation.formula_id = flagged.id
  AND observation.validation_status = 'accepted';

WITH flagged AS (
  SELECT id
  FROM public.catalog_formulas
  WHERE public.catalog_has_unbalanced_parentheses(ingredient_text)
     OR public.catalog_has_ingredient_ocr_artifacts(ingredient_text)
)
UPDATE public.catalog_field_evidence evidence
SET accepted = FALSE
FROM flagged
WHERE evidence.formula_id = flagged.id
  AND evidence.field_name = 'ingredient_text';
