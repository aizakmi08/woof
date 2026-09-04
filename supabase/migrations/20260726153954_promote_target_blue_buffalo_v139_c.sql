DO $$
DECLARE v JSONB;
BEGIN
  UPDATE public.catalog_observations o SET validation_reasons=ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs r WHERE o.run_id=r.id AND r.run_key='target-blue-buffalo-review-v139:b83e1e18bad1b75082664881'
    AND o.source_external_id IN ('52616121','76348607') AND o.validation_reasons=ARRAY['deferred_review_batch']::TEXT[];
  SELECT public.promote_reviewed_retailer_package_batch(
    'target-blue-buffalo-review-v139:b83e1e18bad1b75082664881',
    'target-blue-buffalo-reviewed-source-versions-v140c:20260726',
    'target-blue-buffalo-reviewed-v140c',2,2,
    'Reviewed large-breed puppy package fronts preserve Chicken & Oatmeal versus Chicken & Brown Rice as separate formula identities; reused UPC abstains.'
  ) INTO v;
  IF (v->>'source_version_safe_package_count')::INT<>1 OR (v->>'source_version_gtin_conflict_package_count')::INT<>1
    OR (v->>'promoted_source_version_formula_count')::INT<>2 THEN RAISE EXCEPTION 'Unexpected Blue v140c result: %',v; END IF;
END $$;
