-- Some manufacturers publish the same visible product title for dog and cat
-- formulas. Keep the title-only query ambiguous, but make an exact
-- "<brand> <product name> <dog|cat>" query deterministic.

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

  IF function_sql LIKE '%exact brand product title and species rank alignment%' THEN
    RETURN;
  END IF;

  IF regexp_count(
    function_sql,
    'query\.normalized = concat_ws\('' '', r\.brand_lc, r\.product_name_lc\)'
  ) <> 2 THEN
    RAISE EXCEPTION 'search_products exact brand-title comparison count unexpected';
  END IF;

  function_sql := replace(
    function_sql,
    'AND query.normalized = concat_ws('' '', r.brand_lc, r.product_name_lc)',
    'AND (
            query.normalized = concat_ws('' '', r.brand_lc, r.product_name_lc)
            OR (
              -- exact brand product title and species rank alignment
              lower(COALESCE(r.pet_type, '''')) IN (''dog'', ''cat'')
              AND query.normalized = concat_ws(
                '' '', r.brand_lc, r.product_name_lc, lower(r.pet_type)
              )
            )
          )'
  );

  IF regexp_count(
    function_sql,
    'exact brand product title and species rank alignment'
  ) <> 2 THEN
    RAISE EXCEPTION 'search_products exact brand-title-species patch failed';
  END IF;

  EXECUTE function_sql;
END $$;
