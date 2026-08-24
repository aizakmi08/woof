-- Promote ten exact reviewed Target packages across nine formula identities.
-- Two packages with suspicious ingredient transcription tokens remain
-- quarantined, and a reused Healthy Weight UPC remains non-resolving.
DO $$
DECLARE
  v JSONB;
  v_run_key CONSTANT TEXT :=
    'target-blue-buffalo-review-v157:f5337a2d2943d8aec40d6203';
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
  ) <> 12 THEN
    RAISE EXCEPTION 'Target Blue Buffalo v157 review set changed';
  END IF;

  UPDATE public.catalog_observations observation
  SET validation_reasons =
    ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key = v_run_key
    AND observation.source_external_id NOT IN ('94897291', '76348368');

  SELECT public.promote_reviewed_retailer_package_batch(
    v_run_key,
    'target-blue-buffalo-reviewed-v158:20260727',
    'target-blue-buffalo-reviewed-v158',
    10,
    9,
    'Ten exact Target packages reviewed against matching front images. '
      || 'Package size is grouped only when exact identity and normalized '
      || 'ingredients agree; distinct breed, condition, form, life-stage, '
      || 'recipe, and ingredient-version boundaries remain separate.'
  )
  INTO v;

  IF (v->>'manufacturer_current_equal_package_count')::INTEGER <> 1
    OR (v->>'source_version_safe_package_count')::INTEGER <> 8
    OR (v->>'source_version_gtin_conflict_package_count')::INTEGER <> 1
    OR (v->>'promoted_source_version_formula_count')::INTEGER <> 8
  THEN
    RAISE EXCEPTION 'Unexpected Blue Buffalo v158 result: %', v;
  END IF;

  UPDATE public.catalog_observations observation
  SET validation_reasons =
    ARRAY['ingredient_text_artifact_requires_exact_label_review']::TEXT[]
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key = v_run_key
    AND observation.source_external_id IN ('94897291', '76348368')
    AND observation.validation_reasons =
      ARRAY['deferred_review_batch']::TEXT[];

  IF NOT FOUND OR (
    SELECT count(*)
    FROM public.catalog_observations observation
    JOIN public.catalog_source_runs source_run
      ON source_run.id = observation.run_id
    WHERE source_run.run_key = v_run_key
      AND observation.validation_reasons =
        ARRAY['ingredient_text_artifact_requires_exact_label_review']::TEXT[]
  ) <> 2 THEN
    RAISE EXCEPTION
      'Target Blue Buffalo v157 ingredient-artifact quarantine changed';
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
    RAISE EXCEPTION 'Unclassified Blue Buffalo v157 review records remain';
  END IF;
END
$$;
