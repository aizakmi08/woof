-- Retailer web versions remain valid exact-package results, but they must not
-- replace an existing manufacturer-backed formula's default serving pointer.
-- A missing manufacturer pointer may still use the retailer version as a
-- fallback; retailer-created and unverified formulas continue to sync.

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.sync_retailer_formula_promotions(uuid)'::regprocedure
  ) INTO v_definition;

  v_fixed_definition := replace(
    v_definition,
    $old$    WHERE formula.id = representative.linked_formula_id
    RETURNING formula.id$old$,
    $new$    WHERE formula.id = representative.linked_formula_id
      AND (
        formula.formula_key LIKE 'retailer-web:%'
        OR formula.promoted_cache_key IS NULL
        OR formula.source_authority <> 'manufacturer'
      )
    RETURNING formula.id$new$
  );

  IF v_fixed_definition = v_definition
    OR position('formula.source_authority <> ''manufacturer''' IN v_fixed_definition) = 0
  THEN
    RAISE EXCEPTION 'retailer formula pointer guard marker not found';
  END IF;
  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.sync_retailer_formula_promotions(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_retailer_formula_promotions(UUID)
  TO service_role;
