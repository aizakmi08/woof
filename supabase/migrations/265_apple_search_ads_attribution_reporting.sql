-- Apple Search Ads attribution and paid-acquisition readiness reporting.
-- Campaign, ad group, and keyword revenue stay in RevenueCat; these views
-- verify the app-side AdServices collection path and paid-spend guardrails.

CREATE OR REPLACE VIEW public.kpi_apple_search_ads_attribution_daily
WITH (security_invoker = true)
AS
SELECT
  date_trunc('day', created_at)::date AS metric_date,
  COALESCE(NULLIF(properties->>'platform', ''), 'unknown') AS platform,
  COALESCE(NULLIF(properties->>'app_version', ''), 'unknown') AS app_version,
  COALESCE(NULLIF(properties->>'native_build_version', ''), 'unknown') AS native_build_version,
  COALESCE(NULLIF(properties->>'runtime_version', ''), 'unknown') AS runtime_version,
  COUNT(*) FILTER (WHERE name = 'apple_search_ads_attribution_collection_requested')::integer AS collection_requests,
  COUNT(DISTINCT user_id) FILTER (WHERE name = 'apple_search_ads_attribution_collection_requested')::integer AS collection_request_users,
  COUNT(DISTINCT session_id) FILTER (WHERE name = 'apple_search_ads_attribution_collection_requested')::integer AS collection_request_sessions,
  COUNT(*) FILTER (WHERE name = 'apple_search_ads_attribution_collection_failed')::integer AS collection_failures,
  COUNT(*) FILTER (
    WHERE name = 'apple_search_ads_attribution_collection_failed'
      AND properties->>'status' = 'not_supported'
  )::integer AS collection_not_supported,
  COUNT(*) FILTER (
    WHERE name = 'apple_search_ads_attribution_collection_failed'
      AND properties->>'status' = 'failed'
  )::integer AS collection_runtime_failures,
  COUNT(*) FILTER (
    WHERE name = 'apple_search_ads_attribution_collection_requested'
      AND properties->>'reidentified' = 'true'
  )::integer AS reidentified_collection_requests,
  ROUND(
    COUNT(*) FILTER (WHERE name = 'apple_search_ads_attribution_collection_failed')::numeric /
    NULLIF(COUNT(*) FILTER (
      WHERE name IN (
        'apple_search_ads_attribution_collection_requested',
        'apple_search_ads_attribution_collection_failed'
      )
    ), 0),
    4
  ) AS collection_failure_rate
FROM public.analytics_events
WHERE name IN (
  'apple_search_ads_attribution_collection_requested',
  'apple_search_ads_attribution_collection_failed'
)
GROUP BY 1, 2, 3, 4, 5;

