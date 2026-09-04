-- Insect protein products are distinct formulas. Do not let a query such as
-- "Kind Earth Premium Insect Dog Kibble" resolve to a plant-based formula just
-- because the brand/line terms overlap.

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.search_verified_products(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'search_verified_products(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%''insect''%' THEN
    function_sql := replace(
      function_sql,
      $old$      'trout',
      'venison',
      'bison',$old$,
      $new$      'trout',
      'venison',
      'insect',
      'bison',$new$
    );

    function_sql := replace(
      function_sql,
      $old$                ('trout'), ('venison'), ('bison'), ('broth'),$old$,
      $new$                ('trout'), ('venison'), ('insect'), ('bison'), ('broth'),$new$
    );

    function_sql := replace(
      function_sql,
      $old$                ('trout'),
                ('venison'),
                ('bison'),$old$,
      $new$                ('trout'),
                ('venison'),
                ('insect'),
                ('bison'),$new$
    );
  END IF;

  IF function_sql NOT LIKE '%''insect''%' THEN
    RAISE EXCEPTION 'search_verified_products insect recipe guard was not applied';
  END IF;

  EXECUTE function_sql;
END $$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;
