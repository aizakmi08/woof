import fs from "node:fs";
import path from "node:path";

const checklistPath = "DEPLOYMENT_CHECKLIST.md";
const migrationsDir = "supabase/migrations";
const functionsDir = "supabase/functions";
const workflowPath = ".github/workflows/ci.yml";
const postDeployValidationPath = "supabase/validation/post_deploy_audit_validation.sql";
const appStoreConnectAuditPath = "APP_STORE_CONNECT_AUDIT.md";
const githubReleaseAuditPath = "GITHUB_RELEASE_AUDIT.md";
const productUxRevenueAuditPath = "PRODUCT_UX_REVENUE_AUDIT.md";
const revenueCatExperimentPlanPath = "REVENUECAT_EXPERIMENT_PLAN.md";
const releaseEvidencePath = "RELEASE_EVIDENCE.md";
const deployEdgeFunctionPath = "scripts/deploy-edge-function.mjs";
const failures = [];

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function fail(message) {
  failures.push(message);
}

function requireSnippet(source, snippet, message) {
  if (!source.includes(snippet)) fail(message);
}

function migrationNumber(fileName) {
  const match = fileName.match(/^(\d+)_.*\.sql$/);
  return match ? Number(match[1]) : null;
}

function listMigrationFiles() {
  return fs.readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort((left, right) => {
      const leftNumber = migrationNumber(left) ?? Number.MAX_SAFE_INTEGER;
      const rightNumber = migrationNumber(right) ?? Number.MAX_SAFE_INTEGER;
      return leftNumber - rightNumber || left.localeCompare(right);
    });
}

