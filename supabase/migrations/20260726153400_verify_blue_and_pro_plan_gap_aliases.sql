-- Post-commit search regression gate for exact verified aliases.

DO $$
DECLARE
  v_top_cache TEXT;
BEGIN
  SELECT result.cache_key
  INTO v_top_cache
  FROM public.search_verified_products(
    'Blue Buffalo Life Protection Formula Adult Dry Dog Food Grain Free Chicken',
    8
  ) result
  ORDER BY result.rank DESC
  LIMIT 1;

  IF v_top_cache IS DISTINCT FROM
     'blue-buffalo-general-mills:blue buffalo life protection formula adult dog grain-free chicken recipe life-protection-formula adult-grain-free-chicken-potato-recipe'
  THEN
    RAISE EXCEPTION
      'Blue Buffalo Grain-Free Chicken exact search regression: found %',
      v_top_cache;
  END IF;

  SELECT result.cache_key
  INTO v_top_cache
  FROM public.search_verified_products(
    'Purina Pro Plan Complete Essentials Kitten Chicken & Rice Formula Dry Cat Food',
    8
  ) result
  ORDER BY result.rank DESC
  LIMIT 1;

  IF v_top_cache IS DISTINCT FROM 'nestle-purina-pro-plan:038100105806' THEN
    RAISE EXCEPTION
      'Purina Pro Plan Kitten Chicken & Rice exact search regression: found %',
      v_top_cache;
  END IF;
END;
$$;
