import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import zlib from "node:zlib";
import { normalizeScraperCandidate, validateScraperCandidate } from "./catalog-scraper-contract.mjs";
import {
  splitIngredientStatement,
  stripTrailingCatalogFormulaCode,
} from "../services/catalogIngredients.js";

const failures = [];

function fail(message) {
  failures.push(message);
}

const groupedIngredientFixture = "Chicken, MINERALS [Zinc Proteinate, Ferrous Sulfate, Sodium Selenite], VITAMINS [Vitamin E Supplement, Niacin, Vitamin D-3 Supplement], Garlic Oil. A445523";
const groupedIngredientExpected = [
  "Chicken",
  "Zinc Proteinate",
  "Ferrous Sulfate",
  "Sodium Selenite",
  "Vitamin E Supplement",
  "Niacin",
  "Vitamin D-3 Supplement",
  "Garlic Oil",
];
const groupedIngredientActual = splitIngredientStatement(groupedIngredientFixture);
if (JSON.stringify(groupedIngredientActual) !== JSON.stringify(groupedIngredientExpected)) {
  fail(`grouped ingredient parser mismatch: ${JSON.stringify(groupedIngredientActual)}`);
}
if (stripTrailingCatalogFormulaCode("Garlic Oil. A445523") !== "Garlic Oil.") {
  fail("catalog formula code cleaner must preserve the final ingredient and remove the internal code");
}
if (
  stripTrailingCatalogFormulaCode(
    "Chicken, VITAMINS [Vitamin E Supplement, Vitamin D-3 Supplement]. A372025; Taurine"
  ) !== "Chicken, VITAMINS [Vitamin E Supplement, Vitamin D-3 Supplement]; Taurine"
) {
  fail("catalog formula code cleaner must remove embedded IDs without joining adjacent ingredients");
}
const parentheticalIngredientFixture = splitIngredientStatement(
  "Chicken Fat (Preserved with Mixed Tocopherols, Citric Acid), Rice"
);
if (parentheticalIngredientFixture.length !== 2) {
  fail("ingredient parser must not split descriptive parenthetical text");
}
const curlyIngredientFixture = splitIngredientStatement(
  "Chicken, MINERALS {Zinc Sulfate, Copper Sulfate}, VITAMINS {Vitamin E Supplement, Niacin}, Taurine"
);
if (curlyIngredientFixture.length !== 6 || !curlyIngredientFixture.includes("Copper Sulfate")) {
  fail("ingredient parser must flatten source-backed curly vitamin and mineral groups");
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function requireSnippet(file, source, snippet, label) {
  if (!source.includes(snippet)) fail(`${file}: missing ${label}: ${snippet}`);
}

function requireRegex(file, source, regex, label) {
  if (!regex.test(source)) fail(`${file}: missing ${label}`);
}

const contractPath = "scripts/catalog-scraper-contract.mjs";
const runnerPath = "scripts/catalog-scrape-all.mjs";
const windowRunnerPath = "scripts/catalog-scrape-windows.mjs";
const importerPath = "scripts/catalog-official-feed-import.mjs";
const liveVerifiedAuditPath = "scripts/catalog-live-verified-contract-audit.mjs";
const sourceBatchPath = "scripts/catalog-source-import-batch.mjs";
const safeFetchPath = "scripts/catalog-safe-fetch.mjs";
const readinessPath = "scripts/catalog-restricted-source-readiness.mjs";
const actionPlanPath = "scripts/catalog-live-gap-action-plan.mjs";
const rejectedCandidateWorklistPath = "scripts/catalog-rejected-candidate-worklist.mjs";
const rejectedEvidenceRequestPackPath = "scripts/catalog-rejected-evidence-request-pack.mjs";
const rejectedEvidenceDropImportPath = "scripts/catalog-rejected-evidence-drop-import.mjs";
const usMarketCoverageDashboardPath = "scripts/catalog-us-market-coverage-dashboard.mjs";
const pendingImportDeltaPath = "scripts/catalog-pending-import-delta.mjs";
const verifiedUsPipelinePath = "scripts/catalog-verified-us-pipeline.mjs";
const nutroOcrImporterPath = "scripts/catalog-nutro-ocr-import-batch.mjs";
const migrationPath = "supabase/migrations/166_catalog_scraper_audit.sql";
const artifactGuardMigrationPath = "supabase/migrations/268_include_parenthesis_order_in_artifact_guard.sql";
const squareBracketArtifactGuardMigrationPath = "supabase/migrations/271_reject_unbalanced_ingredient_square_brackets.sql";
const statementMismatchMigrationPath = "supabase/migrations/294_demote_verified_statement_array_mismatches.sql";
const packagePath = "package.json";

const contract = read(contractPath);
const runner = read(runnerPath);
const windowRunner = read(windowRunnerPath);
const importer = read(importerPath);
const liveVerifiedAudit = read(liveVerifiedAuditPath);
const sourceBatch = read(sourceBatchPath);
const safeFetch = read(safeFetchPath);
const readiness = read(readinessPath);
const actionPlan = read(actionPlanPath);
const rejectedCandidateWorklist = read(rejectedCandidateWorklistPath);
const rejectedEvidenceRequestPack = read(rejectedEvidenceRequestPackPath);
const rejectedEvidenceDropImport = read(rejectedEvidenceDropImportPath);
const usMarketCoverageDashboard = read(usMarketCoverageDashboardPath);
const pendingImportDelta = read(pendingImportDeltaPath);
const verifiedUsPipeline = read(verifiedUsPipelinePath);
const nutroOcrImporter = read(nutroOcrImporterPath);
const migration = read(migrationPath);
const artifactGuardMigration = read(artifactGuardMigrationPath);
const squareBracketArtifactGuardMigration = read(squareBracketArtifactGuardMigrationPath);
const statementMismatchMigration = read(statementMismatchMigrationPath);
const packageJson = JSON.parse(read(packagePath));

for (const [snippet, label] of [
  ["SCRAPER_EXTRACTOR_VERSION", "versioned scraper extractor"],
  ["VERIFIED_INGREDIENT_STATUSES", "verified ingredient statuses"],
  ["VERIFIED_IMAGE_STATUSES", "verified image statuses"],
  ["normalizeScraperCandidate", "candidate normalizer"],
  ["validateScraperCandidate", "candidate validator"],
  ["marketing_copy_as_ingredients", "marketing copy rejection"],
  ["unreviewed_ocr_or_ai_ingredients", "unreviewed OCR rejection"],
  ["non_front_or_placeholder_image", "front image rejection"],
  ["analysis_copy_in_ingredients", "analysis copy rejection"],
  ["contaminated_ingredient_statement", "contaminated ingredient rejection"],
  ["variant_ingredient_mismatch", "ingredient variant mismatch rejection"],
  ["variant_nutrient_mismatch", "nutrient variant mismatch rejection"],
  ["variant_source_url_mismatch", "source URL variant mismatch rejection"],
  ["hasVariantIngredientMismatch", "shared ingredient variant guard"],
  ["hasVariantNutrientMismatch", "shared nutrient variant guard"],
  ["hasVariantSourceUrlMismatch", "shared source URL variant guard"],
]) {
  requireSnippet(contractPath, contract, snippet, label);
}

for (const [snippet, label] of [
  ["--mode", "mode flag"],
  ["discover", "discover mode"],
  ["extract", "extract mode"],
  ["validate", "validate mode"],
  ["import", "import mode"],
  ["report", "report mode"],
  ["tier_1_us_retail", "tier priority"],
  ["SPECIALIZED_IMPORTERS", "specialized importer map"],
  ["catalog-source-targets.json", "source target config"],
  ["catalog-scraper-validate.mjs", "validation handoff"],
  ["preflight_validation", "import preflight validation report"],
  ["validationAcceptedCount", "import accepted-candidate gate"],
  ["--strict-import-validation", "strict import validation flag"],
  ["SUPABASE_SERVICE_ROLE_KEY", "service role report/import path"],
]) {
  requireSnippet(runnerPath, runner, snippet, label);
}

for (const [snippet, label] of [
  ["catalog-scrape-all.mjs", "window runner delegates to scrape-all"],
  ["--url-offset", "window runner offset pass-through"],
  ["--url-limit", "window runner limit pass-through"],
  ["--window-size", "window runner size option"],
  ["--window-count", "window runner count option"],
  ["window_run_report_already_succeeded", "window runner resume skip"],
  ["accepted_candidates", "window runner accepted candidate summary"],
]) {
  requireSnippet(windowRunnerPath, windowRunner, snippet, label);
}

requireRegex(
  runnerPath,
  runner,
  /const validation = runValidate\(target\);[\s\S]+enforceImportValidation\(validation, target\);[\s\S]+catalog-official-feed-import-all\.mjs/,
  "scrape-all import validates before executing official feed import"
);

for (const [snippet, label] of [
  ["safeFetchText", "shared safe fetch helper"],
  ["If-None-Match", "ETag conditional request"],
  ["If-Modified-Since", "Last-Modified conditional request"],
  ["sha256", "raw body content hash"],
  ["retry-after", "Retry-After backoff"],
]) {
  requireSnippet(safeFetchPath, safeFetch, snippet, label);
}

for (const [snippet, label] of [
  ["raw_cache_dir", "batch report raw cache field"],
  ["--raw-cache-dir", "raw cache pass-through"],
  ["path.join(rawCacheDir, \"discovery\")", "discovery raw cache"],
  ["excludedUrlPattern", "discovery exclude pattern pass-through"],
]) {
  requireSnippet(sourceBatchPath, sourceBatch, snippet, label);
}

for (const [snippet, label] of [
  ["catalog_import_runs", "import run audit writes"],
  ["catalog_product_evidence", "product evidence writes"],
  ["ingredient_source_url", "ingredient source evidence alias"],
  ["image_source_url", "image source evidence alias"],
  ["front_image_url", "front image alias"],
  ["extractor_version", "extractor version alias"],
]) {
  requireSnippet(importerPath, importer, snippet, label);
}

for (const [snippet, label] of [
  ["product_data", "live audit product table"],
  ["is_complete_food", "live audit complete-food gate"],
  ["catalog_exclusion_reason", "live audit exclusion gate"],
  ["VERIFIED_SOURCE_QUALITIES", "live audit source quality gate"],
  ["VERIFIED_INGREDIENT_STATUSES", "live audit ingredient status gate"],
  ["VERIFIED_IMAGE_STATUSES", "live audit image status gate"],
  ["normalizeScraperCandidate", "live audit candidate normalizer"],
  ["validateScraperCandidate", "live audit shared validator"],
  ["splitIngredientStatement", "live audit exact statement parser"],
  ["ingredient_statement_array_mismatch", "live audit statement-array gate"],
  ["--fail-on-finding", "live audit failing mode"],
  ["read_only_live_verified_contract_audit", "live audit read-only marker"],
]) {
  requireSnippet(liveVerifiedAuditPath, liveVerifiedAudit, snippet, label);
}

for (const [snippet, label] of [
  ["catalog_split_ingredient_statement", "verified statement parser gate"],
  ["ingredient_verification_status = 'unverified'", "mismatch demotion"],
  ["review_state = 'manual_review'", "mismatch evidence review"],
]) {
  requireSnippet(statementMismatchMigrationPath, statementMismatchMigration, snippet, label);
}

for (const [snippet, label] of [
  ["CREATE TABLE IF NOT EXISTS public.catalog_import_runs", "import run table"],
  ["CREATE TABLE IF NOT EXISTS public.catalog_product_evidence", "product evidence table"],
  ["ALTER TABLE public.catalog_import_runs ENABLE ROW LEVEL SECURITY", "import run RLS"],
  ["ALTER TABLE public.catalog_product_evidence ENABLE ROW LEVEL SECURITY", "product evidence RLS"],
  ["REVOKE ALL ON TABLE public.catalog_import_runs FROM anon", "import run anon revoke"],
  ["REVOKE ALL ON TABLE public.catalog_product_evidence FROM authenticated", "evidence authenticated revoke"],
  ["GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_import_runs TO service_role", "import run service role grant"],
]) {
  requireSnippet(migrationPath, migration, snippet, label);
}

if (packageJson.scripts["catalog:scrape-all"] !== "node scripts/catalog-scrape-all.mjs") {
  fail("package.json: missing catalog:scrape-all script");
}
if (packageJson.scripts["catalog:scrape-windows"] !== "node scripts/catalog-scrape-windows.mjs") {
  fail("package.json: missing catalog:scrape-windows script");
}
if (packageJson.scripts["check:catalog-scraper"] !== "node scripts/check-catalog-scraper.mjs") {
  fail("package.json: missing check:catalog-scraper script");
}
if (packageJson.scripts["catalog:authorized-feed-drop-import"] !== "node scripts/catalog-authorized-feed-drop-import.mjs") {
  fail("package.json: missing catalog:authorized-feed-drop-import script");
}
if (packageJson.scripts["catalog:authorized-feed-request-pack"] !== "node scripts/catalog-authorized-feed-request-pack.mjs") {
  fail("package.json: missing catalog:authorized-feed-request-pack script");
}
if (packageJson.scripts["catalog:restricted-source-readiness"] !== "node scripts/catalog-restricted-source-readiness.mjs") {
  fail("package.json: missing catalog:restricted-source-readiness script");
}
if (packageJson.scripts["catalog:live-gap-action-plan"] !== "node scripts/catalog-live-gap-action-plan.mjs") {
  fail("package.json: missing catalog:live-gap-action-plan script");
}
if (packageJson.scripts["catalog:rejected-candidate-worklist"] !== "node scripts/catalog-rejected-candidate-worklist.mjs") {
  fail("package.json: missing catalog:rejected-candidate-worklist script");
}
if (packageJson.scripts["catalog:rejected-evidence-request-pack"] !== "node scripts/catalog-rejected-evidence-request-pack.mjs") {
  fail("package.json: missing catalog:rejected-evidence-request-pack script");
}
if (packageJson.scripts["catalog:rejected-evidence-drop-import"] !== "node scripts/catalog-rejected-evidence-drop-import.mjs") {
  fail("package.json: missing catalog:rejected-evidence-drop-import script");
}
if (packageJson.scripts["catalog:us-market-coverage-dashboard"] !== "node scripts/catalog-us-market-coverage-dashboard.mjs") {
  fail("package.json: missing catalog:us-market-coverage-dashboard script");
}
if (packageJson.scripts["catalog:pending-import-delta"] !== "node scripts/catalog-pending-import-delta.mjs") {
  fail("package.json: missing catalog:pending-import-delta script");
}
if (packageJson.scripts["catalog:verified-us-pipeline"] !== "node scripts/catalog-verified-us-pipeline.mjs") {
  fail("package.json: missing catalog:verified-us-pipeline script");
}
if (packageJson.scripts["catalog:live-verified-contract-audit"] !== "node scripts/catalog-live-verified-contract-audit.mjs") {
  fail("package.json: missing catalog:live-verified-contract-audit script");
}

for (const [snippet, label] of [
  ["readiness-report.json", "readiness JSON report"],
  ["readiness-report.csv", "readiness CSV report"],
  ["readiness-report.md", "readiness Markdown report"],
  ["waiting_for_authorized_feed", "authorized feed waiting status"],
  ["ready_for_feed_import", "feed import ready status"],
  ["ready_for_snapshot_import", "snapshot import ready status"],
  ["import_sql_ready", "SQL-ready status"],
  ["--gap-summary", "live gap summary input"],
  ["catalog-authorized-feed-requests/current/manifest.json", "request-pack manifest default"],
  ["hasImportableSnapshotEntry", "snapshot evidence content guard"],
  ["hasSnapshotBody", "snapshot body guard"],
  ["hasSnapshotUrl", "snapshot Petco URL guard"],
]) {
  requireSnippet(readinessPath, readiness, snippet, label);
}

for (const [snippet, label] of [
  ["const discovery = wantedUrls.size > 0", "OCR URL-list direct mode"],
  ["? { stdout: [...wantedUrls].join(\"\\n\"), stderr: \"\" }", "OCR URL-list discovery bypass"],
  ["const filteredUrls = wantedUrls.size > 0 ? [...wantedUrls] : discoveredUrls", "OCR URL-list exact URL selection"],
]) {
  requireSnippet(nutroOcrImporterPath, nutroOcrImporter, snippet, label);
}

for (const [snippet, label] of [
  ["zero_verified_ready_candidates", "zero accepted candidate failure"],
  ["unmapped_source_target", "unmapped source failure"],
  ["restricted_source_requires_authorized_quality", "restricted source quality failure"],
  ["verified_ready_candidate_count", "verified-ready candidate count"],
  ["coverage_delta_estimate", "coverage delta estimate"],
  ["--allow-zero-accepted", "zero accepted override flag"],
  ["--allow-unmapped-source", "unmapped source override flag"],
  ["--fail-on-rejected-rows", "rejected row failure flag"],
]) {
  requireSnippet("scripts/catalog-authorized-feed-drop-import.mjs", read("scripts/catalog-authorized-feed-drop-import.mjs"), snippet, label);
}

for (const [snippet, label] of [
  ["--live", "live queue input flag"],
  ["--gap-summary", "gap summary input flag"],
  ["--gap-source", "gap source override flag"],
  ["--gap-exported-at", "gap export timestamp override flag"],
  ["gap_row_scope", "gap row scope metadata"],
  ["--sql-page-size", "paged SQL export flag"],
  ["--sql-offset", "paged SQL offset flag"],
  ["--sql-page-count", "paged SQL count flag"],
  ["--write-sql-pages", "paged SQL writer flag"],
  ["merge_command", "paged SQL manifest merge command"],
  ["saved-json-or-directory", "gap summary directory input"],
  ["reconcile_queue_hygiene", "queue reconciliation action"],
  ["expand_official_source_import", "source expansion action"],
  ["request_authorized_feed", "authorized feed action"],
  ["run_official_importer", "runnable source import action"],
  ["missing_live_sql_ready", "missing-live SQL status"],
  ["live_coverage_no_missing_rows", "local coverage/reconcile status"],
  ["catalog-source-targets.json", "source target mapping"],
  ["catalog_acquisition_queue", "live acquisition queue read"],
  ["catalog_live_gap_summary", "privileged gap summary SQL alias"],
  ["input_gap_open_rows", "privileged gap summary open-row metadata"],
  ["input_gap_actionable_open_rows", "privileged gap summary actionable open-row metadata"],
  ["brand_rollup_affected_products", "privileged gap summary brand-rollup metadata"],
  ["direct_duplicate_checked_open_rows", "privileged gap summary checked duplicate metadata"],
  ["retailer_gap_open_rows", "privileged gap summary retailer-origin metadata"],
  ["gap_source_profile", "privileged gap source profile metadata"],
  ["action-plan.json", "JSON action plan output"],
]) {
  requireSnippet(actionPlanPath, actionPlan, snippet, label);
}

for (const [snippet, label] of [
  ["validation_rejections", "validation rejection manifest reader"],
  ["DEFAULT_PENDING_IMPORT_REJECTED", "pending-import rejection default input"],
  ["pending_import_rejected_path", "pending-import rejection summary path"],
  ["pending_import_delta", "pending-import rejection stage"],
  ["import_rejection_reason", "pending-import rejection reason reader"],
  ["exclude_non_catalog_trial_sample", "non-catalog sample exclusion action"],
  ["non_catalog_trial_sample", "non-catalog sample evidence issue"],
  ["rerun_official_label_ocr", "official OCR repair action"],
  ["fix_official_parser_or_request_feed", "official parser repair action"],
  ["official_source_text_failed_validation", "official source validation evidence issue"],
  ["official_label_ocr_failed_validation", "official OCR validation evidence issue"],
  ["worklist.json", "JSON worklist output"],
  ["worklist.csv", "CSV worklist output"],
  ["worklist.md", "Markdown worklist output"],
  ["--skip-live-resolution", "local fixture live-resolution bypass"],
  ["--fail-on-rejections", "failing rejection gate"],
]) {
  requireSnippet(rejectedCandidateWorklistPath, rejectedCandidateWorklist, snippet, label);
}

for (const [snippet, label] of [
  ["candidate_ingredient_text_tail", "candidate tail diagnostic"],
  ["rejection_stage", "rejection stage diagnostic"],
  ["repair_type", "repair type diagnostic"],
  ["ingredient_statement: \"\"", "blank ingredient statement template"],
  ["Do not reuse candidate_ingredient_text_tail", "unsafe ingredient reuse warning"],
  ["request-index.csv", "request index output"],
  ["templates/<source>.csv", "source template output"],
  ["--evidence-issue", "evidence issue filter"],
]) {
  requireSnippet(rejectedEvidenceRequestPackPath, rejectedEvidenceRequestPack, snippet, label);
}

for (const [snippet, label] of [
  ["inputs/catalog-evidence-repairs", "repair feed default input"],
  ["candidate_ingredient_text_tail_reused", "candidate tail reuse rejection"],
  ["unrequested_cache_key", "unrequested repair rejection"],
  ["unsafe_ingredient_verification_status", "unsafe ingredient status rejection"],
  ["feed.normalized.csv", "sanitized feed output"],
  ["catalog-official-feed-import.mjs", "official importer handoff"],
  ["--emit-sql-rpc", "SQL-only default import mode"],
  ["rejected-rows.csv", "rejected rows report"],
]) {
  requireSnippet(rejectedEvidenceDropImportPath, rejectedEvidenceDropImport, snippet, label);
}

for (const [snippet, label] of [
  ["outputs/catalog-us-market-coverage-dashboard/current", "market dashboard default output"],
  ["verified_ready_goal_not_met", "verified-ready goal blocker"],
  ["authorized_or_blocked_source_targets_pending", "authorized feed blocker"],
  ["rejected_evidence_repairs_pending", "rejected repair blocker"],
  ["validated_import_sql_pending", "validated import SQL pending blocker"],
  ["open_acquisition_gaps_pending", "open gap blocker"],
  ["--catalog-snapshot", "local catalog snapshot fixture input"],
  ["dashboard.json", "dashboard JSON output"],
  ["dashboard.csv", "dashboard CSV output"],
  ["dashboard.md", "dashboard Markdown output"],
  ["action_plan_gap_exported_at", "dashboard action-plan export timestamp"],
  ["action_plan_gap_row_scope", "dashboard action-plan row scope"],
  ["action_plan_input_gap_open_rows", "dashboard authoritative action-plan open rows"],
  ["action_plan_input_gap_actionable_open_rows", "dashboard authoritative action-plan actionable open rows"],
  ["brand_rollup_affected_products", "dashboard brand-rollup affected rows"],
  ["total_queue_affected_products", "dashboard total queue affected rows"],
  ["represented_open_gap_affected_products", "dashboard represented open affected rows"],
  ["action_plan_represented_gap_affected_percent", "dashboard represented affected coverage percent"],
  ["action_plan_missing_gap_exported_at", "dashboard missing export timestamp warning"],
  ["action_plan_gap_row_scope_partial", "dashboard partial export scope warning"],
  ["action_plan_refresh_warnings", "dashboard refresh warning split"],
  ["action_plan_scope_warnings", "dashboard scope warning split"],
  ["action_plan_retailer_gap_open_rows", "dashboard retailer-origin gap count"],
  ["gap_source_profile", "dashboard gap source profile"],
  ["source_sql_ready_for_import", "dashboard pending source SQL status"],
  ["pending_import_sql_rows", "dashboard pending import row count"],
  ["pending_import_delta_rows", "dashboard pending import delta count"],
  ["DEFAULT_PENDING_IMPORT_DELTA", "dashboard pending import delta manifest default"],
  ["import_rejected_rows", "dashboard import rejected row count"],
  ["pending_import_delta_manifest_path", "dashboard pending import delta manifest path"],
  ["pendingImportDeltaBySource", "dashboard source-level pending delta reader"],
  ["pendingImportDeltaForTarget", "dashboard target-level pending delta matcher"],
  ["pending_import_delta_matched_sources", "dashboard pending delta source audit column"],
  ["BROAD_SOURCE_PREFIXES", "dashboard broad parent source prefix guard"],
  ["SOURCE_RUN_SUFFIX_PATTERN", "dashboard source run suffix guard"],
  ["repair_rejected_import_evidence", "dashboard rejected import repair action"],
  ["pending_import_cache_keys_sample", "dashboard pending import cache-key sample"],
  ["manifest_cache_key_rows", "dashboard manifest cache-key count"],
  ["pending_import_manifest_path", "dashboard pending import manifest path"],
]) {
  requireSnippet(usMarketCoverageDashboardPath, usMarketCoverageDashboard, snippet, label);
}

for (const [snippet, label] of [
  ["outputs/catalog-pending-import-delta/current", "pending import delta default output"],
  ["DEFAULT_MCP_GROUP_SIZE", "pending delta MCP group default"],
  ["sql-mcp", "pending delta MCP SQL output"],
  ["upsert_catalog_product_feed", "pending delta upsert RPC"],
  ["compactImportPayloadRow", "pending delta compact import payload"],
  ["sqlStringConcatLiteral", "pending delta readable split payload SQL"],
  ["front_image_url", "pending delta front image fallback"],
  ["upsertMcpGroupSql", "pending delta MCP grouped upsert SQL"],
  ["evidenceSql", "pending delta audit evidence SQL writer"],
  ["catalog_product_evidence", "pending delta product evidence insert"],
  ["artifact_guard_checked", "pending delta evidence records artifact guard result"],
  ["9998-pending-import-audit-and-evidence.sql", "pending delta audit evidence output file"],
  ["executePendingImport", "pending delta service-role execute mode"],
  ["--execute", "pending delta execute flag"],
  ["SUPABASE_SERVICE_ROLE_KEY", "pending delta execute service role guard"],
  ["importRejectionReason", "pending delta import rejection classifier"],
  ["hasLikelyIngredientOcrArtifacts", "pending delta OCR artifact guard"],
  ["allowsCurlyIngredientGroups", "pending delta official curly ingredient group allowlist"],
  ["hasCurlyIngredientGroup", "pending delta curly ingredient group guard"],
  ["import-rejected-rows.json", "pending delta rejected import artifact"],
  ["refresh_catalog_acquisition_queue", "pending delta queue refresh"],
  ["reconcile_catalog_acquisition_queue", "pending delta queue reconcile"],
  ["isRepresentedByVerifiedLiveRow", "pending delta live identity matcher"],
  ["isTerminalExcludedLiveRow", "pending delta terminal excluded matcher"],
  ["sourceGtinKey", "pending delta GTIN identity key"],
  ["sourceUrlKey", "pending delta source URL identity key"],
  ["catalogFeedIdentityKey", "pending delta catalog feed identity duplicate key"],
  ["isVerifiedIdentityDuplicateGuardRow", "pending delta duplicate guard readiness"],
  ["byDuplicateIdentity", "pending delta duplicate identity map"],
  ["byTerminalExcludedDuplicateIdentity", "pending delta terminal excluded duplicate map"],
  ["compatibleGtins", "pending delta duplicate GTIN compatibility"],
  ["manifestPayloadRows", "pending delta SQL manifest decoder"],
  ["pending-rows.json", "pending delta row artifact"],
  ["source-summary.csv", "pending delta source CSV"],
  ["report.md", "pending delta markdown report"],
  ["md5(payload_text)", "pending delta checksum guard"],
  ["expected_md5", "pending delta per-row MCP checksum guard"],
]) {
  requireSnippet(pendingImportDeltaPath, pendingImportDelta, snippet, label);
}

for (const [snippet, label] of [
  ["public.catalog_has_unbalanced_parentheses(value)", "artifact guard uses ordered parenthesis validator"],
  ["ordered parenthesis artifacts with equal counts must be flagged", "artifact guard equal-count bad-order test"],
]) {
  requireSnippet(artifactGuardMigrationPath, artifactGuardMigration, snippet, label);
}

for (const [snippet, label] of [
  ["catalog_has_unbalanced_square_brackets", "artifact guard uses ordered square-bracket validator"],
  ["unclosed square-bracket ingredient OCR artifact must be flagged", "artifact guard unclosed square-bracket test"],
  ["negative-depth square-bracket ingredient OCR artifact must be flagged", "artifact guard negative-depth square-bracket test"],
  ["missing leading L-Ascorbyl ingredient OCR artifact must be flagged", "artifact guard missing leading L-Ascorbyl test"],
  ["sentence-split preservative ingredient artifact must be flagged", "artifact guard sentence-split preservative test"],
]) {
  requireSnippet(squareBracketArtifactGuardMigrationPath, squareBracketArtifactGuardMigration, snippet, label);
}

for (const [snippet, label] of [
  ["outputs/catalog-verified-us-pipeline/current", "verified pipeline default output"],
  ["catalog-pending-import-delta.mjs", "verified pipeline pending delta step"],
  ["catalog-rejected-candidate-worklist.mjs", "verified pipeline rejected worklist step"],
  ["catalog-rejected-evidence-request-pack.mjs", "verified pipeline evidence request step"],
  ["catalog-us-market-coverage-dashboard.mjs", "verified pipeline dashboard step"],
  ["catalog-source-feed-worklist.mjs", "verified pipeline source feed worklist step"],
  ["catalog-live-verified-contract-audit.mjs", "verified pipeline full live audit step"],
  ["--fail-on-finding", "verified pipeline live audit failure gate"],
  ["DEFAULT_LIVE_AUDIT_LIMIT = \"10000\"", "verified pipeline full live audit default limit"],
  ["check-catalog-scraper.mjs", "verified pipeline scraper check step"],
  ["check-catalog-quality.mjs", "verified pipeline quality check step"],
  ["SUPABASE_SERVICE_ROLE_KEY", "verified pipeline service role gate"],
  ["--execute-imports", "verified pipeline execute imports flag"],
  ["skipped_missing_service_role_key", "verified pipeline missing key status"],
  ["summary.json", "verified pipeline JSON summary"],
  ["summary.md", "verified pipeline Markdown summary"],
  ["live_import_status", "verified pipeline live import status"],
  ["source_feed_worklist", "verified pipeline source feed worklist summary"],
  ["rejected_by_repair_type", "verified pipeline repair breakdown"],
]) {
  requireSnippet(verifiedUsPipelinePath, verifiedUsPipeline, snippet, label);
}

const cases = JSON.parse(read("scripts/fixtures/catalog-scraper-cases.json"));
let expectedAcceptedCases = 0;
for (const testCase of cases) {
  const candidate = normalizeScraperCandidate(testCase.candidate);
  const validation = validateScraperCandidate(candidate);
  if (validation.ok) expectedAcceptedCases += 1;
  if (validation.ok !== testCase.ok) {
    fail(`${testCase.name}: expected ok=${testCase.ok}, got ${validation.ok} (${validation.reasons.join(", ")})`);
  }
  if (testCase.reason && !validation.reasons.includes(testCase.reason)) {
    fail(`${testCase.name}: expected reason ${testCase.reason}, got ${validation.reasons.join(", ")}`);
  }
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function fixtureCsv(casesToWrite) {
  const headers = [
    "cache_key",
    "product_name",
    "brand",
    "flavor",
    "package_size",
    "pet_type",
    "ingredient_statement",
    "product_image_url",
    "product_url",
    "source",
    "source_quality",
    "ingredient_verification_status",
    "image_verification_status",
    "is_complete_food",
    "guaranteed_analysis",
    "nutritional_info",
    "verified_at",
  ];
  const rows = casesToWrite.map(({ candidate }) => headers.map((header) => csvCell({
    cache_key: candidate.cache_key,
    product_name: candidate.product_name,
    brand: candidate.brand,
    flavor: candidate.flavor,
    package_size: candidate.package_size,
    pet_type: candidate.pet_type,
    ingredient_statement: candidate.ingredient_text,
    product_image_url: candidate.front_image_url,
    product_url: candidate.source_url,
    source: candidate.source,
    source_quality: candidate.source_quality,
    ingredient_verification_status: candidate.ingredient_verification_status,
    image_verification_status: candidate.image_verification_status,
    is_complete_food: candidate.is_complete_food,
    guaranteed_analysis: candidate.guaranteed_analysis,
    nutritional_info: candidate.nutritional_info ? JSON.stringify(candidate.nutritional_info) : "",
    verified_at: candidate.verified_at,
  }[header])).join(","));
  return `${headers.join(",")}\n${rows.join("\n")}\n`;
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "woof-catalog-scraper-check-"));
try {
  const feedPath = path.join(tempDir, "fixtures.csv");
  const sqlDir = path.join(tempDir, "sql");
  fs.writeFileSync(feedPath, fixtureCsv(cases), "utf8");
  const importResult = spawnSync(process.execPath, [
    "scripts/catalog-official-feed-import.mjs",
    "--file", feedPath,
    "--source", "fixture-manufacturer",
    "--source-quality", "manufacturer",
    "--ingredient-verification", "manufacturer",
    "--image-verification", "manufacturer",
    "--expected-brand", "Fixture",
    "--expected-brand", "Freshpet",
    "--expected-brand", "Lotus",
    "--expected-brand", "Earthborn Holistic",
    "--expected-brand", "CANIDAE",
    "--expected-brand", "KOHA",
    "--expected-brand", "NUTRO",
    "--emit-sql-rpc",
    "--emit-sql-dir", sqlDir,
    "--sql-payload-format", "base64",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (importResult.status !== 0) {
    fail(`official importer fixture run failed: ${(importResult.stderr || importResult.stdout).trim()}`);
  } else {
    const manifest = JSON.parse(read(path.join(sqlDir, "manifest.json")));
    if (manifest.total_sql_rows !== expectedAcceptedCases) {
      fail(`official importer emitted ${manifest.total_sql_rows} SQL rows, expected ${expectedAcceptedCases} contract-accepted fixture rows`);
    }
  }

  const duplicateGtinFeedPath = path.join(tempDir, "duplicate-gtin-aliases.csv");
  const duplicateGtinSqlDir = path.join(tempDir, "duplicate-gtin-sql");
  const duplicateGtinIngredient = "Chicken, chicken meal, brown rice, barley, oatmeal, chicken fat, natural flavor, flaxseed, dried beet pulp, salt, potassium chloride, vitamin E supplement, zinc sulfate, ferrous sulfate, copper sulfate, manganese sulfate, calcium iodate";
  fs.writeFileSync(duplicateGtinFeedPath, [
    [
      "gtin",
      "product_name",
      "brand",
      "package_size",
      "pet_type",
      "ingredient_statement",
      "product_image_url",
      "product_url",
      "is_complete_food",
    ].join(","),
    [
      "111111111111",
      "Fixture Adult Chicken Recipe Dry Dog Food",
      "Fixture",
      "5 lb",
      "dog",
      csvCell(duplicateGtinIngredient),
      "https://example.com/images/fixture-adult-chicken-front.jpg",
      "https://example.com/products/fixture-adult-chicken",
      "true",
    ].join(","),
    [
      "111111111111",
      "Fixture Adult Chicken Recipe Dry Dog Food",
      "Fixture",
      "5 lb",
      "dog",
      csvCell(duplicateGtinIngredient),
      "https://example.com/images/fixture-adult-chicken-front.jpg",
      "https://example.com/products/fixture-adult-chicken-renamed",
      "true",
    ].join(","),
    "",
  ].join("\n"), "utf8");
  const duplicateGtinResult = spawnSync(process.execPath, [
    "scripts/catalog-official-feed-import.mjs",
    "--file", duplicateGtinFeedPath,
    "--source", "fixture-manufacturer",
    "--source-quality", "manufacturer",
    "--ingredient-verification", "manufacturer",
    "--image-verification", "manufacturer",
    "--expected-brand", "Fixture",
    "--emit-sql-rpc",
    "--emit-sql-dir", duplicateGtinSqlDir,
    "--sql-payload-format", "base64",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (duplicateGtinResult.status !== 0) {
    fail(`official importer duplicate GTIN alias run failed: ${(duplicateGtinResult.stderr || duplicateGtinResult.stdout).trim()}`);
  } else {
    const duplicateGtinManifest = JSON.parse(read(path.join(duplicateGtinSqlDir, "manifest.json")));
    if (duplicateGtinManifest.total_sql_rows !== 1) {
      fail(`official importer emitted ${duplicateGtinManifest.total_sql_rows} SQL rows for duplicate GTIN URL aliases, expected 1`);
    }
  }

  const gdsnAliasFeedPath = path.join(tempDir, "gdsn-feed-aliases.json");
  const gdsnAliasSqlDir = path.join(tempDir, "gdsn-feed-aliases-sql");
  fs.writeFileSync(gdsnAliasFeedPath, JSON.stringify({
    products: [
      {
        globalTradeItemNumber: "00011122233345",
        tradeItemDescription: "Licensed Fixture Adult Chicken Recipe Dry Dog Food",
        brandName: "Licensed Fixture",
        subBrand: "Source Backed",
        variantDescription: "Chicken Recipe",
        targetSpecies: "Dog",
        lifeStageDescription: "Adult",
        petFoodForm: "Dry",
        netContent: "12 lb",
        ingredientStatement: duplicateGtinIngredient,
        frontOfPackImageUrl: "https://licensed.example.com/images/licensed-fixture-chicken-front.jpg",
        productInformationUrl: "https://licensed.example.com/products/licensed-fixture-chicken",
        completeAndBalanced: true,
        guaranteedAnalysisStatement: "Crude Protein 24% min; Crude Fat 14% min; Crude Fiber 5% max; Moisture 10% max. Formulated to meet AAFCO nutrient profiles for adult maintenance.",
        gdsnPublicationDate: "2026-06-01T00:00:00.000Z",
      },
      {
        tradeItem: {
          globalTradeItemNumber: "00011122233352",
          tradeItemDescription: "Licensed Fixture Adult Turkey Recipe Wet Cat Food",
        },
        brand: {
          brandName: "Licensed Fixture",
        },
        variant: {
          subBrand: "Nested Source Backed",
          variantDescription: "Turkey Recipe",
        },
        audience: {
          targetSpecies: "Cat",
          lifeStageDescription: "Adult",
        },
        packaging: {
          petFoodForm: "Wet",
          netContent: "3 oz",
          completeAndBalanced: true,
        },
        nutrition: {
          ingredientDeclaration: duplicateGtinIngredient.replace("Chicken", "Turkey"),
          guaranteedAnalysisStatement: "Crude Protein 10% min; Crude Fat 5% min; Crude Fiber 1.5% max; Moisture 78% max. Formulated to meet AAFCO nutrient profiles for adult maintenance.",
        },
        media: [
          {
            viewCode: "FRONT",
            url: "https://licensed.example.com/images/licensed-fixture-turkey-front.jpg",
          },
        ],
        informationProvider: {
          url: "https://licensed.example.com/products/licensed-fixture-turkey",
        },
        publication: {
          gdsnPublicationDate: "2026-06-02T00:00:00.000Z",
        },
      },
    ],
  }, null, 2), "utf8");
  const gdsnAliasResult = spawnSync(process.execPath, [
    "scripts/catalog-official-feed-import.mjs",
    "--file", gdsnAliasFeedPath,
    "--source", "licensed-gdsn-fixture",
    "--source-quality", "gdsn",
    "--ingredient-verification", "gdsn",
    "--image-verification", "official",
    "--expected-brand", "Licensed Fixture",
    "--emit-sql-rpc",
    "--emit-sql-dir", gdsnAliasSqlDir,
    "--sql-payload-format", "base64",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (gdsnAliasResult.status !== 0) {
    fail(`official importer GDSN alias run failed: ${(gdsnAliasResult.stderr || gdsnAliasResult.stdout).trim()}`);
  } else {
    const gdsnAliasManifest = JSON.parse(read(path.join(gdsnAliasSqlDir, "manifest.json")));
    if (gdsnAliasManifest.total_sql_rows !== 2) {
      fail(`official importer emitted ${gdsnAliasManifest.total_sql_rows} SQL rows for GDSN-style aliases, expected 2`);
    }
  }

  const gdsnXmlFeedPath = path.join(tempDir, "gdsn-feed.xml");
  const gdsnXmlSqlDir = path.join(tempDir, "gdsn-feed-xml-sql");
  fs.writeFileSync(gdsnXmlFeedPath, `<?xml version="1.0" encoding="UTF-8"?>
<catalogue>
  <tradeItem>
    <globalTradeItemNumber>00011122233369</globalTradeItemNumber>
    <tradeItemDescription>Licensed Fixture Adult Salmon Recipe Dry Cat Food</tradeItemDescription>
    <brand>
      <brandName>Licensed Fixture</brandName>
    </brand>
    <variant>
      <subBrand>XML Source Backed</subBrand>
      <variantDescription>Salmon Recipe</variantDescription>
    </variant>
    <audience>
      <targetSpecies>Cat</targetSpecies>
      <lifeStageDescription>Adult</lifeStageDescription>
    </audience>
    <packaging>
      <petFoodForm>Dry</petFoodForm>
      <netContent>5 lb</netContent>
      <completeAndBalanced>true</completeAndBalanced>
    </packaging>
    <nutrition>
      <ingredientDeclaration>${duplicateGtinIngredient.replace("Chicken", "Salmon")}</ingredientDeclaration>
      <guaranteedAnalysisStatement>Crude Protein 30% min; Crude Fat 14% min; Crude Fiber 4% max; Moisture 10% max. Formulated to meet AAFCO nutrient profiles for adult maintenance.</guaranteedAnalysisStatement>
    </nutrition>
    <media>
      <image>
        <viewCode>FRONT</viewCode>
        <url>https://licensed.example.com/images/licensed-fixture-salmon-front.jpg</url>
      </image>
    </media>
    <informationProvider>
      <productInformationUrl>https://licensed.example.com/products/licensed-fixture-salmon</productInformationUrl>
    </informationProvider>
    <publication>
      <gdsnPublicationDate>2026-06-03T00:00:00.000Z</gdsnPublicationDate>
    </publication>
  </tradeItem>
</catalogue>
`, "utf8");
  const gdsnXmlResult = spawnSync(process.execPath, [
    "scripts/catalog-official-feed-import.mjs",
    "--file", gdsnXmlFeedPath,
    "--source", "licensed-gdsn-fixture",
    "--source-quality", "gdsn",
    "--ingredient-verification", "gdsn",
    "--image-verification", "official",
    "--expected-brand", "Licensed Fixture",
    "--emit-sql-rpc",
    "--emit-sql-dir", gdsnXmlSqlDir,
    "--sql-payload-format", "base64",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (gdsnXmlResult.status !== 0) {
    fail(`official importer GDSN XML run failed: ${(gdsnXmlResult.stderr || gdsnXmlResult.stdout).trim()}`);
  } else {
    const gdsnXmlManifest = JSON.parse(read(path.join(gdsnXmlSqlDir, "manifest.json")));
    if (gdsnXmlManifest.total_sql_rows !== 1) {
      fail(`official importer emitted ${gdsnXmlManifest.total_sql_rows} SQL rows for GDSN-style XML, expected 1`);
    }
  }

  const gdsnTsvFeedPath = path.join(tempDir, "gdsn-feed.tsv");
  const gdsnTsvSqlDir = path.join(tempDir, "gdsn-feed-tsv-sql");
  fs.writeFileSync(gdsnTsvFeedPath, [
    [
      "globalTradeItemNumber",
      "tradeItemDescription",
      "brandName",
      "variantDescription",
      "targetSpecies",
      "petFoodForm",
      "netContent",
      "ingredientStatement",
      "frontOfPackImageUrl",
      "productInformationUrl",
      "completeAndBalanced",
      "guaranteedAnalysisStatement",
      "gdsnPublicationDate",
    ].join("\t"),
    [
      "00011122233376",
      "Licensed Fixture Adult Beef Recipe Dry Dog Food",
      "Licensed Fixture",
      "Beef Recipe",
      "Dog",
      "Dry",
      "20 lb",
      duplicateGtinIngredient.replace("Chicken", "Beef"),
      "https://licensed.example.com/images/licensed-fixture-beef-front.jpg",
      "https://licensed.example.com/products/licensed-fixture-beef",
      "true",
      "Crude Protein 26% min; Crude Fat 15% min; Crude Fiber 4% max; Moisture 10% max. Formulated to meet AAFCO nutrient profiles for adult maintenance.",
      "2026-06-04T00:00:00.000Z",
    ].join("\t"),
    "",
  ].join("\n"), "utf8");
  const gdsnTsvResult = spawnSync(process.execPath, [
    "scripts/catalog-official-feed-import.mjs",
    "--file", gdsnTsvFeedPath,
    "--source", "licensed-gdsn-fixture",
    "--source-quality", "gdsn",
    "--ingredient-verification", "gdsn",
    "--image-verification", "official",
    "--expected-brand", "Licensed Fixture",
    "--emit-sql-rpc",
    "--emit-sql-dir", gdsnTsvSqlDir,
    "--sql-payload-format", "base64",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (gdsnTsvResult.status !== 0) {
    fail(`official importer GDSN TSV run failed: ${(gdsnTsvResult.stderr || gdsnTsvResult.stdout).trim()}`);
  } else {
    const gdsnTsvManifest = JSON.parse(read(path.join(gdsnTsvSqlDir, "manifest.json")));
    if (gdsnTsvManifest.total_sql_rows !== 1) {
      fail(`official importer emitted ${gdsnTsvManifest.total_sql_rows} SQL rows for GDSN-style TSV, expected 1`);
    }
  }

  const gdsnPipeFeedPath = path.join(tempDir, "gdsn-feed.psv");
  const gdsnPipeSqlDir = path.join(tempDir, "gdsn-feed-pipe-sql");
  fs.writeFileSync(gdsnPipeFeedPath, [
    [
      "globalTradeItemNumber",
      "tradeItemDescription",
      "brandName",
      "variantDescription",
      "targetSpecies",
      "ingredientStatement",
      "frontOfPackImageUrl",
      "productInformationUrl",
      "completeAndBalanced",
      "guaranteedAnalysisStatement",
    ].join("|"),
    [
      "00011122233383",
      "Licensed Fixture Adult Lamb Recipe Wet Dog Food",
      "Licensed Fixture",
      "Lamb Recipe",
      "Dog",
      duplicateGtinIngredient.replace("Chicken", "Lamb"),
      "https://licensed.example.com/images/licensed-fixture-lamb-front.jpg",
      "https://licensed.example.com/products/licensed-fixture-lamb",
      "true",
      "Crude Protein 9% min; Crude Fat 5% min; Crude Fiber 1.5% max; Moisture 78% max. Formulated to meet AAFCO nutrient profiles for adult maintenance.",
    ].join("|"),
    "",
  ].join("\n"), "utf8");
  const gdsnPipeResult = spawnSync(process.execPath, [
    "scripts/catalog-official-feed-import.mjs",
    "--file", gdsnPipeFeedPath,
    "--source", "licensed-gdsn-fixture",
    "--source-quality", "gdsn",
    "--ingredient-verification", "gdsn",
    "--image-verification", "official",
    "--expected-brand", "Licensed Fixture",
    "--emit-sql-rpc",
    "--emit-sql-dir", gdsnPipeSqlDir,
    "--sql-payload-format", "base64",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (gdsnPipeResult.status !== 0) {
    fail(`official importer GDSN pipe-delimited run failed: ${(gdsnPipeResult.stderr || gdsnPipeResult.stdout).trim()}`);
  } else {
    const gdsnPipeManifest = JSON.parse(read(path.join(gdsnPipeSqlDir, "manifest.json")));
    if (gdsnPipeManifest.total_sql_rows !== 1) {
      fail(`official importer emitted ${gdsnPipeManifest.total_sql_rows} SQL rows for GDSN-style pipe-delimited feed, expected 1`);
    }
  }

  const gdsnGzipFeedPath = path.join(tempDir, "gdsn-feed.tsv.gz");
  const gdsnGzipSqlDir = path.join(tempDir, "gdsn-feed-gzip-sql");
  const gzipTsv = [
    [
      "globalTradeItemNumber",
      "tradeItemDescription",
      "brandName",
      "variantDescription",
      "targetSpecies",
      "ingredientStatement",
      "frontOfPackImageUrl",
      "productInformationUrl",
      "completeAndBalanced",
      "guaranteedAnalysisStatement",
    ].join("\t"),
    [
      "00011122233390",
      "Licensed Fixture Adult Duck Recipe Dry Cat Food",
      "Licensed Fixture",
      "Duck Recipe",
      "Cat",
      duplicateGtinIngredient.replace("Chicken", "Duck"),
      "https://licensed.example.com/images/licensed-fixture-duck-front.jpg",
      "https://licensed.example.com/products/licensed-fixture-duck",
      "true",
      "Crude Protein 31% min; Crude Fat 15% min; Crude Fiber 4% max; Moisture 10% max. Formulated to meet AAFCO nutrient profiles for adult maintenance.",
    ].join("\t"),
    "",
  ].join("\n");
  fs.writeFileSync(gdsnGzipFeedPath, zlib.gzipSync(Buffer.from(gzipTsv, "utf8")));
  const gdsnGzipResult = spawnSync(process.execPath, [
    "scripts/catalog-official-feed-import.mjs",
    "--file", gdsnGzipFeedPath,
    "--source", "licensed-gdsn-fixture",
    "--source-quality", "gdsn",
    "--ingredient-verification", "gdsn",
    "--image-verification", "official",
    "--expected-brand", "Licensed Fixture",
    "--emit-sql-rpc",
    "--emit-sql-dir", gdsnGzipSqlDir,
    "--sql-payload-format", "base64",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (gdsnGzipResult.status !== 0) {
    fail(`official importer GDSN gzip TSV run failed: ${(gdsnGzipResult.stderr || gdsnGzipResult.stdout).trim()}`);
  } else {
    const gdsnGzipManifest = JSON.parse(read(path.join(gdsnGzipSqlDir, "manifest.json")));
    if (gdsnGzipManifest.total_sql_rows !== 1) {
      fail(`official importer emitted ${gdsnGzipManifest.total_sql_rows} SQL rows for gzip-compressed GDSN TSV, expected 1`);
    }
  }

  const authorizedDropInputDir = path.join(tempDir, "authorized-feed-drop");
  const authorizedDropSourceDir = path.join(authorizedDropInputDir, "licensed-gdsn-fixture");
  const authorizedDropOutputDir = path.join(tempDir, "authorized-feed-drop-output");
  fs.mkdirSync(authorizedDropSourceDir, { recursive: true });
  fs.writeFileSync(path.join(authorizedDropSourceDir, "feed.tsv.gz"), zlib.gzipSync(Buffer.from(gzipTsv, "utf8")));
  const authorizedDropResult = spawnSync(process.execPath, [
    "scripts/catalog-authorized-feed-drop-import.mjs",
    "--input-dir", authorizedDropInputDir,
    "--output-dir", authorizedDropOutputDir,
    "--source", "licensed-gdsn-fixture",
    "--source-quality", "gdsn",
    "--expected-brand", "Licensed Fixture",
    "--allow-unmapped-source",
    "--sql-payload-format", "base64",
    "--json",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (authorizedDropResult.status !== 0) {
    fail(`authorized feed drop import fixture failed: ${(authorizedDropResult.stderr || authorizedDropResult.stdout).trim()}`);
  } else {
    const authorizedDropSummary = JSON.parse(read(path.join(authorizedDropOutputDir, "summary.json")));
    if (authorizedDropSummary.file_count !== 1) {
      fail(`authorized feed drop processed ${authorizedDropSummary.file_count} files, expected 1`);
    }
    if (authorizedDropSummary.sql_rows !== 1) {
      fail(`authorized feed drop emitted ${authorizedDropSummary.sql_rows} SQL rows, expected 1`);
    }
    if (authorizedDropSummary.verified_ready_candidate_count !== 1) {
      fail(`authorized feed drop counted ${authorizedDropSummary.verified_ready_candidate_count} verified-ready candidates, expected 1`);
    }
    if (!authorizedDropSummary.reports?.[0]?.sql_manifest) {
      fail("authorized feed drop did not write a SQL manifest path");
    }
    if (authorizedDropSummary.reports?.[0]?.status !== "succeeded") {
      fail(`authorized feed drop report status was ${authorizedDropSummary.reports?.[0]?.status}, expected succeeded`);
    }
  }

  const badAuthorizedDropInputDir = path.join(tempDir, "bad-authorized-feed-drop");
  const badAuthorizedDropSourceDir = path.join(badAuthorizedDropInputDir, "licensed-gdsn-fixture");
  const badAuthorizedDropOutputDir = path.join(tempDir, "bad-authorized-feed-drop-output");
  fs.mkdirSync(badAuthorizedDropSourceDir, { recursive: true });
  fs.writeFileSync(path.join(badAuthorizedDropSourceDir, "feed.csv"), [
    [
      "product_name",
      "brand",
      "pet_type",
      "ingredient_statement",
      "product_image_url",
      "product_url",
      "is_complete_food",
    ].join(","),
    [
      "Licensed Fixture Chicken Bone Broth Topper for Dogs",
      "Licensed Fixture",
      "dog",
      "Chicken bone broth, carrot, parsley, turmeric",
      "https://licensed.example.com/images/bone-broth-front.jpg",
      "https://licensed.example.com/products/bone-broth-topper",
      "true",
    ].join(","),
    "",
  ].join("\n"), "utf8");
  const badAuthorizedDropResult = spawnSync(process.execPath, [
    "scripts/catalog-authorized-feed-drop-import.mjs",
    "--input-dir", badAuthorizedDropInputDir,
    "--output-dir", badAuthorizedDropOutputDir,
    "--source", "licensed-gdsn-fixture",
    "--source-quality", "gdsn",
    "--expected-brand", "Licensed Fixture",
    "--allow-unmapped-source",
    "--sql-payload-format", "base64",
    "--json",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (badAuthorizedDropResult.status === 0) {
    fail("bad authorized feed drop unexpectedly succeeded with zero verified-ready candidates");
  } else {
    const badAuthorizedDropSummary = JSON.parse(read(path.join(badAuthorizedDropOutputDir, "summary.json")));
    const badReport = badAuthorizedDropSummary.reports?.[0];
    if (badAuthorizedDropSummary.failed_count !== 1) {
      fail(`bad authorized feed drop failed_count was ${badAuthorizedDropSummary.failed_count}, expected 1`);
    }
    if (!badReport?.intake_failures?.includes("zero_verified_ready_candidates")) {
      fail(`bad authorized feed drop missing zero_verified_ready_candidates failure: ${badReport?.intake_failures?.join(", ")}`);
    }
    if (badAuthorizedDropSummary.verified_ready_candidate_count !== 0) {
      fail(`bad authorized feed drop counted ${badAuthorizedDropSummary.verified_ready_candidate_count} verified-ready candidates, expected 0`);
    }
  }

  const requestPackOutputDir = path.join(tempDir, "authorized-feed-request-pack");
  const requestPackResult = spawnSync(process.execPath, [
    "scripts/catalog-authorized-feed-request-pack.mjs",
    "--output-dir", requestPackOutputDir,
    "--access-status", "requires_authorized_feed",
    "--limit", "2",
    "--json",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (requestPackResult.status !== 0) {
    fail(`authorized feed request pack fixture failed: ${(requestPackResult.stderr || requestPackResult.stdout).trim()}`);
  } else {
    const requestPackManifest = JSON.parse(read(path.join(requestPackOutputDir, "manifest.json")));
    if (requestPackManifest.request_count !== 2) {
      fail(`authorized feed request pack wrote ${requestPackManifest.request_count} targets, expected 2`);
    }
    if (!requestPackManifest.summary_sql_path || !fs.existsSync(requestPackManifest.summary_sql_path)) {
      fail("authorized feed request pack did not write the restricted-source summary SQL");
    }
    const requestPackReadme = read(path.join(requestPackOutputDir, "README.md"));
    if (!requestPackReadme.includes("catalog:restricted-source-readiness") || !requestPackReadme.includes("zero verified-ready candidates")) {
      fail("authorized feed request pack README does not describe readiness and strict drop-import gates");
    }
    const summarySql = read(requestPackManifest.summary_sql_path);
    if (!summarySql.includes("restricted_sources") || !summarySql.includes("catalog_acquisition_queue")) {
      fail("authorized feed request pack summary SQL does not summarize acquisition queue gaps");
    }
    if (!summarySql.includes("product_sources")) {
      fail("authorized feed request pack summary SQL does not preserve product source evidence");
    }
    const firstTarget = requestPackManifest.targets?.[0];
    if (!firstTarget?.template_path || !fs.existsSync(firstTarget.template_path)) {
      fail("authorized feed request pack did not write the first template");
    }
    if (!firstTarget?.sql_path || !fs.existsSync(firstTarget.sql_path)) {
      fail("authorized feed request pack did not write the first queue export SQL");
    }
    if (!firstTarget?.docs_path || !fs.existsSync(firstTarget.docs_path)) {
      fail("authorized feed request pack did not write the first source docs file");
    }
    const firstTemplate = read(firstTarget.template_path);
    if (!firstTemplate.includes("ingredient_statement") || !firstTemplate.includes("product_image_url")) {
      fail("authorized feed request pack template is missing ingredient/image headers");
    }
    const firstSql = read(firstTarget.sql_path);
    if (!firstSql.includes("catalog_acquisition_queue") || !firstSql.includes("status = 'open'")) {
      fail("authorized feed request pack SQL does not export open acquisition gaps");
    }

    const retailCatalogRequestPackOutputDir = path.join(tempDir, "authorized-feed-retail-catalog-request-pack");
    const retailCatalogRequestPackResult = spawnSync(process.execPath, [
      "scripts/catalog-authorized-feed-request-pack.mjs",
      "--output-dir", retailCatalogRequestPackOutputDir,
      "--source", "chewy-retail-catalog",
      "--json",
    ], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    if (retailCatalogRequestPackResult.status !== 0) {
      fail(`authorized feed retail catalog request pack fixture failed: ${(retailCatalogRequestPackResult.stderr || retailCatalogRequestPackResult.stdout).trim()}`);
    } else {
      const retailCatalogManifest = JSON.parse(read(path.join(retailCatalogRequestPackOutputDir, "manifest.json")));
      const retailCatalogTarget = retailCatalogManifest.targets?.[0];
      if (retailCatalogTarget?.import_command?.includes("--expected-brand") || retailCatalogTarget?.drop_import_command?.includes("--expected-brand")) {
        fail("authorized feed retail catalog request pack should not force a fake broad-retailer expected-brand guard");
      }
      const retailCatalogSummarySql = read(retailCatalogManifest.summary_sql_path);
      if (!/\('chewy-retail-catalog'[\s\S]*'chewy'\)/.test(retailCatalogSummarySql)) {
        fail("authorized feed retail catalog summary SQL should use retailer source matching for broad catalog targets");
      }
    }

    const privateLabelRequestPackOutputDir = path.join(tempDir, "authorized-feed-private-label-request-pack");
    const privateLabelRequestPackResult = spawnSync(process.execPath, [
      "scripts/catalog-authorized-feed-request-pack.mjs",
      "--output-dir", privateLabelRequestPackOutputDir,
      "--source", "walmart-pure-balance",
      "--json",
    ], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    if (privateLabelRequestPackResult.status !== 0) {
      fail(`authorized feed private-label request pack fixture failed: ${(privateLabelRequestPackResult.stderr || privateLabelRequestPackResult.stdout).trim()}`);
    } else {
      const privateLabelManifest = JSON.parse(read(path.join(privateLabelRequestPackOutputDir, "manifest.json")));
      const privateLabelSummarySql = read(privateLabelManifest.summary_sql_path);
      if (!/\('walmart-pure-balance'[\s\S]*''\)/.test(privateLabelSummarySql)) {
        fail("authorized feed private-label summary SQL should not inherit broad retailer source matching");
      }
    }

    const retailCoverageReadinessOutputDir = path.join(tempDir, "restricted-source-retail-coverage-readiness-output");
    const retailCoverageReadinessResult = spawnSync(process.execPath, [
      "scripts/catalog-restricted-source-readiness.mjs",
      "--manifest", path.join(retailCatalogRequestPackOutputDir, "manifest.json"),
      "--input-dir", path.join(tempDir, "empty-authorized-feed-input"),
      "--output-dir", retailCoverageReadinessOutputDir,
      "--json",
    ], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    if (retailCoverageReadinessResult.status !== 0) {
      fail(`restricted source retail coverage readiness fixture failed: ${(retailCoverageReadinessResult.stderr || retailCoverageReadinessResult.stdout).trim()}`);
    } else {
      const retailCoverageReadinessReport = JSON.parse(read(path.join(retailCoverageReadinessOutputDir, "readiness-report.json")));
      const retailCoverageRow = retailCoverageReadinessReport.rows.find((row) => row.source_slug === "chewy-retail-catalog");
      if (retailCoverageRow?.coverage_requirement !== "broad_retail_catalog_required") {
        fail(`restricted source readiness did not mark broad retailer catalog coverage requirement: ${retailCoverageRow?.coverage_requirement}`);
      }
      const retailCoverageMarkdown = read(path.join(retailCoverageReadinessOutputDir, "readiness-report.md"));
      if (!retailCoverageMarkdown.includes("Coverage") || !retailCoverageMarkdown.includes("broad_retail_catalog_required")) {
        fail("restricted source readiness Markdown did not include broad retailer coverage requirement");
      }
    }

    const retailPriorityRequestPackOutputDir = path.join(tempDir, "authorized-feed-retail-priority-request-pack");
    const retailPriorityRequestPackResult = spawnSync(process.execPath, [
      "scripts/catalog-authorized-feed-request-pack.mjs",
      "--output-dir", retailPriorityRequestPackOutputDir,
      "--source", "chewy-retail-catalog",
      "--source", "walmart-pure-balance",
      "--json",
    ], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    if (retailPriorityRequestPackResult.status !== 0) {
      fail(`authorized feed retail priority request pack fixture failed: ${(retailPriorityRequestPackResult.stderr || retailPriorityRequestPackResult.stdout).trim()}`);
    } else {
      const retailPriorityGapSummaryPath = path.join(tempDir, "restricted-source-retail-priority-gap-summary.json");
      const retailPriorityReadinessOutputDir = path.join(tempDir, "restricted-source-retail-priority-readiness-output");
      fs.writeFileSync(retailPriorityGapSummaryPath, JSON.stringify([
        {
          source_slug: "walmart-pure-balance",
          brand: "Pure Balance",
          open_rows: 50,
          affected_products: 250,
          needs_ingredients_rows: 50,
          needs_image_rows: 50,
          product_sources: "store_brand; web_verified",
        },
      ], null, 2), "utf8");
      const retailPriorityReadinessResult = spawnSync(process.execPath, [
        "scripts/catalog-restricted-source-readiness.mjs",
        "--manifest", path.join(retailPriorityRequestPackOutputDir, "manifest.json"),
        "--input-dir", path.join(tempDir, "empty-authorized-feed-input"),
        "--output-dir", retailPriorityReadinessOutputDir,
        "--gap-summary", retailPriorityGapSummaryPath,
        "--json",
      ], {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
      });
      if (retailPriorityReadinessResult.status !== 0) {
        fail(`restricted source retail priority readiness fixture failed: ${(retailPriorityReadinessResult.stderr || retailPriorityReadinessResult.stdout).trim()}`);
      } else {
        const retailPriorityReadinessReport = JSON.parse(read(path.join(retailPriorityReadinessOutputDir, "readiness-report.json")));
        if (retailPriorityReadinessReport.rows?.[0]?.source_slug !== "chewy-retail-catalog") {
          fail(`restricted source readiness should rank broad retailer catalog before private-label gap rows, got ${retailPriorityReadinessReport.rows?.[0]?.source_slug}`);
        }
      }
    }

    const readinessInputDir = path.join(tempDir, "restricted-source-readiness-input");
    const readinessSourceDir = path.join(readinessInputDir, firstTarget.source_slug);
    const readinessOutputDir = path.join(tempDir, "restricted-source-readiness-output");
    const readinessGapSummaryPath = path.join(tempDir, "restricted-source-gap-summary.json");
    fs.mkdirSync(readinessSourceDir, { recursive: true });
    fs.writeFileSync(path.join(readinessSourceDir, "feed.csv"), [
      "product_name,brand,ingredient_statement,product_image_url,product_url,is_complete_food",
      `"${firstTarget.brand} Fixture Formula","${firstTarget.brand}","${duplicateGtinIngredient}","https://example.com/front.jpg","https://example.com/product",true`,
      "",
    ].join("\n"), "utf8");
    fs.writeFileSync(readinessGapSummaryPath, JSON.stringify([
      {
        source_slug: firstTarget.source_slug,
        brand: firstTarget.brand,
        open_rows: 3,
        affected_products: 7,
        needs_ingredients_rows: 2,
        needs_image_rows: 1,
        product_sources: "retailer_feed; gap_queue",
      },
    ], null, 2), "utf8");
    const readinessResult = spawnSync(process.execPath, [
      "scripts/catalog-restricted-source-readiness.mjs",
      "--manifest", path.join(requestPackOutputDir, "manifest.json"),
      "--input-dir", readinessInputDir,
      "--output-dir", readinessOutputDir,
      "--gap-summary", readinessGapSummaryPath,
      "--json",
    ], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    if (readinessResult.status !== 0) {
      fail(`restricted source readiness fixture failed: ${(readinessResult.stderr || readinessResult.stdout).trim()}`);
    } else {
      const readinessReport = JSON.parse(read(path.join(readinessOutputDir, "readiness-report.json")));
      if (readinessReport.source_count !== 2) {
        fail(`restricted source readiness reported ${readinessReport.source_count} sources, expected 2`);
      }
      const readyRow = readinessReport.rows.find((row) => row.source_slug === firstTarget.source_slug);
      if (readyRow?.readiness_status !== "ready_for_feed_import") {
        fail(`restricted source readiness status for fixture feed was ${readyRow?.readiness_status}, expected ready_for_feed_import`);
      }
      if (readyRow?.feed_file_count !== 1 || readyRow?.affected_products !== 7) {
        fail("restricted source readiness did not merge feed file count and live gap summary counts");
      }
      if (readyRow?.product_sources !== "retailer_feed; gap_queue") {
        fail("restricted source readiness did not preserve product source evidence");
      }
      if (readyRow?.feed_drop_path !== path.join(readinessInputDir, firstTarget.source_slug, "feed.csv")) {
        fail("restricted source readiness did not report source-specific feed drop path");
      }
      if (!fs.existsSync(path.join(readinessOutputDir, "readiness-report.csv"))) {
        fail("restricted source readiness did not write CSV report");
      }
      if (!fs.existsSync(path.join(readinessOutputDir, "readiness-report.md"))) {
        fail("restricted source readiness did not write Markdown report");
      }
      const readinessMarkdown = read(path.join(readinessOutputDir, "readiness-report.md"));
      if (!readinessMarkdown.includes("Product sources") || !readinessMarkdown.includes("retailer_feed; gap_queue")) {
        fail("restricted source readiness Markdown did not include product source evidence");
      }
    }
  }

  const actionPlanImportRoot = path.join(tempDir, "action-plan-import-root");
  const actionPlanBlueDir = path.join(actionPlanImportRoot, "blue-buffalo-general-mills");
  const actionPlanOutputDir = path.join(tempDir, "live-gap-action-plan-output");
  const actionPlanGapSummaryPath = path.join(tempDir, "live-gap-summary.json");
  fs.mkdirSync(path.join(actionPlanBlueDir, "sql"), { recursive: true });
  fs.mkdirSync(path.join(actionPlanBlueDir, "missing-live-current"), { recursive: true });
  fs.writeFileSync(path.join(actionPlanBlueDir, "report.json"), JSON.stringify({
    source: "blue-buffalo-general-mills",
    feed: {
      rows: 2,
      complete_food_rows: 2,
      rows_with_ingredients: 2,
      rows_with_images: 2,
    },
    import_warnings: "Input rows: 2 Normalized rows: 2 SQL rows: 2",
  }, null, 2), "utf8");
  fs.writeFileSync(path.join(actionPlanBlueDir, "sql", "manifest.json"), JSON.stringify({
    source: "blue-buffalo-general-mills",
    total_sql_rows: 2,
    chunks: [{ file: "0001.sql", rows: 2 }],
  }, null, 2), "utf8");
  fs.writeFileSync(path.join(actionPlanBlueDir, "missing-live-current", "manifest.json"), JSON.stringify({
    source: "blue-buffalo-general-mills",
    total_missing_rows: 0,
    chunks: [],
  }, null, 2), "utf8");
  fs.writeFileSync(actionPlanGapSummaryPath, JSON.stringify([
    {
      brand: "Blue Buffalo",
      open_rows: 3,
      affected_products: 7,
      actionable_open_rows: 3,
      actionable_affected_products: 7,
      direct_duplicate_checked_open_rows: 3,
      direct_duplicate_checked_affected_products: 7,
      needs_ingredients_rows: 3,
      needs_image_rows: 3,
    },
    {
      brand: "Wag",
      open_rows: 2,
      affected_products: 5,
      needs_ingredients_rows: 2,
      needs_image_rows: 2,
    },
  ], null, 2), "utf8");
  const actionPlanResult = spawnSync(process.execPath, [
    "scripts/catalog-live-gap-action-plan.mjs",
    "--gap-summary", actionPlanGapSummaryPath,
    "--import-root", actionPlanImportRoot,
    "--output-dir", actionPlanOutputDir,
    "--limit", "10",
    "--skip-live-product-stats",
    "--json",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (actionPlanResult.status !== 0) {
    fail(`live gap action plan fixture failed: ${(actionPlanResult.stderr || actionPlanResult.stdout).trim()}`);
  } else {
    const actionPlanReport = JSON.parse(read(path.join(actionPlanOutputDir, "action-plan.json")));
    const blueRow = actionPlanReport.rows.find((row) => row.brand === "Blue Buffalo");
    const wagRow = actionPlanReport.rows.find((row) => row.brand === "Wag");
    if (blueRow?.recommended_action !== "expand_official_source_import") {
      fail(`live gap action plan Blue action was ${blueRow?.recommended_action}, expected expand_official_source_import`);
    }
    if (blueRow?.local_status !== "live_coverage_no_missing_rows") {
      fail(`live gap action plan Blue local status was ${blueRow?.local_status}, expected live_coverage_no_missing_rows`);
    }
    if (wagRow?.recommended_action !== "request_authorized_feed") {
      fail(`live gap action plan Wag action was ${wagRow?.recommended_action}, expected request_authorized_feed`);
    }
    if (!fs.existsSync(path.join(actionPlanOutputDir, "action-plan.csv"))) {
      fail("live gap action plan did not write CSV report");
    }
    if (!fs.existsSync(path.join(actionPlanOutputDir, "action-plan.md"))) {
      fail("live gap action plan did not write Markdown report");
    }
  }

  const actionPlanPagedSummaryDir = path.join(tempDir, "live-gap-summary-pages");
  const actionPlanPagedOutputDir = path.join(tempDir, "live-gap-action-plan-paged-output");
  fs.mkdirSync(actionPlanPagedSummaryDir, { recursive: true });
  fs.writeFileSync(path.join(actionPlanPagedSummaryDir, "0001.json"), JSON.stringify({
    catalog_live_gap_summary: {
      gap_source: "live_supabase_catalog_acquisition_queue",
      gap_exported_at: "2026-06-29T00:00:00.000Z",
      gap_row_scope: "all_brands_page",
      input_gap_brand_count: 2,
      input_gap_open_rows: 5,
      input_gap_affected_products: 12,
      requested_limit: 0,
      scoped_brand_count: 2,
      page_offset: 0,
      page_size: 1,
      page_row_count: 1,
      rows: [{
        brand: "Blue Buffalo",
        open_rows: 3,
        affected_products: 7,
        needs_ingredients_rows: 3,
        needs_image_rows: 3,
      }],
    },
  }, null, 2), "utf8");
  fs.writeFileSync(path.join(actionPlanPagedSummaryDir, "0002.json"), JSON.stringify({
    catalog_live_gap_summary: {
      gap_source: "live_supabase_catalog_acquisition_queue",
      gap_exported_at: "2026-06-29T00:01:00.000Z",
      gap_row_scope: "all_brands_page",
      input_gap_brand_count: 2,
      input_gap_open_rows: 5,
      input_gap_affected_products: 12,
      requested_limit: 0,
      scoped_brand_count: 2,
      page_offset: 1,
      page_size: 1,
      page_row_count: 1,
      rows: [{
        brand: "Wag",
        open_rows: 2,
        affected_products: 5,
        needs_ingredients_rows: 2,
        needs_image_rows: 2,
      }],
    },
  }, null, 2), "utf8");
  const actionPlanPagedResult = spawnSync(process.execPath, [
    "scripts/catalog-live-gap-action-plan.mjs",
    "--gap-summary", actionPlanPagedSummaryDir,
    "--import-root", actionPlanImportRoot,
    "--output-dir", actionPlanPagedOutputDir,
    "--limit", "0",
    "--skip-live-product-stats",
    "--json",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (actionPlanPagedResult.status !== 0) {
    fail(`live gap action plan paged fixture failed: ${(actionPlanPagedResult.stderr || actionPlanPagedResult.stdout).trim()}`);
  } else {
    const actionPlanPagedReport = JSON.parse(read(path.join(actionPlanPagedOutputDir, "action-plan.json")));
    if (actionPlanPagedReport.gap_row_scope !== "all_brands") {
      fail(`paged live gap summary scope was ${actionPlanPagedReport.gap_row_scope}, expected all_brands`);
    }
    if (actionPlanPagedReport.brand_count !== 2 || actionPlanPagedReport.input_gap_brand_count !== 2) {
      fail("paged live gap summary did not merge both brand rows");
    }
    if (actionPlanPagedReport.merged_gap_summary_files !== 2 || actionPlanPagedReport.merged_gap_row_count !== 2) {
      fail("paged live gap summary did not report merge metadata");
    }
  }

  const snapshotRequestPackOutputDir = path.join(tempDir, "browser-snapshot-request-pack");
  const snapshotRequestPackResult = spawnSync(process.execPath, [
    "scripts/catalog-authorized-feed-request-pack.mjs",
    "--output-dir", snapshotRequestPackOutputDir,
    "--access-status", "requires_browser_snapshot",
    "--limit", "1",
    "--json",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (snapshotRequestPackResult.status !== 0) {
    fail(`browser snapshot request pack fixture failed: ${(snapshotRequestPackResult.stderr || snapshotRequestPackResult.stdout).trim()}`);
  } else {
    const snapshotRequestPackManifest = JSON.parse(read(path.join(snapshotRequestPackOutputDir, "manifest.json")));
    const snapshotTarget = snapshotRequestPackManifest.targets?.[0];
    if (snapshotTarget?.access_status !== "requires_browser_snapshot") {
      fail("browser snapshot request pack did not select a requires_browser_snapshot target");
    }
    if (!snapshotTarget?.snapshot_import_command?.includes("catalog:retailer-snapshot-import-batch")) {
      fail("browser snapshot request pack did not write the retailer snapshot import command");
    }
    if (!/--retailer\s+["']?petco["']?/.test(snapshotTarget?.snapshot_import_command || "")) {
      fail("browser snapshot request pack did not infer the Petco retailer URL guard");
    }
    const snapshotDocs = read(snapshotTarget.docs_path);
    if (!snapshotDocs.includes("petco-browser-batch-snapshot-collector.js") || !snapshotDocs.includes("inputs/catalog-browser-snapshots")) {
      fail("browser snapshot request pack docs are missing collector/snapshot storage instructions");
    }

    const snapshotReadinessSnapshotDir = path.join(tempDir, "browser-snapshot-readiness-snapshots");
    const snapshotReadinessSourceDir = path.join(snapshotReadinessSnapshotDir, snapshotTarget.source_slug);
    const snapshotReadinessOutputDir = path.join(tempDir, "browser-snapshot-readiness-output");
    fs.mkdirSync(path.join(snapshotReadinessSourceDir, "batch-failures"), { recursive: true });
    fs.writeFileSync(path.join(snapshotReadinessSourceDir, "batch-failures", "001-failure.json"), JSON.stringify({
      index: 1,
      url: "https://www.petco.com/product/fixture-failed-page",
      navUrl: "https://www.petco.com/product/fixture-failed-page",
      error: "Navigation timeout before page text was captured",
    }, null, 2), "utf8");
    fs.writeFileSync(path.join(snapshotReadinessSourceDir, "001-product.json"), JSON.stringify([
      {
        url: "https://www.petco.com/product/fixture-wholehearted-food",
        text: "WholeHearted Fixture Dog Food Primary Brand WholeHearted Ingredients Chicken, Rice, Chicken Fat. Guaranteed Analysis Crude Protein 24.0%",
      },
    ], null, 2), "utf8");
    const snapshotReadinessResult = spawnSync(process.execPath, [
      "scripts/catalog-restricted-source-readiness.mjs",
      "--manifest", path.join(snapshotRequestPackOutputDir, "manifest.json"),
      "--input-dir", path.join(tempDir, "empty-snapshot-authorized-feed-input"),
      "--snapshot-dir", snapshotReadinessSnapshotDir,
      "--output-dir", snapshotReadinessOutputDir,
      "--json",
    ], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    if (snapshotReadinessResult.status !== 0) {
      fail(`browser snapshot readiness fixture failed: ${(snapshotReadinessResult.stderr || snapshotReadinessResult.stdout).trim()}`);
    } else {
      const snapshotReadinessReport = JSON.parse(read(path.join(snapshotReadinessOutputDir, "readiness-report.json")));
      const snapshotReadyRow = snapshotReadinessReport.rows.find((row) => row.source_slug === snapshotTarget.source_slug);
      if (snapshotReadyRow?.readiness_status !== "ready_for_snapshot_import") {
        fail(`browser snapshot readiness status was ${snapshotReadyRow?.readiness_status}, expected ready_for_snapshot_import`);
      }
      if (snapshotReadyRow?.snapshot_file_count !== 1) {
        fail(`browser snapshot readiness counted ${snapshotReadyRow?.snapshot_file_count} importable snapshots, expected 1`);
      }
      if (/failure\.json$/.test(snapshotReadyRow?.evidence_path || "")) {
        fail("browser snapshot readiness treated a failure JSON as importable evidence");
      }
    }
  }

  const petcoSnapshot = JSON.parse(read("scripts/fixtures/catalog-product-petco-snapshot.json"));
  const petcoContaminatedSnapshotPath = path.join(tempDir, "petco-contaminated-recommendation.json");
  const petcoContamination = " DHA, Savory Chicken Recipe Natural Dry Food for Puppies, 5 lbs. Starting at $18.99 was $22.99";
  fs.writeFileSync(petcoContaminatedSnapshotPath, JSON.stringify({
    ...petcoSnapshot,
    text: petcoSnapshot.text.replace(" Primary Brand WholeHearted", `${petcoContamination} Primary Brand WholeHearted`),
  }, null, 2), "utf8");
  const petcoExtractResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", petcoContaminatedSnapshotPath,
    "--json",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (petcoExtractResult.status !== 0) {
    fail(`page extractor Petco contaminated recommendation fixture failed: ${(petcoExtractResult.stderr || petcoExtractResult.stdout).trim()}`);
  } else {
    const petcoRows = JSON.parse(petcoExtractResult.stdout).rows || [];
    const petcoAnalysis = petcoRows[0]?.guaranteed_analysis || "";
    if (!petcoAnalysis.includes("Crude Protein 23.0%") || !petcoAnalysis.includes("Omega-3 Fatty Acids* 0.4%")) {
      fail("page extractor Petco fixture did not preserve verified nutrient rows");
    }
    if (/Savory Chicken|Starting at|\bwas\s+\$/i.test(petcoAnalysis)) {
      fail("page extractor leaked Petco recommendation/price text into guaranteed analysis");
    }
  }

  const wellnessIngredient = "Deboned Chicken, Chicken Meal, Brown Rice, Barley, Oatmeal, Chicken Fat, Flaxseed, Pumpkin, Cranberries, Natural Flavor, Salmon Oil, Apples, Potassium Chloride, Taurine, Choline Chloride, Vitamin E Supplement, Niacin, Zinc Proteinate, Ferrous Sulfate, Vitamin A Supplement, Thiamine Mononitrate, d-Calcium Pantothenate, Sodium Selenite, Pyridoxine Hydrochloride, Copper Sulfate, Manganese Sulfate, Riboflavin, Biotin, Vitamin D3 Supplement, Vitamin B12 Supplement, Folic Acid, Calcium Iodate.";
  const wellnessFixturePath = path.join(tempDir, "wellness-meta-evidence.html");
  fs.writeFileSync(wellnessFixturePath, `<!doctype html>
<html>
  <head>
    <title>Healthy Indulgence Morsels Chicken &amp; Chicken Liver Cat Food</title>
    <meta name="description" content="Give your cat a complete, grain-free meal." />
    <meta property="og:title" content="Healthy Indulgence Morsels Chicken &amp; Chicken Liver Cat Food" />
    <meta property="og:description" content="Give your cat a complete, grain-free meal." />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Wellness Complete Health Healthy Indulgence Morsels with Chicken & Chicken Liver in Savory Sauce",
        "brand": { "@type": "Brand", "name": "Wellness" },
        "image": "https://images.salsify.com/image/upload/wellness-cat-front.jpg"
      }
    </script>
  </head>
  <body>
    <p><strong>Ingredients:</strong> ${wellnessIngredient}</p>
    <h2>Guaranteed Analysis</h2>
    <p>Crude Protein (min.) 7%, Crude Fat (min.) 4%, Crude Fiber (max.) 1%, Moisture (max.) 82%, Taurine (min.) 0.1%</p>
  </body>
</html>`, "utf8");
  const wellnessMetaResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", wellnessFixturePath,
    "--source-url", "https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-healthy-indulgence-morsels-chicken-chicken-liver/",
    "--brand", "Wellness",
    "--json",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (wellnessMetaResult.status !== 0) {
    fail(`page extractor Wellness meta evidence fixture failed: ${(wellnessMetaResult.stderr || wellnessMetaResult.stdout).trim()}`);
  } else {
    const wellnessRow = JSON.parse(wellnessMetaResult.stdout).rows?.[0] || {};
    if (wellnessRow.pet_type !== "cat") {
      fail(`page extractor Wellness meta title pet_type was ${wellnessRow.pet_type}, expected cat`);
    }
    if (wellnessRow.is_complete_food !== "true") {
      fail(`page extractor Wellness cat food complete flag was ${wellnessRow.is_complete_food}, expected true`);
    }
  }

  const wellnessStewFixturePath = path.join(tempDir, "wellness-stew-source-evidence.html");
  fs.writeFileSync(wellnessStewFixturePath, `<!doctype html>
<html>
  <head>
    <title>Wellness Complete Health Chicken | Wellness Pet Food</title>
    <meta name="description" content="Wellness Complete Health Stews Chicken is a natural wet dog food." />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Wellness Complete Health Chicken",
        "brand": { "@type": "Brand", "name": "Wellness" },
        "image": "https://images.salsify.com/image/upload/wellness-stew-front.jpg"
      }
    </script>
  </head>
  <body>
    <p><strong>Ingredients:</strong> ${wellnessIngredient}</p>
    <h2>Guaranteed Analysis</h2>
    <p>Crude Protein (min.) 8%, Crude Fat (min.) 3.5%, Crude Fiber (max.) 1%, Moisture (max.) 82%</p>
  </body>
</html>`, "utf8");
  const wellnessStewResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", wellnessStewFixturePath,
    "--source-url", "https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-stews-chicken/",
    "--brand", "Wellness",
    "--json",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (wellnessStewResult.status !== 0) {
    fail(`page extractor Wellness stew fixture failed: ${(wellnessStewResult.stderr || wellnessStewResult.stdout).trim()}`);
  } else {
    const wellnessStewRow = JSON.parse(wellnessStewResult.stdout).rows?.[0] || {};
    if (wellnessStewRow.product_name !== "Wellness Complete Health Stews Chicken") {
      fail(`page extractor Wellness stew name was ${wellnessStewRow.product_name}, expected source family identity`);
    }
    if (wellnessStewRow.food_form !== "wet") {
      fail(`page extractor Wellness stew food_form was ${wellnessStewRow.food_form}, expected wet`);
    }
  }

  const wellnessTreatPath = path.join(tempDir, "wellness-dog-treat.html");
  fs.writeFileSync(wellnessTreatPath, `<!doctype html>
<html>
  <head>
    <title>Wellness CORE Healthy Joints Beef &amp; Chicken Meal</title>
    <meta name="description" content="Wellness CORE Healthy Joints Crunchy Dog Treats are wholesome, bite-sized dog treats." />
    <meta property="og:description" content="Wellness CORE Healthy Joints Crunchy Dog Treats are wholesome, bite-sized dog treats." />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Wellness CORE Healthy Joints Beef & Chicken Meal",
        "brand": { "@type": "Brand", "name": "Wellness" },
        "image": "https://images.salsify.com/image/upload/wellness-treat-front.jpg"
      }
    </script>
  </head>
  <body>
    <p><strong>Ingredients:</strong> ${wellnessIngredient}</p>
    <h2>Guaranteed Analysis</h2>
    <p>Crude Protein Not Less Than 24.0%, Crude Fat Not Less Than 12.0%, Crude Fiber Not More Than 4.0%, Moisture Not More Than 22.0%</p>
  </body>
</html>`, "utf8");
  const wellnessTreatResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", wellnessTreatPath,
    "--source-url", "https://www.wellnesspetfood.com/product-catalog/wellness-core-healthy-joints-beef-chicken-meal/",
    "--brand", "Wellness",
    "--json",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (wellnessTreatResult.status !== 0) {
    fail(`page extractor Wellness treat fixture failed: ${(wellnessTreatResult.stderr || wellnessTreatResult.stdout).trim()}`);
  } else {
    const wellnessTreatRow = JSON.parse(wellnessTreatResult.stdout).rows?.[0] || {};
    if (wellnessTreatRow.is_complete_food !== "false") {
      fail(`page extractor Wellness dog treat complete flag was ${wellnessTreatRow.is_complete_food}, expected false`);
    }
  }

  const completeBalancedTreatPath = path.join(tempDir, "merrick-complete-balanced-cat-treat.html");
  fs.writeFileSync(completeBalancedTreatPath, `<!doctype html>
<html>
  <head>
    <title>Merrick Purrfect Bistro Petite Parfaits Chicken Mousse With Beef in Glaze Gravy for Cats Wet Cat Treats</title>
    <meta name="description" content="Merrick Purrfect Bistro Petite Parfaits Wet Cat Treats deliver complete and balanced nutrition with real chicken." />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Merrick Purrfect Bistro Petite Parfaits Chicken Mousse With Beef in Glaze Gravy for Cats Wet Cat Treats",
        "brand": { "@type": "Brand", "name": "Merrick" },
        "image": "https://www.merrickpetcare.com/sites/default/files/treat-front.png"
      }
    </script>
  </head>
  <body>
    <p><strong>Ingredients:</strong> Chicken broth, chicken, eggs, beef, tapioca starch, yeast extract, xanthan gum, agar-agar, celery salt.</p>
    <p>Complete and balanced nutrition for adult cats.</p>
  </body>
</html>`, "utf8");
  const completeBalancedTreatResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", completeBalancedTreatPath,
    "--source-url", "https://www.merrickpetcare.com/shop/purrfect-bistro-petite-parfaits-chicken-beef-mousse-gravy-wet-cat-treats",
    "--brand", "Merrick",
    "--json",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (completeBalancedTreatResult.status !== 0) {
    fail(`page extractor complete-balanced treat fixture failed: ${(completeBalancedTreatResult.stderr || completeBalancedTreatResult.stdout).trim()}`);
  } else {
    const completeBalancedTreatRow = JSON.parse(completeBalancedTreatResult.stdout).rows?.[0] || {};
    if (completeBalancedTreatRow.is_complete_food !== "false") {
      fail(`page extractor complete-balanced treat flag was ${completeBalancedTreatRow.is_complete_food}, expected false`);
    }
  }

  const orijenFdtTreatPath = path.join(tempDir, "orijen-fdt-treat.html");
  fs.writeFileSync(orijenFdtTreatPath, `<!doctype html>
<html>
  <head>
    <title>ORIJEN Original Freeze-Dried Treats</title>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Original",
        "brand": { "@type": "Brand", "name": "Orijen" },
        "image": "https://www.orijenpetfoods.com/dw/image/v2/BFDW_PRD/orijen-original-fdt-front.png",
        "category": "Dog Food"
      }
    </script>
  </head>
  <body>
    <p><strong>Ingredients:</strong> Chicken, turkey, turkey giblets (liver, heart, gizzard), chicken giblets (liver, heart, gizzard), flounder, mixed tocopherols (preservative), citric acid (preservative), rosemary extract.</p>
    <h2>Guaranteed Analysis</h2>
    <p>Crude Protein (min.) 36%, Crude Fat (min.) 36%, Crude Fiber (max.) 3%, Moisture (max.) 2%</p>
  </body>
</html>`, "utf8");
  const orijenFdtTreatResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", orijenFdtTreatPath,
    "--source-url", "https://www.orijenpetfoods.com/en-US/dogs/dog-food/original/ds-ori-fdt-original-dog.html",
    "--brand", "Orijen",
    "--json",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (orijenFdtTreatResult.status !== 0) {
    fail(`page extractor Orijen FDT fixture failed: ${(orijenFdtTreatResult.stderr || orijenFdtTreatResult.stdout).trim()}`);
  } else {
    const orijenFdtTreatRow = JSON.parse(orijenFdtTreatResult.stdout).rows?.[0] || {};
    if (orijenFdtTreatRow.is_complete_food !== "false") {
      fail(`page extractor Orijen FDT complete flag was ${orijenFdtTreatRow.is_complete_food}, expected false`);
    }
  }

  const wellnessProbioticKibblePath = path.join(tempDir, "wellness-probiotic-kibble.html");
  fs.writeFileSync(wellnessProbioticKibblePath, `<!doctype html>
<html>
  <head>
    <title>CORE Digestive Health Chicken &amp; Brown Rice | Wellness Pet</title>
    <meta name="description" content="Wellness CORE Digestive Health Chicken &amp; Brown Rice is a highly digestible, probiotic-coated kibble crafted with digestive enzymes." />
    <meta property="og:description" content="Wellness CORE Digestive Health Chicken &amp; Brown Rice is a highly digestible, probiotic-coated kibble crafted with digestive enzymes." />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Wellness CORE Digestive Health Chicken & Brown Rice Recipe",
        "brand": { "@type": "Brand", "name": "Wellness" },
        "image": "https://images.salsify.com/image/upload/wellness-kibble-front.jpg"
      }
    </script>
  </head>
  <body>
    <p><strong>Ingredients:</strong> ${wellnessIngredient}</p>
    <h2>Guaranteed Analysis</h2>
    <p>Crude Protein Not Less Than 30.0%, Crude Fat Not Less Than 12.0%, Crude Fiber Not More Than 4.00%, Moisture Not More Than 10.0%</p>
  </body>
</html>`, "utf8");
  const wellnessKibbleResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", wellnessProbioticKibblePath,
    "--source-url", "https://www.wellnesspetfood.com/product-catalog/wellness-core-digestive-health-chicken-brown-rice/",
    "--brand", "Wellness",
    "--json",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (wellnessKibbleResult.status !== 0) {
    fail(`page extractor Wellness probiotic kibble fixture failed: ${(wellnessKibbleResult.stderr || wellnessKibbleResult.stdout).trim()}`);
  } else {
    const wellnessKibbleRow = JSON.parse(wellnessKibbleResult.stdout).rows?.[0] || {};
    if (wellnessKibbleRow.is_complete_food !== "true") {
      fail(`page extractor Wellness probiotic kibble complete flag was ${wellnessKibbleRow.is_complete_food}, expected true`);
    }
  }

  const weruvaIngredient = "Chicken, Chicken Broth, Turkey, Locust Bean Gum, Sunflower Seed Oil, Calcium Lactate, Guar Gum, Xanthan Gum, Fish Oil, Potassium Chloride, Tricalcium Phosphate, Choline Chloride, Taurine, Zinc Sulfate, Vitamin E Supplement, Nicotinic Acid, Ferrous Sulfate, Manganese Proteinate, Calcium Pantothenate, Vitamin A Supplement, Thiamine Mononitrate, Pyridoxine Hydrochloride, Riboflavin Supplement, Vitamin D3 Supplement, Folic Acid, Copper Sulfate, Potassium Iodide, Sodium Selenite, Biotin, Vitamin B12 Supplement.";
  const weruvaCompletePureePath = path.join(tempDir, "weruva-complete-puree.html");
  fs.writeFileSync(weruvaCompletePureePath, `<!doctype html>
<html>
  <head>
    <title>Chicken Dinner in a Hydrating Purée</title>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Chicken Dinner in a Hydrating Purée",
        "brand": { "@type": "Brand", "name": "Weruva" },
        "category": "Wet Cat Food",
        "image": "https://cdn.shopify.com/s/files/1/0668/0051/7394/files/weruva-complete-front.jpg"
      }
    </script>
  </head>
  <body>
    <h1>Chicken Dinner in a Hydrating Purée</h1>
    <h2>Ingredients</h2>
    <p>${weruvaIngredient}</p>
    <h2>Guaranteed Analysis</h2>
    <p>Crude Protein (min): 7%, Crude Fat (min): 3%, Crude Fiber (max): 1%, Crude Moisture (max): 84%. Lifestage Adult Features Complete &amp; Balanced, Fish-Free, Gluten-Free, Grain-Free.</p>
  </body>
</html>`, "utf8");
  const weruvaCompletePureeResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", weruvaCompletePureePath,
    "--source-url", "https://www.weruva.com/products/soulistic-pate-chicken-dinner-cat-can",
    "--brand", "Weruva",
    "--json",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (weruvaCompletePureeResult.status !== 0) {
    fail(`page extractor Weruva complete puree fixture failed: ${(weruvaCompletePureeResult.stderr || weruvaCompletePureeResult.stdout).trim()}`);
  } else {
    const weruvaCompletePureeRow = JSON.parse(weruvaCompletePureeResult.stdout).rows?.[0] || {};
    if (weruvaCompletePureeRow.is_complete_food !== "true") {
      fail(`page extractor Weruva complete puree flag was ${weruvaCompletePureeRow.is_complete_food}, expected true`);
    }
  }

  const weruvaSupplementalPath = path.join(tempDir, "weruva-supplemental-feeding.html");
  fs.writeFileSync(weruvaSupplementalPath, `<!doctype html>
<html>
  <head>
    <title>Chicken Formula in Gravy</title>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Chicken Formula in Gravy",
        "brand": { "@type": "Brand", "name": "Weruva" },
        "category": "Wet Cat Food",
        "image": "https://cdn.shopify.com/s/files/1/0668/0051/7394/files/weruva-supplemental-front.jpg"
      }
    </script>
  </head>
  <body>
    <h1>Chicken Formula in Gravy</h1>
    <h2>Ingredients</h2>
    <p>${weruvaIngredient}</p>
    <h2>Guaranteed Analysis</h2>
    <p>Crude Protein (min): 10%, Crude Fat (min): 5%, Crude Fiber (max): 1%, Crude Moisture (max): 83.5%. Lifestage Adult, Senior Features Gluten-Free, Grain-Free, Supplemental Feeding.</p>
  </body>
</html>`, "utf8");
  const weruvaSupplementalResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", weruvaSupplementalPath,
    "--source-url", "https://www.weruva.com/products/chicken-formula-in-gravy-cat-can",
    "--brand", "Weruva",
    "--json",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (weruvaSupplementalResult.status !== 0) {
    fail(`page extractor Weruva supplemental-feeding fixture failed: ${(weruvaSupplementalResult.stderr || weruvaSupplementalResult.stdout).trim()}`);
  } else {
    const weruvaSupplementalRow = JSON.parse(weruvaSupplementalResult.stdout).rows?.[0] || {};
    if (weruvaSupplementalRow.is_complete_food !== "false") {
      fail(`page extractor Weruva supplemental-feeding flag was ${weruvaSupplementalRow.is_complete_food}, expected false`);
    }
  }

  const inlineIngredient = "Chicken, chicken broth, chicken liver, carrots, turkey, green beans, peas, celery, sweet potatoes, guar gum, xanthan gum, potassium chloride, pumpkin, flaxseed oil (preserved with mixed tocopherols), minerals (iron amino acid chelate, zinc amino acid chelate, copper amino acid chelate, manganese amino acid chelate, sodium selenite, potassium iodide), choline chloride, vitamins (vitamin E supplement, thiamine mononitrate, niacin supplement, d-calcium pantothenate, pyridoxine hydrochloride, riboflavin supplement, vitamin A supplement, biotin, vitamin D3 supplement, vitamin B12 supplement, folic acid), taurine, dried kelp, salmon oil (preserved with mixed tocopherols), magnesium sulfate, natural flavor.";
  const inlineHtmlPath = path.join(tempDir, "inline-ingredients.html");
  fs.writeFileSync(inlineHtmlPath, `<!doctype html>
<html>
  <head>
    <title>Halo Test Chicken Recipe Wet Cat Food</title>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Halo Test Chicken Recipe Wet Cat Food",
        "brand": { "@type": "Brand", "name": "Halo" },
        "image": "https://example.com/images/halo-test-front.jpg"
      }
    </script>
  </head>
  <body>
    <div class="ingredient-description">
      <p>Made with whole animal proteins only, Made with non-GMO vegetables, No artificial colors, flavors or preservatives, Made in the USA with the world's finest ingredients</p>
    </div>
    <h2>Guaranteed Analysis</h2>
    <table>
      <tr><td>Crude Protein (min.)</td><td>9%</td></tr>
      <tr><td>Crude Fat (min.)</td><td>6%</td></tr>
      <tr><td>Crude Fiber (max.)</td><td>1.50%</td></tr>
      <tr><td>Moisture (max.)</td><td>84%</td></tr>
    </table>
    <p><strong>I</strong><strong>ngredients:&nbsp;</strong>${inlineIngredient}</p>
  </body>
</html>`, "utf8");
  const extractResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", inlineHtmlPath,
    "--source-url", "https://example.com/catalog-fixtures/halo-inline-ingredients",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (extractResult.status !== 0) {
    fail(`page extractor inline ingredient fixture failed: ${(extractResult.stderr || extractResult.stdout).trim()}`);
  } else {
    if (!extractResult.stdout.includes(inlineIngredient)) {
      fail("page extractor did not prefer explicit inline Ingredients paragraph");
    }
    if (extractResult.stdout.includes("Made with whole animal proteins only")) {
      fail("page extractor leaked marketing copy as ingredients");
    }
  }

  const almoIngredient = "Chicken, Water Sufficient For Processing, Sunflower Oil, Calcium Sulfate, Sodium Tripolyphosphate, Tricalcium Phosphate, Locust Bean Gum, Guar Gum, Xanthan Gum, Magnesium Sulfate, Choline Chloride, Potassium Chloride, Minerals (Ferrous Sulfate, Zinc Oxide, Manganese Sulfate, Copper Amino Acid Complex, Sodium Selenite, Potassium Iodide), Taurine, Vitamins (Vitamin E Supplement, Vitamin A Supplement, Niacin Supplement, Vitamin B1 Supplement, Pyridoxine Hydrochloride, Vitamin D3 Supplement, d-Calcium Pantothenate, Riboflavin Supplement, Biotin Supplement, Vitamin B12 Supplement, Folic Acid, Menadione Sodium Bisulfite Complex (Source of Vitamin K Activity)).";
  const almoHtmlPath = path.join(tempDir, "almo-classic-complete.html");
  fs.writeFileSync(almoHtmlPath, `<!doctype html>
<html>
  <head>
    <title>Classic Complete Chicken Recipe in soft aspic</title>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Classic Complete Chicken Recipe in soft aspic",
        "brand": { "@type": "Brand", "name": "Almo Nature" },
        "image": "https://www.almonature.com/images/classic-complete-chicken-front.png",
        "gtin13": "699184021316",
        "category": "Animals & Pet Supplies > Pet Supplies > Cat Food"
      }
    </script>
  </head>
  <body>
    <div id="product" data-brand="Classic" data-segment="Classic Complete" data-recipe="Chicken Recipe in soft aspic"></div>
    <div class="Product__analytical"><div>Crude Protein (min) 12%, Crude Fat (min) 2%, Crude Fiber (max) 1%, Moisture (max) 81%, Taurine (min) 0.05%</div></div>
    <div id="composition" class="Product__ingredients active">${almoIngredient}</div>
  </body>
</html>`, "utf8");
  const almoExtractResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", almoHtmlPath,
    "--source-url", "https://www.almonature.com/en-us/cat-products/1450",
    "--brand", "Almo Nature",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (almoExtractResult.status !== 0) {
    fail(`page extractor Almo complete fixture failed: ${(almoExtractResult.stderr || almoExtractResult.stdout).trim()}`);
  } else if (!almoExtractResult.stdout.includes(almoIngredient)) {
    fail("page extractor did not extract Almo Classic Complete non-percentage ingredients");
  }

  const blueBuffaloIngredient = "Deboned Alligator, Peas, Pea Starch, Alligator Meal, Pea Protein, Tapioca Starch, Potato Starch, Canola Oil (source of Omega 6 Fatty Acids), Flaxseed (source of Omega 3 Fatty Acids), Natural Flavor, Pea Fiber, Dicalcium Phosphate, Fish Oil (source of DHA-Docosahexaenoic Acid), Potassium Chloride, Salt, Pumpkin, Dried Kelp, Dried Chicory Root, L-Threonine, Choline Chloride, Direct Dehydrated Alfalfa Pellets, DL-Methionine, Calcium Carbonate, Vitamin E Supplement, L-Tryptophan, Zinc Amino Acid Chelate, preserved with Mixed Tocopherols, Iron Amino Acid Chelate, L-Ascorbyl-2-Polyphosphate (source of Vitamin C), Copper Amino Acid Chelate, Manganese Amino Acid Chelate, Niacin (Vitamin B3), Calcium Pantothenate (Vitamin B5), Biotin (Vitamin B7), Vitamin A Supplement, Thiamine Mononitrate (Vitamin B1), Riboflavin (Vitamin B2), Vitamin D3 Supplement, Vitamin B12 Supplement, Pyridoxine Hydrochloride (Vitamin B6), Calcium Iodate, Dried Yeast, Dried Enterococcus faecium fermentation product, Dried Lactobacillus acidophilus fermentation product, Dried Aspergillus niger fermentation extract, Dried Trichoderma longibrachiatum fermentation extract, Dried Bacillus subtilis fermentation extract, Folic Acid (Vitamin B9), Sodium Selenite, Oil of Rosemary";
  const blueBuffaloIngredientJsonRows = blueBuffaloIngredient.split(", ").map((name) => ({ name }));
  blueBuffaloIngredientJsonRows[blueBuffaloIngredientJsonRows.length - 1].name += ".\n\nThis product was made using alligator that was sourced in the United States in full compliance with the provisions of the Convention on International Trade in Endangered Species (CITES)";
  const blueBuffaloHtmlPath = path.join(tempDir, "blue-buffalo-ingredient-json.html");
  fs.writeFileSync(blueBuffaloHtmlPath, `<!doctype html>
<html>
  <head>
    <title>BLUE Natural Veterinary Diet Dry Dog Food Novel Protein</title>
    <meta property="og:image" content="https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-dry-food/natural-veterinary-diet/share-product-image/share_nvd_dog_np_dry.png" />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "BLUE Natural Veterinary Diet Dry Dog Food Novel Protein",
        "brand": { "@type": "Brand", "name": "Blue Buffalo" },
        "image": "https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-dry-food/natural-veterinary-diet/share-product-image/share_nvd_dog_np_dry.png"
      }
    </script>
    <script>
      window.ingredientsJson = {
        "ingredients": ${JSON.stringify(blueBuffaloIngredientJsonRows)}
      };
    </script>
  </head>
  <body>
    <table>
      <tr><th>Crude Protein</th><td>22.0% min</td></tr>
      <tr><th>Crude Fat</th><td>14.0% min</td></tr>
      <tr><th>Crude Fiber</th><td>6.0% max</td></tr>
      <tr><th>Moisture</th><td>10.0% max</td></tr>
    </table>
  </body>
</html>`, "utf8");
  const blueBuffaloExtractResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", blueBuffaloHtmlPath,
    "--source-url", "https://www.bluebuffalo.com/dry-dog-food/blue-natural-veterinary-diet/novel-protein-alligator/",
    "--brand", "Blue Buffalo",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (blueBuffaloExtractResult.status !== 0) {
    fail(`page extractor Blue Buffalo ingredient JSON fixture failed: ${(blueBuffaloExtractResult.stderr || blueBuffaloExtractResult.stdout).trim()}`);
  } else {
    if (!blueBuffaloExtractResult.stdout.includes(blueBuffaloIngredient)) {
      fail("page extractor did not extract Blue Buffalo official ingredient JSON");
    }
    if (blueBuffaloExtractResult.stdout.includes("Convention on International Trade")) {
      fail("page extractor leaked Blue Buffalo ingredient JSON disclaimer");
    }
  }

  const blueBuffaloMalformedIngredient = "Deboned Lamb, Lamb Meal, Potatoes, Peas, Chicken Fat (preserved with Mixed Tocopherols), Flaxseed (source of Omega 3 and 6 Fatty Acids), Natural Flavor, Niacin (Vitamin B3), Calcium Pantothenate Vitamin B5), L-Ascorbyl-2-Polyphosphate Vitamin C), Calcium lodate, Folic Acid (Vitamin B9), Sodium Selenite, Oil of Rosemary";
  const blueBuffaloNormalizedIngredient = "Deboned Lamb, Lamb Meal, Potatoes, Peas, Chicken Fat (preserved with Mixed Tocopherols), Flaxseed (source of Omega 3 and 6 Fatty Acids), Natural Flavor, Niacin (Vitamin B3), Calcium Pantothenate (Vitamin B5), L-Ascorbyl-2-Polyphosphate (Vitamin C), Calcium Iodate, Folic Acid (Vitamin B9), Sodium Selenite, Oil of Rosemary";
  const blueBuffaloMalformedHtmlPath = path.join(tempDir, "blue-buffalo-malformed-ingredient.html");
  fs.writeFileSync(blueBuffaloMalformedHtmlPath, `<!doctype html>
<html>
  <head>
    <title>Life Protection Formula Adult Dog Grain-Free Lamb Recipe</title>
    <meta property="og:image" content="https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-dry-food/life-protection-formula/share-product-image/share_lpf_dry_dog_gf_lambpotato.png" />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Life Protection Formula Adult Dog Grain-Free Lamb Recipe",
        "brand": { "@type": "Brand", "name": "Blue Buffalo" },
        "image": "https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-dry-food/life-protection-formula/share-product-image/share_lpf_dry_dog_gf_lambpotato.png",
        "category": "Dog Food"
      }
    </script>
  </head>
  <body>
    <p><strong>Ingredients:</strong> ${blueBuffaloMalformedIngredient}</p>
    <h2>Guaranteed Analysis</h2>
    <table>
      <tr><td>Crude Protein</td><td>24%</td></tr>
      <tr><td>Crude Fat</td><td>14%</td></tr>
      <tr><td>Crude Fiber</td><td>6%</td></tr>
      <tr><td>Moisture</td><td>10%</td></tr>
    </table>
  </body>
</html>`, "utf8");
  const blueBuffaloMalformedExtractResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", blueBuffaloMalformedHtmlPath,
    "--source-url", "https://www.bluebuffalo.com/dry-dog-food/life-protection-formula/adult-grain-free-lamb-potato-recipe/",
    "--brand", "Blue Buffalo",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (blueBuffaloMalformedExtractResult.status !== 0) {
    fail(`page extractor Blue Buffalo malformed ingredient fixture failed: ${(blueBuffaloMalformedExtractResult.stderr || blueBuffaloMalformedExtractResult.stdout).trim()}`);
  } else {
    if (!blueBuffaloMalformedExtractResult.stdout.includes(blueBuffaloNormalizedIngredient)) {
      fail("page extractor did not normalize Blue Buffalo ingredient punctuation/OCR artifacts");
    }
    if (blueBuffaloMalformedExtractResult.stdout.includes("Calcium Pantothenate Vitamin B5)") || blueBuffaloMalformedExtractResult.stdout.includes("Calcium lodate")) {
      fail("page extractor leaked Blue Buffalo malformed ingredient artifacts");
    }
  }

  const splitMicronutrientHtmlPath = path.join(tempDir, "split-micronutrient-ingredient.html");
  fs.writeFileSync(splitMicronutrientHtmlPath, `<!doctype html>
<html>
  <head>
    <title>Fixture Split Micronutrient Adult Cat Food</title>
    <meta property="og:image" content="https://example.com/images/split-micronutrient-front.jpg" />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Fixture Split Micronutrient Adult Cat Food",
        "brand": { "@type": "Brand", "name": "Fixture" },
        "image": "https://example.com/images/split-micronutrient-front.jpg",
        "category": "Cat Food"
      }
    </script>
  </head>
  <body>
    <p><strong>Ingredients:</strong> Chicken, Chicken Broth, Wheat Gluten, Liver, Fish, Corn Starch-Modified, Taurine, Choline Chloride, VITAMINS [thiamine mononitrate, pyr idoxine hydrochloride, ribo flavin supplement, bio tin, folic acid, Vitamin D-3 supplement].</p>
    <h2>Guaranteed Analysis</h2>
    <table>
      <tr><td>Crude Protein</td><td>10%</td></tr>
      <tr><td>Crude Fat</td><td>5%</td></tr>
      <tr><td>Crude Fiber</td><td>1%</td></tr>
      <tr><td>Moisture</td><td>78%</td></tr>
    </table>
  </body>
</html>`, "utf8");
  const splitMicronutrientExtractResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", splitMicronutrientHtmlPath,
    "--source-url", "https://example.com/cats/shop/split-micronutrient-cat-food",
    "--brand", "Fixture",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (splitMicronutrientExtractResult.status !== 0) {
    fail(`page extractor split micronutrient fixture failed: ${(splitMicronutrientExtractResult.stderr || splitMicronutrientExtractResult.stdout).trim()}`);
  } else {
    if (!splitMicronutrientExtractResult.stdout.includes("pyridoxine hydrochloride")
      || !splitMicronutrientExtractResult.stdout.includes("riboflavin supplement")
      || !splitMicronutrientExtractResult.stdout.includes("biotin")) {
      fail("page extractor did not normalize split micronutrient ingredient terms");
    }
    if (/pyr idoxine|ribo flavin|bio tin/i.test(splitMicronutrientExtractResult.stdout)) {
      fail("page extractor leaked split micronutrient ingredient artifacts");
    }
  }

  const splitMicronutrientCandidate = normalizeScraperCandidate({
    cache_key: "fixture-source:split-micronutrient",
    product_name: "Fixture Split Micronutrient Adult Cat Food",
    brand: "Fixture Source",
    source: "fixture-source",
    source_quality: "manufacturer",
    source_url: "https://example.com/products/split-micronutrient",
    pet_type: "cat",
    package_size: "3 oz",
    front_image_url: "https://example.com/images/split-micronutrient-front.jpg",
    ingredient_text: "Chicken, Chicken Broth, Wheat Gluten, Liver, Fish, Corn Starch-Modified, Taurine, Choline Chloride, VITAMINS [thiamine mononitrate, pyr idoxine hydrochloride, ribo flavin supplement, bio tin, folic acid, Vitamin D-3 supplement].",
    ingredient_verification_status: "manufacturer",
    image_verification_status: "manufacturer",
    is_complete_food: true,
  });
  const splitMicronutrientValidation = validateScraperCandidate(splitMicronutrientCandidate);
  if (!splitMicronutrientValidation.reasons.includes("ingredient_ocr_artifact")) {
    fail("catalog scraper contract did not reject split micronutrient ingredient artifacts");
  }

  const badOrderParenthesesCandidate = normalizeScraperCandidate({
    cache_key: "fixture-source:bad-order-parentheses",
    product_name: "Fixture Bad Order Parentheses Adult Cat Food",
    brand: "Fixture Source",
    source: "fixture-source",
    source_quality: "manufacturer",
    source_url: "https://example.com/products/bad-order-parentheses",
    pet_type: "cat",
    package_size: "3 oz",
    front_image_url: "https://example.com/images/bad-order-parentheses-front.jpg",
    ingredient_text: "Chicken, Minerals (Zinc Sulfate, Sodium Selenite), Choline Chloride, Sodium Selenite), Mixed Tocopherols (Preservative",
    ingredient_verification_status: "manufacturer",
    image_verification_status: "manufacturer",
    is_complete_food: true,
  });
  const badOrderParenthesesValidation = validateScraperCandidate(badOrderParenthesesCandidate);
  if (!badOrderParenthesesValidation.reasons.includes("unbalanced_ingredient_parentheses")) {
    fail("catalog scraper contract did not reject equal-count bad-order ingredient parentheses");
  }

  const badSquareBracketCandidate = normalizeScraperCandidate({
    cache_key: "fixture-source:bad-square-bracket",
    product_name: "Fixture Bad Square Bracket Adult Dog Food",
    brand: "Fixture Source",
    source: "fixture-source",
    source_quality: "manufacturer",
    source_url: "https://example.com/products/bad-square-bracket",
    pet_type: "dog",
    package_size: "3.5 oz",
    front_image_url: "https://example.com/images/bad-square-bracket-front.jpg",
    ingredient_text: "Chicken, Rice, Liver, Calcium Carbonate, Minerals (Zinc Sulfate), Vitamins (Vitamin E Supplement, Pyridoxine [Vitamin B6, Vitamin D3 Supplement, Folic Acid).",
    ingredient_verification_status: "label_ocr_verified",
    image_verification_status: "manufacturer",
    is_complete_food: true,
  });
  const badSquareBracketValidation = validateScraperCandidate(badSquareBracketCandidate);
  if (!badSquareBracketValidation.reasons.includes("ingredient_ocr_artifact")) {
    fail("catalog scraper contract did not reject unbalanced square-bracket ingredient OCR artifacts");
  }

  const missingAscorbylPrefixCandidate = normalizeScraperCandidate({
    cache_key: "fixture-source:missing-ascorbyl-prefix",
    product_name: "Fixture Missing Ascorbyl Prefix Adult Dog Food",
    brand: "Fixture Source",
    source: "fixture-source",
    source_quality: "manufacturer",
    source_url: "https://example.com/products/missing-ascorbyl-prefix",
    pet_type: "dog",
    package_size: "12 lb",
    front_image_url: "https://example.com/images/missing-ascorbyl-prefix-front.jpg",
    ingredient_text: "Chicken, Chicken Meal, Peas, Zinc Sulfate, -Ascorbyl-2-Polyphosphate (Vitamin C), Calcium Iodate, Sodium Selenite.",
    ingredient_verification_status: "label_ocr_verified",
    image_verification_status: "manufacturer",
    is_complete_food: true,
  });
  const missingAscorbylPrefixValidation = validateScraperCandidate(missingAscorbylPrefixCandidate);
  if (!missingAscorbylPrefixValidation.reasons.includes("ingredient_ocr_artifact")) {
    fail("catalog scraper contract did not reject missing leading L-Ascorbyl ingredient OCR artifacts");
  }

  const sentenceSplitPreservativeCandidate = normalizeScraperCandidate({
    cache_key: "fixture-source:sentence-split-preservative",
    product_name: "Fixture Sentence Split Preservative Adult Cat Food",
    brand: "Fixture Source",
    source: "fixture-source",
    source_quality: "manufacturer",
    source_url: "https://example.com/products/sentence-split-preservative",
    pet_type: "cat",
    package_size: "5 lb",
    front_image_url: "https://example.com/images/sentence-split-preservative-front.jpg",
    ingredient_text: "Chicken, Chicken Meal, Dried Kelp, Vitamin E Supplement. preserved with Mixed Tocopherols, Sodium Selenite.",
    ingredient_verification_status: "manufacturer",
    image_verification_status: "manufacturer",
    is_complete_food: true,
  });
  const sentenceSplitPreservativeValidation = validateScraperCandidate(sentenceSplitPreservativeCandidate);
  if (!sentenceSplitPreservativeValidation.reasons.includes("ingredient_ocr_artifact")) {
    fail("catalog scraper contract did not reject sentence-split preservative ingredient artifacts");
  }

  const blueBuffaloToyBreedHtmlPath = path.join(tempDir, "blue-buffalo-toy-breed.html");
  fs.writeFileSync(blueBuffaloToyBreedHtmlPath, `<!doctype html>
<html>
  <head>
    <title>Life Protection Formula Toy Breed Adult Dry Dog Food - Chicken &amp; Brown Rice</title>
    <meta property="og:image" content="https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-dry-food/life-protection-formula/share-product-image/share_lpf_dry_dog_tbchicken.png" />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Life Protection Formula Toy Breed Adult Dry Dog Food - Chicken & Brown Rice",
        "brand": { "@type": "Brand", "name": "Blue Buffalo" },
        "image": "https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-dry-food/life-protection-formula/share-product-image/share_lpf_dry_dog_tbchicken.png",
        "category": "Dog Food"
      }
    </script>
  </head>
  <body>
    <p><strong>Ingredients:</strong> Deboned Chicken, Chicken Meal, Brown Rice, Oatmeal, Barley, Chicken Fat, Flaxseed, Natural Flavor, Peas, Dried Tomato Pomace, Dried Yeast, Salt, Potassium Chloride, Taurine, Zinc Sulfate, Ferrous Sulfate, Vitamin E Supplement, Niacin, Biotin, Vitamin A Supplement, Thiamine Mononitrate, Riboflavin, Vitamin D3 Supplement, Vitamin B12 Supplement, Pyridoxine Hydrochloride, Calcium Iodate, Folic Acid, Sodium Selenite.</p>
    <h2>Guaranteed Analysis</h2>
    <table>
      <tr><td>Crude Protein</td><td>26%</td></tr>
      <tr><td>Crude Fat</td><td>15%</td></tr>
      <tr><td>Crude Fiber</td><td>4%</td></tr>
      <tr><td>Moisture</td><td>10%</td></tr>
    </table>
  </body>
</html>`, "utf8");
  const blueBuffaloToyBreedExtractResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", blueBuffaloToyBreedHtmlPath,
    "--source-url", "https://www.bluebuffalo.com/dry-dog-food/life-protection-formula/toy-breed-chicken-brown-rice-recipe/",
    "--brand", "Blue Buffalo",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (blueBuffaloToyBreedExtractResult.status !== 0) {
    fail(`page extractor Blue Buffalo toy-breed fixture failed: ${(blueBuffaloToyBreedExtractResult.stderr || blueBuffaloToyBreedExtractResult.stdout).trim()}`);
  } else if (!blueBuffaloToyBreedExtractResult.stdout.split(/\r?\n/)[1]?.includes(",true,")) {
    fail("page extractor incorrectly marked Blue Buffalo Toy Breed dry dog food as non-complete");
  }

  const lotCodeIngredient = "Chicken, Chicken Meal, Brown Rice, Barley, Oatmeal, Chicken Fat, Natural Flavor, Flaxseed, Potassium Chloride, Salt, Choline Chloride, Minerals (Zinc Sulfate, Ferrous Sulfate, Copper Sulfate, Manganese Sulfate, Potassium Iodide, Sodium Selenite), Vitamins (Vitamin E Supplement, Thiamine Mononitrate, Niacin, Pyridoxine Hydrochloride, Biotin, Vitamin D3 Supplement), Mixed Tocopherols For Freshness.";
  const dirtyLotCodeIngredient = `${lotCodeIngredient} 2C37078|`;
  const lotCodeHtmlPath = path.join(tempDir, "manufacturer-lot-code-ingredients.html");
  fs.writeFileSync(lotCodeHtmlPath, `<!doctype html>
<html>
  <head>
    <title>Fixture Chicken Recipe Dry Dog Food</title>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Fixture Chicken Recipe Dry Dog Food",
        "brand": { "@type": "Brand", "name": "Fixture" },
        "image": "https://example.com/images/fixture-chicken-front.jpg",
        "category": "Animals & Pet Supplies > Pet Supplies > Dog Food"
      }
    </script>
  </head>
  <body>
    <p><strong>Ingredients:</strong> ${dirtyLotCodeIngredient}</p>
    <h2>Guaranteed Analysis</h2>
    <table>
      <tr><td>Crude Protein (min.)</td><td>26%</td></tr>
      <tr><td>Crude Fat (min.)</td><td>14%</td></tr>
      <tr><td>Crude Fiber (max.)</td><td>4%</td></tr>
      <tr><td>Moisture (max.)</td><td>10%</td></tr>
    </table>
  </body>
</html>`, "utf8");
  const lotCodeExtractResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", lotCodeHtmlPath,
    "--source-url", "https://example.com/catalog-fixtures/fixture-chicken-dry-dog-food",
    "--brand", "Fixture",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (lotCodeExtractResult.status !== 0) {
    fail(`page extractor manufacturer lot-code fixture failed: ${(lotCodeExtractResult.stderr || lotCodeExtractResult.stdout).trim()}`);
  } else {
    if (!lotCodeExtractResult.stdout.includes(lotCodeIngredient)) {
      fail("page extractor did not preserve cleaned manufacturer ingredient text");
    }
    if (lotCodeExtractResult.stdout.includes("2C37078") || lotCodeExtractResult.stdout.includes("|") || lotCodeExtractResult.stdout.includes(`${lotCodeIngredient},`)) {
      fail("page extractor leaked manufacturer lot code, pipe separator, or trailing comma");
    }
  }

  const unavailableHtmlPath = path.join(tempDir, "unavailable-product.html");
  fs.writeFileSync(unavailableHtmlPath, `<!doctype html>
<html>
  <head>
    <title>Fixture Turkey Recipe Dry Cat Food</title>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Fixture Turkey Recipe Dry Cat Food",
        "brand": { "@type": "Brand", "name": "Fixture" },
        "image": "https://example.com/images/fixture-turkey-front.jpg",
        "category": "Animals & Pet Supplies > Pet Supplies > Cat Food"
      }
    </script>
  </head>
  <body>
    <h1>Fixture Turkey Recipe Dry Cat Food</h1>
    <p>This product is no longer available.</p>
    <p><strong>Ingredients:</strong> Turkey, Turkey Meal, Brown Rice, Barley, Oatmeal, Chicken Fat, Natural Flavor, Flaxseed, Potassium Chloride, Salt, Choline Chloride, Minerals (Zinc Sulfate, Ferrous Sulfate, Copper Sulfate, Manganese Sulfate, Potassium Iodide, Sodium Selenite), Vitamins (Vitamin E Supplement, Thiamine Mononitrate, Niacin, Pyridoxine Hydrochloride, Biotin, Vitamin D3 Supplement), Mixed Tocopherols For Freshness.</p>
    <h2>Guaranteed Analysis</h2>
    <table>
      <tr><td>Crude Protein (min.)</td><td>30%</td></tr>
      <tr><td>Crude Fat (min.)</td><td>12%</td></tr>
      <tr><td>Crude Fiber (max.)</td><td>4%</td></tr>
      <tr><td>Moisture (max.)</td><td>10%</td></tr>
    </table>
  </body>
</html>`, "utf8");
  const unavailableExtractResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", unavailableHtmlPath,
    "--source-url", "https://example.com/catalog-fixtures/fixture-turkey-dry-cat-food",
    "--brand", "Fixture",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (unavailableExtractResult.status !== 0) {
    fail(`page extractor unavailable-product fixture failed: ${(unavailableExtractResult.stderr || unavailableExtractResult.stdout).trim()}`);
  } else if (!unavailableExtractResult.stdout.includes(",false,")) {
    fail("page extractor did not mark unavailable official product as non-complete for promotion gating");
  }

  const healthExtensionIngredient = "Beef, Chicken, Beef Broth, Water Sufficient for Processing, Carrot, Tapioca Starch, Canola Oil (Preserved with Mixed Tocopherols), Dried Egg Product, Rice Flour, Salt, Natural Flavor, Inulin, Minerals (Zinc Oxide, Reduced Iron, Sodium Selenite, Manganese Sulfate, Copper Amino Acid Complex, Potassium Iodide), Sodium Tripolyphosphate, Potassium Chloride Vitamins (Vitamin E Supplement, Vitamin A Supplement, Niacin Supplement, D-Calcium Pantothenate, Thiamine Mononitrate, Beta-Carotene, Biotin, Vitamin D3 Supplement, Riboflavin Supplement, Vitamin B12 Supplement, Pyridoxine Hydrochloride, Folic Acid), Magnesium Sulfate, Choline Chloride, Fish Oil, Celery Powder, Turmeric Powder, Ginger Powder, Coconut Oil.";
  const healthExtensionHtmlPath = path.join(tempDir, "health-extension-period-ingredients.html");
  fs.writeFileSync(healthExtensionHtmlPath, `<!doctype html>
<html>
  <head>
    <title>Digestive Support, Beef &amp; Carrot Entrée in Gravy 9oz</title>
    <link rel="canonical" href="https://www.healthextension.com/products/digestive-support-beef-carrot-entree">
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Digestive Support, Beef & Carrot Entrée in Gravy 9oz",
        "brand": { "@type": "Brand", "name": "Health Extension" },
        "image": "https://www.healthextension.com/cdn/shop/files/DigestiveSupportBeef_FrontofCan.png",
        "category": "Canned Dog Food"
      }
    </script>
  </head>
  <body>
    <h1>Digestive Support, Beef &amp; Carrot Entrée in Gravy 9oz</h1>
    <h4>Ingredients</h4>
    <p>Beef, Chicken, Beef Broth, Water Sufficient for Processing, Carrot, Tapioca Starch, Canola Oil (Preserved with Mixed Tocopherols), Dried Egg Product, Rice Flour, Salt, Natural Flavor, Inulin, Minerals (Zinc Oxide, Reduced Iron, Sodium Selenite, Manganese Sulfate, Copper Amino Acid Complex, Potassium Iodide), Sodium Tripolyphosphate, Potassium Chloride Vitamins (Vitamin E Supplement, Vitamin A Supplement, Niacin Supplement, D-Calcium Pantothenate, Thiamine Mononitrate, Beta-Carotene, Biotin, Vitamin D3 Supplement, Riboflavin Supplement, Vitamin B12 Supplement, Pyridoxine Hydrochloride, Folic Acid). Magnesium Sulfate, Choline Chloride, Fish Oil, Celery Powder, Turmeric Powder, Ginger Powder, Coconut Oil.</p>
    <h4>Guaranteed Analysis</h4>
    <table>
      <tr><td>Crude Protein (min)</td><td>7%</td></tr>
      <tr><td>Crude Fat (min)</td><td>6%</td></tr>
      <tr><td>Crude Fiber (max)</td><td>2%</td></tr>
      <tr><td>Moisture (max)</td><td>75%</td></tr>
    </table>
  </body>
</html>`, "utf8");
  const healthExtensionExtractResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", healthExtensionHtmlPath,
    "--source-url", "https://www.healthextension.com/products/digestive-support-beef-carrot-entree",
    "--brand", "Health Extension",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (healthExtensionExtractResult.status !== 0) {
    fail(`page extractor Health Extension period ingredient fixture failed: ${(healthExtensionExtractResult.stderr || healthExtensionExtractResult.stdout).trim()}`);
  } else if (!healthExtensionExtractResult.stdout.includes(healthExtensionIngredient)) {
    fail("page extractor did not normalize Health Extension period-separated ingredient list");
  }

  const supplementalDescriptionHtmlPath = path.join(tempDir, "health-extension-supplemental-description.html");
  fs.writeFileSync(supplementalDescriptionHtmlPath, `<!doctype html>
<html>
  <head>
    <title>Grain Free 95% Chicken</title>
    <link rel="canonical" href="https://www.healthextension.com/products/grain-free-95-chicken">
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Grain Free 95% Chicken",
        "brand": { "@type": "Brand", "name": "Health Extension" },
        "description": "This product is intended for supplemental feeding only.",
        "image": "https://www.healthextension.com/cdn/shop/files/HE_12_5Chicken_front.jpg",
        "category": "Canned Dog Food"
      }
    </script>
  </head>
  <body>
    <h1>Grain Free 95% Chicken</h1>
    <h4>Ingredients</h4>
    <p>Chicken, Water Sufficient for Processing, Guar Gum, Natural Flavor</p>
    <h4>Nutritional Guarantee</h4>
    <p>This product is intended for supplemental feeding only.</p>
  </body>
</html>`, "utf8");
  const supplementalDescriptionExtractResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", supplementalDescriptionHtmlPath,
    "--source-url", "https://www.healthextension.com/products/grain-free-95-chicken",
    "--brand", "Health Extension",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (supplementalDescriptionExtractResult.status !== 0) {
    fail(`page extractor supplemental-description fixture failed: ${(supplementalDescriptionExtractResult.stderr || supplementalDescriptionExtractResult.stdout).trim()}`);
  } else if (!supplementalDescriptionExtractResult.stdout.includes(",false,")) {
    fail("page extractor did not mark supplemental-feeding product description as non-complete");
  }

  const healthExtensionAccessoryHtmlPath = path.join(tempDir, "health-extension-accessory.html");
  fs.writeFileSync(healthExtensionAccessoryHtmlPath, `<!doctype html>
<html>
  <head>
    <title>Pet Food Container</title>
    <link rel="canonical" href="https://www.healthextension.com/products/pet-food-container">
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Pet Food Container",
        "brand": { "@type": "Brand", "name": "Health Extension" },
        "description": "Storage container for dry food bags.",
        "image": "https://www.healthextension.com/cdn/shop/files/pet-food-container-front.jpg",
        "category": "Accessories"
      }
    </script>
  </head>
  <body>
    <h1>Pet Food Container</h1>
  </body>
</html>`, "utf8");
  const healthExtensionAccessoryExtractResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", healthExtensionAccessoryHtmlPath,
    "--source-url", "https://www.healthextension.com/products/pet-food-container",
    "--brand", "Health Extension",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (healthExtensionAccessoryExtractResult.status !== 0) {
    fail(`page extractor Health Extension accessory fixture failed: ${(healthExtensionAccessoryExtractResult.stderr || healthExtensionAccessoryExtractResult.stdout).trim()}`);
  } else if (!healthExtensionAccessoryExtractResult.stdout.includes(",false,")) {
    fail("page extractor did not mark Health Extension accessory product as non-complete");
  }

  const healthExtensionToyCategoryHtmlPath = path.join(tempDir, "health-extension-toy-category.html");
  fs.writeFileSync(healthExtensionToyCategoryHtmlPath, `<!doctype html>
<html>
  <head>
    <title>Ally the Alpaca</title>
    <link rel="canonical" href="https://www.healthextension.com/products/ally-the-alpaca">
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Ally the Alpaca",
        "brand": { "@type": "Brand", "name": "Health Extension" },
        "description": "Soft plush dog toy with squeaker and crinkle material.",
        "image": "https://www.healthextension.com/cdn/shop/files/SA_ALLY_01.png",
        "category": "Dog Toy"
      }
    </script>
  </head>
  <body>
    <h1>Ally the Alpaca</h1>
  </body>
</html>`, "utf8");
  const healthExtensionToyCategoryExtractResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", healthExtensionToyCategoryHtmlPath,
    "--source-url", "https://www.healthextension.com/products/ally-the-alpaca",
    "--brand", "Health Extension",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (healthExtensionToyCategoryExtractResult.status !== 0) {
    fail(`page extractor Health Extension toy category fixture failed: ${(healthExtensionToyCategoryExtractResult.stderr || healthExtensionToyCategoryExtractResult.stdout).trim()}`);
  } else if (!healthExtensionToyCategoryExtractResult.stdout.includes(",false,")) {
    fail("page extractor did not mark Health Extension toy category product as non-complete");
  }

  const almoGenericRedirectHtmlPath = path.join(tempDir, "almo-generic-redirect.html");
  fs.writeFileSync(almoGenericRedirectHtmlPath, `<!doctype html>
<html>
  <head>
    <meta name="robots" content="noindex, nofollow">
    <meta http-equiv="refresh" content="0;url=https://www.almonature.com/en-us/cat-products">
    <title>Cat Products | Almo Nature</title>
    <link rel="canonical" href="https://www.almonature.com/en-us/cat-products/147">
    <meta property="og:image" content="https://www.almonature.com/hubfs/products/cat/wet/daily/mousse_with_Tuna_and_Cod_85_g_412.png">
  </head>
  <body>
    <h1>Cat Products</h1>
    <p>Made with ingredients originally fit for human consumption and repurposed for pet food.</p>
  </body>
</html>`, "utf8");
  const almoGenericRedirectExtractResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", almoGenericRedirectHtmlPath,
    "--source-url", "https://www.almonature.com/en-us/cat-products/147",
    "--brand", "Almo Nature",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (almoGenericRedirectExtractResult.status !== 0) {
    fail(`page extractor Almo generic redirect fixture failed: ${(almoGenericRedirectExtractResult.stderr || almoGenericRedirectExtractResult.stdout).trim()}`);
  } else if (!almoGenericRedirectExtractResult.stdout.includes(",false,")) {
    fail("page extractor did not mark Almo generic redirect category page as non-complete");
  }

  const purinaMismatchedEmbeddedUrlHtmlPath = path.join(tempDir, "purina-mismatched-embedded-url.html");
  fs.writeFileSync(purinaMismatchedEmbeddedUrlHtmlPath, `<!doctype html>
<html>
  <head>
    <title>Pro Plan Adult Complete Essentials Beef & Salmon Entrée Classic Wet Dog Food</title>
    <link rel="canonical" href="https://www.purina.com/dogs/shop/pro-plan-complete-essentials-grain-free-beef-salmon-wet-dog-food">
    <meta property="og:image" content="https://www.purina.com/sites/default/files/products/2025-01/1pro-plan-complete-essentials-grain-free-beef-salmon-wet-dog-food-13-oz-can.png">
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Pro Plan Adult Complete Essentials Beef & Salmon Entrée Classic Wet Dog Food",
        "brand": { "@type": "Brand", "name": "Purina Pro Plan" },
        "url": "https://www.purina.com/cats/shop/gourmet-naturals-pate-salmon",
        "image": "https://www.purina.com/sites/default/files/products/2022-12/gourmet-naturals-salmon-pate.jpg",
        "category": "Dog Food"
      }
    </script>
  </head>
  <body>
    <h1>Pro Plan Adult Complete Essentials Beef &amp; Salmon Entrée Classic Wet Dog Food</h1>
    <img src="/sites/default/files/products/2025-01/1pro-plan-complete-essentials-grain-free-beef-salmon-wet-dog-food-13-oz-can.png" alt="Pro Plan Beef and Salmon wet dog food can">
    <p><strong>Ingredients:</strong> Water Sufficient for Processing, Beef, Salmon, Liver, Wheat Gluten, Meat By-Products, Chicken, Corn Starch-Modified, Soy Protein Concentrate, Salt, Potassium Chloride, Natural Flavor, Zinc Sulfate, Ferrous Sulfate, Manganese Sulfate, Copper Sulfate, Potassium Iodide, Taurine, Choline Chloride, Vitamin E Supplement, Thiamine Mononitrate, Niacin, Calcium Pantothenate, Vitamin A Supplement, Riboflavin Supplement, Vitamin B-12 Supplement, Pyridoxine Hydrochloride, Folic Acid, Vitamin D-3 Supplement.</p>
    <h2>Guaranteed Analysis</h2>
    <table>
      <tr><td>Crude Protein (min)</td><td>10%</td></tr>
      <tr><td>Crude Fat (min)</td><td>3%</td></tr>
      <tr><td>Crude Fiber (max)</td><td>1.5%</td></tr>
      <tr><td>Moisture (max)</td><td>78%</td></tr>
    </table>
  </body>
</html>`, "utf8");
  const purinaMismatchedEmbeddedUrlExtractResult = spawnSync(process.execPath, [
    "scripts/catalog-page-feed-extract.mjs",
    "--html", purinaMismatchedEmbeddedUrlHtmlPath,
    "--source-url", "https://www.purina.com/dogs/shop/pro-plan-complete-essentials-grain-free-beef-salmon-wet-dog-food",
    "--brand", "Purina Pro Plan",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (purinaMismatchedEmbeddedUrlExtractResult.status !== 0) {
    fail(`page extractor Purina mismatched embedded URL fixture failed: ${(purinaMismatchedEmbeddedUrlExtractResult.stderr || purinaMismatchedEmbeddedUrlExtractResult.stdout).trim()}`);
  } else {
    if (!purinaMismatchedEmbeddedUrlExtractResult.stdout.includes("https://www.purina.com/dogs/shop/pro-plan-complete-essentials-grain-free-beef-salmon-wet-dog-food")) {
      fail("page extractor did not preserve the fetched Purina shop URL as product evidence");
    }
    if (!purinaMismatchedEmbeddedUrlExtractResult.stdout.split(/\r?\n/)[1]?.includes(",dog,")) {
      fail("page extractor did not infer dog pet type from the current Purina shop URL");
    }
    if (purinaMismatchedEmbeddedUrlExtractResult.stdout.includes("https://www.purina.com/cats/shop/gourmet-naturals-pate-salmon")) {
      fail("page extractor leaked mismatched embedded Purina URL as product evidence");
    }
    if (!purinaMismatchedEmbeddedUrlExtractResult.stdout.includes("https://www.purina.com/sites/default/files/products/2025-01/1pro-plan-complete-essentials-grain-free-beef-salmon-wet-dog-food-13-oz-can.png")) {
      fail("page extractor did not preserve the current Purina shop image as product evidence");
    }
    if (purinaMismatchedEmbeddedUrlExtractResult.stdout.includes("https://www.purina.com/sites/default/files/products/2022-12/gourmet-naturals-salmon-pate.jpg")) {
      fail("page extractor leaked mismatched embedded Purina image as product evidence");
    }
  }

  const pendingDeltaImportRoot = path.join(tempDir, "pending-delta-import-root");
  const pendingDeltaSqlDir = path.join(pendingDeltaImportRoot, "fixture-source", "sql");
  const pendingDeltaOutputDir = path.join(tempDir, "pending-delta-output");
  const pendingDeltaCatalogSnapshotPath = path.join(tempDir, "pending-delta-catalog-snapshot.json");
  fs.mkdirSync(pendingDeltaSqlDir, { recursive: true });
  const pendingDeltaIngredient = "Chicken, chicken meal, brown rice, barley, oatmeal, chicken fat, natural flavor, flaxseed, dried beet pulp, salt, potassium chloride, vitamin E supplement, zinc sulfate, ferrous sulfate, copper sulfate, manganese sulfate, calcium iodate, sodium selenite.";
  const pendingDeltaManifestRows = [
    {
      cache_key: "fixture-source:already-verified",
      product_name: "Fixture Already Verified Adult Chicken Recipe Dry Dog Food",
      brand: "Fixture Source",
      source: "fixture-source",
      source_quality: "manufacturer",
      source_url: "https://example.com/products/already-verified",
      pet_type: "dog",
      package_size: "12 lb",
      image_url: "https://example.com/images/already-verified-front.jpg",
      ingredient_text: pendingDeltaIngredient,
      ingredient_count: 18,
      ingredient_verification_status: "manufacturer",
      image_verification_status: "manufacturer",
      verified_at: "2026-06-28T00:00:00.000Z",
      expires_at: "2027-06-28T00:00:00.000Z",
      is_complete_food: true,
    },
    {
      cache_key: "fixture-source:trial-sample",
      product_name: "Fixture Trial Sample",
      brand: "Fixture Source",
      source: "fixture-source",
      source_quality: "manufacturer",
      source_url: "https://example.com/products/trial-sample",
      pet_type: "dog",
      package_size: "sample",
      image_url: "https://example.com/images/trial-sample-front.jpg",
      ingredient_text: pendingDeltaIngredient,
      ingredient_count: 18,
      ingredient_verification_status: "manufacturer",
      image_verification_status: "manufacturer",
      verified_at: "2026-06-28T00:00:00.000Z",
      expires_at: "2027-06-28T00:00:00.000Z",
      is_complete_food: true,
    },
    {
      cache_key: "fixture-source:pending-lamb",
      product_name: "Fixture Pending Adult Lamb Recipe Dry Dog Food",
      brand: "Fixture Source",
      source: "fixture-source",
      source_quality: "manufacturer",
      source_url: "https://example.com/products/pending-lamb",
      pet_type: "dog",
      package_size: "12 lb",
      image_url: "https://example.com/images/pending-lamb-front.jpg",
      ingredient_text: pendingDeltaIngredient,
      ingredient_count: 18,
      ingredient_verification_status: "manufacturer",
      image_verification_status: "manufacturer",
      verified_at: "2026-06-28T00:00:00.000Z",
      expires_at: "2027-06-28T00:00:00.000Z",
      is_complete_food: true,
    },
    {
      cache_key: "health-extension:official-brace-groups",
      product_name: "Health Extension Official Vegetarian Entree",
      brand: "Health Extension",
      source: "health-extension",
      source_quality: "manufacturer",
      source_url: "https://www.healthextension.com/products/vegetarian-entree",
      pet_type: "dog",
      package_size: "12.5 oz",
      image_url: "https://www.healthextension.com/cdn/shop/files/VEGETARIAN-PACK-OF-12.png",
      ingredient_text: "Sweet Potatoes, Butternut Squash, Water Sufficient for Processing, Brown Rice, Carrots, Vegetable Oil, Peas, Blueberries, Cranberries, Kale, Brewers Dried Yeast, Dried Eggs, Guar Gum, Taurine, Vitamins {Vitamin E Supplement, Niacin Supplement, L-Ascorbyl-2 Polyphosphate (Source of Vitamin C), Thiamine Mononitrate (Source of Vitamin B1), Calcium Pantothenate, Vitamin A Supplement, Pyridoxine Hydrochloride (Source of Vitamin B6), Riboflavin Supplement (Source of Vitamin B2), Folic Acid, Vitamin B12 Supplement, Biotin, Vitamin D2 Supplement}, Minerals {Zinc Sulfate, Ferrous Sulfate, Copper Sulfate, Manganese Sulfate, Selenium Yeast, Potassium Iodide}.",
      ingredient_count: 34,
      ingredient_verification_status: "manufacturer",
      image_verification_status: "manufacturer",
      verified_at: "2026-06-28T00:00:00.000Z",
      expires_at: "2027-06-28T00:00:00.000Z",
      is_complete_food: true,
    },
    {
      cache_key: "evanger-s:official-brace-groups",
      product_name: "Evanger's Super Premium Beef Dinner for Dogs",
      brand: "Evanger's",
      source: "evanger-s",
      source_quality: "manufacturer",
      source_url: "https://evangersdogfood.com/shop/super-premium-beef-dinner-for-dogs-case-of-12/",
      pet_type: "dog",
      package_size: "Case of 12",
      image_url: "https://evangersdogfood.com/wp-content/uploads/2024/fixture-beef-dinner.jpg",
      ingredient_text: "Beef, Water Sufficient for Processing, Liver, Guar Gum, Spinach, Kale, Cinnamon, Vitamins {Vitamin E Supplement, Niacin Supplement, L-Ascorbyl-2-Polyphosphate (Source of Vitamin C), Thiamine Mononitrate (Source of Vitamin B1), Calcium Pantothenate, Vitamin A Supplement, Pyridoxine Hydrochloride (Source of Vitamin B6), Riboflavin Supplement (Source of Vitamin B2), Folic Acid, Vitamin B12 Supplement, Biotin, Vitamin D2 Supplement}, Minerals {Zinc Sulfate, Iron Sulfate, Copper Sulfate, Manganese Sulfate, Selenium Yeast, Potassium Iodide}.",
      ingredient_count: 27,
      ingredient_verification_status: "manufacturer",
      image_verification_status: "manufacturer",
      verified_at: "2026-06-28T00:00:00.000Z",
      expires_at: "2027-06-28T00:00:00.000Z",
      is_complete_food: true,
    },
    {
      cache_key: "fixture-source:bad-brace-fragment",
      product_name: "Fixture Bad Brace Fragment Adult Chicken Recipe",
      brand: "Fixture Source",
      source: "fixture-source",
      source_quality: "manufacturer",
      source_url: "https://example.com/products/bad-brace-fragment",
      pet_type: "dog",
      package_size: "12 lb",
      image_url: "https://example.com/images/bad-brace-fragment-front.jpg",
      ingredient_text: "Chicken, Chicken Meal, Brown Rice, Calcium Pantothenate {Vitamin B5), Vitamin E Supplement, Zinc Sulfate, Copper Sulfate, Manganese Sulfate, Potassium Iodide.",
      ingredient_count: 9,
      ingredient_verification_status: "manufacturer",
      image_verification_status: "manufacturer",
      verified_at: "2026-06-28T00:00:00.000Z",
      expires_at: "2027-06-28T00:00:00.000Z",
      is_complete_food: true,
    },
    {
      cache_key: "fixture-source:split-micronutrient",
      product_name: "Fixture Split Micronutrient Adult Cat Food",
      brand: "Fixture Source",
      source: "fixture-source",
      source_quality: "manufacturer",
      source_url: "https://example.com/products/split-micronutrient",
      pet_type: "cat",
      package_size: "3 oz",
      image_url: "https://example.com/images/split-micronutrient-front.jpg",
      ingredient_text: "Chicken, Chicken Broth, Wheat Gluten, Liver, Fish, Corn Starch-Modified, Taurine, Choline Chloride, VITAMINS [thiamine mononitrate, pyr idoxine hydrochloride, ribo flavin supplement, bio tin, folic acid, Vitamin D-3 supplement].",
      ingredient_count: 14,
      ingredient_verification_status: "manufacturer",
      image_verification_status: "manufacturer",
      verified_at: "2026-06-28T00:00:00.000Z",
      expires_at: "2027-06-28T00:00:00.000Z",
      is_complete_food: true,
    },
    {
      cache_key: "fixture-source:bad-order-parentheses",
      product_name: "Fixture Bad Order Parentheses Adult Cat Food",
      brand: "Fixture Source",
      source: "fixture-source",
      source_quality: "manufacturer",
      source_url: "https://example.com/products/bad-order-parentheses",
      pet_type: "cat",
      package_size: "3 oz",
      image_url: "https://example.com/images/bad-order-parentheses-front.jpg",
      ingredient_text: "Chicken, Minerals (Zinc Sulfate, Sodium Selenite), Choline Chloride, Sodium Selenite), Mixed Tocopherols (Preservative",
      ingredient_count: 9,
      ingredient_verification_status: "manufacturer",
      image_verification_status: "manufacturer",
      verified_at: "2026-06-28T00:00:00.000Z",
      expires_at: "2027-06-28T00:00:00.000Z",
      is_complete_food: true,
    },
    {
      cache_key: "fixture-source:bad-square-bracket",
      product_name: "Fixture Bad Square Bracket Adult Dog Food",
      brand: "Fixture Source",
      source: "fixture-source",
      source_quality: "manufacturer",
      source_url: "https://example.com/products/bad-square-bracket",
      pet_type: "dog",
      package_size: "3.5 oz",
      image_url: "https://example.com/images/bad-square-bracket-front.jpg",
      ingredient_text: "Chicken, Rice, Liver, Calcium Carbonate, Minerals (Zinc Sulfate), Vitamins (Vitamin E Supplement, Pyridoxine [Vitamin B6, Vitamin D3 Supplement, Folic Acid).",
      ingredient_count: 11,
      ingredient_verification_status: "label_ocr_verified",
      image_verification_status: "manufacturer",
      verified_at: "2026-06-28T00:00:00.000Z",
      expires_at: "2027-06-28T00:00:00.000Z",
      is_complete_food: true,
    },
    {
      cache_key: "fixture-source:missing-ascorbyl-prefix",
      product_name: "Fixture Missing Ascorbyl Prefix Adult Dog Food",
      brand: "Fixture Source",
      source: "fixture-source",
      source_quality: "manufacturer",
      source_url: "https://example.com/products/missing-ascorbyl-prefix",
      pet_type: "dog",
      package_size: "12 lb",
      image_url: "https://example.com/images/missing-ascorbyl-prefix-front.jpg",
      ingredient_text: "Chicken, Chicken Meal, Peas, Zinc Sulfate, -Ascorbyl-2-Polyphosphate (Vitamin C), Calcium Iodate, Sodium Selenite.",
      ingredient_count: 8,
      ingredient_verification_status: "label_ocr_verified",
      image_verification_status: "manufacturer",
      verified_at: "2026-06-28T00:00:00.000Z",
      expires_at: "2027-06-28T00:00:00.000Z",
      is_complete_food: true,
    },
    {
      cache_key: "fixture-source:sentence-split-preservative",
      product_name: "Fixture Sentence Split Preservative Adult Cat Food",
      brand: "Fixture Source",
      source: "fixture-source",
      source_quality: "manufacturer",
      source_url: "https://example.com/products/sentence-split-preservative",
      pet_type: "cat",
      package_size: "5 lb",
      image_url: "https://example.com/images/sentence-split-preservative-front.jpg",
      ingredient_text: "Chicken, Chicken Meal, Dried Kelp, Vitamin E Supplement. preserved with Mixed Tocopherols, Sodium Selenite.",
      ingredient_count: 6,
      ingredient_verification_status: "manufacturer",
      image_verification_status: "manufacturer",
      verified_at: "2026-06-28T00:00:00.000Z",
      expires_at: "2027-06-28T00:00:00.000Z",
      is_complete_food: true,
    },
  ];
  const pendingDeltaSqlFile = path.join(pendingDeltaSqlDir, "0001-fixture-source.sql");
  fs.writeFileSync(pendingDeltaSqlFile, [
    "SELECT count(*) AS upserted_rows",
    `FROM public.upsert_catalog_product_feed((SELECT convert_from(decode('${Buffer.from(JSON.stringify(pendingDeltaManifestRows), "utf8").toString("base64")}', 'base64'), 'UTF8')::jsonb));`,
    "",
  ].join("\n"), "utf8");
  fs.writeFileSync(path.join(pendingDeltaSqlDir, "manifest.json"), JSON.stringify({
    generated_at: "2026-06-28T00:00:00.000Z",
    source: "fixture-source",
    source_quality: "manufacturer",
    total_sql_rows: pendingDeltaManifestRows.length,
    chunks: [
      {
        file: pendingDeltaSqlFile,
        offset: 0,
        rows: pendingDeltaManifestRows.length,
      },
    ],
  }, null, 2), "utf8");
  fs.writeFileSync(pendingDeltaCatalogSnapshotPath, JSON.stringify([
    pendingDeltaManifestRows[0],
    {
      cache_key: "fixture-source:trial-sample",
      product_name: "Fixture Trial Sample",
      brand: "Fixture Source",
      source: "fixture-source",
      source_quality: "manufacturer",
      source_url: "https://example.com/products/trial-sample",
      pet_type: "dog",
      package_size: "sample",
      is_complete_food: false,
      catalog_exclusion_reason: "non_catalog_trial_sample",
    },
  ], null, 2), "utf8");
  const pendingDeltaResult = spawnSync(process.execPath, [
    "scripts/catalog-pending-import-delta.mjs",
    "--import-root", pendingDeltaImportRoot,
    "--catalog-snapshot", pendingDeltaCatalogSnapshotPath,
    "--output-dir", pendingDeltaOutputDir,
    "--mcp-group-size", "0",
    "--json",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (pendingDeltaResult.status !== 0) {
    fail(`pending import delta fixture failed: ${(pendingDeltaResult.stderr || pendingDeltaResult.stdout).trim()}`);
  } else {
    const pendingDeltaSummary = JSON.parse(read(path.join(pendingDeltaOutputDir, "manifest.json")));
    const pendingDeltaRows = JSON.parse(read(path.join(pendingDeltaOutputDir, "pending-rows.json")));
    const pendingDeltaRejectedRows = JSON.parse(read(path.join(pendingDeltaOutputDir, "import-rejected-rows.json")));
    if (pendingDeltaSummary.pending_rows !== 3) {
      fail(`pending import delta emitted ${pendingDeltaSummary.pending_rows} pending rows, expected 3`);
    }
    if (pendingDeltaSummary.import_rejected_rows !== 6 || pendingDeltaRejectedRows.length !== 6) {
      fail("pending import delta should reject only the malformed brace, split micronutrient, bad-order parenthesis, bad-square-bracket, missing-Ascorbyl-prefix, and sentence-split preservative fixtures");
    }
    const pendingDeltaKeys = pendingDeltaRows.map((row) => row.cache_key).sort();
    if (
      !pendingDeltaKeys.includes("fixture-source:pending-lamb")
      || !pendingDeltaKeys.includes("health-extension:official-brace-groups")
      || !pendingDeltaKeys.includes("evanger-s:official-brace-groups")
    ) {
      fail(`pending import delta kept wrong pending row: ${pendingDeltaRows?.map((row) => row.cache_key).join(", ")}`);
    }
    const pendingDeltaRejectedKeys = pendingDeltaRejectedRows.map((row) => row.cache_key).sort();
    if (
      !pendingDeltaRejectedKeys.includes("fixture-source:bad-brace-fragment")
      || !pendingDeltaRejectedKeys.includes("fixture-source:split-micronutrient")
      || !pendingDeltaRejectedKeys.includes("fixture-source:bad-order-parentheses")
      || !pendingDeltaRejectedKeys.includes("fixture-source:bad-square-bracket")
      || !pendingDeltaRejectedKeys.includes("fixture-source:missing-ascorbyl-prefix")
      || !pendingDeltaRejectedKeys.includes("fixture-source:sentence-split-preservative")
    ) {
      fail(`pending import delta rejected wrong row: ${pendingDeltaRejectedRows?.map((row) => row.cache_key).join(", ")}`);
    }
    if (pendingDeltaRows.some((row) => row.cache_key === "fixture-source:trial-sample")) {
      fail("pending import delta kept a sample row that was already terminal-excluded live");
    }
  }

  const rejectedManifestDir = path.join(tempDir, "rejected-source", "missing-live-current");
  const rejectedImportRoot = path.join(tempDir, "rejected-import-root");
  const acceptedManifestDir = path.join(rejectedImportRoot, "pedigree-mars-petcare-repair", "missing-live-current");
  const rejectedReportPath = path.join(tempDir, "missing-live-generation-report.json");
  const rejectedWorklistOutputDir = path.join(tempDir, "rejected-worklist");
  fs.mkdirSync(rejectedManifestDir, { recursive: true });
  fs.mkdirSync(acceptedManifestDir, { recursive: true });
  const rejectedManifestPath = path.join(rejectedManifestDir, "manifest.json");
  fs.writeFileSync(rejectedManifestPath, JSON.stringify({
    generated_at: "2026-06-28T00:00:00.000Z",
    source: "pedigree-mars-petcare",
    source_quality: "manufacturer",
    total_missing_rows: 0,
    rejected_missing_rows: 2,
    validation_rejections: [
      {
        cache_key: "pedigree-mars-petcare:fixture",
        product_name: "PEDIGREE Fixture Wet Dog Food",
        brand: "Pedigree",
        source: "pedigree-mars-petcare",
        source_quality: "manufacturer",
        source_url: "https://www.pedigree.com/products/fixture",
        ingredient_verification_status: "label_ocr_verified",
        image_verification_status: "manufacturer",
        ingredient_text_tail: "Potsssium Chloride, Vitsmin E Supplement",
        reasons: ["unbalanced_ingredient_parentheses", "ingredient_ocr_artifact"],
      },
      {
        cache_key: "pedigree-mars-petcare:repaired",
        product_name: "PEDIGREE Repaired Wet Dog Food",
        brand: "Pedigree",
        source: "pedigree-mars-petcare",
        source_quality: "manufacturer",
        source_url: "https://www.pedigree.com/products/repaired",
        ingredient_verification_status: "label_ocr_verified",
        image_verification_status: "manufacturer",
        reasons: ["ingredient_ocr_artifact"],
      },
    ],
    chunks: [],
  }, null, 2), "utf8");
  fs.writeFileSync(path.join(acceptedManifestDir, "manifest.json"), JSON.stringify({
    generated_at: "2026-06-28T00:01:00.000Z",
    source: "pedigree-mars-petcare",
    source_quality: "manufacturer",
    total_missing_rows: 1,
    accepted_missing_candidates: [
      {
        cache_key: "pedigree-mars-petcare:repaired",
        product_name: "PEDIGREE Repaired Wet Dog Food",
        brand: "Pedigree",
        source: "pedigree-mars-petcare",
        source_quality: "manufacturer",
        source_url: "https://www.pedigree.com/products/repaired",
        ingredient_verification_status: "label_ocr_verified",
        image_verification_status: "manufacturer",
      },
    ],
    rejected_missing_rows: 0,
    validation_rejections: [],
    chunks: [],
  }, null, 2), "utf8");
  fs.writeFileSync(rejectedReportPath, JSON.stringify({
    generated_at: "2026-06-28T00:00:00.000Z",
    rows: [
      {
        source: "pedigree-mars-petcare",
        parsed: {
          output_manifest: rejectedManifestPath,
          missing_rows: 0,
          rejected_missing_rows: 2,
        },
      },
    ],
  }, null, 2), "utf8");
  const rejectedWorklistResult = spawnSync(process.execPath, [
    "scripts/catalog-rejected-candidate-worklist.mjs",
    "--report", rejectedReportPath,
    "--import-root", rejectedImportRoot,
    "--pending-import-rejected", path.join(tempDir, "empty-pending-import-rejected.json"),
    "--output-dir", rejectedWorklistOutputDir,
    "--skip-live-resolution",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (rejectedWorklistResult.status !== 0) {
    fail(`rejected candidate worklist fixture failed: ${(rejectedWorklistResult.stderr || rejectedWorklistResult.stdout).trim()}`);
  } else {
    const worklist = JSON.parse(read(path.join(rejectedWorklistOutputDir, "worklist.json")));
    if (worklist.rejected_candidate_count !== 1) {
      fail(`rejected candidate worklist emitted ${worklist.rejected_candidate_count} rows, expected 1`);
    }
    if (worklist.rows?.some((row) => row.cache_key === "pedigree-mars-petcare:repaired")) {
      fail("rejected candidate worklist kept a stale rejected row after a newer accepted manifest");
    }
    if (worklist.rows?.[0]?.repair_type !== "rerun_official_label_ocr") {
      fail(`rejected candidate worklist repair type was ${worklist.rows?.[0]?.repair_type}, expected rerun_official_label_ocr`);
    }
    if (worklist.rows?.[0]?.evidence_issue !== "official_label_ocr_failed_validation") {
      fail(`rejected candidate worklist evidence issue was ${worklist.rows?.[0]?.evidence_issue}, expected official_label_ocr_failed_validation`);
    }
    if (worklist.rows?.[0]?.ingredient_evidence_failure_kind !== "label_ocr_malformed") {
      fail(`rejected candidate worklist failure kind was ${worklist.rows?.[0]?.ingredient_evidence_failure_kind}, expected label_ocr_malformed`);
    }
    if (!worklist.rejected_by_evidence_issue?.official_label_ocr_failed_validation) {
      fail("rejected candidate worklist did not summarize evidence issues");
    }
    if (!worklist.rejected_by_ingredient_evidence_failure_kind?.label_ocr_malformed) {
      fail("rejected candidate worklist did not summarize ingredient evidence failure kinds");
    }
    if (!fs.existsSync(path.join(rejectedWorklistOutputDir, "worklist.csv"))) {
      fail("rejected candidate worklist did not write CSV output");
    }
    if (!fs.existsSync(path.join(rejectedWorklistOutputDir, "worklist.md"))) {
      fail("rejected candidate worklist did not write Markdown output");
    }

    const rejectedEvidenceRequestOutputDir = path.join(tempDir, "rejected-evidence-request-pack");
    const rejectedEvidenceRequestResult = spawnSync(process.execPath, [
      "scripts/catalog-rejected-evidence-request-pack.mjs",
      "--worklist", path.join(rejectedWorklistOutputDir, "worklist.json"),
      "--output-dir", rejectedEvidenceRequestOutputDir,
      "--json",
    ], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    if (rejectedEvidenceRequestResult.status !== 0) {
      fail(`rejected evidence request pack fixture failed: ${(rejectedEvidenceRequestResult.stderr || rejectedEvidenceRequestResult.stdout).trim()}`);
    } else {
      const evidenceManifest = JSON.parse(read(path.join(rejectedEvidenceRequestOutputDir, "manifest.json")));
      if (evidenceManifest.request_count !== 1) {
        fail(`rejected evidence request pack emitted ${evidenceManifest.request_count} rows, expected 1`);
      }
      if (!evidenceManifest.rejected_by_evidence_issue?.official_label_ocr_failed_validation) {
        fail("rejected evidence request pack did not summarize evidence issues");
      }
      const evidenceIndex = read(path.join(rejectedEvidenceRequestOutputDir, "request-index.csv"));
      if (!evidenceIndex.includes("candidate_ingredient_text_tail") || !evidenceIndex.includes("official_label_ocr_failed_validation")) {
        fail("rejected evidence request index is missing diagnostic columns");
      }
      const evidenceSource = evidenceManifest.sources?.[0];
      if (!evidenceSource?.template_path || !fs.existsSync(evidenceSource.template_path)) {
        fail("rejected evidence request pack did not write a source template");
      } else {
        const evidenceTemplate = read(evidenceSource.template_path);
        if (!evidenceTemplate.includes("ingredient_statement") || !evidenceTemplate.includes("Do not reuse candidate_ingredient_text_tail")) {
          fail("rejected evidence request template is missing strict ingredient repair guidance");
        }
      }
      if (!fs.existsSync(path.join(rejectedEvidenceRequestOutputDir, "README.md"))) {
        fail("rejected evidence request pack did not write README output");
      }

      const rejectedRepairIngredient = "Chicken, chicken meal, brown rice, barley, oatmeal, chicken fat, natural flavor, flaxseed, dried beet pulp, salt, potassium chloride, vitamin E supplement, zinc sulfate, ferrous sulfate, copper sulfate, manganese sulfate, calcium iodate, sodium selenite";
      const rejectedRepairInputDir = path.join(tempDir, "rejected-evidence-repairs");
      const rejectedRepairSourceDir = path.join(rejectedRepairInputDir, "pedigree-mars-petcare");
      const rejectedRepairOutputDir = path.join(tempDir, "rejected-evidence-repair-imports");
      fs.mkdirSync(rejectedRepairSourceDir, { recursive: true });
      fs.writeFileSync(path.join(rejectedRepairSourceDir, "feed.csv"), [
        [
          "cache_key",
          "product_name",
          "brand",
          "pet_type",
          "ingredient_statement",
          "product_image_url",
          "product_url",
          "source_name",
          "source_quality",
          "ingredient_verification_status",
          "image_verification_status",
          "verified_at",
        ].join(","),
        [
          "pedigree-mars-petcare:fixture",
          "PEDIGREE Fixture Wet Dog Food",
          "Pedigree",
          "dog",
          csvCell(rejectedRepairIngredient),
          "https://www.pedigree.com/images/fixture-front.jpg",
          "https://www.pedigree.com/products/fixture",
          "pedigree-mars-petcare",
          "manufacturer",
          "manufacturer",
          "manufacturer",
          "2026-06-28",
        ].join(","),
        "",
      ].join("\n"), "utf8");
      const rejectedRepairResult = spawnSync(process.execPath, [
        "scripts/catalog-rejected-evidence-drop-import.mjs",
        "--input-dir", rejectedRepairInputDir,
        "--output-dir", rejectedRepairOutputDir,
        "--worklist", path.join(rejectedWorklistOutputDir, "worklist.json"),
        "--source", "pedigree-mars-petcare",
        "--sql-payload-format", "base64",
        "--json",
      ], {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
      });
      if (rejectedRepairResult.status !== 0) {
        fail(`rejected evidence repair drop import fixture failed: ${(rejectedRepairResult.stderr || rejectedRepairResult.stdout).trim()}`);
      } else {
        const repairSummary = JSON.parse(read(path.join(rejectedRepairOutputDir, "summary.json")));
        if (repairSummary.file_count !== 1) {
          fail(`rejected evidence repair drop import processed ${repairSummary.file_count} files, expected 1`);
        }
        if (repairSummary.sql_rows !== 1) {
          fail(`rejected evidence repair drop import emitted ${repairSummary.sql_rows} SQL rows, expected 1`);
        }
        if (repairSummary.preflight_rejected_rows !== 0) {
          fail(`rejected evidence repair drop import preflight rejected ${repairSummary.preflight_rejected_rows} rows, expected 0`);
        }
        if (!repairSummary.reports?.[0]?.sql_manifest) {
          fail("rejected evidence repair drop import did not write a SQL manifest");
        }
        if (!fs.existsSync(path.join(rejectedRepairOutputDir, "summary.csv"))) {
          fail("rejected evidence repair drop import did not write summary CSV");
        }
        if (!fs.existsSync(path.join(rejectedRepairOutputDir, "summary.md"))) {
          fail("rejected evidence repair drop import did not write summary Markdown");
        }
      }

      const badRejectedRepairInputDir = path.join(tempDir, "bad-rejected-evidence-repairs");
      const badRejectedRepairSourceDir = path.join(badRejectedRepairInputDir, "pedigree-mars-petcare");
      const badRejectedRepairOutputDir = path.join(tempDir, "bad-rejected-evidence-repair-imports");
      fs.mkdirSync(badRejectedRepairSourceDir, { recursive: true });
      fs.writeFileSync(path.join(badRejectedRepairSourceDir, "feed.csv"), [
        [
          "cache_key",
          "product_name",
          "brand",
          "pet_type",
          "ingredient_statement",
          "product_image_url",
          "product_url",
          "source_name",
          "source_quality",
          "ingredient_verification_status",
          "image_verification_status",
          "verified_at",
        ].join(","),
        [
          "pedigree-mars-petcare:fixture",
          "PEDIGREE Fixture Wet Dog Food",
          "Pedigree",
          "dog",
          csvCell("Potsssium Chloride, Vitsmin E Supplement"),
          "https://www.pedigree.com/images/fixture-front.jpg",
          "https://www.pedigree.com/products/fixture",
          "pedigree-mars-petcare",
          "manufacturer",
          "manufacturer",
          "manufacturer",
          "2026-06-28",
        ].join(","),
        "",
      ].join("\n"), "utf8");
      const badRejectedRepairResult = spawnSync(process.execPath, [
        "scripts/catalog-rejected-evidence-drop-import.mjs",
        "--input-dir", badRejectedRepairInputDir,
        "--output-dir", badRejectedRepairOutputDir,
        "--worklist", path.join(rejectedWorklistOutputDir, "worklist.json"),
        "--source", "pedigree-mars-petcare",
        "--json",
      ], {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
      });
      if (badRejectedRepairResult.status === 0) {
        fail("bad rejected evidence repair drop import unexpectedly succeeded after reusing candidate ingredient tail");
      } else {
        const badRepairSummary = JSON.parse(read(path.join(badRejectedRepairOutputDir, "summary.json")));
        if (badRepairSummary.preflight_rejected_rows !== 1) {
          fail(`bad rejected evidence repair drop import rejected ${badRepairSummary.preflight_rejected_rows} rows, expected 1`);
        }
        if (!badRepairSummary.rejected_rows?.[0]?.reasons?.includes("candidate_ingredient_text_tail_reused")) {
          fail(`bad rejected evidence repair drop import missing candidate_ingredient_text_tail_reused rejection: ${badRepairSummary.rejected_rows?.[0]?.reasons}`);
        }
        if (badRepairSummary.sql_rows !== 0) {
          fail(`bad rejected evidence repair drop import emitted ${badRepairSummary.sql_rows} SQL rows, expected 0`);
        }
      }

      const marketDashboardDir = path.join(tempDir, "us-market-dashboard");
      const marketTargetsPath = path.join(tempDir, "market-source-targets.json");
      const marketCatalogSnapshotPath = path.join(tempDir, "market-catalog-snapshot.json");
      const marketActionPlanPath = path.join(tempDir, "market-action-plan.json");
      const marketRejectedWorklistPath = path.join(tempDir, "market-rejected-worklist.json");
      const marketRepairSummaryPath = path.join(tempDir, "market-repair-summary.json");
      const marketPendingImportDeltaPath = path.join(tempDir, "market-pending-import-delta.json");
      const marketImportRoot = path.join(tempDir, "market-import-root");
      fs.mkdirSync(path.join(marketImportRoot, "fixture-complete"), { recursive: true });
      fs.writeFileSync(path.join(marketImportRoot, "fixture-complete", "report.json"), JSON.stringify({
        feed: { rows: 1, complete_food_rows: 1 },
      }, null, 2), "utf8");
      fs.writeFileSync(marketTargetsPath, JSON.stringify([
        {
          brand: "Fixture Complete",
          sourceOwner: "Fixture Complete",
          sourceSlug: "fixture-complete",
          sourcePriority: "manufacturer",
          targetUrl: "https://example.com/fixture-complete",
          coverageTier: "tier_1_us_retail",
          discovery: {
            targetUrl: "https://example.com/sitemap.xml",
            requiredUrlPattern: "^https://example\\.com/products/",
          },
        },
        {
          brand: "Fixture Feed",
          sourceOwner: "Fixture Retailer",
          sourceSlug: "fixture-feed",
          sourcePriority: "retailer",
          targetUrl: "https://example.com/fixture-feed",
          coverageTier: "tier_2_us_retail",
          accessStatus: "requires_authorized_feed",
        },
        {
          brand: "Fixture Parent",
          sourceOwner: "Fixture Parent",
          sourceSlug: "fixture-parent",
          sourcePriority: "manufacturer",
          targetUrl: "https://example.com/fixture-parent",
          coverageTier: "tier_2_us_retail",
          accessStatus: "requires_authorized_feed",
        },
        {
          brand: "Fixture Child",
          sourceOwner: "Fixture Parent / Child",
          sourceSlug: "fixture-parent-child",
          sourcePriority: "manufacturer",
          targetUrl: "https://example.com/fixture-parent-child",
          coverageTier: "tier_2_us_retail",
          discovery: {
            targetUrl: "https://example.com/child-sitemap.xml",
            requiredUrlPattern: "^https://example\\.com/child-products/",
          },
        },
        {
          brand: "Fixture Shared Cat",
          sourceOwner: "Fixture Shared Source",
          sourceSlug: "fixture-shared-cat",
          sharedSourceSlug: "fixture-shared-source",
          sourcePriority: "manufacturer",
          targetUrl: "https://example.com/fixture-shared-source",
          coverageTier: "tier_2_us_retail",
          accessStatus: "shared_catalog_source",
        },
        {
          brand: "Fixture Discontinued",
          sourceOwner: "Fixture Discontinued",
          sourceSlug: "fixture-discontinued",
          sourcePriority: "manufacturer",
          targetUrl: "https://example.com/fixture-discontinued",
          coverageTier: "tier_2_us_retail",
          accessStatus: "discontinued",
        },
      ], null, 2), "utf8");
      fs.writeFileSync(marketCatalogSnapshotPath, JSON.stringify([
        {
          cache_key: "fixture-complete:adult-chicken",
          product_name: "Fixture Complete Adult Chicken Recipe Dry Dog Food",
          brand: "Fixture Complete",
          source: "fixture-complete",
          source_quality: "manufacturer",
          source_url: "https://example.com/products/adult-chicken",
          pet_type: "dog",
          image_url: "https://example.com/images/adult-chicken-front.jpg",
          ingredient_text: rejectedRepairIngredient,
          ingredient_count: 18,
          ingredient_verification_status: "manufacturer",
          image_verification_status: "manufacturer",
          verified_at: "2026-06-28T00:00:00.000Z",
          expires_at: "2027-06-28T00:00:00.000Z",
          is_complete_food: true,
          catalog_exclusion_reason: null,
        },
        {
          cache_key: "fixture-shared-source:cat-chicken",
          product_name: "Fixture Shared Cat Chicken Recipe Wet Cat Food",
          brand: "Fixture Shared Cat",
          source: "fixture-shared-source",
          source_quality: "manufacturer",
          source_url: "https://example.com/shared/cat-chicken",
          pet_type: "cat",
          image_url: "https://example.com/shared/cat-chicken-front.jpg",
          ingredient_text: rejectedRepairIngredient,
          ingredient_count: 18,
          ingredient_verification_status: "manufacturer",
          image_verification_status: "manufacturer",
          verified_at: "2026-06-28T00:00:00.000Z",
          expires_at: "2027-06-28T00:00:00.000Z",
          is_complete_food: true,
          catalog_exclusion_reason: null,
        },
      ], null, 2), "utf8");
      const freshFixtureTimestamp = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      fs.writeFileSync(marketActionPlanPath, JSON.stringify({
        generated_at: freshFixtureTimestamp,
        gap_source: "live_supabase_catalog_acquisition_queue",
        gap_exported_at: freshFixtureTimestamp,
        gap_row_scope: "top_2_brands",
        input_gap_brand_count: 2,
        input_gap_open_rows: 5,
        input_gap_affected_products: 17,
        input_gap_actionable_open_rows: 4,
        input_gap_actionable_affected_products: 12,
        input_gap_brand_rollup_rows: 1,
        input_gap_brand_rollup_affected_products: 5,
        total_open_rows: 2,
        total_affected_products: 7,
        total_actionable_open_rows: 2,
        total_actionable_affected_products: 7,
        total_brand_rollup_rows: 0,
        total_brand_rollup_affected_products: 0,
        rows: [
          {
            brand: "Fixture Feed",
            source_slug: "fixture-feed",
            open_rows: 2,
            affected_products: 7,
            actionable_open_rows: 2,
            actionable_affected_products: 7,
            brand_rollup_rows: 0,
            brand_rollup_affected_products: 0,
            recommended_action: "request_authorized_feed",
            local_status: "not_applicable",
            next_command: "npm run catalog:authorized-feed-request-pack -- --brand \"Fixture Feed\" --all-restricted",
          },
        ],
      }, null, 2), "utf8");
      fs.writeFileSync(marketRejectedWorklistPath, JSON.stringify({
        rows: [
          {
            source: "fixture-complete",
            brand: "Fixture Complete",
            cache_key: "fixture-complete:rejected",
            evidence_issue: "official_source_text_failed_validation",
          },
        ],
      }, null, 2), "utf8");
      fs.writeFileSync(marketRepairSummaryPath, JSON.stringify({
        reports: [
          {
            source: "fixture-complete",
            status: "succeeded",
            input_rows: 1,
            accepted_rows: 1,
            sql_rows: 1,
          },
        ],
      }, null, 2), "utf8");
      fs.writeFileSync(marketPendingImportDeltaPath, JSON.stringify({
        pending_rows: 2,
        import_rejected_rows: 1,
        sources_with_pending_rows: 1,
        source_summaries: [
          {
            source: "fixture-complete",
            source_manifest_path: "outputs/catalog-source-imports/fixture-complete/sql/manifest.json",
            manifest_rows: 1,
            pending_rows: 0,
            import_rejected_rows: 1,
            sql_chunks: 0,
          },
          {
            source: "fixture-parent-child",
            source_manifest_path: "outputs/catalog-source-imports/fixture-parent-child/sql/manifest.json",
            manifest_rows: 2,
            pending_rows: 2,
            import_rejected_rows: 0,
            sql_chunks: 1,
            sample_pending_identity: "fixture-parent-child:one; fixture-parent-child:two",
          },
        ],
      }, null, 2), "utf8");
      const marketDashboardResult = spawnSync(process.execPath, [
        "scripts/catalog-us-market-coverage-dashboard.mjs",
        "--source-targets", marketTargetsPath,
        "--catalog-snapshot", marketCatalogSnapshotPath,
        "--action-plan", marketActionPlanPath,
        "--rejected-worklist", marketRejectedWorklistPath,
        "--repair-summary", marketRepairSummaryPath,
        "--pending-import-delta", marketPendingImportDeltaPath,
        "--import-root", marketImportRoot,
        "--output-dir", marketDashboardDir,
        "--verified-ready-goal", "3",
        "--json",
      ], {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
      });
      if (marketDashboardResult.status !== 0) {
        fail(`US market coverage dashboard fixture failed: ${(marketDashboardResult.stderr || marketDashboardResult.stdout).trim()}`);
      } else {
        const dashboard = JSON.parse(read(path.join(marketDashboardDir, "dashboard.json")));
        if (dashboard.completion_state !== "incomplete") {
          fail(`US market coverage dashboard completion state was ${dashboard.completion_state}, expected incomplete`);
        }
        for (const blocker of [
          "verified_ready_goal_not_met",
          "source_targets_without_verified_ready_rows",
          "authorized_or_blocked_source_targets_pending",
          "rejected_evidence_repairs_pending",
          "open_acquisition_gaps_pending",
        ]) {
          if (!dashboard.completion_blockers?.includes(blocker)) {
            fail(`US market coverage dashboard missing completion blocker ${blocker}`);
          }
        }
        if (dashboard.verified_ready_rows !== 2 || dashboard.verified_ready_goal_gap !== 1) {
          fail(`US market coverage dashboard ready/gap counts were ${dashboard.verified_ready_rows}/${dashboard.verified_ready_goal_gap}, expected 2/1`);
        }
        if (dashboard.pending_import_sql_rows !== 2 || dashboard.import_rejected_rows !== 1 || !dashboard.completion_blockers?.includes("validated_import_sql_pending")) {
          fail("US market coverage dashboard did not use authoritative pending-import delta totals");
        }
        if (dashboard.action_plan_freshness !== "fresh" || dashboard.action_plan_live_gap_source !== true || dashboard.action_plan_rows !== 1) {
          fail("US market coverage dashboard did not preserve action-plan provenance/freshness metadata");
        }
        if (dashboard.action_plan_gap_exported_at !== freshFixtureTimestamp || dashboard.action_plan_gap_row_scope !== "top_2_brands") {
          fail("US market coverage dashboard did not preserve action-plan export timestamp/scope metadata");
        }
        if (
          dashboard.action_plan_freshness !== "fresh"
          || !dashboard.action_plan_scope_warnings?.includes("action_plan_gap_row_scope_partial")
          || dashboard.action_plan_refresh_warnings?.length !== 0
          || dashboard.completion_blockers?.includes("action_plan_refresh_needed")
        ) {
          fail("US market coverage dashboard treated partial row scope as a stale action-plan refresh blocker");
        }
        if (
          dashboard.open_gap_rows !== 4
          || dashboard.open_gap_affected_products !== 12
          || dashboard.represented_open_gap_rows !== 2
          || dashboard.represented_open_gap_affected_products !== 7
          || dashboard.total_queue_open_rows !== 5
          || dashboard.total_queue_affected_products !== 17
          || dashboard.brand_rollup_rows !== 1
          || dashboard.brand_rollup_affected_products !== 5
          || dashboard.action_plan_input_gap_open_rows !== 5
          || dashboard.action_plan_input_gap_affected_products !== 17
          || dashboard.action_plan_input_gap_actionable_open_rows !== 4
          || dashboard.action_plan_input_gap_actionable_affected_products !== 12
        ) {
          fail("US market coverage dashboard did not preserve authoritative live gap totals separately from represented row totals");
        }
        if (dashboard.source_targets_without_verified_ready_rows !== 3) {
          fail(`US market coverage dashboard active zero-ready targets were ${dashboard.source_targets_without_verified_ready_rows}, expected 3`);
        }
        const fixtureFeedRow = dashboard.rows?.find((row) => row.source_slug === "fixture-feed");
        if (fixtureFeedRow?.recommended_action !== "request_authorized_feed" || fixtureFeedRow?.open_gap_affected_products !== 7) {
          fail("US market coverage dashboard did not preserve authorized-feed action-plan row");
        }
        const fixtureParentRow = dashboard.rows?.find((row) => row.source_slug === "fixture-parent");
        const fixtureChildRow = dashboard.rows?.find((row) => row.source_slug === "fixture-parent-child");
        if (fixtureParentRow?.pending_import_delta_rows !== 0 || fixtureParentRow?.recommended_action !== "request_authorized_feed") {
          fail("US market coverage dashboard incorrectly assigned child pending delta rows to the parent source target");
        }
        if (fixtureChildRow?.pending_import_delta_rows !== 2 || fixtureChildRow?.recommended_action !== "apply_generated_source_sql") {
          fail("US market coverage dashboard did not assign pending delta rows to the child source target");
        }
        const fixtureSharedRow = dashboard.rows?.find((row) => row.source_slug === "fixture-shared-cat");
        if (fixtureSharedRow?.verified_ready_rows !== 1 || fixtureSharedRow?.cat_verified_ready_rows !== 1 || fixtureSharedRow?.recommended_action !== "monitor_or_expand_coverage") {
          fail("US market coverage dashboard did not assign shared-source verified cat row to the shared target");
        }
        const fixtureDiscontinuedRow = dashboard.rows?.find((row) => row.source_slug === "fixture-discontinued");
        if (fixtureDiscontinuedRow?.verified_ready_rows !== 0 || dashboard.source_targets_without_verified_ready_rows !== 3) {
          fail("US market coverage dashboard counted discontinued source as missing active coverage");
        }
        const fixtureCompleteRow = dashboard.rows?.find((row) => row.source_slug === "fixture-complete");
        if (
          fixtureCompleteRow?.verified_ready_rows !== 1
          || fixtureCompleteRow?.rejected_repair_rows !== 1
          || fixtureCompleteRow?.repair_import_sql_rows !== 1
          || fixtureCompleteRow?.import_rejected_rows !== 1
          || fixtureCompleteRow?.recommended_action !== "repair_rejected_import_evidence"
        ) {
          fail("US market coverage dashboard did not merge verified-ready, rejected repair, repair SQL, and pending-delta rejection counts");
        }
        if (!fs.existsSync(path.join(marketDashboardDir, "dashboard.csv"))) {
          fail("US market coverage dashboard did not write CSV output");
        }
        if (!fs.existsSync(path.join(marketDashboardDir, "dashboard.md"))) {
          fail("US market coverage dashboard did not write Markdown output");
        }
      }
    }
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Catalog scraper check passed (${cases.length} fixture cases)`);
