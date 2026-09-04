-- Reduce conservative acquisition reconciliation misses without lowering the
-- global trigram thresholds. The fallback below only runs after species,
-- variety-pack, protein, recipe-term, and form guards pass, then requires the
-- queued product's distinctive terms to appear in the source-backed catalog
-- identity. This covers label/title variants like "slow cooked" vs "slow
-- cook", "filet mignon" vs beef, and retailer filler such as "wet dog food".

CREATE OR REPLACE FUNCTION public.catalog_acquisition_identity_normalize(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH cleaned AS (
    SELECT regexp_replace(
      extensions.unaccent(lower(COALESCE(p_value, ''))),
      '[^a-z0-9]+',
      ' ',
      'g'
    ) AS value
  ),
  normalized AS (
    SELECT regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          regexp_replace(
                            regexp_replace(
                              value,
                              '\mblue buffalo\M',
                              'blue',
                              'g'
                            ),
                            '\mblue s\M',
                            'blue',
                            'g'
                          ),
                          '\mblue blue\M',
                          'blue',
                          'g'
                        ),
                        '\mfilet mignon\M|\mfillet mignon\M|\mporterhouse steak\M|\mnew york strip\M|\mgrilled steak\M|\msteak\M',
                        'beef',
                        'g'
                      ),
                      '\mslow cooked\M|\mcooked\M',
                      'slow cook',
                      'g'
                    ),
                    '\mpotatoes\M',
                    'potato',
                    'g'
                  ),
                  '\mcarrots\M',
                  'carrot',
                  'g'
                ),
                '\mpeas\M',
                'pea',
                'g'
              ),
              '\mtomatoes\M',
              'tomato',
              'g'
            ),
            '\mvegetables\M|\mveggies\M',
            'vegetable',
            'g'
          ),
          '\mwhite fish\M',
          'whitefish',
          'g'
        ),
        '\mocean fish\M',
        'oceanfish',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    ) AS value
    FROM cleaned
  )
  SELECT NULLIF(trim(value), '')
  FROM normalized;
