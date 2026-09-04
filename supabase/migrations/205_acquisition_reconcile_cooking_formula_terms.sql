-- Treat cooking/style terms on front labels as protected formula identity
-- terms during acquisition reconciliation. This prevents a generic
-- "Chicken Recipe" queue title from closing against a "Grilled Chicken"
-- verified product.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.catalog_acquisition_strict_search_high_confidence(text, text, text, text, text, text, real)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'catalog_acquisition_strict_search_high_confidence not found';
  END IF;

  IF function_sql NOT LIKE '%''eggs'', ''filet''%' THEN
    function_sql := replace(
      function_sql,
      $$    'herring', 'lamb', 'liver', 'mackerel',$$,
      $$    'eggs', 'filet', 'herring', 'lamb', 'liver', 'mackerel', 'mignon',$$
    );
  END IF;

  IF function_sql NOT LIKE '%''grilled'', ''haddock''%' THEN
    function_sql := replace(
      function_sql,
      $$    'green', 'haddock', 'heart',$$,
      $$    'green', 'grilled', 'haddock', 'heart',$$
    );
  END IF;

  IF function_sql NOT LIKE '%''porterhouse'', ''quail''%' THEN
    function_sql := replace(
      function_sql,
      $$    'quail', 'rabbit', 'salmon',$$,
      $$    'porterhouse', 'quail', 'rabbit', 'rotisserie', 'salmon',$$
    );
  END IF;

  IF function_sql NOT LIKE '%''shrimp'', ''steak'', ''trout''%' THEN
    function_sql := replace(
      function_sql,
      $$'salmon', 'sardine', 'shrimp', 'trout',$$,
      $$'salmon', 'sardine', 'shrimp', 'steak', 'trout',$$
    );
  END IF;

  IF function_sql NOT LIKE '%''eggs'', ''filet''%'
     OR function_sql NOT LIKE '%''grilled'', ''haddock''%'
     OR function_sql NOT LIKE '%''mackerel'', ''mignon''%'
     OR function_sql NOT LIKE '%''porterhouse'', ''quail''%'
     OR function_sql NOT LIKE '%''rabbit'', ''rotisserie''%'
     OR function_sql NOT LIKE '%''shrimp'', ''steak'', ''trout''%' THEN
    RAISE EXCEPTION 'cooking formula-term patch failed';
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
    'Classic Loaf in Sauce Grilled Chicken wet',
    'dog',
    9.0
  ) THEN
    RAISE EXCEPTION 'plain Cesar chicken title must not reconcile to grilled chicken variant';
  END IF;

  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Cesar',
    'Cesar Classic Loaf Grilled Chicken Dog Food',
    'dog',
    'Cesar',
    'Classic Loaf in Sauce Grilled Chicken wet',
    'dog',
    9.0
  ) THEN
    RAISE EXCEPTION 'Cesar grilled chicken title should reconcile to grilled chicken variant';
  END IF;

  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Cesar',
    'Cesar Classic Loaf in Sauce Filet Mignon Flavor',
    'dog',
    'Cesar',
    'Classic Loaf in Sauce Filet Mignon wet',
    'dog',
    6.3
  ) THEN
    RAISE EXCEPTION 'Cesar filet mignon title should reconcile to filet mignon variant';
  END IF;
END $$;

UPDATE public.catalog_acquisition_queue
SET
  status = 'open',
  resolved_at = NULL,
  resolution_reason = 'reopened: ambiguous chicken title previously matched grilled chicken variant',
  updated_at = now(),
  sample_metadata = COALESCE(sample_metadata, '{}'::jsonb) || jsonb_build_object(
    'reopened_at', now(),
    'reopened_by', '205_acquisition_reconcile_cooking_formula_terms',
    'reopened_reason', 'plain chicken title is not exact enough for grilled chicken variant'
  )
WHERE brand = 'Cesar'
  AND status = 'resolved'
  AND product_name = 'Cesar Classic Loaf in Sauce Chicken Recipe'
  AND sample_metadata->>'matched_product_name' = 'Classic Loaf in Sauce Grilled Chicken';
