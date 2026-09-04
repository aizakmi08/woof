-- Count "Delights" as a distinctive product-line token for verified source
-- search ranking. It should not be treated like a generic food word because
-- Blue Buffalo uses it as the visible line on shelf labels.

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

  IF function_sql NOT LIKE '%verified source distinctive token overlap%' THEN
    RAISE EXCEPTION 'search_products verified source token overlap block not found';
  END IF;

  IF function_sql NOT LIKE '%''complete'', ''delight'',%'
    AND function_sql NOT LIKE '%''delights'', ''diets'',%'
  THEN
    RETURN;
  END IF;

  function_sql := replace(
    function_sql,
    $match$'complete', 'delight',
                'delights', 'diets'$match$,
    $replace$'complete', 'diets'$replace$
  );

  IF function_sql LIKE '%''complete'', ''delight'',%'
    OR function_sql LIKE '%''delights'', ''diets'',%'
  THEN
    RAISE EXCEPTION 'search_products Delights stopword removal patch failed';
  END IF;

  EXECUTE function_sql;
END $$;
