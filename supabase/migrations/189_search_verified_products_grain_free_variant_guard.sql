-- Grain-free and grain-inclusive formulas are distinct variants. Queries that
-- explicitly say "grain free" must not return Ancient Grains siblings.

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.search_verified_products(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'search_verified_products(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%''grain''%' THEN
    function_sql := replace(
      function_sql,
      $old$      'skin',
      'coat',
      'hydrolyzed',$old$,
      $new$      'skin',
      'coat',
      'grain',
      'free',
      'hydrolyzed',$new$
    );
  END IF;

  IF function_sql NOT LIKE '%''grain''%' OR function_sql NOT LIKE '%''free''%' THEN
    RAISE EXCEPTION 'search_verified_products grain-free variant guard was not applied';
  END IF;

  EXECUTE function_sql;
END $$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;
