-- Retailer web versions are dated evidence and must be revalidated. The
-- serving table requires a non-null expiry, so give these versions a bounded
-- 180-day lifetime instead of an unbounded/null value.

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
    '''expires_at'', NULL,',
    '''expires_at'', COALESCE(evidence.fetched_at, now()) + interval ''180 days'','
  );

  IF v_fixed_definition = v_definition THEN
    RAISE EXCEPTION
      'reconcile_retailer_ingredient_evidence expiry payload guard not found';
  END IF;

  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.reconcile_retailer_ingredient_evidence(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_retailer_ingredient_evidence(UUID, INTEGER)
  TO service_role;
