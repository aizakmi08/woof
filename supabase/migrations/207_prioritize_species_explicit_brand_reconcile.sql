-- Brand-scoped acquisition reconciliation should spend each bounded batch on
-- rows that can be proven safely. Unknown-species retailer titles often need
-- authorized source data or manual alias rules; process explicit dog/cat rows
-- first so already-covered products drain from the queue faster without
-- loosening match confidence.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.reconcile_catalog_acquisition_queue_strict_search_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'reconcile_catalog_acquisition_queue_strict_search_for_brand(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%species explicit queue priority%' THEN
    function_sql := replace(
      function_sql,
      $$    ORDER BY
      q.priority_score DESC,
      public.catalog_acquisition_reconcile_checked_at(q.sample_metadata) ASC,
      q.updated_at DESC$$,
      $$    ORDER BY
      CASE
        WHEN lower(COALESCE(q.pet_type, '')) IN ('dog', 'cat')
          OR lower(q.product_name) ~ '\m(dog|dogs|puppy|puppies|canine|cat|cats|kitten|kittens|feline)\M'
          THEN 0
        ELSE 1
      END ASC,
      -- species explicit queue priority
      public.catalog_acquisition_reconcile_checked_at(q.sample_metadata) ASC,
      q.priority_score DESC,
      q.updated_at DESC$$
    );
  END IF;

  IF function_sql NOT LIKE '%species explicit queue priority%' THEN
    RAISE EXCEPTION 'species-explicit queue priority patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) TO service_role;

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.reconcile_catalog_acquisition_queue_strict_search_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql NOT LIKE '%species explicit queue priority%' THEN
    RAISE EXCEPTION 'brand-scoped reconciler must prioritize species-explicit rows';
  END IF;

  IF function_sql NOT LIKE '%ambiguous verified formula guard%' THEN
    RAISE EXCEPTION 'brand-scoped reconciler must keep ambiguous verified formula matches open';
  END IF;
END $$;
