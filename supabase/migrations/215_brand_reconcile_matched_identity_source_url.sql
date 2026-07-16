-- Correct the source URL identity patch with an exact target. Migration 214's
-- guard was too broad because it matched the separate matched_source_url column
-- before matched_identity, so the concat itself could remain unchanged.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.reconcile_catalog_acquisition_queue_strict_search_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'reconcile_catalog_acquisition_queue_strict_search_for_brand(text, integer) not found';
  END IF;

  function_sql := replace(
    function_sql,
    $$        matched.food_form,
        matched.package_size,
        matched.gtin
      ) AS matched_identity$$,
    $$        matched.food_form,
        matched.package_size,
        matched.gtin,
        matched.source_url
      ) AS matched_identity$$
  );

  IF function_sql NOT LIKE '%matched.gtin,%matched.source_url%AS matched_identity%' THEN
    RAISE EXCEPTION 'brand-scoped reconciler exact source-url identity patch failed';
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
      'last_reconcile_checked_by', 'brand_reconcile_matched_identity_source_url',
      'last_reconcile_checked_result', 'reopened_dry_title_wet_source_url',
      'reopened_at', now(),
      'reopened_by', '215_brand_reconcile_matched_identity_source_url',
      'reopen_reason', 'Queue title says dry food but matched official source URL was wet food.'
    )
WHERE status = 'resolved'
  AND lower(product_name) ~ '\mdry\M'
  AND sample_metadata->>'matched_source_url' ~ '/wet-(dog|cat)-food/';

DO $$
DECLARE
  bad_rows INTEGER;
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.reconcile_catalog_acquisition_queue_strict_search_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql NOT LIKE '%matched.gtin,%matched.source_url%AS matched_identity%' THEN
    RAISE EXCEPTION 'brand-scoped reconciler must include matched source URL in matched_identity concat';
  END IF;

  SELECT count(*)::INTEGER
  INTO bad_rows
  FROM public.catalog_acquisition_queue
  WHERE status = 'resolved'
    AND lower(product_name) ~ '\mdry\M'
    AND sample_metadata->>'matched_source_url' ~ '/wet-(dog|cat)-food/';

  IF bad_rows <> 0 THEN
    RAISE EXCEPTION 'dry-title/wet-source resolved rows remain: %', bad_rows;
  END IF;
END $$;
