-- Break verified-source search ties toward visible label terms. This keeps
-- Baby BLUE + Brown Rice queries from being ordered behind adult sibling
-- formulas with larger ingredient lists.

DO $$
DECLARE
  function_sql TEXT;
  tie_breaker TEXT;
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

  IF function_sql LIKE '%visible label line/recipe tie-breaker%' THEN
    RETURN;
  END IF;

  IF regexp_count(function_sql, 'explicit pet species rank alignment') <> 2 THEN
    RAISE EXCEPTION 'search_products species alignment block count unexpected';
  END IF;

  tie_breaker := $patch$END + CASE
        -- visible label line/recipe tie-breaker
        WHEN query.normalized ~ '\mbaby\M'
          AND r.identity_lc ~ '\mbaby\M'
        THEN 0.80
        ELSE 0.0
      END + CASE
        WHEN query.normalized ~ '\mbrown rice\M'
          AND r.identity_lc ~ '\mbrown rice\M'
        THEN 0.35
        ELSE 0.0
      END + CASE
        -- explicit pet species rank alignment$patch$;

  function_sql := replace(
    function_sql,
    'END + CASE
        -- explicit pet species rank alignment',
    tie_breaker
  );

  IF regexp_count(function_sql, 'visible label line/recipe tie-breaker') <> 2 THEN
    RAISE EXCEPTION 'search_products baby brown-rice tie-breaker patch failed';
  END IF;

  EXECUTE function_sql;
END $$;
