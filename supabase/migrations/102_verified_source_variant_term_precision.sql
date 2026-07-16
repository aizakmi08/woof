-- Tighten verified source exact-product boosting so variant terms like
-- "small breed" are not treated as ignorable, and give exact verified
-- product-term matches enough lift to beat unverified duplicate retailer rows.

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO function_sql
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'search_products'
    AND pg_get_function_identity_arguments(p.oid) = 'q text, max_results integer';

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'search_products(q text, max_results integer) not found';
  END IF;

  IF regexp_count(function_sql, 'verified source exact product terms') <> 2 THEN
    RAISE EXCEPTION 'search_products exact source product term block not found';
  END IF;

  function_sql := replace(function_sql, 'THEN 1.20', 'THEN 1.35');
  function_sql := replace(
    function_sql,
    '''adult'', ''breed'', ''breeds'', ''clusters'', ''dog'', ''dogs'',',
    '''adult'', ''clusters'', ''dog'', ''dogs'','
  );
  function_sql := replace(
    function_sql,
    '''puppy'', ''recipe'', ''small'', ''whole'', ''with''',
    '''puppy'', ''recipe'', ''whole'', ''with'''
  );

  IF regexp_count(function_sql, 'THEN 1.20') <> 0 THEN
    RAISE EXCEPTION 'search_products exact source product term boost patch failed';
  END IF;

  IF function_sql LIKE '%''breed'', ''breeds''%' OR function_sql LIKE '%''small''%' THEN
    RAISE EXCEPTION 'search_products exact source product variant stopword patch failed';
  END IF;

  EXECUTE function_sql;
END $$;
