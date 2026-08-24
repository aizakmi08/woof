DO $$
DECLARE v JSONB;
BEGIN
  UPDATE public.catalog_observations o SET validation_reasons=ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs r WHERE o.run_id=r.id AND r.run_key='target-blue-buffalo-review-v133:995aeb9f088e0d3bb7efda92'
    AND o.source_external_id='94897301' AND o.validation_reasons=ARRAY['deferred_review_batch']::TEXT[];
  SELECT public.promote_reviewed_retailer_package_batch('target-blue-buffalo-review-v133:995aeb9f088e0d3bb7efda92','target-blue-buffalo-reviewed-source-versions-v134e:20260726','target-blue-buffalo-reviewed-v134e',1,1,'Exact Target PDP ingredients, UPC, and size-specific Blue Buffalo image reviewed 2026-07-26.') INTO v;
  IF (v->>'source_version_safe_package_count')::INT<>1 OR (v->>'promoted_source_version_formula_count')::INT<>1 THEN RAISE EXCEPTION 'Unexpected Blue v134e result: %',v; END IF;
END $$;
