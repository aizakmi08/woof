-- Plant-based products are distinct formulas. Queries that explicitly include
-- "plant" should not return ordinary meat-based kibble just because brand and
-- food-form terms overlap.

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.search_verified_products(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'search_verified_products(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%''plant''%' THEN
    function_sql := replace(
      function_sql,
      $old$      'hydrolyzed',
      'vegetarian',
      'salmon',$old$,
      $new$      'hydrolyzed',
      'vegetarian',
      'plant',
      'salmon',$new$
    );
  END IF;

  IF function_sql NOT LIKE '%''plant''%' THEN
    RAISE EXCEPTION 'search_verified_products plant recipe guard was not applied';
  END IF;

  EXECUTE function_sql;
END $$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;
