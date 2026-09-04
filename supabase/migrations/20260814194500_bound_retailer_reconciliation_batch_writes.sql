-- Restrict SKU/evidence audit writes to the rows promoted by the current
-- transaction. Replaying every row touched in the previous five minutes made
-- bounded reconciliation progressively slower while adding no new evidence.

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.reconcile_retailer_ingredient_evidence(uuid,integer)'::regprocedure
  )
  INTO v_definition;

  v_fixed_definition := replace(
    v_definition,
    '  v_remaining INTEGER := 0;' || chr(10),
    '  v_remaining INTEGER := 0;' || chr(10) ||
    '  v_batch_started_at TIMESTAMPTZ := now();' || chr(10)
  );
  v_fixed_definition := replace(
    v_fixed_definition,
    'evidence.updated_at >= statement_timestamp() - interval ''5 minutes''',
    'evidence.updated_at >= v_batch_started_at'
  );

  IF v_fixed_definition = v_definition THEN
    RAISE EXCEPTION
      'retailer reconciliation batch-write guard not found';
  END IF;

  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.reconcile_retailer_ingredient_evidence(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_retailer_ingredient_evidence(UUID, INTEGER)
  TO service_role;
