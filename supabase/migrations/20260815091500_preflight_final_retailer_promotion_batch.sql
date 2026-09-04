-- The bounded preflight may quarantine part of its first candidate set. The
-- legacy function then refills v_ids; validate that final set too, and make
-- eligibility require the row to have survived validation.

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
  v_marker TEXT := $marker$
  IF cardinality(v_ids) = 0 THEN
$marker$;
  v_replacement TEXT := $replacement$
  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET
    evidence_status = 'quarantined_validation',
    validation_reasons = CASE
      WHEN 'product_data_ingredient_contract' = ANY(evidence.validation_reasons)
        THEN evidence.validation_reasons
      ELSE array_append(evidence.validation_reasons, 'product_data_ingredient_contract')
    END,
    updated_at = now()
  WHERE evidence.id = ANY(v_ids)
    AND evidence.evidence_status = 'promotable_exact_package'
    AND NOT public.catalog_retailer_ingredient_is_serving_safe(evidence.ingredient_text);

  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET
    evidence_status = 'quarantined_validation',
    validation_reasons = CASE
      WHEN 'product_data_ingredient_artifact_contract' = ANY(evidence.validation_reasons)
        THEN evidence.validation_reasons
      ELSE array_append(evidence.validation_reasons, 'product_data_ingredient_artifact_contract')
    END,
    updated_at = now()
  WHERE evidence.id = ANY(v_ids)
    AND evidence.evidence_status = 'promotable_exact_package'
    AND (
      length(evidence.ingredient_text) < 30
      OR evidence.ingredient_count < 5
      OR evidence.ingredient_text ~ '(\.\.\.|…)'
      OR public.catalog_has_unbalanced_parentheses(evidence.ingredient_text)
      OR public.catalog_has_ingredient_ocr_artifacts(evidence.ingredient_text)
    );

  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET
    evidence_status = 'quarantined_validation',
    validation_reasons = CASE
      WHEN 'canonical_formula_non_product' = ANY(evidence.validation_reasons)
        THEN evidence.validation_reasons
      ELSE array_append(evidence.validation_reasons, 'canonical_formula_non_product')
    END,
    updated_at = now()
  FROM public.catalog_formulas formula
  WHERE formula.id = evidence.linked_formula_id
    AND evidence.id = ANY(v_ids)
    AND evidence.evidence_status = 'promotable_exact_package'
    AND public.is_likely_non_product_catalog_row(formula.product_name, formula.brand);

  IF cardinality(v_ids) = 0 THEN
$replacement$;
BEGIN
  SELECT pg_get_functiondef(
    'public.promote_retailer_ingredient_versions(uuid,integer)'::regprocedure
  ) INTO v_definition;

  v_fixed_definition := replace(v_definition, v_marker, v_replacement);
  v_fixed_definition := replace(
    v_fixed_definition,
    $marker$    WHERE evidence.id = ANY(v_ids)
      AND evidence.ingredient_count >= 5$marker$,
    $replacement$    WHERE evidence.id = ANY(v_ids)
      AND evidence.evidence_status = 'promotable_exact_package'
      AND evidence.ingredient_count >= 5$replacement$
  );

  IF v_fixed_definition = v_definition
    OR position(
      'AND evidence.evidence_status = ''promotable_exact_package''' IN v_fixed_definition
    ) = 0
  THEN
    RAISE EXCEPTION 'final retailer promotion preflight markers not found';
  END IF;

  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  TO service_role;