function listFunctionNames() {
  return fs.readdirSync(functionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function checkOrderedMentions(source, values, label) {
  let lastIndex = -1;
  for (const value of values) {
    const index = source.indexOf(value);
    if (index === -1) {
      fail(`${label}: missing ${value}`);
      continue;
    }
    if (index < lastIndex) {
      fail(`${label}: ${value} appears out of order`);
    }
    lastIndex = index;
  }
}

const checklist = readText(checklistPath);
const postDeployValidation = readText(postDeployValidationPath);
const appStoreConnectAudit = readText(appStoreConnectAuditPath);
const githubReleaseAudit = readText(githubReleaseAuditPath);
const productUxRevenueAudit = readText(productUxRevenueAuditPath);
const revenueCatExperimentPlan = readText(revenueCatExperimentPlanPath);
const releaseEvidence = readText(releaseEvidencePath);
const deployEdgeFunction = readText(deployEdgeFunctionPath);
const kpiFramework = readText("KPI_FRAMEWORK.md");
const appSource = readText("App.js");
const onboardingScreen = readText("screens/OnboardingScreen.js");
const homeScreen = readText("screens/HomeScreen.js");
const scannerScreen = readText("screens/ScannerScreen.js");
const resultsScreen = readText("screens/ResultsScreen/index.js");
const resultsComponents = readText("screens/ResultsScreen/components.js");
const packageJson = JSON.parse(readText("package.json"));
const workflow = readText(workflowPath);
const migrations = listMigrationFiles();
const auditMigrations = migrations.filter((fileName) => (migrationNumber(fileName) ?? 0) >= 58);
const functionNames = listFunctionNames();
const migrationSectionStart = checklist.indexOf("The key audit migrations are:");
const migrationSectionEnd = checklist.indexOf("After applying, validate:", migrationSectionStart);
const migrationSection = migrationSectionStart >= 0 && migrationSectionEnd > migrationSectionStart
  ? checklist.slice(migrationSectionStart, migrationSectionEnd)
  : "";

if (packageJson.scripts?.["check:deployment"] !== "node scripts/check-deployment-readiness.mjs") {
  fail("package.json must expose check:deployment");
}

if (packageJson.scripts?.["check:evidence"] !== "node scripts/check-release-evidence.mjs") {
  fail("package.json must expose check:evidence");
}

if (packageJson.scripts?.["check:preflight"] !== "node scripts/check-release-preflight.mjs") {
  fail("package.json must expose check:preflight");
}

if (packageJson.scripts?.["check:ci"] !== "node scripts/check-ci-release-alignment.mjs") {
  fail("package.json must expose check:ci");
}

if (packageJson.scripts?.["check:crash-reporting"] !== "node scripts/check-crash-reporting.mjs") {
  fail("package.json must expose check:crash-reporting");
}

if (packageJson.scripts?.["check:expo-config"] !== "node scripts/check-expo-config.mjs") {
  fail("package.json must expose check:expo-config");
}

if (packageJson.scripts?.["check:bundle"] !== "node scripts/check-expo-export.mjs") {
  fail("package.json must expose check:bundle");
}

if (packageJson.scripts?.["check:prebuild"] !== "node scripts/check-expo-prebuild.mjs") {
  fail("package.json must expose check:prebuild");
}

if (packageJson.scripts?.["check:audit"] !== "node scripts/check-dependency-audit.mjs") {
  fail("package.json must expose check:audit");
}

if (packageJson.scripts?.["check:expo-versions"] !== "node scripts/check-expo-versions.mjs") {
  fail("package.json must expose check:expo-versions");
}

if (packageJson.scripts?.["check:listing"] !== "node scripts/check-app-store-listing.mjs") {
  fail("package.json must expose check:listing");
}

if (packageJson.scripts?.["check:privacy"] !== "node scripts/check-app-privacy-disclosure.mjs") {
  fail("package.json must expose check:privacy");
}

if (packageJson.scripts?.["check:revenuecat"] !== "node scripts/check-revenuecat-readiness.mjs") {
  fail("package.json must expose check:revenuecat");
}

if (packageJson.scripts?.["edge:fingerprint"] !== "node scripts/fingerprint-edge-functions.mjs") {
  fail("package.json must expose edge:fingerprint");
}

if (packageJson.scripts?.["edge:deploy-analyze"] !== "node scripts/deploy-edge-function.mjs --function analyze") {
  fail("package.json must expose edge:deploy-analyze");
}

if (packageJson.scripts?.["edge:verify-live"] !== "node scripts/verify-live-edge-functions.mjs") {
  fail("package.json must expose edge:verify-live");
}

if (packageJson.scripts?.["check:edge-types"] !== "node scripts/check-edge-typecheck.mjs") {
  fail("package.json must expose check:edge-types");
}

requireSnippet(workflow, "npm run check:deployment", "CI must run check:deployment");
requireSnippet(checklist, "npm run check:deployment", "Deployment checklist local checks must include check:deployment");
requireSnippet(workflow, "npm run check:catalog", "CI must run check:catalog");
requireSnippet(checklist, "npm run check:catalog", "Deployment checklist local checks must include check:catalog");
requireSnippet(workflow, "npm run check:catalog-completeness", "CI must run check:catalog-completeness");
requireSnippet(checklist, "npm run check:catalog-completeness", "Deployment checklist local checks must include check:catalog-completeness");
requireSnippet(checklist, "npm run catalog:verification-gaps", "Deployment checklist local checks must include catalog verification gap report");
requireSnippet(checklist, "npm run catalog:acquisition-queue", "Deployment checklist local checks must include catalog acquisition queue refresh");
requireSnippet(checklist, "catalog_acquisition_queue", "Deployment checklist must mention the catalog acquisition queue");
requireSnippet(checklist, "refreshed and reconciled", "Deployment checklist must require acquisition queue reconciliation");
requireSnippet(checklist, "official/manufacturer ingredients", "Deployment checklist must connect verification gaps to official ingredient acquisition");
requireSnippet(checklist, "verified product images", "Deployment checklist must connect verification gaps to image acquisition");
requireSnippet(checklist, "SUPABASE_SERVICE_ROLE_KEY", "Deployment checklist must mention the service role key needed for catalog completeness");
requireSnippet(checklist, "dog/cat minimums", "Deployment checklist must mention dog/cat catalog completeness gates");
requireSnippet(checklist, "unknown-pet-type threshold", "Deployment checklist must mention unknown pet-type catalog gate");
requireSnippet(checklist, "verified ingredient rate", "Deployment checklist must mention verified ingredient catalog gate");
requireSnippet(checklist, "verified image rate", "Deployment checklist must mention verified image catalog gate");
requireSnippet(workflow, "npm run check:evidence", "CI must run check:evidence");
requireSnippet(checklist, "npm run check:evidence", "Deployment checklist local checks must include check:evidence");
requireSnippet(checklist, "npm run check:evidence -- --strict", "Deployment checklist must include the strict release evidence gate");
requireSnippet(releaseEvidence, "github_current_branch_ci", "Release evidence must cover GitHub CI proof");
requireSnippet(releaseEvidence, "supabase_migrations_applied", "Release evidence must cover Supabase migration proof");
requireSnippet(releaseEvidence, "revenuecat_purchase_restore", "Release evidence must cover RevenueCat purchase/restore proof");
requireSnippet(releaseEvidence, "app_store_live_listing", "Release evidence must cover live App Store listing proof");
requireSnippet(releaseEvidence, "testflight_guest_scan", "Release evidence must cover TestFlight guest scan proof");
requireSnippet(checklist, "npm run check:preflight", "Deployment checklist local checks must include check:preflight");
requireSnippet(workflow, "npm run check:ci", "CI must run check:ci");
requireSnippet(checklist, "npm run check:ci", "Deployment checklist local checks must include check:ci");
requireSnippet(workflow, "npm run check:crash-reporting", "CI must run check:crash-reporting");
requireSnippet(checklist, "npm run check:crash-reporting", "Deployment checklist local checks must include check:crash-reporting");
requireSnippet(workflow, "npm run check:expo-config", "CI must run check:expo-config after npm ci");
requireSnippet(checklist, "npm run check:expo-config", "Deployment checklist local checks must include check:expo-config");
requireSnippet(workflow, "npm run check:bundle", "CI must run check:bundle after npm ci");
requireSnippet(checklist, "npm run check:bundle", "Deployment checklist local checks must include check:bundle");
requireSnippet(workflow, "npm run check:prebuild", "CI must run check:prebuild after npm ci");
requireSnippet(checklist, "npm run check:prebuild", "Deployment checklist local checks must include check:prebuild");
requireSnippet(workflow, "npm run check:audit", "CI must run check:audit after npm ci");
requireSnippet(checklist, "npm run check:audit", "Deployment checklist local checks must include check:audit");
requireSnippet(workflow, "npm run check:expo-versions", "CI must run check:expo-versions after npm ci");
requireSnippet(checklist, "npm run check:expo-versions", "Deployment checklist local checks must include check:expo-versions");
requireSnippet(checklist, "npm run edge:fingerprint", "Deployment checklist must include edge:fingerprint");
requireSnippet(checklist, "npm run edge:deploy-analyze", "Deployment checklist must include analyze deploy command");
requireSnippet(checklist, "npm run edge:verify-live -- --dry-run", "Deployment checklist must include dry-run live Edge verifier");
requireSnippet(checklist, "npm run edge:verify-live", "Deployment checklist must include live Edge verifier");
requireSnippet(deployEdgeFunction, "SUPABASE_ACCESS_TOKEN", "Edge deploy script must require Supabase access token");
requireSnippet(deployEdgeFunction, "buildZip(files)", "Edge deploy script must package local function files");
requireSnippet(deployEdgeFunction, "/functions/deploy", "Edge deploy script must call Management API function deploy endpoint");
requireSnippet(deployEdgeFunction, "verify_jwt", "Edge deploy script must send verify_jwt metadata");
requireSnippet(deployEdgeFunction, "--dry-run", "Edge deploy script must support dry-run artifact verification");
requireSnippet(workflow, "denoland/setup-deno@v2", "CI must install Deno for Edge Function type checks");
requireSnippet(workflow, "npm run check:edge-types", "CI must run check:edge-types");
requireSnippet(checklist, "npm run check:edge-types", "Deployment checklist local checks must include check:edge-types");
requireSnippet(workflow, "npm run edge:fingerprint", "CI must run edge:fingerprint before dependency install");
requireSnippet(workflow, "npm run edge:verify-live -- --dry-run", "CI must run the live Edge verifier dry-run before dependency install");
requireSnippet(workflow, "npm run check:accessibility", "CI must run check:accessibility");
requireSnippet(checklist, "npm run check:accessibility", "Deployment checklist local checks must include check:accessibility");
requireSnippet(workflow, "npm run check:listing", "CI must run check:listing");
requireSnippet(checklist, "npm run check:listing", "Deployment checklist local checks must include check:listing");
requireSnippet(workflow, "npm run check:eas-versioning", "CI must run check:eas-versioning");
requireSnippet(checklist, "npm run check:eas-versioning", "Deployment checklist local checks must include check:eas-versioning");
requireSnippet(workflow, "npm run check:revenuecat", "CI must run check:revenuecat");
requireSnippet(checklist, "npm run check:revenuecat", "Deployment checklist local checks must include check:revenuecat");
if (packageJson.scripts?.["check:live-listing"] !== "node scripts/check-live-app-store-listing.mjs") {
  fail("package.json must expose check:live-listing for live App Store metadata verification");
}
if (packageJson.scripts?.["catalog:acquisition-queue"] !== "node scripts/catalog-acquisition-queue.mjs") {
  fail("package.json must expose catalog:acquisition-queue");
}
requireSnippet(checklist, "npm run check:live-listing -- --guest-validated", "Deployment checklist must require live App Store listing verification after metadata updates");
requireSnippet(checklist, "EAS_RELEASE_VERSIONING.md", "Deployment checklist must reference EAS_RELEASE_VERSIONING.md");
requireSnippet(checklist, "npx eas-cli@latest build:version:get -p ios", "Deployment checklist must include EAS remote iOS version command");
requireSnippet(workflow, "npm run check:privacy", "CI must run check:privacy");
requireSnippet(checklist, "npm run check:privacy", "Deployment checklist local checks must include check:privacy");
requireSnippet(checklist, githubReleaseAuditPath, "Deployment checklist must reference GITHUB_RELEASE_AUDIT.md");
requireSnippet(checklist, appStoreConnectAuditPath, "Deployment checklist must reference APP_STORE_CONNECT_AUDIT.md");
requireSnippet(checklist, productUxRevenueAuditPath, "Deployment checklist must reference PRODUCT_UX_REVENUE_AUDIT.md");
requireSnippet(checklist, revenueCatExperimentPlanPath, "Deployment checklist must reference REVENUECAT_EXPERIMENT_PLAN.md");
requireSnippet(checklist, "APP_PRIVACY_DISCLOSURE.md", "Deployment checklist must reference APP_PRIVACY_DISCLOSURE.md");
requireSnippet(checklist, "Data Used to Track You: No", "Deployment checklist must validate the tracking answer");
requireSnippet(checklist, "No IDFA", "Deployment checklist must validate no IDFA/tracking SDKs");
requireSnippet(checklist, "supabase db push", "Deployment checklist must include the Supabase migration deploy command");
requireSnippet(checklist, postDeployValidationPath, "Deployment checklist must include the post-deploy Supabase validation artifact");
requireSnippet(postDeployValidation, "expected_migrations", "Post-deploy validation must check audit migrations");
requireSnippet(postDeployValidation, "expected_tables", "Post-deploy validation must check audit tables");
requireSnippet(postDeployValidation, "expected_columns", "Post-deploy validation must check audit columns");
requireSnippet(postDeployValidation, "expected_functions", "Post-deploy validation must check audit RPCs");
requireSnippet(postDeployValidation, "expected_views", "Post-deploy validation must check KPI views");
requireSnippet(postDeployValidation, "expected_view_columns", "Post-deploy validation must check KPI view columns");
requireSnippet(postDeployValidation, "matched_upload_bytes_per_completed_scan", "Post-deploy validation must check scan-id-matched upload KPI columns");
requireSnippet(postDeployValidation, "analysis_image_retry_suppressions", "Post-deploy validation must check suppressed image-retry KPI columns");
requireSnippet(postDeployValidation, "expected_no_anon_execute", "Post-deploy validation must check anon RPC execution hardening");
requireSnippet(postDeployValidation, "is_likely_non_product_catalog_row search_path", "Post-deploy validation must check advisor search-path hardening");
requireSnippet(appStoreConnectAudit, "239", "App Store Connect audit must preserve first-time-download baseline");
requireSnippet(appStoreConnectAudit, "4.64K", "App Store Connect audit must preserve impressions baseline");
requireSnippet(appStoreConnectAudit, "Day 35 download-to-paid", "App Store Connect audit must preserve paid-conversion baseline");
requireSnippet(appStoreConnectAudit, "DogFoodAdvisor", "App Store Connect audit must preserve unsupported source-claim risk");
requireSnippet(appStoreConnectAudit, "recall alerts", "App Store Connect audit must preserve unsupported recall-claim risk");
requireSnippet(appStoreConnectAudit, "RevenueCat Snapshot", "App Store Connect audit must preserve RevenueCat offering snapshot");
requireSnippet(githubReleaseAudit, "PR #1", "GitHub release audit must preserve draft PR finding");
requireSnippet(githubReleaseAudit, "Commit statuses on PR head: 0", "GitHub release audit must preserve missing status finding");
requireSnippet(githubReleaseAudit, "Check runs on PR head: 0", "GitHub release audit must preserve missing check-run finding");
requireSnippet(githubReleaseAudit, "pages-build-deployment", "GitHub release audit must preserve current remote workflow finding");
requireSnippet(githubReleaseAudit, "protected: false", "GitHub release audit must preserve branch protection finding");
requireSnippet(githubReleaseAudit, "not the same work as the current local audit worktree", "GitHub release audit must preserve branch/worktree mismatch finding");
requireSnippet(githubReleaseAudit, "migration-number collision", "GitHub release audit must preserve PR migration collision finding");
requireSnippet(githubReleaseAudit, "supabase/migrations/007_product_data.sql", "GitHub release audit must identify stale PR migration start");
requireSnippet(githubReleaseAudit, "049_reject_non_complete_food_catalog_rows", "GitHub release audit must identify stale PR migration end");
requireSnippet(githubReleaseAudit, "production's existing `007`-`057` history", "GitHub release audit must connect stale PR migrations to production history");
requireSnippet(checklist, "migration-number collision", "Deployment checklist must preserve PR migration collision finding");
requireSnippet(checklist, "does not contain stale `supabase/migrations/007`-`057` files", "Deployment checklist must block stale PR migration files before merge");
requireSnippet(productUxRevenueAudit, "install -> onboarding Scan Product -> automatic guest session -> scanner -> first result -> result gate", "Product UX audit must preserve scan-first path finding");
requireSnippet(productUxRevenueAudit, "Home empty state now has inline scan actions", "Product UX audit must preserve implemented empty-state CTA finding");
requireSnippet(productUxRevenueAudit, "Results now has a contextual guest-save prompt", "Product UX audit must preserve implemented guest-save finding");
requireSnippet(productUxRevenueAudit, "Human-food mode copy is now mode-specific", "Product UX audit must preserve implemented human-food copy finding");
requireSnippet(productUxRevenueAudit, "Paywall testing is ready, but the source mix must be controlled", "Product UX audit must preserve source-specific paywall testing finding");
requireSnippet(revenueCatExperimentPlan, "065_kpi_reporting_views.sql", "RevenueCat experiment plan must reference current KPI migration");
requireSnippet(revenueCatExperimentPlan, "058` through `070", "RevenueCat experiment plan must require current audit migration range");
requireSnippet(kpiFramework, "supabase/migrations/065_kpi_reporting_views.sql", "KPI framework must reference current KPI migration");
requireSnippet(kpiFramework, "audit migrations `058` through `070`", "KPI framework must reference current audit migration range");

for (const [label, source] of [
  ["KPI framework", kpiFramework],
  ["RevenueCat experiment plan", revenueCatExperimentPlan],
  ["Deployment checklist", checklist],
]) {
  if (source.includes("014_kpi_reporting_views.sql")) {
    fail(`${label} must not reference obsolete KPI migration 014`);
  }
}
requireSnippet(appSource, "<AuthProvider", "App must mount AuthProvider around onboarding and the main navigator");
requireSnippet(appSource, "initialRouteName={initialRouteName}", "App must preserve scan-first initial route support");
requireSnippet(onboardingScreen, "onboarding_scan_now_tapped", "Onboarding must track scan-now activation");
requireSnippet(onboardingScreen, "nextRoute: \"Scanner\"", "Onboarding must be able to route scan-now users to Scanner");
requireSnippet(onboardingScreen, "Scan first, no account required", "Onboarding must reinforce no-account scan-first value prop");
requireSnippet(onboardingScreen, "3 free scans", "Onboarding must reinforce free-scan value prop");
requireSnippet(onboardingScreen, "Pet food labels", "Onboarding must introduce pet-food scan value");
requireSnippet(onboardingScreen, "Human-food checks", "Onboarding must introduce human-food scan value");
requireSnippet(onboardingScreen, "Save results later", "Onboarding must keep account saving after value");
requireSnippet(homeScreen, "home_empty_state", "Home empty-state CTAs must keep source-specific analytics");
requireSnippet(homeScreen, "3 free scans included", "Home empty state must keep the free-scan value cue");
requireSnippet(homeScreen, "CompareRecentCard", "Home must keep the recent-scan comparison card");
requireSnippet(homeScreen, "history_compare_opened", "Home must track recent-scan comparison opens");
requireSnippet(homeScreen, "history_compare_result_opened", "Home must track comparison result follow-through");
requireSnippet(scannerScreen, "Checking food safety...", "Scanner must keep human-food-specific capture processing copy");
requireSnippet(scannerScreen, "How to Check Food", "Scanner must keep human-food-specific help copy");
requireSnippet(scannerScreen, "pointerEvents: \"box-none\"", "Scanner processing overlay must allow the cancel button to receive taps");
requireSnippet(resultsComponents, "export function GuestSavePrompt", "Results components must include the guest-save prompt");
requireSnippet(resultsScreen, "guest_save_prompt_viewed", "Results screen must track guest-save prompt views");
requireSnippet(resultsScreen, "guest_save_prompt_completed", "Results screen must track guest-save prompt completions");

checkOrderedMentions(migrationSection, auditMigrations, "Deployment migration order");

for (const functionName of functionNames) {
  const indexPath = path.join(functionsDir, functionName, "index.ts");
  if (!fs.existsSync(indexPath)) {
    fail(`${functionName}: missing index.ts`);
  }

  requireSnippet(
    checklist,
    `supabase/functions/${functionName}`,
    `Deployment checklist must list tracked function ${functionName}`
  );
  if (functionName === "analyze") {
    requireSnippet(
      checklist,
      "npm run edge:deploy-analyze",
      "Deployment checklist must include deploy command for analyze"
    );
  } else {
    requireSnippet(
      checklist,
      `supabase functions deploy ${functionName}`,
      `Deployment checklist must include deploy command for ${functionName}`
    );
  }
}

for (const requiredConfig of [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "REVENUECAT_API_KEY_IOS",
  "REVENUECAT_API_KEY_ANDROID",
  "REVENUECAT_WEBHOOK_AUTH",
  "REVENUECAT_REST_API_KEY",
  "SENTRY_DSN",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
  "SENTRY_AUTH_TOKEN",
  "WOOF_ALLOWED_ORIGINS",
  "WOOF_SHARE_URL",
]) {
  requireSnippet(checklist, requiredConfig, `Deployment checklist must mention ${requiredConfig}`);
}

for (const requiredDashboardStep of [
  "Enable Anonymous Sign-Ins",
  "manual linking is required",
  "identity-linking/provider settings",
  "woof://auth/callback",
  "anonymous users use the `authenticated` Postgres role",
  "is_anonymous",
  "invisible CAPTCHA or Cloudflare Turnstile",
  "Auth rate limits",
  "anonymous-user cleanup retention",
  "Leaked Password Protection",
  "Enable Supabase Cron / `pg_cron`",
  "offering `default`",
  "$rc_weekly",
  "$rc_monthly",
  "$rc_annual",
  "webhook authorization header",
  "July 15, 2026",
]) {
  requireSnippet(checklist, requiredDashboardStep, `Deployment checklist must mention ${requiredDashboardStep}`);
}

for (const requiredValidationMarker of [
  "automatic_guest_session_*",
  "onboarding_scan_now_tapped",
  "auth_viewed",
  "analytics_queue_dropped",
  "share_url_attached=true",
  "share_dismissed",
  "revenuecat_profile_sync_completed",
  "subscriber_sync_status = 'synced'",
  "account_link_revenuecat_reidentified",
  "scan_cta_tapped",
  "source_surface: \"home_empty_state\"",
  "guest_save_prompt_viewed",
  "history_compare_opened",
  "history_compare_result_opened",
  "photo_capture_completed",
  "avg_photo_capture_base64_length",
  "photo_capture_failed",
  "capture_stage",
  "paywall_requested",
  "paywall_package_load_failures",
  "paywall_expected_package_load_failures",
  "paywall_monthly_package_missing",
  "scan_cache_completion_rate",
  "analysis_image_retry_suppressions",
  "analysis_image_retry_suppressed",
  "image_uploads_per_fresh_scan",
  "estimated_upload_bytes_per_fresh_scan",
  "SUPABASE_FUNCTIONS_BASE_URL",
  "X-Woof-Function-Name",
  "X-Woof-Function-Audit-Version",
  "Expo config check passed",
  "app_error_captured",
  "Sentry native crash reporting",
]) {
  requireSnippet(checklist, requiredValidationMarker, `Deployment checklist must validate ${requiredValidationMarker}`);
}

if (failures.length > 0) {
  console.error("Deployment readiness check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Deployment readiness check passed (${auditMigrations.length} audit migrations, ${functionNames.length} functions checked)`);
