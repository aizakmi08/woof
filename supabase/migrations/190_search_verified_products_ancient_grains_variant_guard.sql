-- Ancient-grains and grain-free formulas are distinct variants. Queries that
-- explicitly say "ancient grains" must not return grain-free siblings.

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.search_verified_products(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'search_verified_products(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%''ancient''%' THEN
    function_sql := replace(
      function_sql,
      $old$      'skin',
      'coat',
      'grain',$old$,
      $new$      'skin',
      'coat',
      'ancient',
      'grains',
      'grain',$new$
    );
  END IF;

  IF function_sql NOT LIKE '%''ancient''%' OR function_sql NOT LIKE '%''grains''%' THEN
    RAISE EXCEPTION 'search_verified_products ancient-grains variant guard was not applied';
  END IF;

  EXECUTE function_sql;
END $$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;
