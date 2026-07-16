-- Generic searches such as "Adult Chicken and Brown Rice" should not rank a
-- Toy Breed sibling formula above the base formula unless the user explicitly
-- searched for the toy-size variant.

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.search_verified_products(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'search_verified_products(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%''toy''%' THEN
    function_sql := replace(
      function_sql,
      $old$      'small',
      'large',$old$,
      $new$      'small',
      'toy',
      'large',$new$
    );

    function_sql := replace(
      function_sql,
      $old$                ('small'),
                ('large'),$old$,
      $new$                ('small'),
                ('toy'),
                ('large'),$new$
    );
  END IF;

  IF function_sql NOT LIKE '%''toy''%' THEN
    RAISE EXCEPTION 'toy breed verified-search variant guard was not applied';
  END IF;

  EXECUTE function_sql;
END $$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;
