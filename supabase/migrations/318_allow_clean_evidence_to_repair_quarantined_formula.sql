-- A clean accepted observation may repair ingredient evidence only when the
-- current formula is already quarantined or fails the artifact gate. Verified,
-- clean evidence remains immutable through this path.

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
  v_flagged_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_flagged_count INTEGER := 0;
BEGIN
  v_result := public.stage_catalog_census_batch_without_ingredient_artifact_gate(
    p_run,
    p_observations
  );

  SELECT id
  INTO v_run_id
  FROM public.catalog_source_runs
  WHERE run_key = p_run->>'run_key';

  WITH incoming AS MATERIALIZED (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_observations, '[]'::JSONB)) AS row(
      formula_key TEXT,
      product_name TEXT,
      ingredient_text TEXT,
      ingredients JSONB,
      front_image_url TEXT,
      source_url TEXT,
      source_authority TEXT,
      ingredient_verification_status TEXT,
      image_verification_status TEXT,
      validation_status TEXT,
      observed_at TIMESTAMPTZ
    )
    WHERE validation_status = 'accepted'
      AND source_authority IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
      AND ingredient_verification_status IN (
        'gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified'
      )
      AND image_verification_status IN ('official', 'manufacturer', 'retailer_verified')
      AND NULLIF(btrim(ingredient_text), '') IS NOT NULL
      AND NULLIF(btrim(front_image_url), '') IS NOT NULL
      AND NOT public.catalog_has_unbalanced_parentheses(ingredient_text)
      AND NOT public.catalog_has_ingredient_ocr_artifacts(ingredient_text)
  )
  UPDATE public.catalog_formulas formula
  SET
    product_name = COALESCE(NULLIF(btrim(incoming.product_name), ''), formula.product_name),
    ingredient_text = incoming.ingredient_text,
    ingredients = COALESCE((
      SELECT array_agg(value ORDER BY ordinal)
      FROM jsonb_array_elements_text(COALESCE(incoming.ingredients, '[]'::JSONB))
        WITH ORDINALITY ingredient(value, ordinal)
    ), regexp_split_to_array(incoming.ingredient_text, '\s*,\s*')),
    front_image_url = incoming.front_image_url,
    source_url = incoming.source_url,
    source_authority = incoming.source_authority,
    ingredient_verification_status = incoming.ingredient_verification_status,
    image_verification_status = incoming.image_verification_status,
    verification_status = 'verified',
    last_observed_at = GREATEST(
      formula.last_observed_at,
      COALESCE(incoming.observed_at, NOW())
    ),
    updated_at = NOW()
  FROM incoming
  WHERE formula.formula_key = incoming.formula_key
    AND (
      formula.verification_status <> 'verified'
      OR public.catalog_has_unbalanced_parentheses(formula.ingredient_text)
      OR public.catalog_has_ingredient_ocr_artifacts(formula.ingredient_text)
    );

  WITH incoming_keys AS MATERIALIZED (
    SELECT DISTINCT item->>'formula_key' AS formula_key
    FROM jsonb_array_elements(COALESCE(p_observations, '[]'::JSONB)) item
    WHERE NULLIF(btrim(item->>'formula_key'), '') IS NOT NULL
  ),
  candidates AS MATERIALIZED (
    SELECT formula.id, formula.ingredient_text
    FROM incoming_keys incoming
    JOIN public.catalog_formulas formula
      ON formula.formula_key = incoming.formula_key
  )
  SELECT COALESCE(array_agg(candidate.id), ARRAY[]::BIGINT[])
  INTO v_flagged_ids
  FROM candidates candidate
  WHERE public.catalog_has_unbalanced_parentheses(candidate.ingredient_text)
     OR public.catalog_has_ingredient_ocr_artifacts(candidate.ingredient_text);

  v_flagged_count := COALESCE(cardinality(v_flagged_ids), 0);

  UPDATE public.catalog_formulas formula
  SET
    verification_status = 'quarantined',
    promoted_cache_key = NULL,
    promoted_at = NULL,
    updated_at = NOW()
  WHERE formula.id = ANY(v_flagged_ids);

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
  WHERE observation.run_id = v_run_id
    AND observation.formula_id = ANY(v_flagged_ids);

  UPDATE public.catalog_observations observation
  SET
    validation_status = 'accepted',
    validation_reasons = array_remove(
      observation.validation_reasons,
      'ingredient_artifact_gate_failed'
    )
  FROM public.catalog_formulas formula
  WHERE observation.run_id = v_run_id
    AND observation.formula_id = formula.id
    AND NOT (formula.id = ANY(v_flagged_ids))
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(p_observations, '[]'::JSONB)) item
      WHERE item->>'formula_key' = formula.formula_key
        AND item->>'content_hash' = observation.content_hash
        AND item->>'validation_status' = 'accepted'
    );

  UPDATE public.catalog_field_evidence evidence
  SET accepted = FALSE
  WHERE evidence.formula_id = ANY(v_flagged_ids)
    AND evidence.field_name = 'ingredient_text';

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
    v_flagged_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) TO service_role;
