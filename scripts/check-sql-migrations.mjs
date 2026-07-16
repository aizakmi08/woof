import fs from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = "supabase/migrations";
const LOCAL_BASELINE_MAX = 6;
const LIVE_PRODUCTION_MAX = 57;
const FIRST_DEPLOYABLE_AUDIT_MIGRATION = 58;
const failures = [];

function fail(message) {
  failures.push(message);
}

function readMigrations() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({
      file,
      path: path.join(MIGRATIONS_DIR, file),
      sql: fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"),
    }));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasRegex(sql, regex) {
  return regex.test(sql);
}

function checkFilenames(migrations) {
  const prefixes = [];

  for (const migration of migrations) {
    const match = migration.file.match(/^(\d{3})_[a-z0-9_]+\.sql$/);
    if (!match) {
      fail(`${migration.file}: migration filename must match 000_description.sql`);
      continue;
    }
    prefixes.push(Number(match[1]));
  }

  const unique = new Set(prefixes);
  if (unique.size !== prefixes.length) {
    fail("Migration numeric prefixes must be unique");
  }

  const sorted = [...unique].sort((left, right) => left - right);
  const baseline = sorted.filter((prefix) => prefix <= LOCAL_BASELINE_MAX);
  const deployableAudit = sorted.filter((prefix) => prefix >= FIRST_DEPLOYABLE_AUDIT_MIGRATION);
  const reservedProduction = sorted.filter(
    (prefix) => prefix > LOCAL_BASELINE_MAX && prefix <= LIVE_PRODUCTION_MAX
  );

  for (let index = 0; index < baseline.length; index += 1) {
    const expected = index + 1;
    if (baseline[index] !== expected) {
      fail(`Baseline migration prefixes should be contiguous from 001; expected ${String(expected).padStart(3, "0")} but found ${String(baseline[index]).padStart(3, "0")}`);
      break;
    }
  }

  if (reservedProduction.length > 0) {
    fail(
      `Migration prefixes ${reservedProduction.map((prefix) => String(prefix).padStart(3, "0")).join(", ")} collide with live Supabase production history; use ${String(FIRST_DEPLOYABLE_AUDIT_MIGRATION).padStart(3, "0")}+ for audit migrations`
    );
  }

  for (let index = 0; index < deployableAudit.length; index += 1) {
    const expected = FIRST_DEPLOYABLE_AUDIT_MIGRATION + index;
    if (deployableAudit[index] !== expected) {
      fail(`Deployable audit migration prefixes should be contiguous from ${String(FIRST_DEPLOYABLE_AUDIT_MIGRATION).padStart(3, "0")}; expected ${String(expected).padStart(3, "0")} but found ${String(deployableAudit[index]).padStart(3, "0")}`);
      break;
    }
  }
}

function checkSecurityDefiner(migration) {
  const regex = /SECURITY\s+DEFINER/gi;
  for (const match of migration.sql.matchAll(regex)) {
    const following = migration.sql.slice(match.index, match.index + 260);
    if (!/SET\s+search_path\s*=\s*public\b/i.test(following)) {
      fail(`${migration.file}: SECURITY DEFINER function must set search_path = public`);
    }
  }
}

