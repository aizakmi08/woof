-- Expand protected formula identity terms for source-backed acquisition
-- reconciliation. These terms commonly appear on front labels and product
-- names; missing one should keep the row unresolved instead of guessing.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.catalog_acquisition_strict_search_high_confidence(text, text, text, text, text, text, real)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'catalog_acquisition_strict_search_high_confidence not found';
  END IF;

  IF function_sql NOT LIKE '%''blueberry'', ''blueberries''%' THEN
    function_sql := replace(
      function_sql,
      $$    'brain', 'brown', 'bean', 'beans', 'carrot', 'cheddar', 'cheese',$$,
      $$    'apple', 'apples', 'brain', 'brown', 'bean', 'beans', 'blueberry',
    'blueberries', 'carrot', 'cheddar', 'cheese', 'cranberry', 'cranberries',$$
    );
  END IF;

  IF function_sql NOT LIKE '%''lentil'', ''lentils''%' THEN
    function_sql := replace(
      function_sql,
      $$    'green', 'heart',
    'joint', 'oat', 'oatmeal', 'pea', 'potato', 'rice', 'spinach',$$,
      $$    'green', 'haddock', 'heart',
    'joint', 'lentil', 'lentils', 'oat', 'oatmeal', 'pea', 'peas', 'potato',
    'pumpkin', 'quinoa', 'raspberry', 'raspberries', 'redfish', 'rice',
    'sole', 'spinach',$$
    );
  END IF;

  IF function_sql NOT LIKE '%''blueberry''%'
     OR function_sql NOT LIKE '%''blueberries''%'
     OR function_sql NOT LIKE '%''lentil'', ''lentils''%'
     OR function_sql NOT LIKE '%''raspberry''%'
     OR function_sql NOT LIKE '%''raspberries''%'
     OR function_sql NOT LIKE '%''haddock'', ''heart''%'
     OR function_sql NOT LIKE '%''redfish'', ''rice''%'
     OR function_sql NOT LIKE '%''pea'', ''peas''%' THEN
    RAISE EXCEPTION 'expanded formula term patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) TO service_role;

DO $$
BEGIN
  IF public.catalog_acquisition_strict_search_high_confidence(
    'Nulo',
    'Nulo Freeze-Dried Raw+ Adult Dog Food, Lamb',
    'dog',
    'Nulo',
    'Nulo Freeze-Dried Raw Lamb & Raspberries Freeze-Dried Raw Lamb Raspberries freeze-dried 13 oz',
    'dog',
    8.7
  ) THEN
    RAISE EXCEPTION 'Nulo lamb title must not reconcile to lamb raspberries formula';
  END IF;

  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Nulo',
    'Nulo Freeze-Dried Raw Chicken and Blueberries',
    'dog',
    'Nulo',
    'Nulo Freeze-Dried Raw Chicken & Blueberries Freeze-Dried Raw Chicken Blueberries freeze-dried 13 oz',
    'dog',
    8.2
  ) THEN
    RAISE EXCEPTION 'Nulo chicken blueberries title should reconcile';
  END IF;

  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Nulo',
    'Nulo MedalSeries High-Protein Kibble Lamb and Lentils',
    'dog',
    'Nulo',
    'MedalSeries High-Protein Kibble Lamb & Lentils Recipe MedalSeries Lamb Lentils dry 4 lb',
    'dog',
    8.0
  ) THEN
    RAISE EXCEPTION 'Nulo lamb lentils title should reconcile';
  END IF;

  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Nulo',
    'Nulo, Gently Cooked Meals Chicken & Quinoa Recipe Adult Dog Food',
    'dog',
    'Nulo',
    'Nulo Gently-Cooked Meals Chicken & Quinoa Recipe For Dogs Gently Cooked Chicken Quinoa fresh 16 oz',
    'dog',
    8.7
  ) THEN
    RAISE EXCEPTION 'Nulo chicken quinoa title should reconcile';
  END IF;

  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Nulo',
    'Nulo challenger Small Breed Northern Catch Haddock, Salmon and Redfish',
    'dog',
    'Nulo',
    'Challenger High-Protein Kibble For Small Breed Northern Catch Haddock, Salmon & Redfish Challenger Haddock Salmon Redfish dry 4 lb',
    'dog',
    7.2
  ) THEN
    RAISE EXCEPTION 'Nulo haddock salmon redfish title should reconcile';
  END IF;
END $$;
