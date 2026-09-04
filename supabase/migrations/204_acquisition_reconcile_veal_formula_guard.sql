-- Keep acquisition reconciliation from closing a plain chicken queue title
-- against a chicken-and-veal verified formula. Cesar exposes this with
-- "Chicken Recipe" versus "Chicken & Veal" wet-food variants.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.catalog_acquisition_strict_search_high_confidence(text, text, text, text, text, text, real)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'catalog_acquisition_strict_search_high_confidence not found';
  END IF;

  IF function_sql NOT LIKE '%''veal''%' THEN
    function_sql := replace(
      function_sql,
      $$    'tuna', 'turkey', 'venison', 'whitefish', 'barley', 'bone',$$,
      $$    'tuna', 'turkey', 'veal', 'venison', 'whitefish', 'barley', 'bone',$$
    );
  END IF;

  IF function_sql NOT LIKE '%''veal'', ''venison''%' THEN
    RAISE EXCEPTION 'veal formula-term patch failed';
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
    'Cesar',
    'Cesar Classic Loaf in Sauce Chicken Recipe',
    'dog',
    'Cesar',
    'Classic Loaf in Sauce Chicken & Veal wet',
    'dog',
    15.7
  ) THEN
    RAISE EXCEPTION 'plain Cesar chicken title must not reconcile to chicken veal variant';
  END IF;

  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Cesar',
    'Cesar Classic Loaf in Sauce Chicken and Veal Recipe',
    'dog',
    'Cesar',
    'Classic Loaf in Sauce Chicken & Veal wet',
    'dog',
    8.8
  ) THEN
    RAISE EXCEPTION 'Cesar chicken veal title should reconcile to chicken veal variant';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Cesar',
    'cesar dog food',
    'dog',
    'Cesar',
    'Cesar Puppy Filets in Gravy Chicken Recipe Wet Dog Food',
    'dog',
    8.8
  ) THEN
    RAISE EXCEPTION 'generic Cesar dog food title must not reconcile to a specific puppy formula';
  END IF;
END $$;
