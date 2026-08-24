-- Promote eleven exact reviewed Target packages across ten formula versions.
-- The malformed 5 lb Kitten ingredient statement remains quarantined.
DO $$
DECLARE
  v JSONB;
  v_run_key CONSTANT TEXT :=
    'target-blue-buffalo-review-v153:97077dc426ea90ce05469b6d';
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
    RAISE EXCEPTION 'Target Blue Buffalo v153 review set changed';
  END IF;

  UPDATE public.catalog_observations observation
  SET validation_reasons =
    ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key = v_run_key
    AND observation.source_external_id <> '76366322';

  SELECT public.promote_reviewed_retailer_package_batch(
    v_run_key,
    'target-blue-buffalo-reviewed-v154:20260726',
    'target-blue-buffalo-reviewed-v154',
    11,
    10,
    'Eleven exact Target packages reviewed against their matching front '
      || 'images. Distinct ingredient versions, package generations, '
      || 'species, life stage, food form, recipe, and breed-size boundaries '
      || 'are retained.'
  )
  INTO v;

  IF (v->>'manufacturer_current_equal_package_count')::INTEGER <> 1
    OR (v->>'source_version_safe_package_count')::INTEGER <> 8
    OR (v->>'source_version_gtin_conflict_package_count')::INTEGER <> 2
    OR (v->>'promoted_source_version_formula_count')::INTEGER <> 9
  THEN
    RAISE EXCEPTION 'Unexpected Blue Buffalo v154 result: %', v;
  END IF;

  UPDATE public.catalog_observations observation
  SET validation_reasons =
    ARRAY['ingredient_text_artifact_requires_exact_label_review']::TEXT[]
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key = v_run_key
    AND observation.source_external_id = '76366322'
    AND observation.validation_reasons =
      ARRAY['deferred_review_batch']::TEXT[];

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wilderness Kitten 5 lb quarantine record changed';
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
    RAISE EXCEPTION 'Unclassified Blue Buffalo v153 review records remain';
  END IF;
END
$$;
