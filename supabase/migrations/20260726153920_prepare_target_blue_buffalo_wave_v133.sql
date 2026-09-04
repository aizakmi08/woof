-- Retire the pre-dedup review run and partition the corrected eight-formula
-- Blue Buffalo batch into bounded promotion units.
UPDATE public.catalog_observations observation
SET validation_reasons =
  ARRAY['superseded_by_canonical_size_variant_review']::TEXT[]
FROM public.catalog_source_runs source_run
WHERE observation.run_id = source_run.id
  AND source_run.run_key =
    'target-blue-buffalo-review-v133:a816f86478874ce5ecc9ea93'
  AND observation.validation_reasons =
    ARRAY['manual_exact_version_review_required']::TEXT[];

DO $$
DECLARE v_run_id BIGINT;
BEGIN
  SELECT id INTO STRICT v_run_id
  FROM public.catalog_source_runs
  WHERE run_key =
    'target-blue-buffalo-review-v133:995aeb9f088e0d3bb7efda92';

  IF (
    SELECT count(*)
    FROM public.catalog_observations
    WHERE run_id = v_run_id
      AND validation_reasons =
        ARRAY['manual_exact_version_review_required']::TEXT[]
  ) <> 9 THEN
    RAISE EXCEPTION 'Target Blue Buffalo v133 review set changed';
  END IF;

  UPDATE public.catalog_observations
  SET validation_reasons = ARRAY['deferred_review_batch']::TEXT[]
  WHERE run_id = v_run_id
    AND validation_reasons =
      ARRAY['manual_exact_version_review_required']::TEXT[];
END
$$;
