-- Strong verified identity coverage should survive ordinary partial product
-- searches that omit texture/form words such as "pate". The extra protected
-- term penalty still keeps sibling recipes with extra proteins/flavors lower.

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.search_verified_products(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'search_verified_products(text, integer) not found';
  END IF;

  IF function_sql LIKE '%verified identity all-token coverage boost v2%' THEN
    RETURN;
  END IF;

  function_sql := replace(
    function_sql,
    '-- verified identity all-token coverage boost',
    '-- verified identity all-token coverage boost v2'
  );

  function_sql := replace(
    function_sql,
    '''and'', ''the'', ''with'', ''for'', ''from'', ''food'', ''foods'',',
    '''and'', ''the'', ''with'', ''for'', ''from'', ''food'', ''foods'', ''pet'','
  );

  function_sql := replace(
    function_sql,
    $old$          THEN 3.6
          ELSE 0.0
        END +
        CASE
          -- verified extra protected-term penalty$old$,
    $new$          THEN 5.2
          ELSE 0.0
        END +
        CASE
          -- verified extra protected-term penalty$new$
  );

  IF function_sql NOT LIKE '%verified identity all-token coverage boost v2%' THEN
    RAISE EXCEPTION 'search_verified_products partial identity boost marker was not applied';
  END IF;

  IF function_sql NOT LIKE '%THEN 5.2%' THEN
    RAISE EXCEPTION 'search_verified_products partial identity boost value was not applied';
  END IF;

  EXECUTE function_sql;
END $$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;
