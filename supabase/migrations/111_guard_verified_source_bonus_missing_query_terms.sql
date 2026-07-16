-- Do not let source-backed verified siblings outrank exact-but-unverified rows
-- when the verified row is missing important recipe or variant terms from the
-- user's query. Verified rows can still appear, but without the source bonus.

DO $$
DECLARE
  function_sql TEXT;
  guarded_bonus TEXT;
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

  IF function_sql LIKE '%verified source base bonus requires important terms%' THEN
    RETURN;
  END IF;

  IF regexp_count(function_sql, 'THEN r\.verified_source_rank_bonus') <> 2 THEN
    RAISE EXCEPTION 'search_products verified source bonus block count unexpected';
  END IF;

  guarded_bonus := $patch$THEN CASE
          -- verified source base bonus requires important terms
          WHEN NOT EXISTS (
            SELECT 1
            FROM unnest(regexp_split_to_array(query.normalized, ' ')) AS query_token(value)
            WHERE query_token.value IN (
              'adult', 'senior', 'puppy', 'kitten', 'small', 'large',
              'weight', 'healthy', 'indoor', 'hairball', 'sensitive',
              'digestive', 'urinary', 'mobility', 'joint', 'skin', 'coat',
              'hydrolyzed', 'vegetarian', 'salmon', 'chicken', 'beef',
              'turkey', 'lamb', 'duck', 'fish', 'whitefish', 'ocean',
              'tuna', 'trout', 'venison', 'bison', 'pollock', 'cod',
              'sole', 'shrimp', 'oatmeal', 'rice', 'potato', 'sweet',
              'prime', 'rib', 'filet', 'mignon', 'giblets'
            )
              AND r.identity_lc !~ ('\m' || query_token.value || '\M')
          )
          THEN r.verified_source_rank_bonus
          ELSE 0.0
        END$patch$;

  function_sql := replace(
    function_sql,
    'THEN r.verified_source_rank_bonus',
    guarded_bonus
  );

  IF regexp_count(function_sql, 'verified source base bonus requires important terms') <> 2 THEN
    RAISE EXCEPTION 'search_products verified source bonus guard patch failed';
  END IF;

  EXECUTE function_sql;
END $$;
