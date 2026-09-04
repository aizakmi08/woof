-- Species terms should constrain pet_type, not require the literal word "cat"
-- or "dog" to appear in the product name. Keep strict identity coverage for
-- the remaining meaningful query tokens so normal searches like
-- "Naturally Healthy chicken goat milk cat" can return verified cat rows.

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.search_verified_products(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'search_verified_products(text, integer) not found';
  END IF;

  IF function_sql LIKE '%verified identity all-token candidate coverage%' THEN
    RETURN;
  END IF;

  function_sql := replace(
    function_sql,
    $old$        OR (
          query.normalized !~ '\m[a-z0-9]{9,}\M'
          AND word_similarity(query.normalized, r.identity_lc) > 0.70
        )$old$,
    $new$        OR (
          query.normalized !~ '\m[a-z0-9]{9,}\M'
          AND word_similarity(query.normalized, r.identity_lc) > 0.70
        )
        OR (
          -- verified identity all-token candidate coverage
          EXISTS (
            SELECT 1
            FROM regexp_split_to_table(query.normalized, '\s+') AS identity_token(term)
            WHERE length(identity_token.term) > 2
              AND identity_token.term NOT IN (
                'and', 'the', 'with', 'for', 'from', 'food', 'foods', 'pet',
                'dog', 'dogs', 'puppy', 'puppies',
                'cat', 'cats', 'kitten', 'kittens'
              )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM regexp_split_to_table(query.normalized, '\s+') AS identity_token(term)
            WHERE length(identity_token.term) > 2
              AND identity_token.term NOT IN (
                'and', 'the', 'with', 'for', 'from', 'food', 'foods', 'pet',
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
        )$new$
  );

  IF function_sql NOT LIKE '%verified identity all-token candidate coverage%' THEN
    RAISE EXCEPTION 'search_verified_products species metadata candidate patch failed';
  END IF;

  EXECUTE function_sql;
END $$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;
