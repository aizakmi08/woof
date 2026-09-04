-- Treat green bean terms as protected formula identity terms. Without this,
-- a queued "Turkey and Sweet Potato" row can resolve to a different verified
-- formula that adds green beans.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.catalog_acquisition_strict_search_high_confidence(text, text, text, text, text, text, real)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'catalog_acquisition_strict_search_high_confidence not found';
  END IF;

  IF function_sql NOT LIKE '%''bean'', ''beans''%' THEN
    function_sql := replace(
      function_sql,
      $$    'brain', 'brown', 'carrot', 'cheddar', 'cheese', 'heart',$$,
      $$    'brain', 'brown', 'bean', 'beans', 'carrot', 'cheddar', 'cheese',
    'green', 'heart',$$
    );
  END IF;

  IF function_sql NOT LIKE '%''bean'', ''beans''%' OR function_sql NOT LIKE '%''green'', ''heart''%' THEN
    RAISE EXCEPTION 'green bean formula term patch failed';
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
    'Wellness',
    'Wellness Complete Health Turkey and Sweet Potato Recipe',
    'dog',
    'Wellness',
    'Wellness Complete Health Petite Entrees Mini Fillets Tender Turkey, Green Beans & White Sweet Potato wet 3 oz',
    'dog',
    7.9
  ) THEN
    RAISE EXCEPTION 'Wellness turkey sweet potato title must not reconcile to green bean petite entree';
  END IF;

  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Wellness',
    'Wellness Protein Bowls Salmon, Whitefish and Rice',
    'dog',
    'Wellness',
    'Wellness Protein Bowls Salmon, Whitefish & Rice Protein Bowls Salmon Whitefish Rice wet 12.5 oz',
    'dog',
    8.7
  ) THEN
    RAISE EXCEPTION 'Wellness protein bowls salmon whitefish rice title should reconcile';
  END IF;
END $$;
