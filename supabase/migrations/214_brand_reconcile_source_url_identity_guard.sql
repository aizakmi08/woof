-- Brand-scoped strict reconciliation should pass source URLs into the identity
-- string it validates. Search ranking already uses source URLs, but the strict
-- reconciler did not, so a dry retailer title could pass against a verified
-- wet formula if the returned product title omitted the word "wet".

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.reconcile_catalog_acquisition_queue_strict_search_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'reconcile_catalog_acquisition_queue_strict_search_for_brand(text, integer) not found';
  END IF;

  IF function_sql NOT LIKE '%matched.source_url%matched_identity%' THEN
    function_sql := replace(
      function_sql,
      $$        matched.package_size,
        matched.gtin
      ) AS matched_identity$$,
      $$        matched.package_size,
        matched.gtin,
        matched.source_url
      ) AS matched_identity$$
    );
  END IF;

  IF function_sql NOT LIKE '%matched.source_url%matched_identity%' THEN
    RAISE EXCEPTION 'brand-scoped reconciler source-url identity patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue_strict_search_for_brand(TEXT, INTEGER) TO service_role;

UPDATE public.catalog_acquisition_queue
SET
  status = 'open',
  resolved_at = NULL,
  resolution_reason = NULL,
  updated_at = now(),
  sample_metadata = COALESCE(sample_metadata, '{}'::jsonb)
    - 'matched_cache_key'
    - 'matched_product_name'
    - 'matched_brand'
    - 'matched_pet_type'
    - 'matched_source'
    - 'matched_source_url'
    - 'matched_rank'
    - 'match_strategy'
    || jsonb_build_object(
      'last_reconcile_checked_at', now(),
      'last_reconcile_checked_by', 'brand_reconcile_source_url_identity_guard',
      'last_reconcile_checked_result', 'reopened_dry_title_wet_source_url',
      'reopened_at', now(),
      'reopened_by', '214_brand_reconcile_source_url_identity_guard',
      'reopen_reason', 'Queue title says dry food but matched official source URL was wet food.'
    )
WHERE brand = 'Blue Buffalo'
  AND product_name = 'Blue Buffalo True Solutions Mobility Care Natural Dry Dog Food for Adult Dogs, Chicken, 24-lb. Bag'
  AND status = 'resolved'
  AND sample_metadata->>'matched_source_url' = 'https://www.bluebuffalo.com/wet-dog-food/true-solutions/mobility-support/';

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.reconcile_catalog_acquisition_queue_strict_search_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql NOT LIKE '%matched.source_url%matched_identity%' THEN
    RAISE EXCEPTION 'brand-scoped reconciler must include source URL in matched identity';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Blue Buffalo',
    'Blue Buffalo True Solutions Mobility Care Natural Dry Dog Food for Adult Dogs, Chicken, 24-lb. Bag',
    'dog',
    'Blue Buffalo',
    'BLUE True Solutions Mobility Care Chicken Recipe for Adult Dogs https://www.bluebuffalo.com/wet-dog-food/true-solutions/mobility-support/',
    'dog',
    8.4
  ) THEN
    RAISE EXCEPTION 'dry Blue True Solutions title must not reconcile to wet source URL identity';
  END IF;
END $$;
