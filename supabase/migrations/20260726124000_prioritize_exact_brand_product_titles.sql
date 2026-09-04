-- An exact "<brand> <product name>" query is stronger identity evidence than
-- a longer retailer merchandising title that happens to share many tokens.
-- Apply the same deterministic bonus in both strict and fuzzy ranking paths.
-- Species, recipe, life-stage, texture, and other existing hard/negative
-- guards remain unchanged.

DO $$
DECLARE
  function_sql TEXT;
  exact_title_adjustment TEXT;
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

  IF function_sql LIKE '%exact brand and product title rank alignment%' THEN
    RETURN;
  END IF;

  IF regexp_count(function_sql, 'explicit brand phrase rank alignment') <> 2 THEN
    RAISE EXCEPTION 'search_products brand alignment block count unexpected';
  END IF;

  exact_title_adjustment := $patch$END + CASE
        -- exact brand and product title rank alignment
        WHEN r.brand_lc IS NOT NULL
          AND r.product_name_lc IS NOT NULL
          AND query.normalized = concat_ws(' ', r.brand_lc, r.product_name_lc)
        THEN 4.00
        ELSE 0.0
      END + CASE
        -- explicit brand phrase rank alignment$patch$;

  function_sql := replace(
    function_sql,
    'END + CASE
        -- explicit brand phrase rank alignment',
    exact_title_adjustment
  );

  IF regexp_count(function_sql, 'exact brand and product title rank alignment') <> 2 THEN
    RAISE EXCEPTION 'search_products exact brand-title alignment patch failed';
  END IF;

  EXECUTE function_sql;
END $$;
