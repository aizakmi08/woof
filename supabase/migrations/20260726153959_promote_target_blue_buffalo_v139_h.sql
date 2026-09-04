DO $$
DECLARE v JSONB;
BEGIN
  UPDATE public.catalog_observations o SET validation_reasons=ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs r WHERE o.run_id=r.id AND r.run_key='target-blue-buffalo-review-v139:b83e1e18bad1b75082664881'
    AND o.source_external_id IN ('80607202','87393295') AND o.validation_reasons=ARRAY['deferred_review_batch']::TEXT[];
  SELECT public.promote_reviewed_retailer_package_batch(
    'target-blue-buffalo-review-v139:b83e1e18bad1b75082664881',
    'target-blue-buffalo-reviewed-source-versions-v140h:20260726',
    'target-blue-buffalo-reviewed-v140h',2,2,
    'Reviewed True Solutions Chicken & Oatmeal and Life Protection Adult Chicken & Brown Rice packages with full exact PDP ingredients.'
  ) INTO v;
  IF (v->>'source_version_safe_package_count')::INT<>2 OR (v->>'promoted_source_version_formula_count')::INT<>2
    THEN RAISE EXCEPTION 'Unexpected Blue v140h result: %',v; END IF;
END $$;
