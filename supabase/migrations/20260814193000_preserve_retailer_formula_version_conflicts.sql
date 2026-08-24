-- A dated retailer ingredient version is useful serving evidence, but it must
-- not be accepted as the canonical formula's current ingredient field when
-- the manufacturer/current ledger differs. Keep it as explicit provenance.

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
  v_before TEXT := $before$
      evidence.source_url,
      'retailer_verified',
      true,
      COALESCE(evidence.fetched_at, now()),
      evidence.ingredient_hash
$before$;
  v_after TEXT := $after$
      evidence.source_url,
      'retailer_verified',
      false,
      COALESCE(evidence.fetched_at, now()),
      evidence.ingredient_hash
$after$;
BEGIN
  SELECT pg_get_functiondef(
    'public.reconcile_retailer_ingredient_evidence(uuid,integer)'::regprocedure
  )
  INTO v_definition;

  v_fixed_definition := replace(v_definition, v_before, v_after);
  v_fixed_definition := replace(
    v_fixed_definition,
    'accepted = true,',
    'accepted = false,'
  );

  IF v_fixed_definition = v_definition THEN
    RAISE EXCEPTION
      'retailer formula-version field evidence guard not found';
  END IF;

  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.reconcile_retailer_ingredient_evidence(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_retailer_ingredient_evidence(UUID, INTEGER)
  TO service_role;
