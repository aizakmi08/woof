-- Promote exact Target Freshpet source versions with structurally complete
-- ingredient panels. Malformed vitamin delimiters, missing statements, and
-- unbalanced package evidence remain quarantined.
DO $$
DECLARE
  v JSONB;
BEGIN
  SELECT public.promote_reviewed_retailer_package_batch(
    'target-freshpet-review-v195:a6b9df022e91a1e531788615',
    'target-freshpet-reviewed-v196:20260727',
    'target-freshpet-reviewed-v196',
    17,
    17,
    'Seventeen exact Target Freshpet package pages were reviewed against '
      || 'Target structured product identity, package GTIN, matching front '
      || 'image, full readable ingredient list, complete-food classification, '
      || 'species, life stage, fresh food form, and protected recipe terms. '
      || 'Short but structurally complete fresh-food ingredient panels are '
      || 'accepted; reused or incompatible GTINs abstain.'
  )
  INTO v;

  IF (v->>'reviewed_observation_count')::INTEGER <> 17
    OR (v->>'reviewed_formula_count')::INTEGER <> 17
    OR (v->>'manufacturer_current_equal_package_count')::INTEGER <> 0
    OR (v->>'source_version_safe_package_count')::INTEGER <> 7
    OR (v->>'source_version_gtin_conflict_package_count')::INTEGER <> 10
    OR (v->>'source_version_formula_count')::INTEGER <> 17
    OR (v->>'promoted_source_version_formula_count')::INTEGER <> 17
  THEN
    RAISE EXCEPTION 'Unexpected Target Freshpet v196 result: %', v;
  END IF;
END
$$;
