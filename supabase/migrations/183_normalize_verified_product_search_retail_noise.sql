-- Retail titles often append package size and marketing copy that does not
-- appear on official manufacturer product pages. Normalize those terms before
-- verified catalog search so source-backed rows can still be found.

CREATE OR REPLACE FUNCTION public.normalize_verified_product_search_query(q TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT NULLIF(
    trim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              extensions.unaccent(lower(trim(COALESCE(q, '')))),
              '[^a-z0-9]+',
              ' ',
              'g'
            ),
            '\m[0-9]+( [0-9]+)? (lb|lbs|oz|ounce|ounces|pound|pounds|kg|g|gram|grams|bag|bags)\M',
            ' ',
            'g'
          ),
          '\m(natural|ingredients?|artificial|flavors?|preservatives?|healthy|growth|formula|dha|savory|recipe|bag|bags|lb|lbs|oz|ounce|ounces|pound|pounds|kg|g|gram|grams|with|for|food|foods)\M',
          ' ',
          'g'
        ),
        '\s+',
        ' ',
        'g'
      )
    ),
    ''
  );
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

  IF function_sql LIKE '%normalize_verified_product_search_query(q)%' THEN
    RETURN;
  END IF;

  function_sql := replace(
    function_sql,
    $old$NULLIF(trim(regexp_replace(extensions.unaccent(lower(trim(q))), '[^a-z0-9]+', ' ', 'g')), '') AS normalized,$old$,
    $new$public.normalize_verified_product_search_query(q) AS normalized,$new$
  );

  IF function_sql NOT LIKE '%normalize_verified_product_search_query(q)%' THEN
    RAISE EXCEPTION 'search_verified_products retail-noise normalization patch failed';
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