function checkTablesHaveRls(migration, allSql) {
  const regex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(public)\.)?([a-z_][a-z0-9_]*)/gi;

  for (const match of migration.sql.matchAll(regex)) {
    const table = match[2];
    const tablePattern = `(?:public\\.)?${escapeRegex(table)}`;
    const rlsRegex = new RegExp(`ALTER\\s+TABLE\\s+${tablePattern}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i");

    if (!rlsRegex.test(allSql)) {
      fail(`${migration.file}: table ${table} must enable row level security`);
    }
  }
}

function checkExplicitDataApiGrants(allSql) {
  const required = [
    {
      label: "analytics_events authenticated insert",
      regex: /GRANT\s+INSERT\s+ON\s+TABLE\s+public\.analytics_events\s+TO\s+authenticated/i,
    },
    {
      label: "analytics_events service role access",
      regex: /GRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+TABLE\s+public\.analytics_events\s+TO\s+service_role/i,
    },
    {
      label: "scan_usage_events authenticated select",
      regex: /GRANT\s+SELECT\s+ON\s+TABLE\s+public\.scan_usage_events\s+TO\s+authenticated/i,
    },
    {
      label: "scan_usage_events service role access",
      regex: /GRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+TABLE\s+public\.scan_usage_events\s+TO\s+service_role/i,
    },
    {
      label: "revenuecat_events service role access",
      regex: /GRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+TABLE\s+public\.revenuecat_events\s+TO\s+service_role/i,
    },
  ];

  for (const { label, regex } of required) {
    if (!regex.test(allSql)) {
      fail(`Data API grant coverage: missing ${label}`);
    }
  }

  for (const table of ["analytics_events", "scan_usage_events", "revenuecat_events"]) {
    for (const role of ["PUBLIC", "anon"]) {
      const revokeRegex = new RegExp(`REVOKE\\s+ALL\\s+ON\\s+TABLE\\s+public\\.${table}\\s+FROM\\s+${role}`, "i");
      if (!revokeRegex.test(allSql)) {
        fail(`Data API grant coverage: public.${table} must revoke broad access from ${role}`);
      }
    }
  }

  if (/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[\s\S]+?ON\s+TABLE\s+public\.revenuecat_events\s+TO\s+(?:anon|authenticated)\b/i.test(allSql)) {
    fail("Data API grant coverage: revenuecat_events must not be exposed to anon or authenticated clients");
  }
}

function checkKpiViews(migration, allSql) {
  const regex = /CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.(kpi_[a-z0-9_]+)/gi;

  for (const match of migration.sql.matchAll(regex)) {
    const view = match[1];
    const following = migration.sql.slice(match.index, match.index + 160);
    if (!/WITH\s*\(\s*security_invoker\s*=\s*true\s*\)/i.test(following)) {
      fail(`${migration.file}: ${view} must use security_invoker = true`);
    }

    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      const revokeRegex = new RegExp(`REVOKE\\s+ALL\\s+ON\\s+TABLE\\s+public\\.${escapeRegex(view)}\\s+FROM\\s+${role}`, "i");
      if (!hasRegex(allSql, revokeRegex)) {
        fail(`${migration.file}: ${view} must revoke access from ${role}`);
      }
    }

    const grantRegex = new RegExp(`GRANT\\s+SELECT\\s+ON\\s+TABLE\\s+public\\.${escapeRegex(view)}\\s+TO\\s+service_role`, "i");
    if (!hasRegex(allSql, grantRegex)) {
      fail(`${migration.file}: ${view} must grant SELECT to service_role`);
    }
  }
}

function checkNoAnonExecute(migration) {
  if (/GRANT\s+EXECUTE\s+ON\s+FUNCTION[\s\S]+?\s+TO\s+anon\b/i.test(migration.sql)) {
    fail(`${migration.file}: do not grant function EXECUTE to anon`);
  }
}

function checkNoDangerousDrops(migration) {
  if (/\bDROP\s+TABLE\b/i.test(migration.sql)) {
    fail(`${migration.file}: DROP TABLE is not allowed in migration safety checks`);
  }
}

function checkProfileWriteSecurity(allSql) {
  if (!/REVOKE\s+INSERT\s*,\s*UPDATE\s+ON\s+TABLE\s+public\.profiles\s+FROM\s+authenticated/i.test(allSql)) {
    fail("profiles: authenticated role must not have broad INSERT/UPDATE privileges");
  }

  if (/GRANT\s+UPDATE\s+ON\s+TABLE\s+public\.profiles\s+TO\s+authenticated/i.test(allSql)) {
    fail("profiles: authenticated role must not receive broad UPDATE on profiles");
  }

  if (/GRANT\s+INSERT\s+ON\s+TABLE\s+public\.profiles\s+TO\s+authenticated/i.test(allSql)) {
    fail("profiles: authenticated role must not receive broad INSERT on profiles");
  }

  if (/GRANT\s+UPDATE\s*\([^)]*(?:is_pro|scan_count|pro_expires_at|revenuecat_)/i.test(allSql)) {
    fail("profiles: client UPDATE grants must not include entitlement, scan count, or RevenueCat columns");
  }

  if (!/CREATE\s+POLICY\s+"Users update own history"\s+ON\s+public\.scan_history[\s\S]+?FOR\s+UPDATE[\s\S]+?WITH\s+CHECK\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i.test(allSql)) {
    fail("scan_history: missing own-row UPDATE policy required for upsert-based sync");
  }
}

function checkDeleteAccountCoverage(allSql) {
  const match = allSql.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.delete_own_account\(\)[\s\S]+?END;\s*\$\$/gi);
  const latestFunction = match ? match.at(-1) : "";

  if (!latestFunction) {
    fail("delete_own_account: missing account deletion RPC");
    return;
  }

  for (const requiredDelete of [
    "public.analytics_events",
    "public.revenuecat_events",
    "public.scan_usage_events",
    "public.rate_limits",
    "auth.users",
  ]) {
    const deleteRegex = new RegExp(`DELETE\\s+FROM\\s+${escapeRegex(requiredDelete)}`, "i");
    if (!deleteRegex.test(latestFunction)) {
      fail(`delete_own_account: must delete from ${requiredDelete}`);
    }
  }

  for (const role of ["PUBLIC", "anon"]) {
    const revokeRegex = new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.delete_own_account\\(\\)\\s+FROM\\s+${role}`, "i");
    if (!revokeRegex.test(allSql)) {
      fail(`delete_own_account: must revoke EXECUTE from ${role}`);
    }
  }

  if (!/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.delete_own_account\(\)\s+TO\s+authenticated/i.test(allSql)) {
    fail("delete_own_account: authenticated users must be able to execute the account deletion RPC");
  }
}

