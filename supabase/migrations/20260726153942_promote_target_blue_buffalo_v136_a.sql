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
    AND o.source_external_id IN ('75878590', '75878656')
    AND o.validation_reasons = ARRAY['deferred_review_batch']::TEXT[];

  SELECT public.promote_reviewed_retailer_package_batch(
    'target-blue-buffalo-review-v136:3365ad567626fe8c95572485',
    'target-blue-buffalo-reviewed-source-versions-v137a:20260726',
    'target-blue-buffalo-reviewed-v137a',
    2,
    1,
    'Exact Target PDP ingredients and UPCs reviewed 2026-07-26; 4 lb and 9.5 lb salmon bags grouped as SKU children despite the shared 4 lb front image.'
  ) INTO v;

  IF (v->>'source_version_safe_package_count')::INT <> 2
    OR (v->>'source_version_gtin_conflict_package_count')::INT <> 0
    OR (v->>'promoted_source_version_formula_count')::INT <> 1
  THEN
    RAISE EXCEPTION 'Unexpected Blue v137a result: %', v;
  END IF;
END
$$;
