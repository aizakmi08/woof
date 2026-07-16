-- Search results should only come from complete foods with known dog/cat pet
-- type. Legacy unknown-pet-type rows stay in product_data for acquisition
-- cleanup, but they must not be returned as scorable catalog matches.

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

  IF function_sql LIKE '%search known dog/cat pet type guard%' THEN
    RETURN;
  END IF;

  IF regexp_count(function_sql, 'pd.catalog_exclusion_reason IS NULL') <> 1 THEN
    RAISE EXCEPTION 'search_products ready filter patch point unexpected';
  END IF;

  function_sql := replace(
    function_sql,
    'AND pd.catalog_exclusion_reason IS NULL',
    'AND pd.catalog_exclusion_reason IS NULL
      -- search known dog/cat pet type guard
      AND lower(COALESCE(pd.pet_type, '''')) IN (''dog'', ''cat'', ''dogs'', ''cats'')'
  );

  IF function_sql NOT LIKE '%search known dog/cat pet type guard%' THEN
    RAISE EXCEPTION 'search_products known pet type guard patch failed';
  END IF;

  EXECUTE function_sql;
END $$;
