#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const analyticsSource = fs.readFileSync(path.join(root, "services/analytics.js"), "utf8");
const scannerSource = fs.readFileSync(path.join(root, "screens/ScannerScreen.js"), "utf8");
const homeSource = fs.readFileSync(path.join(root, "screens/HomeScreen.js"), "utf8");
const resultsSource = fs.readFileSync(path.join(root, "screens/ResultsScreen/index.js"), "utf8");
const paywallSource = fs.readFileSync(path.join(root, "screens/PaywallScreen.js"), "utf8");
const appSource = fs.readFileSync(path.join(root, "App.js"), "utf8");
const migrationSource = [
  "029_product_events.sql",
  "030_add_app_error_event.sql",
  "041_log_product_event_arg_order_compat.sql",
  "043_refresh_runtime_schema_contract.sql",
  "044_resolve_log_product_event_rpc_ambiguity.sql",
].map((file) => fs.readFileSync(path.join(root, "supabase/migrations", file), "utf8")).join("\n");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`product analytics guard failed: ${message}`);
    process.exit(1);
  }
}

for (const eventName of [
  "scan_started",
  "search_result_tapped",
  "analysis_completed",
  "analysis_failed",
  "ingredient_label_requested",
  "pet_type_requested",
  "paywall_viewed",
  "paywall_plan_selected",
  "purchase_started",
  "purchase_completed",
  "purchase_failed",
  "restore_started",
  "restore_completed",
  "restore_failed",
  "app_error",
]) {
  assert(
    analyticsSource.includes(`"${eventName}"`) &&
      migrationSource.includes(`'${eventName}'`),
    `${eventName} must be present in client and database allowlists`
  );
}

assert(
  analyticsSource.includes('const SESSION_KEY = "@woof_analytics_session_id"') &&
    analyticsSource.includes("export function analyticsKeyHash(value)") &&
    analyticsSource.includes("Math.imul(hash, 16777619)") &&
    analyticsSource.includes('.rpc("log_product_event"') &&
    analyticsSource.includes("sanitizeMetadata(metadata)") &&
	    analyticsSource.includes("if (!ALLOWED_EVENTS.has(eventName)) return") &&
	    analyticsSource.includes("ANALYTICS_SCHEMA_RETRY_MS") &&
	    analyticsSource.includes("const ANALYTICS_SCHEMA_MAX_RETRY_MS = 15 * 60_000") &&
	    analyticsSource.includes("let analyticsSchemaRetryMs = ANALYTICS_SCHEMA_RETRY_MS") &&
	    analyticsSource.includes("function analyticsErrorText(err)") &&
	    analyticsSource.includes("isAnalyticsSchemaUnavailable") &&
	    analyticsSource.includes("err?.details") &&
	    analyticsSource.includes("err?.hint") &&
	    analyticsSource.includes('err?.code === "PGRST202"') &&
	    analyticsSource.includes('err?.code === "PGRST203"') &&
	    analyticsSource.includes("analyticsRpcRetryAt = Date.now() + analyticsSchemaRetryMs") &&
	    analyticsSource.includes("analyticsSchemaRetryMs = Math.min(analyticsSchemaRetryMs * 2, ANALYTICS_SCHEMA_MAX_RETRY_MS)") &&
	    analyticsSource.includes("function noteAnalyticsRpcSuccess()") &&
	    analyticsSource.includes("analyticsSchemaRetryMs = ANALYTICS_SCHEMA_RETRY_MS") &&
	    analyticsSource.includes("noteAnalyticsRpcSuccess()") &&
	    analyticsSource.includes("Date.now() < analyticsRpcRetryAt") &&
	    analyticsSource.includes("const ANALYTICS_RPC_TIMEOUT_MS = 2_500") &&
	    analyticsSource.includes("const ANALYTICS_MAX_INFLIGHT = 2") &&
	    analyticsSource.includes("let analyticsInflight = 0") &&
	    analyticsSource.includes("let sessionIdMemory = null") &&
	    analyticsSource.includes("let sessionIdPromise = null") &&
	    analyticsSource.includes("if (sessionIdMemory) return sessionIdMemory") &&
	    analyticsSource.includes("if (sessionIdPromise) return sessionIdPromise") &&
	    analyticsSource.includes("sessionIdMemory = existing") &&
	    analyticsSource.includes("sessionIdPromise = null") &&
    analyticsSource.includes("function withAnalyticsTimeout(promise, label, timeoutMs = ANALYTICS_RPC_TIMEOUT_MS)") &&
    analyticsSource.includes("function startAnalyticsRpcDeadline(timeoutMs = ANALYTICS_RPC_TIMEOUT_MS)") &&
    analyticsSource.includes('err.code = "ANALYTICS_TIMEOUT"') &&
    analyticsSource.includes("if (analyticsInflight >= ANALYTICS_MAX_INFLIGHT) return") &&
    analyticsSource.includes('withAnalyticsTimeout(getSessionId(), "Analytics session")') &&
    analyticsSource.includes(".abortSignal(request.signal)") &&
    analyticsSource.includes("analyticsInflight = Math.max(0, analyticsInflight - 1)") &&
    analyticsSource.includes("export function trackError(source, error, metadata = {})") &&
    analyticsSource.includes(".catch(handleAnalyticsError)") &&
    analyticsSource.includes("function handleAnalyticsError(err)"),
  "analytics service must use a persisted session id, sanitize metadata, allowlist events, suppress stale schema-cache failures, bound telemetry work, and fail non-blocking"
);

