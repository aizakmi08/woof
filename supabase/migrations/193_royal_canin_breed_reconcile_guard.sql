-- Royal Canin legacy queue rows often include line text such as
-- "Breed Health Nutrition" while the verified official catalog rows use the
-- shorter package identity, e.g. "German Shepherd Adult Dry Dog Food".
-- Allow those unknown-species queue rows to reconcile only when the queued
-- title contains an explicit dog-breed signal and the verified match is dog.

CREATE OR REPLACE FUNCTION public.catalog_acquisition_strict_search_high_confidence(
  p_queue_brand TEXT,
  p_queue_product_name TEXT,
  p_queue_pet_type TEXT,
  p_matched_brand TEXT,
  p_matched_identity TEXT,
  p_matched_pet_type TEXT,
  p_rank REAL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  q_norm TEXT := public.catalog_acquisition_identity_normalize(concat_ws(' ', p_queue_brand, p_queue_product_name));
  c_norm TEXT := public.catalog_acquisition_identity_normalize(concat_ws(' ', p_matched_brand, p_matched_identity));
  q_brand_norm TEXT := public.catalog_acquisition_identity_normalize(p_queue_brand);
  c_brand_norm TEXT := public.catalog_acquisition_identity_normalize(p_matched_brand);
  q_terms TEXT[];
  c_terms TEXT[];
  q_key_terms TEXT[];
  c_key_terms TEXT[];
  q_has_dog BOOLEAN;
  q_has_cat BOOLEAN;
  royal_canin_dog_breed_signal BOOLEAN;
  minimum_key_terms INTEGER;
BEGIN
  IF COALESCE(p_rank, 0) < 6.0 THEN
    RETURN FALSE;
  END IF;

  IF q_norm IS NULL OR c_norm IS NULL OR length(q_norm) < 12 OR length(c_norm) < 12 THEN
    RETURN FALSE;
  END IF;

  IF q_brand_norm IS NULL OR c_brand_norm IS NULL OR q_brand_norm <> c_brand_norm THEN
    RETURN FALSE;
  END IF;

  royal_canin_dog_breed_signal := q_brand_norm = 'royal canin'
    AND q_norm ~ '\m(beagle|boxer|bulldog|chihuahua|cocker spaniel|dachshund|french bulldog|german shepherd|golden retriever|great dane|labrador retriever|maltese|poodle|pug|rottweiler|shih tzu|west highland white terrier|yorkshire terrier)\M';

  q_has_dog := q_norm ~ '\m(dog|dogs|puppy|puppies|canine)\M'
    OR p_queue_pet_type = 'dog'
    OR royal_canin_dog_breed_signal;
  q_has_cat := q_norm ~ '\m(cat|cats|kitten|kittens|feline)\M'
    OR p_queue_pet_type = 'cat';

  IF q_has_dog = q_has_cat THEN
    RETURN FALSE;
  END IF;

  IF q_has_dog AND p_matched_pet_type <> 'dog' THEN
    RETURN FALSE;
  END IF;

  IF q_has_cat AND p_matched_pet_type <> 'cat' THEN
    RETURN FALSE;
  END IF;

  IF (q_norm ~ '\m(variety|assorted|assortment|bundle|sampler|multipack|mixed)\M')
     <> (c_norm ~ '\m(variety|assorted|assortment|bundle|sampler|multipack|mixed)\M') THEN
    RETURN FALSE;
  END IF;

  q_terms := public.catalog_acquisition_identity_tokens(q_norm, ARRAY[
    'beef', 'bison', 'chicken', 'cod', 'crab', 'duck', 'fish',
    'herring', 'lamb', 'liver', 'mackerel', 'oceanfish', 'pork',
    'quail', 'rabbit', 'salmon', 'sardine', 'shrimp', 'trout',
    'tuna', 'turkey', 'venison', 'whitefish', 'barley', 'bone',
    'brain', 'brown', 'carrot', 'cheddar', 'cheese', 'heart',
    'joint', 'oat', 'oatmeal', 'pea', 'potato', 'rice', 'spinach',
    'sweet', 'tomato', 'vegetable', 'wild'
  ]);
  c_terms := public.catalog_acquisition_identity_tokens(c_norm, ARRAY[
    'beef', 'bison', 'chicken', 'cod', 'crab', 'duck', 'fish',
    'herring', 'lamb', 'liver', 'mackerel', 'oceanfish', 'pork',
    'quail', 'rabbit', 'salmon', 'sardine', 'shrimp', 'trout',
    'tuna', 'turkey', 'venison', 'whitefish', 'barley', 'bone',
    'brain', 'brown', 'carrot', 'cheddar', 'cheese', 'heart',
    'joint', 'oat', 'oatmeal', 'pea', 'potato', 'rice', 'spinach',
    'sweet', 'tomato', 'vegetable', 'wild'
  ]);

  IF cardinality(q_terms) = 0 AND NOT royal_canin_dog_breed_signal THEN
    RETURN FALSE;
  END IF;

  IF cardinality(q_terms) > 0 AND EXISTS (
    SELECT 1
    FROM unnest(q_terms) AS q_required(term)
    WHERE NOT q_required.term = ANY(c_terms)
  ) THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'bright',
      'digestive',
      'hairball',
      'hydrolyzed',
      'indoor',
      'joint',
      'kitten',
      'large',
      'mind',
      'mobility',
      'puppy',
      'renal',
      'senior',
      'sensitive',
      'small',
      'skin',
      'toy',
      'urinary',
      'weight'
    ]) AS extra_guard(term)
    WHERE c_norm ~ ('\m' || extra_guard.term || '\M')
      AND q_norm !~ ('\m' || extra_guard.term || '\M')
  ) THEN
    RETURN FALSE;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT token ORDER BY token), ARRAY[]::TEXT[])
  INTO q_key_terms
  FROM regexp_split_to_table(q_norm, '\s+') AS tokens(token)
  WHERE length(token) >= 3
    AND token !~ '^[0-9]+$'
    AND token NOT IN (
      'and', 'blue', 'breed', 'buffalo', 'canin', 'cat', 'cats',
      'complete', 'diet', 'dog', 'dogs', 'dry', 'flavor', 'flavour',
      'food', 'foods', 'for', 'formula', 'free', 'grain', 'healthy',
      'health', 'hill', 'hills', 'natural', 'nutrition', 'premium',
      'recipe', 'royal', 'science', 'size', 'the', 'wet', 'with'
    );

  SELECT COALESCE(array_agg(DISTINCT token ORDER BY token), ARRAY[]::TEXT[])
  INTO c_key_terms
  FROM regexp_split_to_table(c_norm, '\s+') AS tokens(token)
  WHERE length(token) >= 3
    AND token !~ '^[0-9]+$'
    AND token NOT IN (
      'and', 'blue', 'breed', 'buffalo', 'canin', 'cat', 'cats',
      'complete', 'diet', 'dog', 'dogs', 'dry', 'flavor', 'flavour',
      'food', 'foods', 'for', 'formula', 'free', 'grain', 'healthy',
      'health', 'hill', 'hills', 'natural', 'nutrition', 'premium',
      'recipe', 'royal', 'science', 'size', 'the', 'wet', 'with'
    );

  minimum_key_terms := CASE WHEN royal_canin_dog_breed_signal THEN 2 ELSE 3 END;

  IF cardinality(q_key_terms) < minimum_key_terms THEN
    RETURN FALSE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM unnest(q_key_terms) AS q_key(term)
    WHERE NOT q_key.term = ANY(c_key_terms)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) TO service_role;

