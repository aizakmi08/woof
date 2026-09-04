DO $$
DECLARE v JSONB;
BEGIN
  UPDATE public.catalog_observations o SET validation_reasons=ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs r WHERE o.run_id=r.id AND r.run_key='target-blue-buffalo-review-v139:b83e1e18bad1b75082664881'
    AND o.source_external_id IN ('52619698','52619699') AND o.validation_reasons=ARRAY['deferred_review_batch']::TEXT[];
  SELECT public.promote_reviewed_retailer_package_batch(
    'target-blue-buffalo-review-v139:b83e1e18bad1b75082664881',
    'target-blue-buffalo-reviewed-source-versions-v140f:20260726',
    'target-blue-buffalo-reviewed-v140f',2,2,
    'Exact Homestyle Puppy Chicken Dinner and Senior Chicken & Vegetable Dinner package versions; both reused UPCs abstain.'
  ) INTO v;
  IF (v->>'source_version_gtin_conflict_package_count')::INT<>2 OR (v->>'promoted_source_version_formula_count')::INT<>2
    THEN RAISE EXCEPTION 'Unexpected Blue v140f result: %',v; END IF;
END $$;
