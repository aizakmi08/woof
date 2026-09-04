-- Wellness retailer titles often contain filler words that are not part of the
-- manufacturer identity, e.g. "Wholesome Grain Kibble" or "Natural, Protein
-- Rich". Keep recipe/flavor guards intact, but do not require those filler
-- terms for strict source-backed reconciliation.

CREATE OR REPLACE FUNCTION public.catalog_verified_search_retailer_identity_covered(
  p_query_norm TEXT,
  p_identity_lc TEXT,
  p_brand_lc TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT
      COALESCE(p_query_norm, '') AS query_norm,
      COALESCE(p_identity_lc, '') AS identity_lc,
      NULLIF(trim(COALESCE(p_brand_lc, '')), '') AS brand_lc
  ),
  query_tokens AS (
    SELECT DISTINCT token.term
    FROM normalized n
    CROSS JOIN LATERAL regexp_split_to_table(n.query_norm, '\s+') AS token(term)
    WHERE length(token.term) >= 3
      AND token.term !~ '^[0-9]+$'
      AND token.term NOT IN (
        'adult', -- default adult can be omitted from manufacturer titles
        'and', 'bag', 'bags', 'can', 'cans', 'canned', 'cat', 'cats', 'dog',
        'dogs', 'dry', 'flavor',
        'flavors', 'food', 'foods', 'for', 'formula', 'from', 'high',
        'grain', 'grains', 'ingredient', 'ingredients', 'kibble', 'lb', 'lbs', 'meal',
        'natural', 'ounce', 'ounces', 'pack', 'packs', 'pet', 'premium',
        'protein', 'recipe', 'recipes', 'rich', 'the', 'wet',
        'wholesome', 'with'
      )
  )
  SELECT
    n.brand_lc IS NOT NULL
    AND n.query_norm LIKE '%' || n.brand_lc || '%'
    AND (SELECT count(*) FROM query_tokens) >= 4
    AND NOT EXISTS (
      SELECT 1
      FROM query_tokens qt
      WHERE n.identity_lc !~ ('\m' || qt.term || '\M')
        AND NOT (
          length(qt.term) > 3
          AND right(qt.term, 1) = 's'
          AND n.identity_lc ~ ('\m' || left(qt.term, length(qt.term) - 1) || '\M')
        )
        AND NOT (
          qt.term = 'brown'
          AND n.query_norm ~ '\mrice\M'
          AND n.identity_lc ~ '\mrice\M'
        )
    )
  FROM normalized n;
$$;