DO $$
BEGIN
  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Royal Canin',
    'Royal Canin Breed Health Nutrition German Shepherd Adult',
    'unknown',
    'Royal Canin',
    'German Shepherd Adult Dry Dog Food German Shepherd Adult adult dry 30 lb 030111520876',
    'dog',
    7.9
  ) THEN
    RAISE EXCEPTION 'Royal Canin dog-breed queue titles should reconcile to matching dog verified rows';
  END IF;

  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Royal Canin',
    'Royal Canin Labrador Retriever',
    'unknown',
    'Royal Canin',
    'Labrador Retriever Adult Dry Dog Food Labrador Retriever Adult adult dry 30 lb 030111418036',
    'dog',
    7.9
  ) THEN
    RAISE EXCEPTION 'Royal Canin two-token dog-breed queue titles should reconcile to matching dog verified rows';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Royal Canin',
    'Royal Canin Weight Care',
    'unknown',
    'Royal Canin',
    'Weight Care Adult Dry Dog Food Weight Care adult dry 17 lb',
    'dog',
    7.9
  ) THEN
    RAISE EXCEPTION 'Royal Canin unknown-species non-breed titles must remain unresolved';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Royal Canin',
    'Royal Canin Breed Health Nutrition German Shepherd Adult',
    'unknown',
    'Royal Canin',
    'Adult Instinctive Thin Slices in Gravy Canned Cat Food',
    'cat',
    9.0
  ) THEN
    RAISE EXCEPTION 'Royal Canin dog-breed queue titles must not reconcile to cat verified rows';
  END IF;
END $$;
