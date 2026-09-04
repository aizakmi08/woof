-- Finish mirroring the serving-table artifact gate before promotion. These
-- rows remain durable retailer evidence but cannot become customer results.

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
  v_marker TEXT := $marker$
  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET
    evidence_status = 'quarantined_validation',
    validation_reasons = CASE
      WHEN 'canonical_formula_non_product' = ANY(evidence.validation_reasons)
$marker$;
  v_replacement TEXT := $replacement$
  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET
    evidence_status = 'quarantined_validation',
    validation_reasons = CASE
      WHEN 'product_data_ingredient_artifact_contract' = ANY(evidence.validation_reasons)
        THEN evidence.validation_reasons
      ELSE array_append(
        evidence.validation_reasons,
        'product_data_ingredient_artifact_contract'
      )
    END,
    updated_at = now()
  WHERE evidence.import_run_id = p_import_run_id
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
$replacement$;
BEGIN
  SELECT pg_get_functiondef(
    'public.promote_retailer_ingredient_versions(uuid,integer)'::regprocedure
  )
  INTO v_definition;

  v_fixed_definition := replace(v_definition, v_marker, v_replacement);
  IF v_fixed_definition = v_definition THEN
    RAISE EXCEPTION 'retailer ingredient artifact preflight marker not found';
  END IF;

  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  TO service_role;
