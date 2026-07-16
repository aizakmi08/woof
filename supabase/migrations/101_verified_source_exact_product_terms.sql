-- Add a conservative exact-product-token boost for verified source rows.
-- This helps official rows beat long unverified retailer titles and source
-- sibling formulas, while guarding against common grain-free/whole-grain
-- confusion.

DO $$
DECLARE
  function_sql TEXT;
  exact_product_bonus TEXT;
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

  IF function_sql LIKE '%verified source exact product terms%' THEN
    RETURN;
  END IF;

  exact_product_bonus := 'END + CASE
        -- verified source exact product terms
        WHEN r.verified_source_rank_bonus > 0
          AND r.brand_lc IS NOT NULL
          AND query.normalized LIKE ''%'' || r.brand_lc || ''%''
          AND NOT (query.query_has_dog AND r.pet_type = ''cat'')
          AND NOT (query.query_has_cat AND r.pet_type = ''dog'')
          AND NOT (
            query.normalized ~ ''\mgrain free\M''
            AND r.identity_lc ~ ''\mwhole grain\M''
          )
          AND NOT EXISTS (
            SELECT 1
            FROM unnest(regexp_split_to_array(COALESCE(r.product_name_lc, ''''), '' '')) AS token(value)
            WHERE length(token.value) >= 4
              AND token.value NOT IN (
                ''adult'', ''breed'', ''breeds'', ''clusters'', ''dog'', ''dogs'',
                ''food'', ''foods'', ''free'', ''grain'', ''kitten'', ''large'',
                ''puppy'', ''recipe'', ''small'', ''whole'', ''with''
              )
              AND query.normalized !~ (''\m'' || token.value || ''\M'')
          )
        THEN 1.20
        ELSE 0.0
      END + CASE
        WHEN r.identity_lc LIKE';

  function_sql := replace(
    function_sql,
    'END + CASE
        WHEN r.identity_lc LIKE',
    exact_product_bonus
  );

  IF regexp_count(function_sql, 'verified source exact product terms') <> 2 THEN
    RAISE EXCEPTION 'search_products exact source product term patch failed';
  END IF;

  EXECUTE function_sql;
END $$;
