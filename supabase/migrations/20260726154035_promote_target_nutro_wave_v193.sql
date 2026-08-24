-- Promote the clean exact Target Nutro source versions from the reviewed
-- package batch. One ingredient transcription artifact, incomplete pages, and
-- malformed package evidence remain quarantined.
DO $$
DECLARE
  v JSONB;
BEGIN
  SELECT public.promote_reviewed_retailer_package_batch(
    'target-nutro-review-v192:8a0c8d6dbaa6b92688fbd53f',
    'target-nutro-reviewed-v193:20260727',
    'target-nutro-reviewed-v193',
    16,
    12,
    'Sixteen exact Target Nutro package pages were reviewed against Target '
      || 'structured product identity, package GTIN, matching front image, '
      || 'full readable ingredients, species, life stage, food form, and '
      || 'protected recipe terms. Six exact ingredient-equivalent packages '
      || 'link to existing verified formulas. Distinct source versions remain '
      || 'retailer_web_version formulas; conflicting reused GTINs abstain.'
  )
  INTO v;

  IF (v->>'reviewed_observation_count')::INTEGER <> 16
    OR (v->>'reviewed_formula_count')::INTEGER <> 12
    OR (v->>'manufacturer_current_equal_package_count')::INTEGER <> 6
    OR (v->>'source_version_safe_package_count')::INTEGER <> 2
    OR (v->>'source_version_gtin_conflict_package_count')::INTEGER <> 8
    OR (v->>'source_version_formula_count')::INTEGER <> 8
    OR (v->>'promoted_source_version_formula_count')::INTEGER <> 8
  THEN
    RAISE EXCEPTION 'Unexpected Target Nutro v193 result: %', v;
  END IF;
END
$$;
