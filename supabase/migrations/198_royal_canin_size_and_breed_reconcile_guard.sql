-- Royal Canin official catalog rows include dog breed formulas that were not in
-- the earlier fallback list, plus size-health formulas whose retailer/community
-- titles have no protein terms. Keep this scoped to Royal Canin dog identities.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.catalog_acquisition_strict_search_high_confidence(text, text, text, text, text, text, real)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'catalog_acquisition_strict_search_high_confidence not found';
  END IF;

  IF function_sql NOT LIKE '%royal_canin_dog_size_signal%' THEN
    function_sql := replace(
      function_sql,
      '  royal_canin_dog_breed_signal BOOLEAN;',
      '  royal_canin_dog_breed_signal BOOLEAN;
  royal_canin_dog_size_signal BOOLEAN;'
    );
  END IF;

  function_sql := replace(
    function_sql,
    $$  royal_canin_dog_breed_signal := q_brand_norm = 'royal canin'
    AND q_norm ~ '\m(beagle|boxer|bulldog|chihuahua|cocker spaniel|dachshund|french bulldog|german shepherd|golden retriever|great dane|labrador retriever|maltese|poodle|pug|rottweiler|shih tzu|west highland white terrier|yorkshire terrier)\M';$$,
    $$  royal_canin_dog_breed_signal := q_brand_norm = 'royal canin'
    AND q_norm ~ '\m(beagle|bichon frise|boxer|bulldog|cavalier king charles|cavalier king charles spaniel|chihuahua|cocker spaniel|dachshund|french bulldog|german shepherd|golden retriever|great dane|labrador retriever|maltese|miniature schnauzer|poodle|pug|rottweiler|shih tzu|west highland white terrier|yorkshire terrier)\M';$$
  );

  IF function_sql NOT LIKE '%Royal Canin dog size-health signal%' THEN
    function_sql := replace(
      function_sql,
      $$  q_has_dog := q_norm ~ '\m(dog|dogs|puppy|puppies|canine)\M'
    OR p_queue_pet_type = 'dog'
    OR royal_canin_dog_breed_signal;$$,
      $$  royal_canin_dog_size_signal := q_brand_norm = 'royal canin'
    -- Royal Canin dog size-health signal
    AND q_norm ~ '\m(x small|xsmall|mini|small|medium|large|giant)\M'
    AND q_norm ~ '\m(adult|puppy|junior|senior|aging|ageing|8|12)\M';

  q_has_dog := q_norm ~ '\m(dog|dogs|puppy|puppies|canine)\M'
    OR p_queue_pet_type = 'dog'
    OR royal_canin_dog_breed_signal
    OR royal_canin_dog_size_signal;$$
    );
  END IF;

  function_sql := replace(
    function_sql,
    '  IF cardinality(q_terms) = 0 AND NOT royal_canin_dog_breed_signal THEN',
    '  IF cardinality(q_terms) = 0 AND NOT royal_canin_dog_breed_signal AND NOT royal_canin_dog_size_signal THEN'
  );

  function_sql := replace(
    function_sql,
    '  minimum_key_terms := CASE WHEN royal_canin_dog_breed_signal THEN 2 ELSE 3 END;',
    '  minimum_key_terms := CASE WHEN royal_canin_dog_breed_signal THEN 2 WHEN royal_canin_dog_size_signal THEN 1 ELSE 3 END;'
  );

  IF function_sql NOT LIKE '%bichon frise%' THEN
    RAISE EXCEPTION 'Royal Canin dog breed signal patch failed';
  END IF;

  IF function_sql NOT LIKE '%Royal Canin dog size-health signal%' THEN
    RAISE EXCEPTION 'Royal Canin dog size-health signal patch failed';
  END IF;

  IF function_sql NOT LIKE '%WHEN royal_canin_dog_size_signal THEN 1%' THEN
    RAISE EXCEPTION 'Royal Canin dog size-health minimum-key-term patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) TO service_role;

DO $$
BEGIN
  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Royal Canin',
    'Royal Canin Adult Bichon Frisé',
    'unknown',
    'Royal Canin',
    'Bichon Frise Adult Dry Dog Food Bichon Frise Adult adult dry 10 lb',
    'dog',
    8.3
  ) THEN
    RAISE EXCEPTION 'Royal Canin Bichon Frise dog-breed queue title should reconcile to official dog row';
  END IF;

  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Royal Canin',
    'Royal Canin Size Health Nutrition Large Adult',
    'unknown',
    'Royal Canin',
    'LARGE ADULT Large Adult adult dry 35 lb',
    'dog',
    8.1
  ) THEN
    RAISE EXCEPTION 'Royal Canin dog size-health queue title should reconcile to official dog row';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Royal Canin',
    'Royal Canin Weight Care',
    'unknown',
    'Royal Canin',
    'Weight Care Adult Dry Cat Food Weight Care adult dry 6 lb',
    'cat',
    9.0
  ) THEN
    RAISE EXCEPTION 'Royal Canin generic unknown-species care title must remain unresolved';
  END IF;
END $$;
