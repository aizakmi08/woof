DO $$
DECLARE v JSONB;
BEGIN
  UPDATE public.catalog_observations o SET validation_reasons=ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs r WHERE o.run_id=r.id AND r.run_key='target-blue-buffalo-review-v139:b83e1e18bad1b75082664881'
    AND o.source_external_id IN ('75878626','76366320') AND o.validation_reasons=ARRAY['deferred_review_batch']::TEXT[];
  SELECT public.promote_reviewed_retailer_package_batch(
    'target-blue-buffalo-review-v139:b83e1e18bad1b75082664881',
    'target-blue-buffalo-reviewed-source-versions-v140a:20260726',
    'target-blue-buffalo-reviewed-v140a',2,1,
    'Exact Target PDP ingredients and reviewed Blue Wilderness Indoor Hairball & Weight Control Chicken package images; two sizes grouped, one reused UPC abstains.'
  ) INTO v;
  IF (v->>'source_version_safe_package_count')::INT<>1 OR (v->>'source_version_gtin_conflict_package_count')::INT<>1
    OR (v->>'promoted_source_version_formula_count')::INT<>1 THEN RAISE EXCEPTION 'Unexpected Blue v140a result: %',v; END IF;
END $$;
