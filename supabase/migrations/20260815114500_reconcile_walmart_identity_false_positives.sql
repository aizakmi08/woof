-- Some Walmart rows were conservatively quarantined before the complete
-- canonical catalog was available. Permit only two narrow false-positive
-- reasons back through the same unique full-ingredient identity gates.

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.reconcile_walmart_unique_ingredient_formulas(uuid,integer)'::regprocedure
  ) INTO v_definition;

  v_fixed_definition := replace(
    v_definition,
    $old$      AND evidence.evidence_status = 'unmatched_catalog_sku'$old$,
    $new$      AND (
        evidence.evidence_status = 'unmatched_catalog_sku'
        OR (
          evidence.evidence_status = 'quarantined_validation'
          AND evidence.validation_reasons <@ ARRAY[
            'variant_ingredient_mismatch',
            'non_complete_or_non_food_identity'
          ]::TEXT[]
          AND evidence.validation_reasons && ARRAY[
            'variant_ingredient_mismatch',
            'non_complete_or_non_food_identity'
          ]::TEXT[]
        )
      )$new$
  );
  v_fixed_definition := replace(
    v_fixed_definition,
    $old$      validation_reasons = array_remove(
        evidence.validation_reasons, 'no_unique_exact_catalog_sku_identity'
      ),$old$,
    $new$      validation_reasons = array_remove(array_remove(array_remove(
        evidence.validation_reasons,
        'no_unique_exact_catalog_sku_identity'
      ), 'variant_ingredient_mismatch'), 'non_complete_or_non_food_identity'),$new$
  );

  IF v_fixed_definition = v_definition
    OR position('variant_ingredient_mismatch' IN v_fixed_definition) = 0
    OR position('non_complete_or_non_food_identity' IN v_fixed_definition) = 0
  THEN
    RAISE EXCEPTION 'Walmart identity false-positive reconciliation markers not found';
  END IF;

  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.reconcile_walmart_unique_ingredient_formulas(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_walmart_unique_ingredient_formulas(UUID, INTEGER)
  TO service_role;
