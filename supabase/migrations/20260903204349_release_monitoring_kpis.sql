-- One-day release health view spanning app analytics and catalog resolver events.
-- It remains service-role only because both source tables contain internal telemetry.

CREATE OR REPLACE VIEW public.kpi_release_monitoring_daily
WITH (security_invoker = true)
AS
WITH analytics_daily AS (
  SELECT
    date_trunc('day', created_at)::date AS metric_date,
    COUNT(*) FILTER (WHERE name = 'scan_analysis_started')::integer AS scan_starts,
    COUNT(*) FILTER (WHERE name = 'scan_analysis_completed')::integer AS scan_completions,
    COUNT(*) FILTER (WHERE name = 'label_lookup_completed')::integer AS resolver_completions,
    COUNT(*) FILTER (
      WHERE name = 'label_lookup_completed'
        AND properties->>'resolution_decision' = 'exact_confirmed'
    )::integer AS resolver_exact_confirmations,
    COUNT(*) FILTER (
      WHERE name = 'label_lookup_completed'
        AND properties->>'resolution_decision' IN (
          'recognizers_disagree',
          'no_exact_variant',
          'not_readable',
          'timed_out'
        )
    )::integer AS resolver_abstentions,
    COUNT(*) FILTER (WHERE name = 'paywall_viewed')::integer AS paywall_views,
    COUNT(*) FILTER (WHERE name = 'purchase_completed')::integer AS purchase_completions,
    COUNT(*) FILTER (WHERE name = 'restore_started')::integer AS restore_starts,
    COUNT(*) FILTER (WHERE name = 'restore_failed')::integer AS restore_failures
  FROM public.analytics_events
  GROUP BY 1
),
catalog_daily AS (
  SELECT
    date_trunc('day', created_at)::date AS metric_date,
    COUNT(*) FILTER (
      WHERE event_name IN ('catalog_lookup_completed', 'catalog_lookup_miss', 'catalog_lookup_failed')
    )::integer AS catalog_lookup_outcomes,
    COUNT(*) FILTER (WHERE event_name = 'catalog_lookup_miss')::integer AS catalog_misses,
    COUNT(*) FILTER (WHERE event_name = 'catalog_lookup_failed')::integer AS catalog_lookup_failures
  FROM public.product_events
  GROUP BY 1
)
SELECT
  COALESCE(analytics_daily.metric_date, catalog_daily.metric_date) AS metric_date,
  COALESCE(scan_starts, 0)::integer AS scan_starts,
  COALESCE(scan_completions, 0)::integer AS scan_completions,
  ROUND(COALESCE(scan_completions, 0)::numeric / NULLIF(COALESCE(scan_starts, 0), 0), 4) AS scan_success_rate,
  COALESCE(resolver_completions, 0)::integer AS resolver_completions,
  COALESCE(resolver_exact_confirmations, 0)::integer AS resolver_exact_confirmations,
  COALESCE(resolver_abstentions, 0)::integer AS resolver_abstentions,
  ROUND(COALESCE(resolver_abstentions, 0)::numeric / NULLIF(COALESCE(resolver_completions, 0), 0), 4) AS resolver_abstention_rate,
  COALESCE(catalog_lookup_outcomes, 0)::integer AS catalog_lookup_outcomes,
  COALESCE(catalog_misses, 0)::integer AS catalog_misses,
  COALESCE(catalog_lookup_failures, 0)::integer AS catalog_lookup_failures,
  ROUND(COALESCE(catalog_misses, 0)::numeric / NULLIF(COALESCE(catalog_lookup_outcomes, 0), 0), 4) AS catalog_miss_rate,
  COALESCE(paywall_views, 0)::integer AS paywall_views,
  COALESCE(purchase_completions, 0)::integer AS purchase_completions,
  ROUND(COALESCE(purchase_completions, 0)::numeric / NULLIF(COALESCE(paywall_views, 0), 0), 4) AS paywall_purchase_conversion_rate,
  COALESCE(restore_starts, 0)::integer AS restore_starts,
  COALESCE(restore_failures, 0)::integer AS restore_failures,
  ROUND(COALESCE(restore_failures, 0)::numeric / NULLIF(COALESCE(restore_starts, 0), 0), 4) AS restore_failure_rate
FROM analytics_daily
FULL OUTER JOIN catalog_daily USING (metric_date);

REVOKE ALL ON TABLE public.kpi_release_monitoring_daily FROM PUBLIC;
REVOKE ALL ON TABLE public.kpi_release_monitoring_daily FROM anon;
REVOKE ALL ON TABLE public.kpi_release_monitoring_daily FROM authenticated;
GRANT SELECT ON TABLE public.kpi_release_monitoring_daily TO service_role;

COMMENT ON VIEW public.kpi_release_monitoring_daily IS
  'Daily post-release health: scan success, safe resolver abstention, catalog misses, paywall conversion, and restore failures.';
