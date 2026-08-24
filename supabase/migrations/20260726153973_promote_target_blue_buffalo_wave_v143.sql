-- Promote the visually reviewed v143 Target package wave in bounded formula
-- units. This preserves two distinct Puppy ingredient versions and abstains
-- on one reused Salmon UPC.
DO $$
DECLARE
  v JSONB;
  v_run_key CONSTANT TEXT :=
    'target-blue-buffalo-review-v143:20b4602fc185e8e7bc2ca66e';
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
  ) <> 15 THEN
    RAISE EXCEPTION 'Target Blue Buffalo v143 review set changed';
  END IF;

  UPDATE public.catalog_observations observation
  SET validation_reasons =
    ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key = v_run_key
    AND observation.source_external_id IN ('52616091', '75575887');

  SELECT public.promote_reviewed_retailer_package_batch(
    v_run_key,
    'target-blue-buffalo-reviewed-v144a:20260726',
    'target-blue-buffalo-reviewed-v144a',
    2,
    1,
    'Exact Life Protection Small Breed Adult Chicken & Brown Rice '
      || '5 lb and 15 lb packages; ingredients match an existing '
      || 'verified formula and sizes are SKU children.'
  )
  INTO v;
  IF (v->>'manufacturer_current_equal_package_count')::INTEGER <> 2
    OR (v->>'promoted_source_version_formula_count')::INTEGER <> 0
  THEN
    RAISE EXCEPTION 'Unexpected Blue v144a result: %', v;
  END IF;

  UPDATE public.catalog_observations observation
  SET validation_reasons =
    ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key = v_run_key
    AND observation.source_external_id = '52616092';

  SELECT public.promote_reviewed_retailer_package_batch(
    v_run_key,
    'target-blue-buffalo-reviewed-v144b:20260726',
    'target-blue-buffalo-reviewed-v144b',
    1,
    1,
    'Exact 5 lb Life Protection Puppy Chicken & Brown Rice package '
      || 'and full Target PDP ingredient statement.'
  )
  INTO v;
  IF (v->>'source_version_safe_package_count')::INTEGER <> 1
    OR (v->>'promoted_source_version_formula_count')::INTEGER <> 1
  THEN
    RAISE EXCEPTION 'Unexpected Blue v144b result: %', v;
  END IF;

  UPDATE public.catalog_observations observation
  SET validation_reasons =
    ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key = v_run_key
    AND observation.source_external_id = '52616123';

  SELECT public.promote_reviewed_retailer_package_batch(
    v_run_key,
    'target-blue-buffalo-reviewed-v144c:20260726',
    'target-blue-buffalo-reviewed-v144c',
    1,
    1,
    'Exact 15 lb Life Protection Puppy Chicken & Brown Rice package; '
      || 'its full ingredient statement differs from the 5 lb package '
      || 'and remains a separate source version.'
  )
  INTO v;
  IF (v->>'source_version_safe_package_count')::INTEGER <> 1
    OR (v->>'promoted_source_version_formula_count')::INTEGER <> 1
  THEN
    RAISE EXCEPTION 'Unexpected Blue v144c result: %', v;
  END IF;

  UPDATE public.catalog_observations observation
  SET validation_reasons =
    ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key = v_run_key
    AND observation.source_external_id = '81126572';

  SELECT public.promote_reviewed_retailer_package_batch(
    v_run_key,
    'target-blue-buffalo-reviewed-v144d:20260726',
    'target-blue-buffalo-reviewed-v144d',
    1,
    1,
    'Exact six-count single-formula Tastefuls Chicken Entrée Pâté '
      || 'for Kittens package and full Target PDP ingredients.'
  )
  INTO v;
  IF (v->>'source_version_safe_package_count')::INTEGER <> 1
    OR (v->>'promoted_source_version_formula_count')::INTEGER <> 1
  THEN
    RAISE EXCEPTION 'Unexpected Blue v144d result: %', v;
  END IF;

  UPDATE public.catalog_observations observation
  SET validation_reasons =
    ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key = v_run_key
    AND observation.source_external_id = '80607186';

  SELECT public.promote_reviewed_retailer_package_batch(
    v_run_key,
    'target-blue-buffalo-reviewed-v144e:20260726',
    'target-blue-buffalo-reviewed-v144e',
    1,
    1,
    'Exact True Solutions Total Support Chicken Recipe can; package '
      || 'front corrects a stale Best Life retailer title.'
  )
  INTO v;
  IF (v->>'source_version_safe_package_count')::INTEGER <> 1
    OR (v->>'promoted_source_version_formula_count')::INTEGER <> 1
  THEN
    RAISE EXCEPTION 'Unexpected Blue v144e result: %', v;
  END IF;

  UPDATE public.catalog_observations observation
  SET validation_reasons =
    ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key = v_run_key
    AND observation.source_external_id IN ('75878574', '75878581');

  SELECT public.promote_reviewed_retailer_package_batch(
    v_run_key,
    'target-blue-buffalo-reviewed-v144f:20260726',
    'target-blue-buffalo-reviewed-v144f',
    2,
    1,
    'Exact Wilderness Adult with Chicken dry cat food size family; '
      || 'identical ingredient version grouped under one formula.'
  )
  INTO v;
  IF (v->>'source_version_safe_package_count')::INTEGER <> 2
    OR (v->>'promoted_source_version_formula_count')::INTEGER <> 1
  THEN
    RAISE EXCEPTION 'Unexpected Blue v144f result: %', v;
  END IF;

  UPDATE public.catalog_observations observation
  SET validation_reasons =
    ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key = v_run_key
    AND observation.source_external_id IN (
      '87393249', '87393273', '87393286'
    );

  SELECT public.promote_reviewed_retailer_package_batch(
    v_run_key,
    'target-blue-buffalo-reviewed-v144g:20260726',
    'target-blue-buffalo-reviewed-v144g',
    3,
    1,
    'Exact Wilderness Adult with Chicken dry dog food 4.5 lb, '
      || '24 lb, and 28 lb package family; stale grain wording repaired.'
  )
  INTO v;
  IF (v->>'manufacturer_current_equal_package_count')::INTEGER <> 3
    OR (v->>'promoted_source_version_formula_count')::INTEGER <> 0
  THEN
    RAISE EXCEPTION 'Unexpected Blue v144g result: %', v;
  END IF;

  UPDATE public.catalog_observations observation
  SET validation_reasons =
    ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key = v_run_key
    AND observation.source_external_id = '87393266';

  SELECT public.promote_reviewed_retailer_package_batch(
    v_run_key,
    'target-blue-buffalo-reviewed-v144h:20260726',
    'target-blue-buffalo-reviewed-v144h',
    1,
    1,
    'Exact Wilderness Adult with Duck dry dog food package; identity '
      || 'repaired without changing its existing ingredient version.'
  )
  INTO v;
  IF (v->>'manufacturer_current_equal_package_count')::INTEGER <> 1
    OR (v->>'promoted_source_version_formula_count')::INTEGER <> 0
  THEN
    RAISE EXCEPTION 'Unexpected Blue v144h result: %', v;
  END IF;

  UPDATE public.catalog_observations observation
  SET validation_reasons =
    ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key = v_run_key
    AND observation.source_external_id IN (
      '87393247', '87393256', '87393276'
    );

  SELECT public.promote_reviewed_retailer_package_batch(
    v_run_key,
    'target-blue-buffalo-reviewed-v144i:20260726',
    'target-blue-buffalo-reviewed-v144i',
    3,
    1,
    'Exact Wilderness Adult with Salmon dry dog food size family; '
      || 'two safe UPCs resolve and one reused UPC abstains.'
  )
  INTO v;
  IF (v->>'source_version_safe_package_count')::INTEGER <> 2
    OR (v->>'source_version_gtin_conflict_package_count')::INTEGER <> 1
    OR (v->>'promoted_source_version_formula_count')::INTEGER <> 1
  THEN
    RAISE EXCEPTION 'Unexpected Blue v144i result: %', v;
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
    RAISE EXCEPTION
      'Target Blue Buffalo v143 left reviewed packages deferred';
  END IF;
END
$$;
