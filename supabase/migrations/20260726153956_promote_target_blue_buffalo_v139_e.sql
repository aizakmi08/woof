DO $$
DECLARE v JSONB;
BEGIN
  UPDATE public.catalog_observations o SET validation_reasons=ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs r WHERE o.run_id=r.id AND r.run_key='target-blue-buffalo-review-v139:b83e1e18bad1b75082664881'
    AND o.source_external_id IN ('52619694','52619696') AND o.validation_reasons=ARRAY['deferred_review_batch']::TEXT[];
  SELECT public.promote_reviewed_retailer_package_batch(
    'target-blue-buffalo-review-v139:b83e1e18bad1b75082664881',
    'target-blue-buffalo-reviewed-source-versions-v140e:20260726',
    'target-blue-buffalo-reviewed-v140e',2,2,
    'Exact Target Lamb Dinner and Turkey Meatloaf package pages match manufacturer-current ingredient versions and attach UPC SKU evidence.'
  ) INTO v;
  IF (v->>'manufacturer_current_equal_package_count')::INT<>2 OR (v->>'promoted_source_version_formula_count')::INT<>0
    THEN RAISE EXCEPTION 'Unexpected Blue v140e result: %',v; END IF;
END $$;
