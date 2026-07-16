-- Blue Buffalo official pages name this dog-only line "BLUE Family Favorite
-- Recipes", while retailer/community titles often say "Family Favorites" and
-- include serving words such as "Dinner". Allow those rows to reconcile only
-- inside the Blue Buffalo brand, only against verified dog matches from the
-- same line, and only when the remaining recipe terms still match.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.catalog_acquisition_strict_search_high_confidence(text, text, text, text, text, text, real)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'catalog_acquisition_strict_search_high_confidence not found';
  END IF;

  IF function_sql NOT LIKE '%blue_family_favorites_dog_signal%' THEN
    function_sql := replace(
      function_sql,
      '  open_farm_distinct_line_signal BOOLEAN;',
      '  open_farm_distinct_line_signal BOOLEAN;
  blue_family_favorites_dog_signal BOOLEAN;'
    );

    function_sql := replace(
      function_sql,
      $$  q_has_dog := q_norm ~ '\m(dog|dogs|puppy|puppies|canine)\M'$$,
      $$  blue_family_favorites_dog_signal := q_brand_norm = 'blue'
    AND c_brand_norm = 'blue'
    AND lower(COALESCE(p_queue_brand, '')) LIKE 'blue buffalo%'
    AND lower(COALESCE(p_matched_brand, '')) LIKE 'blue buffalo%'
    AND p_matched_pet_type = 'dog'
    AND q_norm ~ '\mfamily favorites?\M'
    AND c_norm ~ '\mfamily favorite recipes\M';

  q_has_dog := q_norm ~ '\m(dog|dogs|puppy|puppies|canine)\M'$$
    );

    function_sql := replace(
      function_sql,
      $$    OR royal_canin_dog_breed_signal
    OR royal_canin_dog_size_signal;$$,
      $$    OR royal_canin_dog_breed_signal
    OR royal_canin_dog_size_signal
    OR blue_family_favorites_dog_signal;$$
    );

    function_sql := replace(
      function_sql,
      'minimum_key_terms := CASE WHEN royal_canin_dog_breed_signal THEN 2 ELSE 3 END;',
      'minimum_key_terms := CASE WHEN royal_canin_dog_breed_signal OR blue_family_favorites_dog_signal THEN 2 ELSE 3 END;'
    );
    function_sql := replace(
      function_sql,
      'minimum_key_terms := CASE WHEN royal_canin_dog_breed_signal THEN 2 WHEN royal_canin_dog_size_signal THEN 1 ELSE 3 END;',
      'minimum_key_terms := CASE WHEN royal_canin_dog_breed_signal OR blue_family_favorites_dog_signal THEN 2 WHEN royal_canin_dog_size_signal THEN 1 ELSE 3 END;'
    );

    function_sql := replace(
      function_sql,
      $$    'and', 'blue', 'breed', 'buffalo', 'canin', 'cat', 'cats',
      'complete', 'diet', 'dog', 'dogs', 'dry', 'flavor', 'flavour',
      'food', 'foods', 'for', 'formula', 'free', 'grain', 'healthy',
      'health', 'hill', 'hills', 'natural', 'nutrition', 'premium',
      'recipe', 'royal', 'science', 'size', 'the', 'wet', 'with'$$,
      $$    'and', 'blue', 'breed', 'buffalo', 'canin', 'cat', 'cats',
      'complete', 'diet', 'dinner', 'dog', 'dogs', 'dry', 'family',
      'favorite', 'favorites', 'flavor', 'flavour', 'food', 'foods',
      'for', 'formula', 'free', 'grain', 'healthy', 'health', 'hill',
      'hills', 'natural', 'nutrition', 'premium', 'recipe', 'recipes',
      'royal', 'science', 'size', 'the', 'wet', 'with'$$
    );
  END IF;

  IF function_sql NOT LIKE '%blue_family_favorites_dog_signal := q_brand_norm = ''blue''%' THEN
    RAISE EXCEPTION 'Blue Family Favorites reconcile alias patch failed';
  END IF;

  IF function_sql NOT LIKE '%OR blue_family_favorites_dog_signal%' THEN
    RAISE EXCEPTION 'Blue Family Favorites dog species signal patch failed';
  END IF;

  IF function_sql NOT LIKE '%royal_canin_dog_breed_signal OR blue_family_favorites_dog_signal%' THEN
    RAISE EXCEPTION 'Blue Family Favorites minimum-key-term patch failed';
  END IF;

  IF function_sql NOT LIKE '%''complete'', ''diet'', ''dinner'', ''dog''%' THEN
    RAISE EXCEPTION 'Blue Family Favorites stoplist patch failed';
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
    'Blue Buffalo',
    'Blue Buffalo Family Favorites Sunday Chicken Dinner',
    'unknown',
    'Blue Buffalo',
    'BLUE Family Favorite Recipes Wet Dog Food - Sunday Chicken',
    'dog',
    7.9
  ) THEN
    RAISE EXCEPTION 'Blue Family Favorites Sunday Chicken Dinner should reconcile to the verified official dog row';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Blue Buffalo',
    'Blue Buffalo Family Favorites Sunday Chicken Dinner',
    'unknown',
    'Blue Buffalo',
    'BLUE Family Favorite Recipes Wet Dog Food - Turkey Day Feast',
    'dog',
    7.9
  ) THEN
    RAISE EXCEPTION 'Blue Family Favorites Sunday Chicken Dinner must not reconcile to Turkey Day Feast';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Blue Buffalo',
    'Blue Buffalo Family Favorites Sunday Chicken Dinner',
    'unknown',
    'Blue Buffalo',
    'BLUE Tastefuls Adult Wet Cat Food - Chicken Paté',
    'cat',
    9.0
  ) THEN
    RAISE EXCEPTION 'Blue Family Favorites dog line must not reconcile to cat rows';
  END IF;
END $$;
