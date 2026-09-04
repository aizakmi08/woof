-- Normalize accents in catalog search so shelf labels and typed queries like
-- "pate" can match manufacturer names that use "Paté".

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

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
    $search$NULLIF(trim(regexp_replace(lower(trim(q)), '[^a-z0-9]+', ' ', 'g')), '') AS normalized$search$,
    $replace$NULLIF(trim(regexp_replace(extensions.unaccent(lower(trim(q))), '[^a-z0-9]+', ' ', 'g')), '') AS normalized$replace$
  );

  function_sql := replace(
    function_sql,
    $search$lower(pd.product_name) AS product_name_lc,$search$,
    $replace$NULLIF(trim(regexp_replace(extensions.unaccent(lower(COALESCE(pd.product_name, ''))), '[^a-z0-9]+', ' ', 'g')), '') AS product_name_lc,$replace$
  );

  function_sql := replace(
    function_sql,
    $search$lower(COALESCE(pd.brand, '')) AS brand_lc,$search$,
    $replace$NULLIF(trim(regexp_replace(extensions.unaccent(lower(COALESCE(pd.brand, ''))), '[^a-z0-9]+', ' ', 'g')), '') AS brand_lc,$replace$
  );

  function_sql := replace(
    function_sql,
    $search$lower(concat_ws(
        ' ',
        pd.brand,
        pd.product_name,
        pd.product_line,
        pd.flavor,
        pd.life_stage,
        pd.food_form,
        pd.package_size,
        pd.gtin
      )) AS identity_lc,$search$,
    $replace$NULLIF(trim(regexp_replace(extensions.unaccent(lower(concat_ws(
        ' ',
        pd.brand,
        pd.product_name,
        pd.product_line,
        pd.flavor,
        pd.life_stage,
        pd.food_form,
        pd.package_size,
        pd.gtin
      ))), '[^a-z0-9]+', ' ', 'g')), '') AS identity_lc,$replace$
  );

  IF function_sql NOT LIKE '%extensions.unaccent(lower(trim(q)))%'
    OR function_sql NOT LIKE '%extensions.unaccent(lower(COALESCE(pd.product_name, '''')))%'
    OR function_sql NOT LIKE '%extensions.unaccent(lower(COALESCE(pd.brand, '''')))%'
    OR function_sql NOT LIKE '%extensions.unaccent(lower(concat_ws(%'
  THEN
    RAISE EXCEPTION 'search_products accent normalization patch failed';
  END IF;

  EXECUTE function_sql;
END $$;
