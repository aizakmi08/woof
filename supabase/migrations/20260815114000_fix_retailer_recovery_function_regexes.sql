-- The initial deployed recovery functions contained doubled backslashes in
-- their stored SQL bodies. Collapse each doubled literal to the intended
-- single PostgreSQL regex/newline escape without touching data.

DO $migration$
DECLARE
  v_signature REGPROCEDURE;
  v_definition TEXT;
  v_fixed_definition TEXT;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.recover_normalized_retailer_evidence(uuid,text,integer)'::regprocedure,
    'public.attach_exact_catalog_formula_images(uuid,text)'::regprocedure,
    'public.reconcile_walmart_unique_ingredient_formulas(uuid,integer)'::regprocedure
  ]
  LOOP
    SELECT pg_get_functiondef(v_signature) INTO v_definition;
    v_fixed_definition := replace(v_definition, E'\\\\', E'\\');

    IF v_fixed_definition = v_definition THEN
      RAISE EXCEPTION 'No doubled regex literals found in %', v_signature;
    END IF;

    EXECUTE v_fixed_definition;
  END LOOP;
END;
$migration$;

REVOKE ALL ON FUNCTION public.recover_normalized_retailer_evidence(UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attach_exact_catalog_formula_images(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_walmart_unique_ingredient_formulas(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_normalized_retailer_evidence(UUID, TEXT, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.attach_exact_catalog_formula_images(UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_walmart_unique_ingredient_formulas(UUID, INTEGER)
  TO service_role;