assert(
  migrationSource.includes("CREATE TABLE IF NOT EXISTS public.product_events") &&
    migrationSource.includes("ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY") &&
    migrationSource.includes("SECURITY DEFINER") &&
    migrationSource.includes("SET search_path = public") &&
    migrationSource.includes("pg_column_size(v_metadata) > 4096") &&
    migrationSource.includes("REVOKE ALL ON TABLE public.product_events FROM PUBLIC, anon, authenticated") &&
    migrationSource.includes("GRANT EXECUTE ON FUNCTION public.log_product_event(TEXT, TEXT, JSONB)") &&
    migrationSource.includes("TO anon, authenticated"),
  "product event storage must be RLS-protected and writable only through a bounded RPC"
);

assert(
  migrationSource.includes("DROP FUNCTION IF EXISTS public.log_product_event(TEXT, JSONB, TEXT)") &&
    migrationSource.includes("CREATE OR REPLACE FUNCTION public.log_product_event(\n  p_event_name TEXT,\n  p_session_id TEXT") &&
    migrationSource.includes("'app_error'") &&
    migrationSource.includes("NOTIFY pgrst, 'reload schema'"),
  "product analytics RPC must use one unambiguous PostgREST-visible function and preserve app_error telemetry"
);

assert(
  migrationSource.includes("043_refresh_runtime_schema_contract.sql") ||
    (
      migrationSource.includes("ADD COLUMN IF NOT EXISTS analysis_payload JSONB") &&
      migrationSource.includes("CREATE TABLE IF NOT EXISTS public.product_events") &&
      migrationSource.includes("CREATE OR REPLACE FUNCTION public.log_product_event(\n  p_event_name TEXT,\n  p_session_id TEXT") &&
      migrationSource.includes("NOTIFY pgrst, 'reload schema'")
    ),
  "runtime schema compatibility migration must reassert history/analytics surfaces and request a PostgREST schema-cache reload"
);

assert(
  scannerSource.includes('trackEvent("scan_started"') &&
    homeSource.includes('trackEvent("search_result_tapped"') &&
    homeSource.includes("analyticsKeyHash(validatedCacheKey)") &&
    homeSource.includes("analyticsKeyHash(`${validatedCacheKey}__${finalPetType}`)") &&
    resultsSource.includes('trackEvent("analysis_completed"') &&
    resultsSource.includes("const eventProductCacheKey = eventCacheKey.replace(/__(dog|cat)$/i, \"\")") &&
    resultsSource.includes("analyticsKeyHash(eventProductCacheKey)") &&
    resultsSource.includes("analyticsKeyHash(eventCacheKey)") &&
    resultsSource.includes('trackEvent("analysis_failed"') &&
    resultsSource.includes('trackEvent("ingredient_label_requested"') &&
    resultsSource.includes('trackEvent("pet_type_requested"') &&
    paywallSource.includes('trackEvent("paywall_viewed"') &&
    paywallSource.includes('trackEvent("purchase_started"') &&
    paywallSource.includes('trackEvent("purchase_completed"') &&
    paywallSource.includes('trackEvent("restore_started"') &&
    appSource.includes('trackError("root_error_boundary"'),
  "critical scan/search/result/paywall funnel points must emit analytics events"
);

for (const source of [scannerSource, homeSource, resultsSource, paywallSource, appSource]) {
  const productNameTracking =
    /trackEvent\([\s\S]{0,320}(productName|foodName|searchQuery|base64|uri)\s*:/.test(source) ||
    /trackEvent\([\s\S]{0,320}(productName|foodName|searchQuery|base64|uri),/.test(source);
  assert(!productNameTracking, "analytics metadata must not include product names, food text, images, or file URIs");
  const rawCacheKeyTracking =
    /trackEvent\([\s\S]{0,320}(cacheKey|validatedCacheKey|eventCacheKey|eventProductCacheKey)\s*:/.test(source) ||
    /trackEvent\([\s\S]{0,320}(cacheKey|validatedCacheKey|eventCacheKey|eventProductCacheKey),/.test(source);
  assert(!rawCacheKeyTracking, "analytics metadata must use hashed cache-key demand signals, not raw cache keys");
}

assert(
  packageJson.includes('"test:product-analytics": "node scripts/test-product-analytics-guards.js"') &&
    packageJson.includes("npm run test:product-analytics"),
  "product analytics guard must be wired into package scripts"
);

console.log("product analytics guard passed");
