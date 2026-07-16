import fs from "node:fs";

function readText(path) {
  return fs.readFileSync(path, "utf8");
}

function assertIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label} is missing required marker: ${needle}`);
  }
}

const runbookPath = "WEEKLY_REVIEW_RUNBOOK.md";
const kpiFrameworkPath = "KPI_FRAMEWORK.md";
const projectContextPath = "PROJECT_CONTEXT.md";
const migrationPath = "supabase/migrations/065_kpi_reporting_views.sql";
const attributionMigrationPath = "supabase/migrations/265_apple_search_ads_attribution_reporting.sql";

const runbook = readText(runbookPath);
const kpiFramework = readText(kpiFrameworkPath);
const projectContext = readText(projectContextPath);
const migration = readText(migrationPath);
const attributionMigration = readText(attributionMigrationPath);
const allKpiSql = `${migration}\n${attributionMigration}`;

for (const [path, source] of [
  [runbookPath, runbook],
  [kpiFrameworkPath, kpiFramework],
  [projectContextPath, projectContext],
]) {
  if (source.includes("014_kpi_reporting_views.sql")) {
    throw new Error(`${path} references obsolete KPI migration 014; use ${migrationPath}`);
  }
}

const requiredViews = [
  "public.kpi_daily_funnel",
  "public.kpi_activation_cohorts",
  "public.kpi_scan_failures_daily",
  "public.kpi_scan_usage_daily",
  "public.kpi_analysis_cache_health",
  "public.kpi_paywall_source_daily",
  "public.kpi_paywall_pitch_daily",
  "public.kpi_paywall_daily",
  "public.kpi_revenuecat_daily",
  "public.kpi_apple_search_ads_attribution_daily",
  "public.kpi_paid_acquisition_readiness_daily",
  "public.kpi_app_release_daily",
  "public.kpi_app_errors_daily",
  "public.kpi_share_daily",
  "public.kpi_app_review_daily",
  "public.kpi_support_daily",
  "public.kpi_retention_daily",
];

for (const view of requiredViews) {
  assertIncludes(runbook, view, runbookPath);

  const bareViewName = view.replace("public.", "");
  assertIncludes(allKpiSql, bareViewName, "KPI migrations");
}

for (const marker of [
  "App Store Connect",
  "RevenueCat",
  "Supabase",
  "Anthropic",
  "Weekly Scorecard",
  "Decision Rules",
  "Weekly Narrative Template",
  "analytics_queue_flushes",
  "analytics_queue_drops",
  "analytics_queued_events_flushed",
  "analytics_queued_events_dropped",
  "onboarding_scan_now_taps",
  "onboarding_scan_now_rate",
  "auth_screen_views",
  "auth_screen_view_rate",
  "automatic_guest_session_success_rate",
  "empty_state_scan_cta_taps",
  "empty_state_scan_cta_share",
  "guest_save_prompt_views",
  "guest_save_prompt_completion_rate",
  "guest_save_prompt_dismissal_rate",
  "history_compare_opens",
  "history_compare_result_open_rate",
  "kpi_retention_daily",
  "photo_capture_completions",
  "avg_photo_capture_base64_length",
  "avg_photo_capture_estimated_decoded_bytes",
  "avg_photo_capture_optimization_step",
  "avg_photo_capture_target_width",
  "photo_capture_failures",
  "camera_capture_failures",
  "image_optimization_failures",
  "cached_scan_completions",
  "fresh_scan_completions",
  "scan_cache_completion_rate",
  "image_uploads_per_fresh_scan",
  "estimated_upload_bytes_per_fresh_scan",
  "scan_completions_with_upload",
  "completed_scan_upload_estimated_bytes",
  "fresh_completed_scan_upload_estimated_bytes",
  "matched_upload_bytes_per_completed_scan",
  "matched_upload_bytes_per_fresh_scan",
  "active_cache_rows",
  "expired_cache_rows",
  "active_cache_payload_bytes",
  "active_hits_per_cache_row",
  "share_completions_with_link",
  "share_dismissals",
  "share_dismissal_rate",
  "app_review_prompt_views",
  "app_review_requests",
  "app_review_opens",
  "app_review_open_success_rate",
  "support_contact_taps",
  "support_contact_opens",
  "support_contact_open_rate",
  "paywall_requests",
  "scan_limit_paywall_requests",
  "paywall_request_to_view_rate",
  "paywall_package_loads",
  "paywall_package_load_failures",
  "paywall_expected_package_loads",
  "paywall_expected_package_load_failures",
  "paywall_weekly_package_missing",
  "paywall_monthly_package_missing",
  "paywall_annual_package_missing",
  "placement_offering_requests",
  "placement_offering_returns",
  "placement_current_fallbacks",
  "placement_offering_errors",
  "placement_offering_return_rate",
  "placement_current_fallback_rate",
  "apple_search_ads_collection_requests",
  "apple_search_ads_collection_failures",
  "collection_failure_rate",
  "kpi_apple_search_ads_attribution_daily",
  "kpi_paid_acquisition_readiness_daily",
  "paywall_request_to_package_load_rate",
  "paywall_view_to_package_load_rate",
  "paywall_request_to_expected_package_load_rate",
  "paywall_view_to_expected_package_load_rate",
  "paywall_dismissals",
  "paywall_view_dismissal_rate",
  "avg_paywall_dismiss_duration_ms",
  "purchase_entitlement_refresh_pro_rate",
  "restore_entitlement_refresh_pro_rate",
  "avg_analysis_upload_estimated_bytes",
  "app_version",
  "native_build_version",
  "runtime_version",
  "error_category",
  "error_fingerprint",
]) {
  assertIncludes(runbook, marker, runbookPath);
}

for (const marker of [
  "WEEKLY_REVIEW_RUNBOOK.md",
  "weekly operating",
  migrationPath,
  "058",
  "070",
  attributionMigrationPath,
]) {
  assertIncludes(kpiFramework, marker, kpiFrameworkPath);
}

assertIncludes(projectContext, "WEEKLY_REVIEW_RUNBOOK.md", projectContextPath);
assertIncludes(projectContext, "paywall_dismissed", projectContextPath);
assertIncludes(projectContext, "paywall_closed", projectContextPath);
assertIncludes(projectContext, "avg_paywall_dismiss_duration_ms", projectContextPath);

for (const marker of [
  "onboarding_scan_now_taps",
  "onboarding_scan_now_rate",
  "empty_state_scan_cta_taps",
  "empty_state_scan_cta_share",
  "guest_save_prompt_views",
  "guest_save_prompt_completion_rate",
  "guest_save_prompt_dismissal_rate",
  "history_compare_opens",
  "history_compare_result_open_rate",
  "activated_to_history_compare_rate",
  "paywall_expected_package_loads",
  "paywall_expected_package_load_failures",
  "paywall_weekly_package_missing",
  "paywall_monthly_package_missing",
  "paywall_annual_package_missing",
  "placement_offering_requests",
  "placement_offering_returns",
  "placement_current_fallbacks",
  "placement_offering_errors",
  "placement_offering_return_rate",
  "placement_current_fallback_rate",
  "paywall_request_to_expected_package_load_rate",
  "paywall_view_to_expected_package_load_rate",
  "apple_search_ads_attribution_collection_requested",
  "apple_search_ads_attribution_collection_failed",
  "collection_failure_rate",
  "app_error_session_rate",
]) {
  assertIncludes(allKpiSql, marker, "KPI migrations");
}

console.log("KPI runbook check passed");
