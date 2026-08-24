-- Promote seven exact reviewed Target package versions from v147. One
-- malformed ingredient statement and one life-stage conflict remain
-- quarantined with actionable reasons.
DO $$
DECLARE
  v JSONB;
  v_run_key CONSTANT TEXT :=
    'target-blue-buffalo-review-v147:94c4fde4f3b9553aa68871f6';
BEGIN
  UPDATE public.catalog_observations observation
  SET validation_reasons = ARRAY['deferred_review_batch']::TEXT[]
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key = v_run_key
    AND observation.validation_reasons =
      ARRAY['manual_exact_version_review_required']::TEXT[];

  IF NOT FOUND OR (
    SELECT count(*)
    FROM public.catalog_observations observation
    JOIN public.catalog_source_runs source_run
      ON source_run.id = observation.run_id
    WHERE source_run.run_key = v_run_key
      AND observation.validation_reasons =
        ARRAY['deferred_review_batch']::TEXT[]
  ) <> 9 THEN
    RAISE EXCEPTION 'Target Blue Buffalo v147 review set changed';
  END IF;

  UPDATE public.catalog_observations observation
  SET validation_reasons =
    ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key = v_run_key
    AND observation.source_external_id IN (
      '94897292',
      '75878577',
      '75878614',
      '52615632',
      '76400733',
      '94636187',
      '94636190'
    );

  SELECT public.promote_reviewed_retailer_package_batch(
    v_run_key,
    'target-blue-buffalo-reviewed-v148:20260726',
    'target-blue-buffalo-reviewed-v148',
    7,
    7,
    'Seven exact Target package pages reviewed against their matching '
      || 'front images. Distinct Small Breed, adult, species, life-stage, '
      || 'food-form, recipe, and ingredient-version boundaries are retained.'
  )
  INTO v;

  IF (v->>'manufacturer_current_equal_package_count')::INTEGER <> 1
    OR (v->>'source_version_safe_package_count')::INTEGER <> 5
    OR (v->>'source_version_gtin_conflict_package_count')::INTEGER <> 1
    OR (v->>'promoted_source_version_formula_count')::INTEGER <> 6
  THEN
    RAISE EXCEPTION 'Unexpected Blue Buffalo v148 result: %', v;
  END IF;

  UPDATE public.catalog_observations observation
  SET validation_reasons =
    ARRAY['ingredient_text_artifact_requires_exact_label_review']::TEXT[]
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key = v_run_key
    AND observation.source_external_id = '52615647'
    AND observation.validation_reasons =
      ARRAY['deferred_review_batch']::TEXT[];

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tastefuls 10 lb quarantine record changed';
  END IF;

  UPDATE public.catalog_observations observation
  SET validation_reasons =
    ARRAY['conflicting_life_stage_evidence_requires_label_review']::TEXT[]
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key = v_run_key
    AND observation.source_external_id = '76400774'
    AND observation.validation_reasons =
      ARRAY['deferred_review_batch']::TEXT[];

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snake River life-stage quarantine record changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_observations observation
    JOIN public.catalog_source_runs source_run
      ON source_run.id = observation.run_id
    WHERE source_run.run_key = v_run_key
      AND observation.validation_reasons =
        ARRAY['deferred_review_batch']::TEXT[]
  ) THEN
    RAISE EXCEPTION 'Unclassified Blue Buffalo v147 review records remain';
  END IF;
END
$$;
