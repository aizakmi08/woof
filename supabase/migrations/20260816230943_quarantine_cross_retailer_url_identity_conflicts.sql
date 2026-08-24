-- Four cross-retailer image joins passed the original overlap-only URL guard,
-- but the immutable Walmart URL disagrees with the scraped title on recipe,
-- life stage, or grain/form identity. Remove only those evidence versions and
-- their serving rows. A canonical formula remains active when another exact
-- promoted package still supports it.

DO $migration$
DECLARE
  v_import UUID := '615c043f-c3da-4784-842e-0c766af51ab3'::UUID;
  v_external_ids TEXT[] := ARRAY[
    '20483005895',
    '20478757299',
    '961563264',
    '497987828'
  ];
  v_formula_ids BIGINT[];
BEGIN
  SELECT array_agg(DISTINCT evidence.linked_formula_id)
  INTO v_formula_ids
  FROM public.catalog_retailer_ingredient_evidence evidence
  WHERE evidence.import_run_id = v_import
    AND evidence.source_slug = 'walmart'
    AND evidence.source_external_id = ANY(v_external_ids)
    AND evidence.linked_formula_id IS NOT NULL;

  DELETE FROM public.product_data serving
  USING public.catalog_retailer_ingredient_evidence evidence
  WHERE evidence.import_run_id = v_import
    AND evidence.source_slug = 'walmart'
    AND evidence.source_external_id = ANY(v_external_ids)
    AND serving.cache_key = evidence.promoted_cache_key;

  UPDATE public.catalog_observations observation
  SET
    validation_status = 'quarantined',
    validation_reasons = CASE
      WHEN 'retailer_url_identity_conflict' = ANY(observation.validation_reasons)
        THEN observation.validation_reasons
      ELSE array_append(
        observation.validation_reasons,
        'retailer_url_identity_conflict'
      )
    END
  FROM public.catalog_retailer_ingredient_evidence evidence
  WHERE evidence.import_run_id = v_import
    AND evidence.source_slug = 'walmart'
    AND evidence.source_external_id = ANY(v_external_ids)
    AND observation.id = evidence.linked_observation_id;

  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET
    evidence_status = 'quarantined_validation',
    promoted_cache_key = NULL,
    validation_reasons = CASE
      WHEN 'retailer_url_identity_conflict' = ANY(evidence.validation_reasons)
        THEN evidence.validation_reasons
      ELSE array_append(
        evidence.validation_reasons,
        'retailer_url_identity_conflict'
      )
    END,
    updated_at = now()
  WHERE evidence.import_run_id = v_import
    AND evidence.source_slug = 'walmart'
    AND evidence.source_external_id = ANY(v_external_ids);

  UPDATE public.catalog_formulas formula
  SET
    verification_status = 'quarantined',
    active = false,
    absent_since = COALESCE(formula.absent_since, now()),
    promoted_cache_key = NULL,
    promoted_at = NULL,
    updated_at = now()
  WHERE formula.id = ANY(COALESCE(v_formula_ids, ARRAY[]::BIGINT[]))
    AND NOT EXISTS (
      SELECT 1
      FROM public.catalog_retailer_ingredient_evidence evidence
      WHERE evidence.linked_formula_id = formula.id
        AND evidence.is_current
        AND evidence.evidence_status = 'promoted'
    );

  IF (
    SELECT count(*)
    FROM public.catalog_retailer_ingredient_evidence evidence
    WHERE evidence.import_run_id = v_import
      AND evidence.source_slug = 'walmart'
      AND evidence.source_external_id = ANY(v_external_ids)
      AND evidence.evidence_status <> 'quarantined_validation'
  ) <> 0 THEN
    RAISE EXCEPTION 'cross-retailer URL-conflict quarantine postcondition failed';
  END IF;
END;
$migration$;
