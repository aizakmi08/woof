-- Retail titles for Blue Buffalo Family Favorites append marketing/package
-- terms while the official manufacturer page uses the shorter BLUE Family
-- Favorite Recipes name. Keep the lower rank allowance scoped to that exact
-- official dog line and preserve recipe/key-term containment.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.catalog_acquisition_strict_search_high_confidence(text, text, text, text, text, text, real)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'catalog_acquisition_strict_search_high_confidence not found';
  END IF;

  IF function_sql NOT LIKE '%blue_family_favorites_dog_signal := q_brand_norm = ''blue''%' THEN
    RAISE EXCEPTION 'Blue Family Favorites base alias migration must be applied first';
  END IF;

  IF function_sql NOT LIKE '%Blue Family Favorites retail title rank allowance%' THEN
    function_sql := replace(
      function_sql,
      $$  IF COALESCE(p_rank, 0) < 6.0 THEN
    RETURN FALSE;
  END IF;$$,
      $$  IF COALESCE(p_rank, 0) < 6.0
     AND NOT (
       COALESCE(p_rank, 0) >= 3.0
       AND q_brand_norm = 'blue'
       AND c_brand_norm = 'blue'
       AND lower(COALESCE(p_queue_brand, '')) LIKE 'blue buffalo%'
       AND lower(COALESCE(p_matched_brand, '')) LIKE 'blue buffalo%'
       AND p_matched_pet_type = 'dog'
       -- Blue Family Favorites retail title rank allowance.
       AND q_norm ~ '\mfamily favorites?\M'
       AND c_norm ~ '\mfamily favorite recipes\M'
     ) THEN
    RETURN FALSE;
  END IF;$$
    );
  END IF;

  function_sql := replace(
    function_sql,
    $$      'complete', 'diet', 'dinner', 'dog', 'dogs', 'dry', 'family',
      'favorite', 'favorites', 'flavor', 'flavour', 'food', 'foods',
      'for', 'formula', 'free', 'grain', 'healthy', 'health', 'hill',
      'hills', 'natural', 'nutrition', 'premium', 'recipe', 'recipes',
      'royal', 'science', 'size', 'the', 'wet', 'with'$$,
    $$      'can', 'complete', 'diet', 'dinner', 'dog', 'dogs', 'dry',
      'family', 'favorite', 'favorites', 'flavor', 'flavour', 'food',
      'foods', 'for', 'formula', 'free', 'grain', 'healthy', 'health',
      'hill', 'hills', 'ingredients', 'made', 'natural', 'nutrition',
      'pack', 'premium', 'recipe', 'recipes', 'royal', 'science', 'size',
      'the', 'wet', 'with'$$
  );

  IF function_sql NOT LIKE '%Blue Family Favorites retail title rank allowance%' THEN
    RAISE EXCEPTION 'Blue Family Favorites retail rank allowance patch failed';
  END IF;

  IF function_sql NOT LIKE '%''hill'', ''hills'', ''ingredients'', ''made''%' THEN
    RAISE EXCEPTION 'Blue Family Favorites retail stoplist patch failed';
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
    'Blue Buffalo Family Favorites Adult Wet Dog Food, Made with Natural Ingredients, Sunday Chicken Dinner, 12.5-oz Can',
    'dog',
    'Blue Buffalo',
    'BLUE Family Favorite Recipes Wet Dog Food - Sunday Chicken BLUE Family Favorite Recipes Wet - Sunday Chicken wet',
    'dog',
    3.4
  ) THEN
    RAISE EXCEPTION 'Blue Family Favorites long retail title should reconcile to the verified official dog row';
  END IF;

  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Blue Buffalo',
    'Blue Buffalo Family Favorites Adult Wet Dog Food, Made with Natural Ingredients, Sunday Chicken Dinner, 12.5-oz Can (Pack of 12)',
    'dog',
    'Blue Buffalo',
    'BLUE Family Favorite Recipes Wet Dog Food - Sunday Chicken BLUE Family Favorite Recipes Wet - Sunday Chicken wet',
    'dog',
    3.3
  ) THEN
    RAISE EXCEPTION 'Blue Family Favorites pack retail title should reconcile to the verified official dog row';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Blue Buffalo',
    'Blue Buffalo Family Favorites Adult Wet Dog Food, Made with Natural Ingredients, Sunday Chicken Dinner, 12.5-oz Can',
    'dog',
    'Blue Buffalo',
    'BLUE Family Favorite Recipes Wet Dog Food - Turkey Day Feast BLUE Family Favorite Recipes Wet - Turkey Turkey wet',
    'dog',
    3.4
  ) THEN
    RAISE EXCEPTION 'Blue Family Favorites long retail title must not reconcile to Turkey Day Feast';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Blue Buffalo',
    'Blue Buffalo Family Favorites Adult Wet Dog Food, Made with Natural Ingredients, Sunday Chicken Dinner, 12.5-oz Can',
    'dog',
    'Blue Buffalo',
    'Love Made Fresh Chicken Meatballs | Adult Dog Food Love Made Fresh Chicken adult fresh',
    'dog',
    3.4
  ) THEN
    RAISE EXCEPTION 'Blue Family Favorites long retail title must not reconcile to another Blue Buffalo chicken line';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Blue Buffalo',
    'Blue Buffalo Family Favorites Adult Wet Dog Food, Made with Natural Ingredients, Sunday Chicken Dinner, 12.5-oz Can',
    'dog',
    'Blue Buffalo',
    'BLUE Tastefuls Adult Wet Cat Food - Chicken Paté BLUE Tastefuls Chicken adult wet',
    'cat',
    8.0
  ) THEN
    RAISE EXCEPTION 'Blue Family Favorites long retail title must not reconcile to cat rows';
  END IF;
END $$;
