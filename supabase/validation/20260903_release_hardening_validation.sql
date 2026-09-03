-- Post-deploy validation for the 2026-09-03 release hardening set.
-- Every row must return pass = true. This query is read-only.

WITH checks AS (
  SELECT
    'catalog boundary functions exist'::text AS check_name,
    to_regprocedure('public.search_verified_product_teasers(text,integer)') IS NOT NULL
      AND to_regprocedure('public.resolve_verified_product_teaser_by_gtin(text,integer)') IS NOT NULL
      AND to_regprocedure('public.consume_verified_catalog_product(text,text,text)') IS NOT NULL AS pass

  UNION ALL

  SELECT
    'authenticated cannot select ingredient or nutrient columns',
    NOT has_column_privilege('authenticated', 'public.product_data', 'ingredients', 'SELECT')
      AND NOT has_column_privilege('authenticated', 'public.product_data', 'ingredient_text', 'SELECT')
      AND NOT has_column_privilege('authenticated', 'public.product_data', 'nutritional_info', 'SELECT')
      AND NOT has_column_privilege('authenticated', 'public.product_data', 'nutrient_panel', 'SELECT')

  UNION ALL

  SELECT
    'authenticated cannot execute full-row catalog RPCs',
    COALESCE(NOT has_function_privilege('authenticated', to_regprocedure('public.resolve_verified_product_by_gtin(text,integer)'), 'EXECUTE'), true)
      AND COALESCE(NOT has_function_privilege('authenticated', to_regprocedure('public.search_products(text,integer)'), 'EXECUTE'), true)
      AND COALESCE(NOT has_function_privilege('authenticated', to_regprocedure('public.search_verified_products(text,integer)'), 'EXECUTE'), true)
      AND COALESCE(NOT has_function_privilege('authenticated', to_regprocedure('public.search_verified_products_for_label_fast(text[],integer)'), 'EXECUTE'), true)
      AND COALESCE(NOT has_function_privilege('authenticated', to_regprocedure('public.search_verified_products_for_label_ocr(text[],integer)'), 'EXECUTE'), true)
      AND COALESCE(NOT has_function_privilege('authenticated', to_regprocedure('public.search_verified_products_for_label_ocr_text(text,integer)'), 'EXECUTE'), true)
      AND COALESCE(NOT has_function_privilege('authenticated', to_regprocedure('public.search_verified_products_ranked_v1(text,integer)'), 'EXECUTE'), true)

  UNION ALL

  SELECT
    'dead parameter-trust RPCs remain revoked',
    COALESCE(NOT has_function_privilege('authenticated', to_regprocedure('public.get_human_food_count_today(uuid)'), 'EXECUTE'), true)
      AND COALESCE(NOT has_function_privilege('authenticated', to_regprocedure('public.increment_human_food_count(uuid)'), 'EXECUTE'), true)
      AND COALESCE(NOT has_function_privilege('authenticated', to_regprocedure('public.increment_scan_count(uuid)'), 'EXECUTE'), true)

  UNION ALL

  SELECT
    'deletion tombstone and webhook rejection trigger exist',
    to_regclass('public.deleted_revenuecat_identities') IS NOT NULL
      AND to_regprocedure('public.is_deleted_revenuecat_identity(text[])') IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgrelid = 'public.revenuecat_events'::regclass
          AND tgname = 'reject_deleted_revenuecat_event'
          AND NOT tgisinternal
      )

  UNION ALL

  SELECT
    'normalized GTIN indexes exist',
    to_regclass('public.idx_product_data_normalized_gtin') IS NOT NULL
      AND (
        to_regclass('public.catalog_skus') IS NULL
        OR to_regclass('public.idx_catalog_skus_normalized_gtin') IS NOT NULL
      )

  UNION ALL

  SELECT
    'release monitoring view is service-role only',
    to_regclass('public.kpi_release_monitoring_daily') IS NOT NULL
      AND has_table_privilege('service_role', 'public.kpi_release_monitoring_daily', 'SELECT')
      AND NOT has_table_privilege('authenticated', 'public.kpi_release_monitoring_daily', 'SELECT')
      AND NOT has_table_privilege('anon', 'public.kpi_release_monitoring_daily', 'SELECT')
)
SELECT check_name, pass
FROM checks
ORDER BY check_name;
