DO $$
DECLARE v JSONB;
BEGIN
  UPDATE public.catalog_observations o SET validation_reasons=ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs r WHERE o.run_id=r.id AND r.run_key='target-blue-buffalo-review-v139:b83e1e18bad1b75082664881'
    AND o.source_external_id='52619690' AND o.validation_reasons=ARRAY['deferred_review_batch']::TEXT[];
  SELECT public.promote_reviewed_retailer_package_batch(
    'target-blue-buffalo-review-v139:b83e1e18bad1b75082664881',
    'target-blue-buffalo-reviewed-source-versions-v140d1:20260726',
    'target-blue-buffalo-reviewed-v140d1',1,1,
    'Exact Homestyle Beef Dinner with Garden Vegetables package identity and full Target PDP ingredients; reused UPC abstains.'
  ) INTO v;
  IF (v->>'source_version_gtin_conflict_package_count')::INT<>1 OR (v->>'promoted_source_version_formula_count')::INT<>1
    THEN RAISE EXCEPTION 'Unexpected Blue v140d1 result: %',v; END IF;
END $$;
