-- Partition the visually reviewed Target batch into bounded promotion units.
DO $$
DECLARE v_run_id BIGINT;
BEGIN
  SELECT id INTO STRICT v_run_id
  FROM public.catalog_source_runs
  WHERE run_key =
    'target-purina-one-review-v130:fe4464088c835d99286b7376';

  IF (
    SELECT count(*)
    FROM public.catalog_observations
    WHERE run_id = v_run_id
      AND validation_reasons =
        ARRAY['manual_exact_version_review_required']::TEXT[]
  ) <> 19 THEN
    RAISE EXCEPTION 'Purina ONE v130 review set changed';
  END IF;

  UPDATE public.catalog_observations
  SET
    validation_reasons = ARRAY['package_size_image_mismatch']::TEXT[],
    raw_payload = COALESCE(raw_payload, '{}'::JSONB) ||
      jsonb_build_object(
        'image_identity_status', 'formula_match_size_badge_mismatch',
        'exact_package_identity_from_pdp_upc', true,
        'matching_formula_front_image', true,
        'matching_package_size_front_image', false,
        'review_note',
          'Exact PDP has UPC/full ingredients, but its formula-correct image '
          || 'shows another package size; not an exact-package image.'
      )
  WHERE run_id = v_run_id
    AND source_external_id IN (
      '83904106', '14327639', '23951885', '11215770', '11215764'
    );

  UPDATE public.catalog_observations
  SET validation_reasons =
    ARRAY['deferred_review_batch']::TEXT[]
  WHERE run_id = v_run_id
    AND validation_reasons =
      ARRAY['manual_exact_version_review_required']::TEXT[];
END
$$;
