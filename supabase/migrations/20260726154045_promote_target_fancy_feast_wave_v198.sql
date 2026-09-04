-- Promote clean exact Target Fancy Feast packages. Complements, multi-recipe
-- packs, malformed labels, incomplete pages, and OCR/package contamination
-- remain quarantined.
DO $$
DECLARE
  v JSONB;
BEGIN
  SELECT public.promote_reviewed_retailer_package_batch(
    'target-fancy-feast-review-v197:dbed88a67abe373675c0c245',
    'target-fancy-feast-reviewed-v198:20260727',
    'target-fancy-feast-reviewed-v198',
    13,
    12,
    'Thirteen clean exact Target Fancy Feast package pages were reviewed '
      || 'against structured product identity, package GTIN, matching front '
      || 'image, full readable ingredients, complete-food classification, '
      || 'species, life stage, wet food form, texture, and protected recipe '
      || 'terms. Broths/complements, multi-recipe packs, malformed statements, '
      || 'and package/OCR contamination remain quarantined. Reused, '
      || 'incompatible, or failed-postcondition GTINs abstain.'
  )
  INTO v;

  IF (v->>'reviewed_observation_count')::INTEGER <> 13
    OR (v->>'reviewed_formula_count')::INTEGER <> 12
    OR (v->>'manufacturer_current_equal_package_count')::INTEGER <> 1
    OR (v->>'source_version_safe_package_count')::INTEGER <> 2
    OR (v->>'safe_gtin_postcondition_abstention_count')::INTEGER <> 1
    OR (v->>'source_version_gtin_conflict_package_count')::INTEGER <> 10
    OR (v->>'source_version_formula_count')::INTEGER <> 11
    OR (v->>'promoted_source_version_formula_count')::INTEGER <> 11
  THEN
    RAISE EXCEPTION 'Unexpected Target Fancy Feast v198 result: %', v;
  END IF;
END
$$;