function checkTierAwareRateLimit(allSql) {
  const matches = allSql.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?check_rate_limit\([\s\S]+?END;\s*\$\$/gi);
  const latestFunction = matches ? matches.at(-1) : "";

  if (!latestFunction) {
    fail("check_rate_limit: missing rate-limit RPC");
    return;
  }

  for (const requiredPattern of [
    /\bFROM\s+public\.profiles\b/i,
    /\bis_pro\b/i,
    /\bpro_expires_at\b/i,
    /\bv_effective_max_requests\b/i,
    /\bGREATEST\s*\(\s*p_max_requests\s*,\s*240\s*\)/i,
  ]) {
    if (!requiredPattern.test(latestFunction)) {
      fail("check_rate_limit: must be tier-aware for active Pro users");
      return;
    }
  }

  if (!/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.check_rate_limit\(UUID,\s*INTEGER,\s*INTEGER\)\s+FROM\s+authenticated/i.test(allSql)) {
    fail("check_rate_limit: authenticated clients must not execute the service-owned rate-limit RPC directly");
  }
}

function latestFunctionBody(allSql, functionName) {
  const matches = allSql.match(new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+(?:public\\.)?${escapeRegex(functionName)}\\([\\s\\S]+?END;\\s*\\$\\$`, "gi"));
  return matches ? matches.at(-1) : "";
}

function checkConsumeScanReversedRetries(allSql) {
  const latestFunction = latestFunctionBody(allSql, "consume_scan");

  if (!latestFunction) {
    fail("consume_scan: missing scan entitlement RPC");
    return;
  }

  for (const requiredPattern of [
    /\bFOR\s+UPDATE\b/i,
    /\bv_has_existing\s*:=\s*FOUND\b/i,
    /IF\s+auth\.role\(\)\s*=\s*'service_role'\s+THEN[\s\S]+?v_free_limit\s*:=\s*GREATEST\s*\(\s*COALESCE\s*\(\s*p_free_limit\s*,\s*3\s*\)\s*,\s*0\s*\)\s*;[\s\S]+?ELSE[\s\S]+?v_free_limit\s*:=\s*3\s*;/i,
    /\bv_existing\.reversed\b/i,
    /\bNOT\s+COALESCE\s*\(\s*v_existing\.reversed\s*,\s*false\s*\)/i,
    /\breversed\s*=\s*false\b/i,
    /\breversed_at\s*=\s*NULL\b/i,
    /\breversal_reason\s*=\s*NULL\b/i,
  ]) {
    if (!requiredPattern.test(latestFunction)) {
      fail("consume_scan: latest function must re-consume/block reversed scan_id retries and prevent authenticated clients from overriding the free-scan limit");
      return;
    }
  }

  if (!/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.consume_scan\(UUID,\s*TEXT,\s*TEXT,\s*INTEGER\)\s+TO\s+authenticated/i.test(allSql)) {
    fail("consume_scan: authenticated clients need EXECUTE for local barcode cache-hit scan accounting");
  }

  const consumeScanAuthRevoke = /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.consume_scan\(UUID,\s*TEXT,\s*TEXT,\s*INTEGER\)\s+FROM\s+authenticated/gi;
  const consumeScanAuthGrant = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.consume_scan\(UUID,\s*TEXT,\s*TEXT,\s*INTEGER\)\s+TO\s+authenticated/gi;
  const lastRevoke = [...allSql.matchAll(consumeScanAuthRevoke)].at(-1)?.index ?? -1;
  const lastGrant = [...allSql.matchAll(consumeScanAuthGrant)].at(-1)?.index ?? -1;
  if (lastRevoke > lastGrant) {
    fail("consume_scan: latest authenticated EXECUTE permission must be granted after any authenticated revoke");
  }
}

function checkRevenueCatEntitlementKpiCoverage(allSql) {
  for (const required of [
    "purchase_entitlement_refreshed",
    "restore_entitlement_refreshed",
    "purchase_no_entitlement",
    "purchase_pending",
    "restore_no_entitlement",
    "revenuecat_status_mismatch",
    "purchase_entitlement_refresh_pro_rate",
  ]) {
    if (!allSql.includes(required)) {
      fail(`kpi reporting: missing RevenueCat entitlement diagnostic coverage for ${required}`);
    }
  }
}

function checkReleaseTelemetryKpiCoverage(allSql) {
  for (const required of [
    "kpi_app_release_daily",
    "app_version",
    "native_build_version",
    "runtime_version",
    "scan_success_rate",
    "app_errors_per_session",
    "error_category",
    "error_fingerprint",
  ]) {
    if (!allSql.includes(required)) {
      fail(`kpi reporting: missing release telemetry coverage for ${required}`);
    }
  }
}

function checkScanFailureKpiCoverage(allSql) {
  for (const required of [
    "kpi_scan_failures_daily",
    "failure_category",
    "error_code",
    "http_status",
    "scan_usage_reversed",
    "entitlement_recovery_attempted",
  ]) {
    if (!allSql.includes(required)) {
      fail(`kpi reporting: missing scan failure diagnostic coverage for ${required}`);
    }
  }
}

function checkAuthEntryKpiCoverage(allSql) {
  for (const required of [
    "analytics_queue_flushes",
    "analytics_queue_drops",
    "analytics_queued_events_flushed",
    "analytics_queued_events_dropped",
    "auth_screen_views",
    "auth_screen_view_rate",
    "anonymous_sign_in_starts",
    "automatic_guest_session_starts",
    "automatic_guest_session_completions",
    "automatic_guest_session_failures",
    "manual_guest_session_starts",
    "manual_guest_session_completions",
    "manual_guest_session_failures",
    "manual_guest_continue_starts",
    "manual_guest_continue_completions",
    "manual_guest_continue_failures",
    "provider_sign_in_starts",
    "provider_sign_in_completions",
    "provider_sign_in_failures",
    "provider_sign_in_cancellations",
    "auth_completions",
    "onboarding_completion_rate",
    "kpi_onboarding_path_daily",
    "onboarding_path",
    "completed_flow",
    "scan_now_incomplete",
    "education_incomplete",
    "education_path_starts",
    "onboarding_to_scan_start_rate",
    "onboarding_to_scan_completion_rate",
    "completed_scan_to_paywall_rate",
    "automatic_guest_session_success_rate",
    "manual_guest_continue_success_rate",
    "provider_sign_in_completion_rate",
  ]) {
    if (!allSql.includes(required)) {
      fail(`kpi reporting: missing first-run auth entry coverage for ${required}`);
    }
  }
}

function checkShareAcquisitionKpiCoverage(allSql) {
  for (const required of [
    "share_starts_with_link",
    "share_completions_with_link",
    "share_dismissed",
    "share_dismissals",
    "share_dismissal_rate",
    "share_url_attached",
    "share_completion_rate",
    "kpi_share_daily",
  ]) {
    if (!allSql.includes(required)) {
      fail(`kpi reporting: missing share acquisition coverage for ${required}`);
    }
  }
}

function checkAppReviewKpiCoverage(allSql) {
  for (const required of [
    "app_review_prompt_viewed",
    "app_review_prompt_dismissed",
    "app_review_requested",
    "app_review_opened",
    "app_review_open_failed",
    "app_review_prompt_views",
    "app_review_requests",
    "app_review_opens",
    "app_review_open_failures",
    "app_review_prompt_request_rate",
    "app_review_open_success_rate",
    "kpi_app_review_daily",
  ]) {
    if (!allSql.includes(required)) {
      fail(`kpi reporting: missing app review coverage for ${required}`);
    }
  }
}

function checkSupportKpiCoverage(allSql) {
  for (const required of [
    "support_contact_tapped",
    "support_contact_opened",
    "support_contact_failed",
    "support_contact_taps",
    "support_contact_opens",
    "support_contact_failures",
    "support_contact_open_rate",
    "kpi_support_daily",
  ]) {
    if (!allSql.includes(required)) {
      fail(`kpi reporting: missing support contact coverage for ${required}`);
    }
  }
}

function checkRetentionKpiCoverage(allSql) {
  for (const required of [
    "history_item_opened",
    "history_search_started",
    "history_search_submitted",
    "history_search_cleared",
    "history_filter_changed",
    "history_filters_cleared",
    "history_list_expanded",
    "history_list_collapsed",
    "history_search_starts",
    "history_search_submissions",
    "history_filter_changes",
    "history_tool_result_opens",
    "history_tool_result_open_rate",
    "home_history_search",
    "home_history_filter",
    "history_compare_opened",
    "history_compare_closed",
    "history_compare_result_opened",
    "history_compare_opens",
    "history_compare_result_opens",
    "history_compare_result_open_rate",
    "history_compare_opens_per_user",
    "activated_to_history_compare_rate",
    "kpi_retention_daily",
    "compare_result_open_rate",
  ]) {
    if (!allSql.includes(required)) {
      fail(`kpi reporting: missing retention comparison coverage for ${required}`);
    }
  }
}

function checkCaptureFrictionKpiCoverage(allSql) {
  for (const required of [
    "camera_permission_requests",
    "camera_permission_grants",
    "camera_permission_denials",
    "scanner_help_opened",
    "scanner_help_opens",
    "photo_capture_failed",
    "photo_capture_completed",
    "photo_capture_completions",
    "avg_photo_capture_base64_length",
    "avg_photo_capture_estimated_decoded_bytes",
    "avg_photo_capture_optimization_step",
    "avg_photo_capture_target_width",
    "photo_capture_failures",
    "camera_capture_failures",
    "image_optimization_failures",
    "photo_capture_cancelled",
    "photo_capture_cancellations",
    "oversized_photo_blocks",
  ]) {
    if (!allSql.includes(required)) {
      fail(`kpi reporting: missing capture friction coverage for ${required}`);
    }
  }
}

function checkScanCostKpiCoverage(allSql) {
  for (const required of [
    "cached_scan_completions",
    "fresh_scan_completions",
    "scan_cache_completion_rate",
    "image_uploads_per_fresh_scan",
    "estimated_upload_bytes_per_fresh_scan",
    "analysis_upload_estimated_bytes",
    "avg_analysis_upload_estimated_bytes",
    "analysis_image_retry_suppressions",
    "scan_completions_with_upload",
    "completed_scan_upload_attempts",
    "completed_image_upload_attempts",
    "completed_scan_upload_estimated_bytes",
    "fresh_completed_scan_upload_estimated_bytes",
    "matched_image_uploads_per_completed_scan",
    "matched_upload_bytes_per_completed_scan",
    "matched_image_uploads_per_fresh_scan",
    "matched_upload_bytes_per_fresh_scan",
  ]) {
    if (!allSql.includes(required)) {
      fail(`kpi reporting: missing scan cost/cache coverage for ${required}`);
    }
  }
}

function checkAnalysisCacheHealthKpiCoverage(allSql) {
  for (const required of [
    "kpi_analysis_cache_health",
    "total_cache_rows",
    "active_cache_rows",
    "expired_cache_rows",
    "cache_rows_with_hits",
    "total_cache_hits",
    "active_cache_payload_bytes",
    "avg_active_cache_payload_bytes",
    "max_active_cache_payload_bytes",
    "cache_rows_with_hits_rate",
    "active_hits_per_cache_row",
    "pg_column_size",
  ]) {
    if (!allSql.includes(required)) {
      fail(`kpi reporting: missing analysis cache health coverage for ${required}`);
    }
  }
}

function checkPaywallRequestKpiCoverage(allSql) {
  for (const required of [
    "paywall_requested",
    "paywall_requests",
    "scan_limit_paywall_requests",
    "source_intent",
    "free_scan_status_tapped",
    "free_scan_status_taps",
    "paywall_request_to_view_rate",
    "paywall_offerings_loaded",
    "paywall_offering_load_attempts",
    "paywall_package_loads",
    "paywall_package_load_failures",
    "placement_offering_requests",
    "placement_offering_returns",
    "placement_current_fallbacks",
    "placement_offering_errors",
    "placement_offering_return_rate",
    "placement_current_fallback_rate",
    "paywall_request_to_package_load_rate",
    "paywall_view_to_package_load_rate",
    "paywall_dismissed",
    "paywall_dismissals",
    "paywall_view_dismissal_rate",
    "avg_paywall_dismiss_duration_ms",
    "duration_ms",
    "package_count",
    "kpi_paywall_source_daily",
    "kpi_paywall_daily",
    "kpi_paywall_pitch_daily",
  ]) {
    if (!allSql.includes(required)) {
      fail(`kpi reporting: missing paywall request coverage for ${required}`);
    }
  }

  if (!/CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.kpi_paywall_source_daily[\s\S]+?'paywall_requested'[\s\S]+?paywall_request_to_view_rate/i.test(allSql)) {
    fail("kpi_paywall_source_daily: missing source-level paywall request-to-view coverage");
  }

  if (!/CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.kpi_paywall_source_daily[\s\S]+?properties->>'source_intent'[\s\S]+?GROUP\s+BY\s+1,\s*2,\s*3/i.test(allSql)) {
    fail("kpi_paywall_source_daily: missing source-intent grouping");
  }

  if (!/CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.kpi_paywall_source_daily[\s\S]+?'paywall_offerings_loaded'[\s\S]+?package_loads[\s\S]+?paywall_request_to_package_load_rate/i.test(allSql)) {
    fail("kpi_paywall_source_daily: missing source-level package-load coverage");
  }

  if (!/CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.kpi_paywall_source_daily[\s\S]+?placement_offering_requests[\s\S]+?placement_offering_return_rate[\s\S]+?placement_current_fallback_rate/i.test(allSql)) {
    fail("kpi_paywall_source_daily: missing source-level placement offering coverage");
  }

  if (!/CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.kpi_paywall_source_daily[\s\S]+?'paywall_dismissed'[\s\S]+?paywall_view_dismissal_rate/i.test(allSql)) {
    fail("kpi_paywall_source_daily: missing source-level paywall dismissal coverage");
  }

  for (const [viewName, regex] of [
    [
      "kpi_paywall_daily",
      /CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.kpi_paywall_daily[\s\S]+?properties->>'source_intent'[\s\S]+?properties,\s*name[\s\S]+?purchase_entitlement_refresh_pro/i,
    ],
    [
      "kpi_paywall_pitch_daily",
      /CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.kpi_paywall_pitch_daily[\s\S]+?properties->>'source_intent'[\s\S]+?properties,\s*name[\s\S]+?purchase_entitlement_refresh_pro/i,
    ],
  ]) {
    if (!regex.test(allSql)) {
      fail(`${viewName}: paywall diagnostic CTE must select properties before using entitlement fields`);
    }
  }
}

const migrations = readMigrations();
const allSql = migrations.map((migration) => migration.sql).join("\n\n");

checkFilenames(migrations);
checkExplicitDataApiGrants(allSql);
checkProfileWriteSecurity(allSql);
checkDeleteAccountCoverage(allSql);
checkTierAwareRateLimit(allSql);
checkConsumeScanReversedRetries(allSql);
checkRevenueCatEntitlementKpiCoverage(allSql);
checkReleaseTelemetryKpiCoverage(allSql);
checkScanFailureKpiCoverage(allSql);
checkAuthEntryKpiCoverage(allSql);
checkShareAcquisitionKpiCoverage(allSql);
checkAppReviewKpiCoverage(allSql);
checkSupportKpiCoverage(allSql);
checkRetentionKpiCoverage(allSql);
checkCaptureFrictionKpiCoverage(allSql);
checkScanCostKpiCoverage(allSql);
checkAnalysisCacheHealthKpiCoverage(allSql);
checkPaywallRequestKpiCoverage(allSql);

for (const migration of migrations) {
  checkSecurityDefiner(migration);
  checkTablesHaveRls(migration, allSql);
  checkKpiViews(migration, allSql);
  checkNoAnonExecute(migration);
  checkNoDangerousDrops(migration);
}

if (failures.length > 0) {
  console.error("SQL migration safety check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`SQL migration safety check passed (${migrations.length} migrations checked)`);
