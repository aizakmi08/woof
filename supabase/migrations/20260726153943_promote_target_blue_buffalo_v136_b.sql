DO $$
DECLARE v JSONB;
BEGIN
  UPDATE public.catalog_observations o
  SET validation_reasons =
    ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs r
  WHERE o.run_id = r.id
    AND r.run_key =
      'target-blue-buffalo-review-v136:3365ad567626fe8c95572485'
    AND o.source_external_id IN ('75878589', '80850646')
    AND o.validation_reasons = ARRAY['deferred_review_batch']::TEXT[];

  SELECT public.promote_reviewed_retailer_package_batch(
    'target-blue-buffalo-review-v136:3365ad567626fe8c95572485',
    'target-blue-buffalo-reviewed-source-versions-v137b:20260726',
    'target-blue-buffalo-reviewed-v137b',
    2,
    2,
    'Exact Target PDP ingredients, UPC, and matching Blue Buffalo wet-cat front package images reviewed 2026-07-26.'
  ) INTO v;

  IF (v->>'source_version_safe_package_count')::INT <> 2
    OR (v->>'source_version_gtin_conflict_package_count')::INT <> 0
    OR (v->>'promoted_source_version_formula_count')::INT <> 2
  THEN
    RAISE EXCEPTION 'Unexpected Blue v137b result: %', v;
  END IF;
END
$$;
