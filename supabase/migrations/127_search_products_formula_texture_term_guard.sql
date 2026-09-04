-- Keep source-backed search bonuses from lifting verified-but-wrong sibling
-- formulas above exact legacy rows when the visible label/query contains
-- numeric formula ratios (for example 30/20) or wet-food texture terms such
-- as gravy, ground, pate, shreds, or chunks.

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

  IF function_sql LIKE '%numeric formula and texture term guard%' THEN
    RETURN;
  END IF;

  IF regexp_count(function_sql, 'query_token.value IN \(') <> 6 THEN
    RAISE EXCEPTION 'search_products important-term guard count unexpected before numeric patch';
  END IF;

  IF regexp_count(function_sql, 'filet'', ''mignon'', ''giblets''') <> 6 THEN
    RAISE EXCEPTION 'search_products important-term list count unexpected before texture patch';
  END IF;

  IF regexp_count(function_sql, 'AND r\.identity_lc !~ \(''\\m'' \|\| query_token.value \|\| ''\\M''\)') <> 6 THEN
    RAISE EXCEPTION 'search_products important-term missing-token predicate count unexpected';
  END IF;

  function_sql := replace(
    function_sql,
    'WHERE query_token.value IN (',
    'WHERE (
              -- numeric formula and texture term guard
              query_token.value ~ ''^[0-9]{1,3}$''
              OR query_token.value IN ('
  );

  function_sql := replace(
    function_sql,
    '''prime'', ''rib'', ''filet'', ''mignon'', ''giblets''',
    '''prime'', ''rib'', ''filet'', ''mignon'', ''giblets'',
              ''gravy'', ''ground'', ''sauce'', ''pate'', ''shreds'', ''flaked'',
              ''minced'', ''chunks'', ''morsels'''
  );

  function_sql := replace(
    function_sql,
    '            )
              AND r.identity_lc !~ (''\m'' || query_token.value || ''\M'')',
    '              )
            )
              AND r.identity_lc !~ (''\m'' || query_token.value || ''\M'')'
  );

  IF regexp_count(function_sql, 'numeric formula and texture term guard') <> 6 THEN
    RAISE EXCEPTION 'search_products numeric formula guard patch failed';
  END IF;

  IF regexp_count(function_sql, '''gravy'', ''ground'', ''sauce'', ''pate''') <> 4 THEN
    RAISE EXCEPTION 'search_products texture term guard patch failed';
  END IF;

  EXECUTE function_sql;
END $$;
