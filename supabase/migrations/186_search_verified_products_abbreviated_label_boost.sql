-- Shelf label photos and user searches often capture the visible product line
-- and main protein but omit default side terms such as "Adult" or "Brown Rice".
-- Keep hard variant guards intact, but rescue strong all-token matches when the
-- only omitted protected terms are common default/side terms.

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.search_verified_products(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'search_verified_products(text, integer) not found';
  END IF;

  IF function_sql LIKE '%verified omitted default side-term rescue boost%' THEN
    RETURN;
  END IF;

  function_sql := replace(
    function_sql,
    $old$          THEN 5.2
          ELSE 0.0
        END +
        CASE
          -- verified extra protected-term penalty$old$,
    $new$          THEN 5.2
          ELSE 0.0
        END +
        CASE
          -- verified omitted default side-term rescue boost
          WHEN (
            SELECT count(*)::INTEGER
            FROM regexp_split_to_table(query.normalized, '\s+') AS identity_token(term)
            WHERE length(identity_token.term) > 2
              AND identity_token.term NOT IN (
                'and', 'the', 'with', 'for', 'from', 'food', 'foods', 'pet',
                'dog', 'dogs', 'puppy', 'puppies',
                'cat', 'cats', 'kitten', 'kittens'
              )
          ) >= 4
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
            AND EXISTS (
              SELECT 1
              FROM (VALUES
                ('adult'), ('senior'), ('puppy'), ('kitten'), ('small'), ('toy'), ('large'),
                ('weight'), ('indoor'), ('hairball'), ('sensitive'), ('digestive'), ('urinary'),
                ('mobility'), ('joint'), ('skin'), ('coat'), ('hydrolyzed'), ('vegetarian'),
                ('salmon'), ('chicken'), ('beef'), ('turkey'), ('lamb'), ('duck'), ('fish'),
                ('whitefish'), ('ocean'), ('tuna'), ('trout'), ('venison'), ('bison'), ('broth'),
                ('crab'), ('pollock'), ('cod'), ('liver'), ('mackerel'), ('mousse'), ('sole'),
                ('shrimp'), ('prawn'), ('prawns'), ('pumpkin'), ('quail'), ('rabbit'), ('sardine'),
                ('sardines'), ('seabass'), ('tilapia'), ('cluster'), ('clusters'), ('dehydrated'),
                ('cuts'), ('gravy'), ('loaf'), ('minced'), ('morsels'), ('oatmeal'), ('pate'),
                ('pat'), ('rice'), ('shreds'), ('stew'), ('stews'), ('potato'), ('sweet'),
                ('wholemade'), ('prime'), ('rib'), ('filet'), ('mignon'), ('giblets')
              ) AS extra_term(term)
              WHERE query.normalized !~ ('\m' || extra_term.term || '\M')
                AND r.identity_lc ~ ('\m' || extra_term.term || '\M')
                AND extra_term.term IN ('adult', 'rice', 'oatmeal', 'potato', 'sweet')
            )
            AND NOT EXISTS (
              SELECT 1
              FROM (VALUES
                ('adult'), ('senior'), ('puppy'), ('kitten'), ('small'), ('toy'), ('large'),
                ('weight'), ('indoor'), ('hairball'), ('sensitive'), ('digestive'), ('urinary'),
                ('mobility'), ('joint'), ('skin'), ('coat'), ('hydrolyzed'), ('vegetarian'),
                ('salmon'), ('chicken'), ('beef'), ('turkey'), ('lamb'), ('duck'), ('fish'),
                ('whitefish'), ('ocean'), ('tuna'), ('trout'), ('venison'), ('bison'), ('broth'),
                ('crab'), ('pollock'), ('cod'), ('liver'), ('mackerel'), ('mousse'), ('sole'),
                ('shrimp'), ('prawn'), ('prawns'), ('pumpkin'), ('quail'), ('rabbit'), ('sardine'),
                ('sardines'), ('seabass'), ('tilapia'), ('cluster'), ('clusters'), ('dehydrated'),
                ('cuts'), ('gravy'), ('loaf'), ('minced'), ('morsels'), ('oatmeal'), ('pate'),
                ('pat'), ('rice'), ('shreds'), ('stew'), ('stews'), ('potato'), ('sweet'),
                ('wholemade'), ('prime'), ('rib'), ('filet'), ('mignon'), ('giblets')
              ) AS extra_term(term)
              WHERE query.normalized !~ ('\m' || extra_term.term || '\M')
                AND r.identity_lc ~ ('\m' || extra_term.term || '\M')
                AND extra_term.term NOT IN ('adult', 'rice', 'oatmeal', 'potato', 'sweet')
            )
          THEN 3.0
          ELSE 0.0
        END +
        CASE
          -- verified extra protected-term penalty$new$
  );

  IF function_sql NOT LIKE '%verified omitted default side-term rescue boost%' THEN
    RAISE EXCEPTION 'search_verified_products abbreviated label boost patch target not found';
  END IF;

  IF function_sql NOT LIKE '%extra_term.term IN (''adult'', ''rice'', ''oatmeal'', ''potato'', ''sweet'')%' THEN
    RAISE EXCEPTION 'search_verified_products abbreviated label boost weak-term guard missing';
  END IF;

  EXECUTE function_sql;
END $$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;
