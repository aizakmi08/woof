-- Promote the clean reviewed Target IAMS package wave. The source review
-- retained 22 exact packages across 18 formula identities. It excluded
-- multi-recipe packages, missing label evidence, malformed ingredient
-- punctuation, other structural failures, and one stale 404 page.
DO $$
DECLARE
  v JSONB;
BEGIN
  SELECT public.promote_reviewed_retailer_package_batch(
    'target-iams-review-v185:12620380604dc263bad338a1',
    'target-iams-reviewed-v186:20260727',
    'target-iams-reviewed-v186',
    22,
    18,
    'Twenty-two exact Target IAMS package pages were reviewed against '
      || 'Target structured product identity, a package GTIN, matching '
      || 'front-package image, complete readable ingredient statement, '
      || 'species, life stage, food form, and protected recipe/condition '
      || 'terms. Four size families group only when exact normalized '
      || 'ingredient evidence agrees. Different ingredient versions remain '
      || 'separate retailer_web_version formulas, and reused GTIN conflicts '
      || 'abstain from barcode-only resolution.'
  )
  INTO v;

  IF (v->>'reviewed_observation_count')::INTEGER <> 22
    OR (v->>'reviewed_formula_count')::INTEGER <> 18
    OR (v->>'manufacturer_current_equal_package_count')::INTEGER <> 3
    OR (v->>'source_version_safe_package_count')::INTEGER <> 9
    OR (v->>'source_version_gtin_conflict_package_count')::INTEGER <> 10
    OR (v->>'source_version_formula_count')::INTEGER <> 15
    OR (v->>'promoted_source_version_formula_count')::INTEGER <> 15
  THEN
    RAISE EXCEPTION 'Unexpected Target IAMS v186 result: %', v;
  END IF;
END
$$;