$$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_normalize(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_normalize(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_normalize(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_identity_normalize(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.catalog_acquisition_identity_match(
  p_queue_identity TEXT,
  p_queue_pet_type TEXT,
  p_catalog_identity TEXT,
  p_catalog_pet_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  q_norm TEXT := public.catalog_acquisition_identity_normalize(p_queue_identity);
  c_norm TEXT := public.catalog_acquisition_identity_normalize(p_catalog_identity);
  q_proteins TEXT[];
  c_proteins TEXT[];
  q_recipe_terms TEXT[];
  c_recipe_terms TEXT[];
  q_key_terms TEXT[];
  c_key_terms TEXT[];
  required_term TEXT;
  identity_similarity REAL;
  identity_word_similarity REAL;
BEGIN
  IF q_norm IS NULL OR c_norm IS NULL OR length(q_norm) < 12 OR length(c_norm) < 12 THEN
    RETURN FALSE;
  END IF;

  IF p_queue_pet_type IN ('dog', 'cat')
     AND p_catalog_pet_type IN ('dog', 'cat')
     AND p_queue_pet_type <> p_catalog_pet_type THEN
    RETURN FALSE;
  END IF;

  IF q_norm ~ '\m(dog|puppy|canine)\M' AND p_catalog_pet_type = 'cat' THEN
    RETURN FALSE;
  END IF;

  IF q_norm ~ '\m(cat|kitten|feline)\M' AND p_catalog_pet_type = 'dog' THEN
    RETURN FALSE;
  END IF;

  IF (q_norm ~ '\m(variety|assorted|assortment|bundle|sampler|multipack|mixed)\M')
     <> (c_norm ~ '\m(variety|assorted|assortment|bundle|sampler|multipack|mixed)\M') THEN
    RETURN FALSE;
  END IF;

  q_proteins := public.catalog_acquisition_identity_tokens(q_norm, ARRAY[
    'beef',
    'bison',
    'chicken',
    'cod',
    'crab',
    'duck',
    'fish',
    'herring',
    'lamb',
    'liver',
    'mackerel',
    'oceanfish',
    'pork',
    'quail',
    'rabbit',
    'salmon',
    'sardine',
    'shrimp',
    'trout',
    'tuna',
    'turkey',
    'venison',
    'whitefish'
  ]);
  c_proteins := public.catalog_acquisition_identity_tokens(c_norm, ARRAY[
    'beef',
    'bison',
    'chicken',
    'cod',
    'crab',
    'duck',
    'fish',
    'herring',
    'lamb',
    'liver',
    'mackerel',
    'oceanfish',
    'pork',
    'quail',
    'rabbit',
    'salmon',
    'sardine',
    'shrimp',
    'trout',
    'tuna',
    'turkey',
    'venison',
    'whitefish'
  ]);

  IF cardinality(q_proteins) = 0 THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(q_proteins) AS q_tokens(q_token)
    WHERE NOT q_token = ANY(c_proteins)
  ) OR EXISTS (
    SELECT 1
    FROM unnest(c_proteins) AS c_tokens(c_token)
    WHERE NOT c_token = ANY(q_proteins)
  ) THEN
    RETURN FALSE;
  END IF;

  q_recipe_terms := public.catalog_acquisition_identity_tokens(q_norm, ARRAY[
    'barley',
    'bone',
    'brain',
    'brown',
    'carrot',
    'cheddar',
    'cheese',
    'heart',
    'joint',
    'oat',
    'oatmeal',
    'pea',
    'potato',
    'rice',
    'spinach',
    'sweet',
    'tomato',
    'vegetable',
    'wild'
  ]);
  c_recipe_terms := public.catalog_acquisition_identity_tokens(c_norm, ARRAY[
    'barley',
    'bone',
    'brain',
    'brown',
    'carrot',
    'cheddar',
    'cheese',
    'heart',
    'joint',
    'oat',
    'oatmeal',
    'pea',
    'potato',
    'rice',
    'spinach',
    'sweet',
    'tomato',
    'vegetable',
    'wild'
  ]);

  IF EXISTS (
    SELECT 1
    FROM unnest(q_recipe_terms) AS q_terms(q_term)
    WHERE NOT q_term = ANY(c_recipe_terms)
  ) OR EXISTS (
    SELECT 1
    FROM unnest(c_recipe_terms) AS c_terms(c_term)
    WHERE NOT c_term = ANY(q_recipe_terms)
  ) THEN
    RETURN FALSE;
  END IF;

  FOREACH required_term IN ARRAY ARRAY[
    'adult 7',
    'classic ground',
    'digestive',
    'dry',
    'grain free',
    'grilled',
    'hairball',
    'healthy weight',
    'high protein',
    'hydrolyzed',
    'indoor',
    'kitten',
    'large breed',
    'mousse',
    'pate',
    'puppy',
    'renal',
    'senior',
    'sensitive',
    'shreds',
    'skin',
    'small breed',
    'stomach',
    'tender',
    'urinary',
    'weight',
    'wet'
  ] LOOP
    IF position(required_term IN q_norm) > 0
       AND position(required_term IN c_norm) = 0 THEN
      IF required_term = 'wet'
         AND c_norm ~ '\m(loaf|sauce|gravy|stew|pate|filets|cuts|pouch|tray|can|canned|bowls)\M' THEN
        CONTINUE;
      END IF;

      IF required_term = 'dry'
         AND c_norm ~ '\m(kibble|crunchy)\M' THEN
        CONTINUE;
      END IF;

      RETURN FALSE;
    END IF;
  END LOOP;

  SELECT COALESCE(array_agg(DISTINCT token ORDER BY token), ARRAY[]::TEXT[])
  INTO q_key_terms
  FROM regexp_split_to_table(q_norm, '\s+') AS tokens(token)
  WHERE length(token) >= 3
    AND token !~ '^[0-9]+$'
    AND token NOT IN (
      'and',
      'blue',
      'buffalo',
      'canin',
      'cat',
      'cats',
      'cesar',
      'choice',
      'complete',
      'diet',
      'dog',
      'dogs',
      'dry',
      'flavor',
      'flavour',
      'food',
      'foods',
      'for',
      'formula',
      'free',
      'grain',
      'healthy',
      'health',
      'hill',
      'hills',
      'iams',
      'natural',
      'nutro',
      'oz',
      'pedigree',
      'premium',
      'purina',
      'raised',
      'recipe',
      'royal',
      'science',
      'soft',
      'the',
      'wet',
      'whole',
      'with'
    );

  SELECT COALESCE(array_agg(DISTINCT token ORDER BY token), ARRAY[]::TEXT[])
  INTO c_key_terms
  FROM regexp_split_to_table(c_norm, '\s+') AS tokens(token)
  WHERE length(token) >= 3
    AND token !~ '^[0-9]+$'
    AND token NOT IN (
      'and',
      'blue',
      'buffalo',
      'canin',
      'cat',
      'cats',
      'cesar',
      'choice',
      'complete',
      'diet',
      'dog',
      'dogs',
      'dry',
      'flavor',
      'flavour',
      'food',
      'foods',
      'for',
      'formula',
      'free',
      'grain',
      'healthy',
      'health',
      'hill',
      'hills',
      'iams',
      'natural',
      'nutro',
      'oz',
      'pedigree',
      'premium',
      'purina',
      'raised',
      'recipe',
      'royal',
      'science',
      'soft',
      'the',
      'wet',
      'whole',
      'with'
    );

  IF cardinality(q_key_terms) >= 3
     AND NOT EXISTS (
       SELECT 1
       FROM unnest(q_key_terms) AS q_terms(q_term)
       WHERE NOT q_term = ANY(c_key_terms)
     ) THEN
    RETURN TRUE;
  END IF;

  identity_similarity := similarity(q_norm, c_norm);
  identity_word_similarity := word_similarity(q_norm, c_norm);

  IF q_norm = c_norm THEN
    RETURN TRUE;
  END IF;

  IF q_norm LIKE '%' || c_norm || '%' AND length(c_norm) >= 20 THEN
    RETURN TRUE;
  END IF;

  IF c_norm LIKE '%' || q_norm || '%'
     AND length(q_norm)::NUMERIC / GREATEST(length(c_norm), 1) >= 0.82 THEN
    RETURN TRUE;
  END IF;

  IF identity_similarity >= 0.62 OR identity_word_similarity >= 0.78 THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) TO service_role;
