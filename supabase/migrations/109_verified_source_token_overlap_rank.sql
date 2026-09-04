-- Prefer source-backed products with verified ingredients and images over
-- legacy exact-text rows, but only when the source row overlaps on distinctive
-- product terms and does not miss important query recipe/variant terms.

DO $$
DECLARE
  function_sql TEXT;
  overlap_bonus TEXT;
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

  IF function_sql LIKE '%verified source distinctive token overlap%' THEN
    RETURN;
  END IF;

  IF regexp_count(function_sql, 'verified source exact product terms') <> 2 THEN
    RAISE EXCEPTION 'search_products exact source product term block not found';
  END IF;

  overlap_bonus := $patch$END + CASE
        -- verified source distinctive token overlap
        WHEN r.verified_source_rank_bonus > 0
          AND r.brand_lc IS NOT NULL
          AND query.normalized LIKE '%' || r.brand_lc || '%'
          AND NOT (query.query_has_dog AND r.pet_type = 'cat')
          AND NOT (query.query_has_cat AND r.pet_type = 'dog')
          AND NOT EXISTS (
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
          AND (
            SELECT count(DISTINCT token.value)
            FROM unnest(regexp_split_to_array(COALESCE(r.product_name_lc, ''), ' ')) AS token(value)
            WHERE length(token.value) >= 4
              AND token.value NOT IN (
                'adult', 'blue', 'buffalo', 'clusters', 'complete', 'delight',
                'delights', 'diets', 'dogs', 'food', 'foods', 'formula',
                'free', 'grain', 'healthy', 'kitten', 'large', 'natural',
                'plan', 'pro', 'purina', 'puppy', 'recipe', 'small',
                'tastefuls', 'veterinary', 'whole', 'with'
              )
              AND query.normalized ~ ('\m' || token.value || '\M')
          ) >= 3
        THEN 2.75
        WHEN r.verified_source_rank_bonus > 0
          AND r.brand_lc IS NOT NULL
          AND query.normalized LIKE '%' || r.brand_lc || '%'
          AND NOT (query.query_has_dog AND r.pet_type = 'cat')
          AND NOT (query.query_has_cat AND r.pet_type = 'dog')
          AND NOT EXISTS (
            SELECT 1
            FROM unnest(regexp_split_to_array(query.normalized, ' ')) AS query_token(value)
            WHERE query_token.value IN (
              'senior', 'puppy', 'kitten', 'small', 'large', 'weight',
              'urinary', 'hydrolyzed', 'vegetarian', 'salmon', 'chicken',
              'beef', 'turkey', 'lamb', 'duck', 'fish', 'whitefish',
              'tuna', 'oatmeal', 'rice', 'potato', 'prime', 'rib',
              'filet', 'mignon', 'giblets'
            )
              AND r.identity_lc !~ ('\m' || query_token.value || '\M')
          )
          AND (
            SELECT count(DISTINCT token.value)
            FROM unnest(regexp_split_to_array(COALESCE(r.product_name_lc, ''), ' ')) AS token(value)
            WHERE length(token.value) >= 4
              AND token.value NOT IN (
                'adult', 'blue', 'buffalo', 'clusters', 'complete', 'delight',
                'delights', 'diets', 'dogs', 'food', 'foods', 'formula',
                'free', 'grain', 'healthy', 'kitten', 'large', 'natural',
                'plan', 'pro', 'purina', 'puppy', 'recipe', 'small',
                'tastefuls', 'veterinary', 'whole', 'with'
              )
              AND query.normalized ~ ('\m' || token.value || '\M')
          ) >= 2
          AND (
            r.identity_lc LIKE '%' || query.normalized || '%'
            OR word_similarity(query.normalized, r.identity_lc) > 0.62
            OR word_similarity(query.normalized, r.brand_lc || ' ' || r.product_name_lc) > 0.62
          )
        THEN 1.25
        ELSE 0.0
      END + CASE
        -- verified source exact product terms$patch$;

  function_sql := replace(
    function_sql,
    'END + CASE
        -- verified source exact product terms',
    overlap_bonus
  );

  IF regexp_count(function_sql, 'verified source distinctive token overlap') <> 2 THEN
    RAISE EXCEPTION 'search_products distinctive source token overlap patch failed';
  END IF;

  EXECUTE function_sql;
END $$;