CREATE OR REPLACE VIEW public.kpi_paid_acquisition_readiness_daily
WITH (security_invoker = true)
AS
WITH events AS (
  SELECT
    *,
    date_trunc('day', created_at)::date AS metric_date
  FROM public.analytics_events
)
SELECT
  metric_date,
  COALESCE(NULLIF(properties->>'platform', ''), 'unknown') AS platform,
  COALESCE(NULLIF(properties->>'app_version', ''), 'unknown') AS app_version,
  COALESCE(NULLIF(properties->>'native_build_version', ''), 'unknown') AS native_build_version,
  COALESCE(NULLIF(properties->>'runtime_version', ''), 'unknown') AS runtime_version,
  COUNT(DISTINCT user_id)::integer AS users,
  COUNT(DISTINCT session_id)::integer AS sessions,
  COUNT(*) FILTER (WHERE name = 'apple_search_ads_attribution_collection_requested')::integer AS apple_search_ads_collection_requests,
  COUNT(*) FILTER (WHERE name = 'apple_search_ads_attribution_collection_failed')::integer AS apple_search_ads_collection_failures,
  COUNT(*) FILTER (WHERE name = 'scan_analysis_started')::integer AS scan_starts,
  COUNT(*) FILTER (WHERE name = 'scan_analysis_completed')::integer AS scan_completions,
  COUNT(*) FILTER (WHERE name IN ('scan_analysis_failed', 'scan_analysis_timeout', 'barcode_not_found'))::integer AS scan_failures,
  COUNT(*) FILTER (WHERE name = 'paywall_requested')::integer AS paywall_requests,
  COUNT(*) FILTER (WHERE name = 'paywall_viewed')::integer AS paywall_views,
  COUNT(*) FILTER (
    WHERE name = 'paywall_offerings_loaded'
      AND properties->>'success' = 'true'
      AND CASE
        WHEN properties->>'missing_plan_count' ~ '^[0-9]+$'
        THEN (properties->>'missing_plan_count')::integer = 0
        WHEN properties->>'package_count' ~ '^[0-9]+$'
        THEN (properties->>'package_count')::integer >= 3
        ELSE false
      END
  )::integer AS expected_package_loads,
  COUNT(*) FILTER (
    WHERE name = 'paywall_offerings_loaded'
      AND NOT COALESCE(
        properties->>'success' = 'true'
        AND CASE
          WHEN properties->>'missing_plan_count' ~ '^[0-9]+$'
          THEN (properties->>'missing_plan_count')::integer = 0
          WHEN properties->>'package_count' ~ '^[0-9]+$'
          THEN (properties->>'package_count')::integer >= 3
          ELSE false
        END,
        false
      )
  )::integer AS expected_package_load_failures,
  COUNT(*) FILTER (WHERE name = 'purchase_started')::integer AS purchase_starts,
  COUNT(*) FILTER (WHERE name = 'purchase_completed')::integer AS purchase_completions,
  COUNT(*) FILTER (WHERE name = 'purchase_no_entitlement')::integer AS purchase_no_entitlement,
  COUNT(*) FILTER (WHERE name = 'restore_no_entitlement')::integer AS restore_no_entitlement,
  COUNT(*) FILTER (WHERE name = 'revenuecat_status_mismatch')::integer AS revenuecat_status_mismatches,
  COUNT(*) FILTER (WHERE name = 'app_error_captured')::integer AS app_errors,
  COUNT(DISTINCT session_id) FILTER (WHERE name = 'app_error_captured')::integer AS app_error_sessions,
  ROUND(COUNT(*) FILTER (WHERE name = 'scan_analysis_completed')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'scan_analysis_started'), 0), 4) AS scan_success_rate,
  ROUND(COUNT(*) FILTER (WHERE name = 'paywall_viewed')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'paywall_requested'), 0), 4) AS paywall_request_to_view_rate,
  ROUND(COUNT(*) FILTER (
    WHERE name = 'paywall_offerings_loaded'
      AND properties->>'success' = 'true'
      AND CASE
        WHEN properties->>'missing_plan_count' ~ '^[0-9]+$'
        THEN (properties->>'missing_plan_count')::integer = 0
        WHEN properties->>'package_count' ~ '^[0-9]+$'
        THEN (properties->>'package_count')::integer >= 3
        ELSE false
      END
  )::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'paywall_viewed'), 0), 4) AS paywall_view_to_expected_package_load_rate,
  ROUND(COUNT(*) FILTER (WHERE name = 'purchase_completed')::numeric / NULLIF(COUNT(*) FILTER (WHERE name = 'purchase_started'), 0), 4) AS purchase_start_completion_rate,
  ROUND(COUNT(DISTINCT session_id) FILTER (WHERE name = 'app_error_captured')::numeric / NULLIF(COUNT(DISTINCT session_id), 0), 4) AS app_error_session_rate
FROM events
GROUP BY 1, 2, 3, 4, 5;

REVOKE ALL ON TABLE public.kpi_apple_search_ads_attribution_daily FROM PUBLIC;
REVOKE ALL ON TABLE public.kpi_paid_acquisition_readiness_daily FROM PUBLIC;

REVOKE ALL ON TABLE public.kpi_apple_search_ads_attribution_daily FROM anon;
REVOKE ALL ON TABLE public.kpi_paid_acquisition_readiness_daily FROM anon;

REVOKE ALL ON TABLE public.kpi_apple_search_ads_attribution_daily FROM authenticated;
REVOKE ALL ON TABLE public.kpi_paid_acquisition_readiness_daily FROM authenticated;

GRANT SELECT ON TABLE public.kpi_apple_search_ads_attribution_daily TO service_role;
GRANT SELECT ON TABLE public.kpi_paid_acquisition_readiness_daily TO service_role;
