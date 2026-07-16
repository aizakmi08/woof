-- Exact recipe searches should not rank a sibling formula higher just because it
-- contains all query terms plus an extra protected protein/flavor term.

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.search_verified_products(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'search_verified_products(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%''crab''%' THEN
    function_sql := replace(
      function_sql,
      $old$      'giblets'
    )$old$,
      $new$      'giblets',
      'broth',
      'crab',
      'liver',
      'mackerel',
      'mousse',
      'prawn',
      'prawns',
      'pumpkin',
      'quail',
      'rabbit',
      'sardine',
      'sardines',
      'seabass',
      'tilapia'
    )$new$
    );
  END IF;

  IF function_sql NOT LIKE '%verified extra protected-term penalty%' THEN
    function_sql := replace(
      function_sql,
      $old$        COALESCE(ts_rank_cd(r.search_document, query.ts_query), 0.0) * 1.4 +
$old$,
      $new$        CASE
          -- verified extra protected-term penalty
          WHEN EXISTS (SELECT 1 FROM query_required_terms) THEN
            -2.5 * (
              SELECT count(*)::REAL
              FROM (VALUES
                ('adult'),
                ('senior'),
                ('puppy'),
                ('kitten'),
                ('small'),
                ('large'),
                ('weight'),
                ('indoor'),
                ('hairball'),
                ('sensitive'),
                ('digestive'),
                ('urinary'),
                ('mobility'),
                ('joint'),
                ('skin'),
                ('coat'),
                ('hydrolyzed'),
                ('vegetarian'),
                ('salmon'),
                ('chicken'),
                ('beef'),
                ('turkey'),
                ('lamb'),
                ('duck'),
                ('fish'),
                ('whitefish'),
                ('ocean'),
                ('tuna'),
                ('trout'),
                ('venison'),
                ('bison'),
                ('broth'),
                ('crab'),
                ('pollock'),
                ('cod'),
                ('liver'),
                ('mackerel'),
                ('mousse'),
                ('sole'),
                ('shrimp'),
                ('prawn'),
                ('prawns'),
                ('pumpkin'),
                ('quail'),
                ('rabbit'),
                ('sardine'),
                ('sardines'),
                ('seabass'),
                ('tilapia'),
                ('cluster'),
                ('clusters'),
                ('dehydrated'),
                ('cuts'),
                ('gravy'),
                ('loaf'),
                ('minced'),
                ('morsels'),
                ('oatmeal'),
                ('pate'),
                ('pat'),
                ('rice'),
                ('shreds'),
                ('stew'),
                ('stews'),
                ('potato'),
                ('sweet'),
                ('wholemade'),
                ('prime'),
                ('rib'),
                ('filet'),
                ('mignon'),
                ('giblets')
              ) AS extra_term(term)
              WHERE query.normalized !~ ('\m' || extra_term.term || '\M')
                AND r.identity_lc ~ ('\m' || extra_term.term || '\M')
            )
          ELSE 0.0
        END +
        COALESCE(ts_rank_cd(r.search_document, query.ts_query), 0.0) * 1.4 +
$new$
    );
  END IF;

  IF function_sql NOT LIKE '%verified extra protected-term penalty%' THEN
    RAISE EXCEPTION 'extra protected-term penalty was not applied';
  END IF;

  IF function_sql NOT LIKE '%''pumpkin''%' OR function_sql NOT LIKE '%''rabbit''%' THEN
    RAISE EXCEPTION 'expanded protected recipe terms were not applied';
  END IF;

  EXECUTE function_sql;
END $$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;
