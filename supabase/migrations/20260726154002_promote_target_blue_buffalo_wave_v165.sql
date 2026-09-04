-- Promote twelve exact reviewed Target packages across eleven exact formula
-- identities. Three packages exactly match a manufacturer-current formula;
-- three reused/conflicting GTINs remain non-resolving.
DO $$
DECLARE
  v JSONB;
BEGIN
  SELECT public.promote_reviewed_retailer_package_batch(
    'target-blue-buffalo-review-v165:0447954b6dd9e2b5935d0faf',
    'target-blue-buffalo-reviewed-v166:20260727',
    'target-blue-buffalo-reviewed-v166',
    12,
    11,
    'Twelve exact Target packages reviewed against matching front images, '
      || 'full readable structured ingredient statements, TCINs, and UPCs. '
      || 'Package sizes group only when exact visible identity and normalized '
      || 'ingredients agree; distinct ingredient versions remain separate.'
  )
  INTO v;

  IF (v->>'manufacturer_current_equal_package_count')::INTEGER <> 3
    OR (v->>'source_version_safe_package_count')::INTEGER <> 6
    OR (v->>'source_version_gtin_conflict_package_count')::INTEGER <> 3
    OR (v->>'promoted_source_version_formula_count')::INTEGER <> 9
  THEN
    RAISE EXCEPTION 'Unexpected Blue Buffalo v166 result: %', v;
  END IF;
END
$$;
