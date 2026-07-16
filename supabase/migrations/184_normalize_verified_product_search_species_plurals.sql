-- Search titles from retailers often use plural species/life-stage words
-- ("puppies", "kittens") while manufacturer catalog rows use singular forms.
-- Normalize those before building the verified product tsquery.

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
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      extensions.unaccent(lower(trim(COALESCE(q, '')))),
                      '[^a-z0-9]+',
                      ' ',
                      'g'
                    ),
                    '\mpuppies\M',
                    'puppy',
                    'g'
                  ),
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

REVOKE ALL ON FUNCTION public.normalize_verified_product_search_query(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_verified_product_search_query(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.normalize_verified_product_search_query(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_verified_product_search_query(TEXT) TO service_role;
