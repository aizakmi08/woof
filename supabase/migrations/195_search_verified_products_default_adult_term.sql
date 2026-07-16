-- Retailer/community titles often include "Adult" for default adult foods
-- even when the official manufacturer title omits it. Keep adult as a
-- protected term when a product has puppy, kitten, senior, mature, small,
-- toy, or large-breed identity, but allow default adult queries to match
-- verified rows with no conflicting life-stage/breed-size signal.

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.search_verified_products(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'search_verified_products(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%FROM query_required_terms qrt%WHERE r.identity_lc !~%' THEN
    RAISE EXCEPTION 'search_verified_products required-term guard not found';
  END IF;

  IF function_sql NOT LIKE '%default adult verified-search term%' THEN
    function_sql := replace(
      function_sql,
      $old$      AND NOT EXISTS (
        SELECT 1
        FROM query_required_terms qrt
        WHERE r.identity_lc !~ ('\m' || qrt.term || '\M')
      )$old$,
      $new$      AND NOT EXISTS (
        SELECT 1
        FROM query_required_terms qrt
        WHERE r.identity_lc !~ ('\m' || qrt.term || '\M')
          AND NOT (
            qrt.term = 'adult'
            -- default adult verified-search term
            AND query.normalized !~ '\m(puppy|kitten|senior|mature|small|toy|large)\M'
            AND r.identity_lc !~ '\m(puppy|kitten|senior|mature|small|toy|large)\M'
          )
      )$new$
    );
  END IF;

  IF function_sql NOT LIKE '%default adult verified-search term%' THEN
    RAISE EXCEPTION 'search_verified_products default adult term patch failed';
  END IF;

  function_sql := replace(
    function_sql,
    $old$                AND r.identity_lc !~ ('\m' || identity_token.term || '\M')
                AND NOT (
                  length(identity_token.term) > 3
                  AND right(identity_token.term, 1) = 's'
                  AND r.identity_lc ~ ('\m' || left(identity_token.term, length(identity_token.term) - 1) || '\M')
                )$old$,
    $new$                AND r.identity_lc !~ ('\m' || identity_token.term || '\M')
                AND NOT (
                  identity_token.term = 'adult'
                  -- default adult verified-search token
                  AND query.normalized !~ '\m(puppy|kitten|senior|mature|small|toy|large)\M'
                  AND r.identity_lc !~ '\m(puppy|kitten|senior|mature|small|toy|large)\M'
                )
                AND NOT (
                  length(identity_token.term) > 3
                  AND right(identity_token.term, 1) = 's'
                  AND r.identity_lc ~ ('\m' || left(identity_token.term, length(identity_token.term) - 1) || '\M')
                )$new$
  );

  function_sql := replace(
    function_sql,
    $old$              AND r.identity_lc !~ ('\m' || identity_token.term || '\M')
              AND NOT (
                length(identity_token.term) > 3
                AND right(identity_token.term, 1) = 's'
                AND r.identity_lc ~ ('\m' || left(identity_token.term, length(identity_token.term) - 1) || '\M')
              )$old$,
    $new$              AND r.identity_lc !~ ('\m' || identity_token.term || '\M')
              AND NOT (
                identity_token.term = 'adult'
                -- default adult verified-search token
                AND query.normalized !~ '\m(puppy|kitten|senior|mature|small|toy|large)\M'
                AND r.identity_lc !~ '\m(puppy|kitten|senior|mature|small|toy|large)\M'
              )
              AND NOT (
                length(identity_token.term) > 3
                AND right(identity_token.term, 1) = 's'
                AND r.identity_lc ~ ('\m' || left(identity_token.term, length(identity_token.term) - 1) || '\M')
              )$new$
  );

  IF regexp_count(function_sql, 'default adult verified-search token') < 3 THEN
    RAISE EXCEPTION 'search_verified_products default adult token patch failed';
  END IF;

  EXECUTE function_sql;
END $$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;
