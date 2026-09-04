-- Treat "baby" as a meaningful product-line/life-stage term in catalog
-- search. Without this, verified Blue Buffalo Life Protection siblings can
-- outrank the exact Baby BLUE product when a legacy/query string includes
-- "Baby BLUE Healthy Growth".

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

  IF function_sql LIKE '%''baby''%' THEN
    RETURN;
  END IF;

  function_sql := replace(
    function_sql,
    'query_token.value IN (
              ''adult'', ''senior'', ''puppy''',
    'query_token.value IN (
              ''adult'', ''baby'', ''senior'', ''puppy'''
  );

  function_sql := replace(
    function_sql,
    'query_token.value IN (
              ''senior'', ''puppy''',
    'query_token.value IN (
              ''baby'', ''senior'', ''puppy'''
  );

  IF regexp_count(function_sql, '''baby''') <> 6 THEN
    RAISE EXCEPTION 'search_products baby term guard patch failed';
  END IF;

  IF function_sql LIKE '%''baby'', ''baby''%' THEN
    RAISE EXCEPTION 'search_products baby term guard duplicated baby token';
  END IF;

  EXECUTE function_sql;
END $$;
