-- Promote exact Target Cesar and Pedigree source versions from the reviewed
-- package batches. Short/incomplete statements, multi-recipe packs, toppers,
-- malformed labels, and unavailable pages remain quarantined.
DO $$
DECLARE
  v JSONB;
BEGIN
  SELECT public.promote_reviewed_retailer_package_batch(
    'target-cesar-review-v188:47576fec7db1c158f6dbfc21',
    'target-cesar-reviewed-v190:20260727',
    'target-cesar-reviewed-v190',
    8,
    8,
    'Eight exact Target Cesar package pages were reviewed against Target '
      || 'structured product identity, package GTIN, matching front image, '
      || 'full readable ingredients, species, life stage, food form, and '
      || 'protected recipe terms. Distinct ingredient versions remain '
      || 'retailer_web_version formulas; conflicting reused GTINs abstain.'
  )
  INTO v;

  IF (v->>'reviewed_observation_count')::INTEGER <> 8
    OR (v->>'reviewed_formula_count')::INTEGER <> 8
    OR (v->>'manufacturer_current_equal_package_count')::INTEGER <> 1
    OR (v->>'source_version_safe_package_count')::INTEGER <> 0
    OR (v->>'source_version_gtin_conflict_package_count')::INTEGER <> 7
    OR (v->>'source_version_formula_count')::INTEGER <> 7
    OR (v->>'promoted_source_version_formula_count')::INTEGER <> 7
  THEN
    RAISE EXCEPTION 'Unexpected Target Cesar v190 result: %', v;
  END IF;

  SELECT public.promote_reviewed_retailer_package_batch(
    'target-pedigree-review-v189:d313489ed1446ce724a68b82',
    'target-pedigree-reviewed-v190:20260727',
    'target-pedigree-reviewed-v190',
    17,
    17,
    'Seventeen exact Target Pedigree package pages were reviewed against '
      || 'Target structured product identity, package GTIN, matching front '
      || 'image, full readable ingredients, species, life stage, food form, '
      || 'and protected recipe terms. A multi-recipe High Protein pack was '
      || 'excluded after detecting counted component ingredient headings. '
      || 'Distinct ingredient versions remain retailer_web_version formulas; '
      || 'conflicting reused GTINs abstain.'
  )
  INTO v;

  IF (v->>'reviewed_observation_count')::INTEGER <> 17
    OR (v->>'reviewed_formula_count')::INTEGER <> 17
    OR (v->>'manufacturer_current_equal_package_count')::INTEGER <> 0
    OR (v->>'source_version_safe_package_count')::INTEGER <> 6
    OR (v->>'source_version_gtin_conflict_package_count')::INTEGER <> 11
    OR (v->>'source_version_formula_count')::INTEGER <> 17
    OR (v->>'promoted_source_version_formula_count')::INTEGER <> 17
  THEN
    RAISE EXCEPTION 'Unexpected Target Pedigree v190 result: %', v;
  END IF;
END
$$;
