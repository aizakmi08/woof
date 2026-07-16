-- Keep source-backed catalog rows ahead of unverified duplicates in search.
-- This preserves the verified-first behavior for databases that already ran 088.

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

  function_sql := replace(function_sql, 'THEN 0.08', 'THEN 1.25');
  function_sql := replace(function_sql, 'THEN 0.02', 'THEN 0.20');

  IF function_sql NOT LIKE '%THEN 1.25%' OR function_sql NOT LIKE '%THEN 0.20%' THEN
    RAISE EXCEPTION 'search_products verified rank replacement failed';
  END IF;

  EXECUTE function_sql;
END $$;
