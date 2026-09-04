-- The stored full-text document is not accent-folded. A user query for
-- "pate" should still match package/catalog titles containing "Paté".
-- Use a shorter full-text prefix for retrieval while keeping the normalized
-- query unchanged for required-term validation.

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
    E'v_ts_query := to_tsquery(''simple'', regexp_replace(v_normalized, ''[[:space:]]+'', '':* & '', ''g'') || '':*'');',
    E'v_ts_query := to_tsquery(''simple'', regexp_replace(regexp_replace(v_normalized, ''\\\\mpate\\\\M'', ''pat'', ''g''), ''[[:space:]]+'', '':* & '', ''g'') || '':*'');'
  );

  IF function_sql NOT LIKE '%\\\\mpate\\\\M%' THEN
    RAISE EXCEPTION 'search_verified_products pate prefix patch failed';
  END IF;

  EXECUTE function_sql;
END $$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;
