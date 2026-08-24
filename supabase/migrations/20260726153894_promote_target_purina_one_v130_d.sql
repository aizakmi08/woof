DO $$
DECLARE v JSONB;
BEGIN
  UPDATE public.catalog_observations o SET validation_reasons=ARRAY['manual_exact_version_review_required']::TEXT[]
  FROM public.catalog_source_runs r WHERE o.run_id=r.id AND r.run_key='target-purina-one-review-v130:fe4464088c835d99286b7376'
    AND o.source_external_id='94919900' AND o.validation_reasons=ARRAY['deferred_review_batch']::TEXT[];
  SELECT public.promote_reviewed_retailer_package_batch('target-purina-one-review-v130:fe4464088c835d99286b7376','target-purina-one-reviewed-source-versions-v131d:20260726','target-purina-one-reviewed-v131d',1,1,'Exact Target PDP ingredients, UPC, and size-specific front image reviewed 2026-07-26.') INTO v;
  IF (v->>'source_version_safe_package_count')::INT<>1 OR (v->>'source_version_gtin_conflict_package_count')::INT<>0 OR (v->>'promoted_source_version_formula_count')::INT<>1 THEN RAISE EXCEPTION 'Unexpected v131d result: %',v; END IF;
END $$;
