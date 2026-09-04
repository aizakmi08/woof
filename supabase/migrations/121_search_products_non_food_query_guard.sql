-- Do not return low-confidence food substitutions for queries that are
-- themselves treats, bundles, variety packs, starter kits, or generic lines.

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

  IF function_sql LIKE '%query_is_non_food%' THEN
    RETURN;
  END IF;

  function_sql := replace(
    function_sql,
    'normalized ~ ''\m(cats?|kitten|kittens|feline|felines)\M'' AS query_has_cat',
    'normalized ~ ''\m(cats?|kitten|kittens|feline|felines)\M'' AS query_has_cat,
      public.is_likely_non_product_catalog_row(normalized, NULL) AS query_is_non_food'
  );

  function_sql := replace(
    function_sql,
    'WHERE query.ts_query IS NOT NULL
      AND (',
    'WHERE query.ts_query IS NOT NULL
      AND NOT query.query_is_non_food
      AND ('
  );

  function_sql := replace(
    function_sql,
    'WHERE query.normalized IS NOT NULL
      AND (SELECT count(*) FROM strict_matched) < query.safe_limit',
    'WHERE query.normalized IS NOT NULL
      AND NOT query.query_is_non_food
      AND (SELECT count(*) FROM strict_matched) < query.safe_limit'
  );

  IF regexp_count(function_sql, 'query_is_non_food') <> 3 THEN
    RAISE EXCEPTION 'search_products non-food query guard patch failed';
  END IF;

  EXECUTE function_sql;
END $$;
