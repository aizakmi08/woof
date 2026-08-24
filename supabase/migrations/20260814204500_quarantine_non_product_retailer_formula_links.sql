-- Some legacy census formulas are marked complete despite canonical titles
-- that the serving-table contract classifies as non-products. Quarantine those
-- links before insertion and leave the catalog inconsistency visible.

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
  v_marker TEXT := $marker$
  SELECT COALESCE(array_agg(selected.id ORDER BY selected.id), ARRAY[]::BIGINT[])
$marker$;
  v_replacement TEXT := $replacement$
  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET
    evidence_status = 'quarantined_validation',
    validation_reasons = CASE
      WHEN 'canonical_formula_non_product' = ANY(evidence.validation_reasons)
        THEN evidence.validation_reasons
      ELSE array_append(
        evidence.validation_reasons,
        'canonical_formula_non_product'
      )
    END,
    updated_at = now()
  FROM public.catalog_formulas formula
  WHERE formula.id = evidence.linked_formula_id
    AND evidence.import_run_id = p_import_run_id
    AND evidence.evidence_status = 'promotable_exact_package'
    AND public.is_likely_non_product_catalog_row(
      formula.product_name,
      formula.brand
    );

  SELECT COALESCE(array_agg(selected.id ORDER BY selected.id), ARRAY[]::BIGINT[])
$replacement$;
BEGIN
  SELECT pg_get_functiondef(
    'public.promote_retailer_ingredient_versions(uuid,integer)'::regprocedure
  )
  INTO v_definition;

  v_fixed_definition := replace(v_definition, v_marker, v_replacement);
  IF v_fixed_definition = v_definition THEN
    RAISE EXCEPTION 'retailer non-product formula preflight marker not found';
  END IF;

  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  TO service_role;
