-- Label photos and retailer titles often use packaging words or legacy line
-- names that differ from the current official catalog title. Normalize those
-- terms before verified search, and let official source URL slugs contribute
-- to strict identity matching for source-backed catalog rows.

CREATE OR REPLACE FUNCTION public.normalize_verified_product_search_query(q TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  WITH cleaned AS (
    SELECT regexp_replace(
      extensions.unaccent(lower(trim(COALESCE(q, '')))),
      '[^a-z0-9]+',
      ' ',
      'g'
    ) AS value
  ),
  phrase_synonyms AS (
    SELECT regexp_replace(value, '\mdivine delights\M', 'blue delights', 'g') AS value
    FROM cleaned
  ),
  singularized AS (
    SELECT regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(value, '\mpuppies\M', 'puppy', 'g'),
          '\mkittens\M',
          'kitten',
          'g'
        ),
        '\mdogs\M',
        'dog',
        'g'
      ),
      '\mcats\M',
      'cat',
      'g'
    ) AS value
    FROM phrase_synonyms
  ),
  size_stripped AS (
    SELECT regexp_replace(
      value,
      '\m[0-9]+( [0-9]+)? (lb|lbs|oz|ounce|ounces|pound|pounds|kg|g|gram|grams|bag|bags)\M',
      ' ',
      'g'
    ) AS value
    FROM singularized
  ),
  noise_stripped AS (
    SELECT regexp_replace(
      value,
      '\m(natural|ingredients?|artificial|flavors?|preservatives?|healthy|growth|formula|dha|savory|recipe|canned|dinner|hearty|bag|bags|lb|lbs|oz|ounce|ounces|pound|pounds|kg|g|gram|grams|with|for|food|foods)\M',
      ' ',
      'g'
    ) AS value
    FROM size_stripped
  ),
  normalized AS (
    SELECT regexp_replace(value, '\s+', ' ', 'g') AS value
    FROM noise_stripped
  )
  SELECT NULLIF(trim(value), '')
  FROM normalized;
$$;

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.search_verified_products(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'search_verified_products(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%pd.source_url%' THEN
    RAISE EXCEPTION 'search_verified_products source_url return column not found';
  END IF;

  IF function_sql NOT LIKE '%pd.gtin,%pd.source_url%AS identity_lc%' THEN
    function_sql := replace(
      function_sql,
      $old$        pd.food_form,
        pd.package_size,
        pd.gtin
      ))), '[^a-z0-9]+', ' ', 'g')), '') AS identity_lc$old$,
      $new$        pd.food_form,
        pd.package_size,
        pd.gtin,
        pd.source_url
      ))), '[^a-z0-9]+', ' ', 'g')), '') AS identity_lc$new$
    );
  END IF;

  IF function_sql NOT LIKE '%pd.gtin,%pd.source_url%AS identity_lc%' THEN
    RAISE EXCEPTION 'search_verified_products source URL identity patch failed';
  END IF;

  IF function_sql NOT LIKE '%verified omitted grain variant penalty%' THEN
    function_sql := replace(
      function_sql,
      $old$        COALESCE(ts_rank_cd(r.search_document, query.ts_query), 0.0) * 1.4 +$old$,
      $new$        CASE
          -- verified omitted grain variant penalty
          WHEN query.normalized !~ '\m(grain|grains|free|ancient)\M'
            AND r.identity_lc ~ '\m(grain|grains|free|ancient)\M'
          THEN -0.75
          ELSE 0.0
        END +
        COALESCE(ts_rank_cd(r.search_document, query.ts_query), 0.0) * 1.4 +$new$
    );
  END IF;

  IF function_sql NOT LIKE '%verified omitted grain variant penalty%' THEN
    RAISE EXCEPTION 'search_verified_products omitted grain variant penalty patch failed';
  END IF;

  EXECUTE function_sql;
END $$;

REVOKE ALL ON FUNCTION public.normalize_verified_product_search_query(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_verified_product_search_query(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.normalize_verified_product_search_query(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_verified_product_search_query(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;
