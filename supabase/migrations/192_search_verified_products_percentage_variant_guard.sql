-- Percentage/numeric formulas are distinct variants. Queries that explicitly
-- include "95" or "95%" must not return ordinary grain-free siblings.

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.search_verified_products(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'search_verified_products(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%''95''%' THEN
    function_sql := replace(
      function_sql,
      $old$      'grain',
      'free',$old$,
      $new$      'grain',
      'free',
      '95',$new$
    );
  END IF;

  IF function_sql NOT LIKE '%''95''%' THEN
    RAISE EXCEPTION 'search_verified_products percentage variant guard was not applied';
  END IF;

  EXECUTE function_sql;
END $$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;