REVOKE ALL ON FUNCTION public.catalog_verified_search_retailer_identity_covered(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_verified_search_retailer_identity_covered(TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.catalog_verified_search_retailer_identity_covered(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_verified_search_retailer_identity_covered(TEXT, TEXT, TEXT) TO service_role;

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.search_verified_products(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'search_verified_products(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%retailer noise identity coverage boost%' THEN
    function_sql := replace(
      function_sql,
      $old$        CASE
          -- verified extra protected-term penalty$old$,
      $new$        CASE
          -- retailer noise identity coverage boost
          WHEN public.catalog_verified_search_retailer_identity_covered(
            query.normalized,
            r.identity_lc,
            r.brand_lc
          )
          THEN 4.8
          ELSE 0.0
        END +
        CASE
          -- verified extra protected-term penalty$new$
    );
  END IF;

  IF function_sql NOT LIKE '%catalog_verified_search_retailer_identity_covered%' THEN
    RAISE EXCEPTION 'search_verified_products retailer noise rank boost patch failed';
  END IF;

  IF function_sql NOT LIKE '%retailer noise identity retrieval%' THEN
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
          -- retailer noise identity retrieval
          public.catalog_verified_search_retailer_identity_covered(
            query.normalized,
            r.identity_lc,
            r.brand_lc
          )
        )$new$
    );
  END IF;

  IF function_sql NOT LIKE '%retailer noise identity retrieval%' THEN
    RAISE EXCEPTION 'search_verified_products retailer noise retrieval patch failed';
  END IF;

  IF function_sql NOT LIKE '%grained required-term equivalence%' THEN
    function_sql := replace(
      function_sql,
      $old$          AND NOT (
            qrt.term = 'adult'
            -- default adult verified-search term
            AND query.normalized !~ '\m(puppy|kitten|senior|mature|small|toy|large)\M'
            AND r.identity_lc !~ '\m(puppy|kitten|senior|mature|small|toy|large)\M'
          )$old$,
      $new$          AND NOT (
            qrt.term = 'adult'
            -- default adult verified-search term
            AND query.normalized !~ '\m(puppy|kitten|senior|mature|small|toy|large)\M'
            AND r.identity_lc !~ '\m(puppy|kitten|senior|mature|small|toy|large)\M'
          )
          AND NOT (
            qrt.term IN ('grain', 'grains')
            -- grained required-term equivalence
            AND r.identity_lc ~ '\mgrained\M'
          )$new$
    );
  END IF;

  IF function_sql NOT LIKE '%grained required-term equivalence%' THEN
    RAISE EXCEPTION 'search_verified_products grained required-term equivalence patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.catalog_acquisition_strict_search_high_confidence(text, text, text, text, text, text, real)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'catalog_acquisition_strict_search_high_confidence not found';
  END IF;

  function_sql := replace(
    function_sql,
    '''hill'', ''hills'', ''ingredients'', ''made'', ''natural'', ''nutrition'',',
    '''hill'', ''hills'', ''high'', ''ingredients'', ''kibble'', ''made'', ''meal'',
      ''natural'', ''nutrition'', ''ounce'', ''ounces'', ''protein'', ''rich'','
  );

  function_sql := replace(
    function_sql,
    '''premium'', ''recipe'', ''recipes'', ''royal'', ''science'', ''size'',',
    '''premium'', ''recipe'', ''recipes'', ''royal'', ''science'', ''size'', ''smooth'','
  );

  function_sql := replace(
    function_sql,
    '''the'', ''wet'', ''with''',
    '''the'', ''wet'', ''wholesome'', ''with'''
  );

  function_sql := replace(
    function_sql,
    '''and'', ''blue'', ''breed'',',
    '''and'', ''blue'', ''breed'', ''brown'','
  );

  function_sql := replace(
    function_sql,
    $$    WHERE NOT q_required.term = ANY(c_terms)$$,
    $$    WHERE NOT q_required.term = ANY(c_terms)
      AND NOT (
        q_required.term = 'brown'
        AND 'rice' = ANY(q_terms)
        AND 'rice' = ANY(c_terms)
      )$$
  );

  function_sql := replace(
    function_sql,
    $$    WHERE NOT c_extra.term = ANY(q_terms)$$,
    $$    WHERE NOT c_extra.term = ANY(q_terms)
      AND NOT (
        c_extra.term = 'brown'
        AND 'rice' = ANY(q_terms)
        AND 'rice' = ANY(c_terms)
      )$$
  );

  IF function_sql NOT LIKE '%''kibble''%'
     OR function_sql NOT LIKE '%''wholesome''%'
     OR function_sql NOT LIKE '%q_required.term = ''brown''%'
     OR function_sql NOT LIKE '%c_extra.term = ''brown''%' THEN
    RAISE EXCEPTION 'Wellness retailer-title strict reconcile patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) TO service_role;

DO $$
BEGIN
  IF NOT public.catalog_verified_search_retailer_identity_covered(
    'wellness complete health puppy dry dog food wholesome grain kibble natural chicken oatmeal and salmon recipe',
    'wellness wellness complete health puppy chicken salmon oatmeal wellness complete health chicken puppy dry',
    'wellness'
  ) THEN
    RAISE EXCEPTION 'retailer-noise search coverage should retrieve Wellness puppy chicken salmon oatmeal';
  END IF;

  IF public.catalog_verified_search_retailer_identity_covered(
    'wellness complete health toy breed adult dry dog food wholesome grain kibble natural chicken brown rice and peas recipe',
    'wellness wellness complete health toy breed chicken rice wellness complete health toy breed chicken rice dry',
    'wellness'
  ) THEN
    RAISE EXCEPTION 'retailer-noise search coverage must not ignore missing peas';
  END IF;

  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Wellness',
    'Wellness Complete Health Puppy Dry Dog Food, Wholesome Grain Kibble, Natural, Chicken, Oatmeal, and Salmon Recipe',
    'dog',
    'Wellness',
    'Wellness Complete Health Puppy Chicken, Salmon & Oatmeal Wellness Complete Health Chicken puppy dry',
    'dog',
    6.2
  ) THEN
    RAISE EXCEPTION 'Wellness puppy chicken oatmeal salmon retailer title should reconcile to official verified row';
  END IF;

  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Wellness',
    'Wellness Complete Health Large Breed Dry Puppy Food, Chicken, Brown Rice & Salmon Meal',
    'dog',
    'Wellness',
    'Wellness Complete Health Large Breed Puppy Chicken, Salmon & Rice Wellness Complete Health Large Breed Chicken puppy dry',
    'dog',
    6.2
  ) THEN
    RAISE EXCEPTION 'Wellness large breed puppy brown-rice retailer title should reconcile to official rice row';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Wellness',
    'Wellness Complete Health Toy Breed Adult Dry Dog Food, Wholesome Grain Kibble, Natural, Chicken, Brown Rice, and Peas Recipe',
    'dog',
    'Wellness',
    'Wellness Complete Health Toy Breed Chicken & Rice Wellness Complete Health Toy Breed Chicken Rice dry',
    'dog',
    6.2
  ) THEN
    RAISE EXCEPTION 'Wellness toy breed chicken brown rice peas must not reconcile to official row missing peas';
  END IF;
END $$;
