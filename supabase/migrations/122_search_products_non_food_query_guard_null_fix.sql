-- The non-food query guard must treat classifier NULL as false. Passing a
-- NULL brand to the classifier can otherwise filter every normal search query.

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

  function_sql := replace(
    function_sql,
    'public.is_likely_non_product_catalog_row(normalized, NULL) AS query_is_non_food',
    'COALESCE(public.is_likely_non_product_catalog_row(normalized, NULL), FALSE) AS query_is_non_food'
  );

  IF function_sql NOT LIKE '%COALESCE(public.is_likely_non_product_catalog_row(normalized, NULL), FALSE) AS query_is_non_food%' THEN
    RAISE EXCEPTION 'search_products non-food query guard NULL fix failed';
  END IF;

  EXECUTE function_sql;
END $$;
