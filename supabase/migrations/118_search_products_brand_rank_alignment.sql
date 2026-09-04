-- When the user types an exact brand phrase, keep matching-brand products
-- ahead of different brands that happen to share recipe terms.

DO $$
DECLARE
  function_sql TEXT;
  brand_adjustment TEXT;
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

  IF function_sql LIKE '%explicit brand phrase rank alignment%' THEN
    RETURN;
  END IF;

  IF regexp_count(function_sql, 'explicit pet species rank alignment') <> 2 THEN
    RAISE EXCEPTION 'search_products species alignment block count unexpected';
  END IF;

  brand_adjustment := $patch$END + CASE
        -- explicit brand phrase rank alignment
        WHEN r.brand_lc IS NOT NULL
          AND length(r.brand_lc) >= 4
          AND query.normalized LIKE '%' || r.brand_lc || '%'
        THEN 1.10
        ELSE 0.0
      END + CASE
        -- explicit pet species rank alignment$patch$;

  function_sql := replace(
    function_sql,
    'END + CASE
        -- explicit pet species rank alignment',
    brand_adjustment
  );

  IF regexp_count(function_sql, 'explicit brand phrase rank alignment') <> 2 THEN
    RAISE EXCEPTION 'search_products brand alignment patch failed';
  END IF;

  EXECUTE function_sql;
END $$;
