-- A retailer SKU can be exact even when its title omits package size. Preserve
-- that SKU as an unknown-size child instead of failing promotion or inventing
-- a separate formula.

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.promote_retailer_ingredient_versions(uuid,integer)'::regprocedure
  )
  INTO v_definition;

  v_fixed_definition := replace(
    v_definition,
    '    NULLIF(evidence.package_size, ''''),',
    '    COALESCE(NULLIF(evidence.package_size, ''''), ''unknown''),'
  );

  IF v_fixed_definition = v_definition THEN
    RAISE EXCEPTION 'retailer unknown package-size guard not found';
  END IF;

  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  TO service_role;
