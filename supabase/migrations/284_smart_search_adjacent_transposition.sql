-- Keep server-side search consistent with the app's adjacent-letter typo
-- correction for the common Purina Pro Plan query.
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
  adjacent_typos AS (
    SELECT regexp_replace(value, '\mpaln\M', 'plan', 'g') AS value
    FROM phrase_synonyms
  ),
  typo_fixed AS (
    SELECT regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(value, '\mbluebuffalo\M', 'blue buffalo', 'g'),
                '\mbufflo\M',
                'buffalo',
                'g'
              ),
              '\mlife protect\M',
              'life protection',
              'g'
            ),
            '\m(urinari|urinery|urianry|urinarry)\M',
            'urinary',
            'g'
          ),
          '\m(proplan|proplan)\M',
          'pro plan',
          'g'
        ),
        '\m(patee|patey|patte)\M',
        'pate',
        'g'
      ),
      '\mfod\M',
      'food',
      'g'
    ) AS value
    FROM adjacent_typos
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
    FROM typo_fixed
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

REVOKE ALL ON FUNCTION public.normalize_verified_product_search_query(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_verified_product_search_query(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.normalize_verified_product_search_query(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_verified_product_search_query(TEXT) TO service_role;

DO $$
BEGIN
  IF public.normalize_verified_product_search_query('Purina Pro Paln Chicken')
    <> 'purina pro plan chicken'
  THEN
    RAISE EXCEPTION 'verified product search must normalize adjacent-letter plan typo';
  END IF;
END;
$$;
