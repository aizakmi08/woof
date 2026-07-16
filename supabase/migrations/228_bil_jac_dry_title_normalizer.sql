-- Bil-Jac dry dog pages use official titles like "Puppy Select Formula Dry
-- Dog Food", while retailer/user titles often append marketing protein
-- phrases such as "Fresh Chicken Recipe" or "Made with Real Chicken". For
-- verified search those phrases should not block the exact official row.
-- Keep the rule constrained to Bil-Jac dry dog titles so protein terms remain
-- strict for normal formula/flavor matching.

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
    FROM cleaned
  ),
  size_stripped AS (
    SELECT regexp_replace(
      value,
      '\m[0-9]+( [0-9]+)? (lb|lbs|oz|ounce|ounces|pound|pounds|kg|g|gram|grams|bag|bags)\M',
      ' ',
      'g'
    ) AS value
    FROM bil_jac_dry_title_noise
  ),
  noise_stripped AS (
    SELECT regexp_replace(
      value,
      '\m(natural|ingredients?|artificial|flavors?|preservatives?|healthy|growth|formula|dha|savory|recipe|bag|bags|lb|lbs|oz|ounce|ounces|pound|pounds|kg|g|gram|grams|with|for|food|foods|chewy|amazon|walmart|target|petco|petsmart|petsense|tractors?|supply|company)\M',
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

REVOKE ALL ON FUNCTION public.normalize_verified_product_search_query(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_verified_product_search_query(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.normalize_verified_product_search_query(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_verified_product_search_query(TEXT) TO service_role;

DO $$
DECLARE
  puppy_match TEXT;
  wet_match TEXT;
BEGIN
  IF public.normalize_verified_product_search_query(
    'Bil-Jac Puppy Select Dry Dog Food, Fresh Chicken Recipe'
  ) <> 'bil jac puppy select dry dog' THEN
    RAISE EXCEPTION 'Bil-Jac dry title normalizer should remove Fresh Chicken Recipe marketing phrase';
  END IF;

  IF public.normalize_verified_product_search_query(
    'Bil-Jac Adult Select Formula Dry Dog Food, All Breed, Made with Real Chicken'
  ) <> 'bil jac adult select dry dog' THEN
    RAISE EXCEPTION 'Bil-Jac dry title normalizer should remove all-breed and made-with-real-chicken marketing phrases';
  END IF;

  IF public.normalize_verified_product_search_query(
    'Bil-Jac Pate Platters with Chicken and Vegetables'
  ) <> 'bil jac pate platters chicken and vegetables' THEN
    RAISE EXCEPTION 'Bil-Jac wet title normalizer must preserve formula protein terms';
  END IF;

  SELECT product_name
    INTO puppy_match
  FROM public.search_verified_products(
    'Bil-Jac Puppy Select Dry Dog Food, Fresh Chicken Recipe',
    1
  );

  IF puppy_match IS DISTINCT FROM 'Puppy Select Formula Dry Dog Food' THEN
    RAISE EXCEPTION 'Bil-Jac dry title should resolve to official Puppy Select row, got %', puppy_match;
  END IF;

  SELECT product_name
    INTO wet_match
  FROM public.search_verified_products(
    'Bil-Jac Pate Platters with Chicken and Vegetables',
    1
  );

  IF wet_match IS DISTINCT FROM 'Pâté Platters with Chicken & Vegetables Wet Dog Food' THEN
    RAISE EXCEPTION 'Bil-Jac wet title should continue resolving to exact protein variant, got %', wet_match;
  END IF;
END $$;
