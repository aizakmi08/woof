-- PostgreSQL does not define max(uuid). Preserve UUID ordering by taking the
-- maximum textual UUID and casting it back to UUID for the resumable cursor.

DO $$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(procedure.oid)
  INTO STRICT v_definition
  FROM pg_proc procedure
  JOIN pg_namespace namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname =
      'catalog_backfill_product_evidence_tiers'
    AND pg_get_function_identity_arguments(procedure.oid) =
      'p_after_id uuid, p_limit integer';

  IF position(
       'COALESCE(max(id), v_next_id)'
       IN v_definition
     ) = 0 THEN
    RAISE EXCEPTION
      'Product evidence tier backfill UUID cursor pattern was not found';
  END IF;

  v_fixed_definition := replace(
    v_definition,
    'COALESCE(max(id), v_next_id)',
    'COALESCE(max(id::TEXT)::UUID, v_next_id)'
  );

  EXECUTE v_fixed_definition;
END;
$$;

DO $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT public.catalog_backfill_product_evidence_tiers(
    '00000000-0000-0000-0000-000000000000'::UUID,
    1
  )
  INTO v_result;

  IF COALESCE((v_result ->> 'rows_updated')::INTEGER, 0) <> 1
      OR COALESCE(v_result ->> 'next_id', '') = '' THEN
    RAISE EXCEPTION
      'Product evidence tier UUID cursor verification failed: %',
      v_result;
  END IF;
END;
$$;
