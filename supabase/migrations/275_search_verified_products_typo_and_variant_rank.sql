-- Improve verified catalog search for real user queries:
-- - normalize common product-name typos before search
-- - demote unrequested puppy/kitten/senior variants before final ordering
-- - collapse exact duplicate product-name rows returned by upstream imports

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
    FROM phrase_synonyms
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

CREATE OR REPLACE FUNCTION public.search_verified_products(q TEXT, max_results INTEGER DEFAULT 10)
RETURNS TABLE(
  cache_key TEXT,
  product_name TEXT,
  brand TEXT,
  gtin TEXT,
  product_line TEXT,
  flavor TEXT,
  life_stage TEXT,
  food_form TEXT,
  package_size TEXT,
  pet_type TEXT,
  ingredient_count INTEGER,
  source TEXT,
  source_quality TEXT,
  ingredient_verification_status TEXT,
  image_verification_status TEXT,
  verified_at TIMESTAMPTZ,
  image_url TEXT,
  ingredients TEXT[],
  ingredient_text TEXT,
  nutritional_info JSONB,
  nutrient_panel JSONB,
  has_published_nutrients BOOLEAN,
  source_url TEXT,
  rank REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input AS (
    SELECT
      public.normalize_verified_product_search_query(q) AS normalized,
      LEAST(GREATEST(COALESCE(max_results, 10), 1), 25) AS safe_limit
  ),
  ranked AS (
    SELECT
      p.*,
      NULLIF(trim(regexp_replace(extensions.unaccent(lower(COALESCE(p.product_name, ''))), '[^a-z0-9]+', ' ', 'g')), '') AS product_name_lc,
      NULLIF(trim(regexp_replace(extensions.unaccent(lower(COALESCE(p.brand, ''))), '[^a-z0-9]+', ' ', 'g')), '') AS brand_lc,
      NULLIF(trim(regexp_replace(extensions.unaccent(lower(COALESCE(p.life_stage, ''))), '[^a-z0-9]+', ' ', 'g')), '') AS life_stage_lc
    FROM input
    CROSS JOIN LATERAL public.search_verified_products_ranked_v1(
      COALESCE(input.normalized, q),
      LEAST(25, input.safe_limit * 2)
    ) AS p
  ),
  rescored AS (
    SELECT
      ranked.*,
      (
        ranked.rank
        + CASE
            WHEN input.normalized ~ '\mclassic\M'
              AND ranked.product_name_lc ~ '\mclassic\M'
            THEN 0.8 ELSE 0.0
          END
        - CASE
            WHEN input.normalized !~ '\m(kitten|puppy)\M'
              AND (
                ranked.product_name_lc ~ '\m(kitten|kittens|puppy|puppies)\M'
                OR ranked.life_stage_lc ~ '\m(kitten|kittens|puppy|puppies)\M'
              )
            THEN 1.25 ELSE 0.0
          END
        - CASE
            WHEN input.normalized !~ '\m(senior|seniors|mature)\M'
              AND (
                ranked.product_name_lc ~ '\m(senior|seniors|mature)\M'
                OR ranked.life_stage_lc ~ '\m(senior|seniors|mature)\M'
              )
            THEN 0.75 ELSE 0.0
          END
      )::REAL AS adjusted_rank,
      row_number() OVER (
        PARTITION BY
          COALESCE(ranked.brand_lc, ''),
          COALESCE(ranked.product_name_lc, ranked.cache_key, ''),
          COALESCE(ranked.pet_type, '')
        ORDER BY
          ranked.rank DESC,
          ranked.ingredient_count DESC,
          ranked.verified_at DESC NULLS LAST
      ) AS duplicate_rank
    FROM ranked
    CROSS JOIN input
  )
  SELECT
    rescored.cache_key,
    rescored.product_name,
    rescored.brand,
    rescored.gtin,
    rescored.product_line,
    rescored.flavor,
    rescored.life_stage,
    rescored.food_form,
    rescored.package_size,
    rescored.pet_type,
    rescored.ingredient_count,
    rescored.source,
    rescored.source_quality,
    rescored.ingredient_verification_status,
    rescored.image_verification_status,
    rescored.verified_at,
    rescored.image_url,
    rescored.ingredients,
    rescored.ingredient_text,
    rescored.nutritional_info,
    rescored.nutrient_panel,
    rescored.has_published_nutrients,
    rescored.source_url,
    rescored.adjusted_rank AS rank
  FROM rescored
  CROSS JOIN input
  WHERE rescored.duplicate_rank = 1
  ORDER BY
    rescored.adjusted_rank DESC,
    CASE
      WHEN input.normalized !~ '\m(kitten|kittens|puppy|puppies)\M'
        AND (
          rescored.product_name_lc ~ '\m(kitten|kittens|puppy|puppies)\M'
          OR rescored.life_stage_lc ~ '\m(kitten|kittens|puppy|puppies)\M'
        )
      THEN 1 ELSE 0
    END ASC,
    CASE
      WHEN input.normalized !~ '\m(senior|seniors|mature)\M'
        AND (
          rescored.product_name_lc ~ '\m(senior|seniors|mature)\M'
          OR rescored.life_stage_lc ~ '\m(senior|seniors|mature)\M'
        )
      THEN 1 ELSE 0
    END ASC,
    rescored.ingredient_count DESC,
    rescored.verified_at DESC NULLS LAST
  LIMIT (SELECT safe_limit FROM input);
$$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;
