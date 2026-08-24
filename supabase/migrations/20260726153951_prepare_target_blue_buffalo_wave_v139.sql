-- Partition the visually reviewed seventeen-formula Blue Buffalo v139 batch
-- into bounded promotion units. Twelve incomplete/conflicting listings were
-- rejected before staging.
DO $$
DECLARE v_run_id BIGINT;
BEGIN
  SELECT id INTO STRICT v_run_id
  FROM public.catalog_source_runs
  WHERE run_key =
    'target-blue-buffalo-review-v139:b83e1e18bad1b75082664881';

  IF (
    SELECT count(*)
    FROM public.catalog_observations
    WHERE run_id = v_run_id
      AND validation_reasons =
        ARRAY['manual_exact_version_review_required']::TEXT[]
  ) <> 18 THEN
    RAISE EXCEPTION 'Target Blue Buffalo v139 review set changed';
  END IF;

  UPDATE public.catalog_observations
  SET validation_reasons = ARRAY['deferred_review_batch']::TEXT[]
  WHERE run_id = v_run_id
    AND validation_reasons =
      ARRAY['manual_exact_version_review_required']::TEXT[];
END
$$;
