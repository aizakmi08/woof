-- Package evidence now owns the exact retailer image. Avoid selecting the
-- observation's duplicate column into the promotion CTE.

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.promote_retailer_ingredient_versions(uuid,integer)'::regprocedure
  ) INTO v_definition;

  v_fixed_definition := replace(
    v_definition,
    '      observation.front_image_url,' || chr(10),
    ''
  );
  v_fixed_definition := replace(
    v_fixed_definition,
    '      AND NULLIF(btrim(observation.front_image_url), '''') IS NOT NULL',
    '      AND NULLIF(btrim(evidence.front_image_url), '''') IS NOT NULL'
  );

  IF v_fixed_definition = v_definition THEN
    RAISE EXCEPTION 'retailer promotion front image markers not found';
  END IF;
  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  TO service_role;
