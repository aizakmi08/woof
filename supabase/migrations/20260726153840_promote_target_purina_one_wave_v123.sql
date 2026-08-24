-- Promote the second visually reviewed Target Purina ONE package batch.
-- Two packages are ingredient-identical to manufacturer-current formulas.
-- Twelve distinct exact package versions are preserved separately.
-- Seven reused GTINs remain non-resolving because their ingredients conflict
-- with another verified formula version.

DO $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT public.promote_reviewed_retailer_package_batch(
    'target-purina-one-review-v123:ba85510efbe524666315d7f5',
    'target-purina-one-reviewed-source-versions-v124:20260726',
    'target-purina-one-reviewed-v124',
    15,
    14,
    'Exact Target PDP full ingredient statement and matching package image '
      || 'visually reviewed on 2026-07-26.'
  )
  INTO v_result;

  IF (v_result->>'manufacturer_current_equal_package_count')::INTEGER <> 2
    OR (v_result->>'source_version_safe_package_count')::INTEGER <> 6
    OR (
      v_result->>'source_version_gtin_conflict_package_count'
    )::INTEGER <> 7
    OR (v_result->>'source_version_formula_count')::INTEGER <> 12
    OR (
      v_result->>'promoted_source_version_formula_count'
    )::INTEGER <> 12
  THEN
    RAISE EXCEPTION
      'Unexpected Target Purina ONE v124 promotion result: %',
      v_result;
  END IF;
END
$$;
