-- Give exact source-backed rows enough lift to beat long legacy retailer
-- titles once they are admitted to the candidate pool. This remains gated by
-- brand, species, source URL, verified image, verified ingredients, and strong
-- recipe identity similarity from the prior migrations.

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

  function_sql := replace(function_sql, 'THEN 1.85', 'THEN 2.30');

  IF function_sql NOT LIKE '%THEN 2.30%' THEN
    RAISE EXCEPTION 'search_products verified source bonus weight patch failed';
  END IF;

  EXECUTE function_sql;
END $$;
