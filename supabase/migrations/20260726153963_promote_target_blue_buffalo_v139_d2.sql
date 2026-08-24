DO $$
DECLARE v JSONB;
BEGIN
  UPDATE public.catalog_observations o SET validation_reasons=ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs r WHERE o.run_id=r.id AND r.run_key='target-blue-buffalo-review-v139:b83e1e18bad1b75082664881'
    AND o.source_external_id='52619693' AND o.validation_reasons=ARRAY['deferred_review_batch']::TEXT[];
  SELECT public.promote_reviewed_retailer_package_batch(
    'target-blue-buffalo-review-v139:b83e1e18bad1b75082664881',
    'target-blue-buffalo-reviewed-source-versions-v140d2:20260726',
    'target-blue-buffalo-reviewed-v140d2',1,1,
    'Exact Homestyle Chicken Dinner with Garden Vegetables package and ingredients match the existing manufacturer formula through its SKU-child UPC.'
  ) INTO v;
  IF (v->>'manufacturer_current_equal_package_count')::INT<>1 OR (v->>'promoted_source_version_formula_count')::INT<>0
    THEN RAISE EXCEPTION 'Unexpected Blue v140d2 result: %',v; END IF;
END $$;
