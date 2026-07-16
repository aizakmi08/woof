-- Retailer titles can distinguish "Small Bite" from "Small Breed". Treat
-- bite/bites as protected verified-search terms so the app does not resolve a
-- small-bite query to a small-breed formula. Also keep retail packaging/noise
-- words out of normalized queries without weakening ingredient truth gates.

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
  bil_jac_dry_title_noise AS (
    SELECT CASE
      WHEN value ~ '\mbil jac\M'
        AND value ~ '\mdry dog\M'
        AND value !~ '\m(wet|canned|can|cans|gravy|pate|pat|stew|stews|platter|platters)\M'
      THEN regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  value,
                  '\m(made with )?(fresh|real|high energy) chicken( recipe)?\M',
                  ' ',
                  'g'
                ),
                '\mchicken oatmeal yams?( recipe)?\M',
                ' ',
                'g'
              ),
              '\mchicken liver( recipe)?\M',
              ' ',
              'g'
            ),
            '\m(chicken and whitefish|chicken whitefish)\M',
            ' ',
            'g'
          ),
          '\mall (life )?stages?\M',
          ' ',
          'g'
        ),
        '\mall breeds?\M',
        ' ',
        'g'
      )
      ELSE value
    END AS value
    FROM singularized
  ),
  size_stripped AS (
    SELECT regexp_replace(
      value,
      '\m[0-9]+( [0-9]+)? (lb|lbs|oz|ounce|ounces|pound|pounds|kg|g|gram|grams|bag|bags|can|cans|case|cases|pack|packs)\M',
      ' ',
      'g'
    ) AS value
    FROM bil_jac_dry_title_noise
  ),
  noise_stripped AS (
    SELECT regexp_replace(
      value,
      '\m(natural|ingredients?|artificial|flavors?|preservatives?|healthy|growth|formula|dha|savory|recipe|bag|bags|lb|lbs|oz|ounce|ounces|pound|pounds|kg|g|gram|grams|can|cans|case|cases|pack|packs|made|build|maintain|strong|muscles?|supports?|ideal|balanced|complete|nutrition|usa|with|for|food|foods|chewy|amazon|walmart|target|petco|petsmart|petsense|tractors?|supply|company)\M',
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
  small_bite_match TEXT;
  small_breed_match TEXT;
BEGIN
  SELECT pg_get_functiondef('public.search_verified_products(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'search_verified_products(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%query_required_terms%' THEN
    RAISE EXCEPTION 'search_verified_products required-term block not found';
  END IF;

  IF function_sql NOT LIKE '%''bite''%' THEN
    function_sql := replace(
      function_sql,
      $old$      'small',
      'toy',
      'large',$old$,
      $new$      'small',
      'bite',
      'bites',
      'toy',
      'large',$new$
    );
  END IF;

  IF function_sql NOT LIKE '%''bite''%' OR function_sql NOT LIKE '%''bites''%' THEN
    RAISE EXCEPTION 'search_verified_products bite required-term patch failed';
  END IF;

  EXECUTE function_sql;

  SELECT product_name
    INTO small_bite_match
  FROM public.search_verified_products(
    'Blue Buffalo Life Protection Formula Adult Small Bite Dry Dog Food, Chicken & Brown Rice Recipe, 15-lb. Bag',
    1
  );

  IF small_bite_match ILIKE '%Small Breed%' THEN
    RAISE EXCEPTION 'Small Bite query must not resolve to Small Breed formula, got %', small_bite_match;
  END IF;

  SELECT product_name
    INTO small_breed_match
  FROM public.search_verified_products(
    'Blue Buffalo Life Protection Formula Adult Small Breed Dry Dog Food, Chicken & Brown Rice Recipe',
    1
  );

  IF small_breed_match IS DISTINCT FROM 'Life Protection Formula Small Breed Adult Dry Dog Food - Chicken & Brown Rice' THEN
    RAISE EXCEPTION 'Small Breed query should still resolve to official Small Breed row, got %', small_breed_match;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.normalize_verified_product_search_query(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_verified_product_search_query(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.normalize_verified_product_search_query(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_verified_product_search_query(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;
