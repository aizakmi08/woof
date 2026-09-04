-- Promote nine exact Target package versions. Seven GTINs are safe to resolve;
-- two reused GTINs remain quarantined from barcode lookup while their exact
-- page/package versions stay searchable with retailer provenance.
DO $$
DECLARE
  v JSONB;
  v_run_key CONSTANT TEXT :=
    'target-blue-buffalo-review-v161:c462f47a94a6411b844ee0b2';
BEGIN
  SELECT public.promote_reviewed_retailer_package_batch(
    v_run_key,
    'target-blue-buffalo-reviewed-v162:20260727',
    'target-blue-buffalo-reviewed-v162',
    9,
    9,
    'Nine exact Target packages reviewed against matching front images, '
      || 'full readable structured ingredient statements, TCINs, and UPCs. '
      || 'Distinct ingredient versions remain separate even when the visible '
      || 'formula title matches. Reused UPCs abstain from barcode resolution.'
  )
  INTO v;

  IF (v->>'manufacturer_current_equal_package_count')::INTEGER <> 0
    OR (v->>'source_version_safe_package_count')::INTEGER <> 7
    OR (v->>'source_version_gtin_conflict_package_count')::INTEGER <> 2
    OR (v->>'promoted_source_version_formula_count')::INTEGER <> 9
  THEN
    RAISE EXCEPTION 'Unexpected Blue Buffalo v162 result: %', v;
  END IF;
END
$$;
