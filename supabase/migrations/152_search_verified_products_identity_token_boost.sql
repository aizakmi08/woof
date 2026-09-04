-- Let strict verified search return a source-backed row when every meaningful
-- query token is present in the verified product identity, even if full-text
-- tokenization differs on punctuation or possession, e.g. "harveys" vs
-- "Harvey's".

DO $$
DECLARE
  function_sql TEXT;
  original_sql TEXT;
  species_rank_block TEXT;
  identity_token_boost_block TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO function_sql
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'search_verified_products'
    AND pg_get_function_identity_arguments(p.oid) = 'q text, max_results integer';

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'search_verified_products(q text, max_results integer) not found';
  END IF;

  IF function_sql LIKE '%verified identity all-token coverage boost%' THEN
    RETURN;
  END IF;

  original_sql := function_sql;
  species_rank_block := $old$        CASE
          WHEN query.query_has_dog AND r.pet_type = 'dog' THEN 0.8
          WHEN query.query_has_cat AND r.pet_type = 'cat' THEN 0.8
          ELSE 0.0
        END +
        COALESCE(ts_rank_cd(r.search_document, query.ts_query), 0.0) * 1.4 +$old$;
  identity_token_boost_block := $new$        CASE
          WHEN query.query_has_dog AND r.pet_type = 'dog' THEN 0.8
          WHEN query.query_has_cat AND r.pet_type = 'cat' THEN 0.8
          ELSE 0.0
        END +
        CASE
          -- verified identity all-token coverage boost
          WHEN EXISTS (
            SELECT 1
            FROM regexp_split_to_table(query.normalized, '\s+') AS identity_token(term)
            WHERE length(identity_token.term) > 2
              AND identity_token.term NOT IN (
                'and', 'the', 'with', 'for', 'from', 'food', 'foods',
                'dog', 'dogs', 'puppy', 'puppies',
                'cat', 'cats', 'kitten', 'kittens'
              )
          )
            AND NOT EXISTS (
              SELECT 1
              FROM regexp_split_to_table(query.normalized, '\s+') AS identity_token(term)
              WHERE length(identity_token.term) > 2
                AND identity_token.term NOT IN (
                  'and', 'the', 'with', 'for', 'from', 'food', 'foods',
                  'dog', 'dogs', 'puppy', 'puppies',
                  'cat', 'cats', 'kitten', 'kittens'
                )
                AND r.identity_lc !~ ('\m' || identity_token.term || '\M')
                AND NOT (
                  length(identity_token.term) > 3
                  AND right(identity_token.term, 1) = 's'
                  AND r.identity_lc ~ ('\m' || left(identity_token.term, length(identity_token.term) - 1) || '\M')
                )
            )
          THEN 3.6
          ELSE 0.0
        END +
        COALESCE(ts_rank_cd(r.search_document, query.ts_query), 0.0) * 1.4 +$new$;

  function_sql := replace(function_sql, species_rank_block, identity_token_boost_block);

  IF function_sql = original_sql THEN
    RAISE EXCEPTION 'search_verified_products identity token boost patch target not found';
  END IF;

  IF regexp_count(function_sql, 'verified identity all-token coverage boost') <> 1 THEN
    RAISE EXCEPTION 'search_verified_products identity token boost patch failed';
  END IF;

  EXECUTE function_sql;
END $$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;
