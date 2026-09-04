-- App search should fail fast to the "not verified yet" flow when there is
-- no indexed verified match. Do not call the historical broad scorer from
-- the user-facing RPC. Also keep unrequested puppy/kitten variants below
-- matching adult formulas.

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.search_verified_products(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'search_verified_products(text, integer) not found';
  END IF;

  function_sql := replace(
    function_sql,
    'THEN 1.25 ELSE 0.0',
    'THEN 4.0 ELSE 0.0'
  );

  function_sql := replace(
    function_sql,
    'THEN 0.75 ELSE 0.0',
    'THEN 2.0 ELSE 0.0'
  );

  function_sql := replace(
    function_sql,
    E'  RETURN QUERY\\n  SELECT *\\n  FROM public.search_verified_products_ranked_v1(v_normalized, v_safe_limit)\\n  LIMIT v_safe_limit;',
    E'  RETURN;'
  );

  IF function_sql LIKE '%search_verified_products_ranked_v1(v_normalized, v_safe_limit)%' THEN
    RAISE EXCEPTION 'search_verified_products still calls the historical fallback';
  END IF;

  IF function_sql NOT LIKE '%THEN 4.0 ELSE 0.0%' THEN
    RAISE EXCEPTION 'search_verified_products puppy/kitten penalty patch failed';
  END IF;

  EXECUTE function_sql;
END $$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;
