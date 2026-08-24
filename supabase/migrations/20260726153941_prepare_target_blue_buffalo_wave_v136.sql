-- Partition the visually reviewed seven-formula Blue Buffalo v136 batch into
-- bounded promotion units. The four rejected Target listings were never staged.
DO $$
DECLARE v_run_id BIGINT;
BEGIN
  SELECT id INTO STRICT v_run_id
  FROM public.catalog_source_runs
  WHERE run_key =
    'target-blue-buffalo-review-v136:3365ad567626fe8c95572485';

  IF (
    SELECT count(*)
    FROM public.catalog_observations
    WHERE run_id = v_run_id
      AND validation_reasons =
        ARRAY['manual_exact_version_review_required']::TEXT[]
  ) <> 8 THEN
    RAISE EXCEPTION 'Target Blue Buffalo v136 review set changed';
  END IF;

  UPDATE public.catalog_observations
  SET validation_reasons = ARRAY['deferred_review_batch']::TEXT[]
  WHERE run_id = v_run_id
    AND validation_reasons =
      ARRAY['manual_exact_version_review_required']::TEXT[];
END
$$;
