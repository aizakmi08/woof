import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { SCRAPER_EXTRACTOR_VERSION } from "./catalog-scraper-contract.mjs";

const SOURCE_TARGETS_PATH = "scripts/catalog-source-targets.json";
const OUTPUT_ROOT = "outputs/catalog-source-imports";
const DEFAULT_LIMIT = 5;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_SQL_CHUNK_SIZE = 25;
const DEFAULT_SOURCE_TIMEOUT_MS = 5 * 60_000;
const REPORT_PAGE_SIZE = 1000;
const TARGET_PRIORITY = {
  tier_1_us_retail: 1,
  tier_2_us_retail: 2,
};
const RUNNABLE_ACCESS_STATUS = "runnable";

const SPECIALIZED_IMPORTERS = new Map([
  ["royal-canin-mars-petcare", ["scripts/catalog-royal-canin-algolia-import-batch.mjs"]],
  ["nutro", ["scripts/catalog-nutro-ocr-import-batch.mjs"]],
  ["pedigree-mars-petcare", ["scripts/catalog-nutro-ocr-import-batch.mjs", "--brand", "Pedigree", "--source", "pedigree-mars-petcare", "--target-url", "https://www.pedigree.com/", "--required-url-pattern", "^https://www\\.pedigree\\.com/products/"]],
  ["iams", ["scripts/catalog-nutro-ocr-import-batch.mjs", "--brand", "IAMS", "--source", "iams", "--target-url", "https://www.iams.com/", "--required-url-pattern", "^https://www\\.iams\\.com/products/"]],
  ["cesar-mars-petcare", ["scripts/catalog-nutro-ocr-import-batch.mjs", "--brand", "Cesar", "--source", "cesar-mars-petcare", "--target-url", "https://www.cesar.com/", "--required-url-pattern", "^https://www\\.cesar\\.com/products/"]],
  ["sheba-mars-petcare", ["scripts/catalog-nutro-ocr-import-batch.mjs", "--brand", "Sheba", "--source", "sheba-mars-petcare", "--target-url", "https://www.sheba.com/", "--required-url-pattern", "^https://www\\.sheba\\.com/products/"]],
  ["crave-mars-petcare", ["scripts/catalog-nutro-ocr-import-batch.mjs", "--brand", "Crave", "--source", "crave-mars-petcare", "--target-url", "https://www.cravepetfoods.com/", "--required-url-pattern", "^https://www\\.cravepetfoods\\.com/products/"]],
  ["eukanuba", ["scripts/catalog-nutro-ocr-import-batch.mjs", "--brand", "Eukanuba", "--source", "eukanuba", "--target-url", "https://www.eukanuba.com/", "--required-url-pattern", "^https://www\\.eukanuba\\.com/products/"]],
  ["instinct-pet-food", ["scripts/catalog-instinct-wp-api-import-batch.mjs"]],
  ["natural-balance", ["scripts/catalog-natural-balance-api-ocr-import-batch.mjs"]],
  ["taste-of-the-wild-diamond-pet-foods", ["scripts/catalog-taste-of-the-wild-wp-api-import-batch.mjs"]],
  ["the-honest-kitchen", ["scripts/catalog-the-honest-kitchen-shopify-import-batch.mjs"]],
  ["i-and-love-and-you", ["scripts/catalog-i-and-love-and-you-shopify-import-batch.mjs"]],
  ["daves-pet-food", ["scripts/catalog-daves-pet-food-shopify-import-batch.mjs"]],
  ["bully-max", ["scripts/catalog-bully-max-shopify-import-batch.mjs"]],
  ["solid-gold", ["scripts/catalog-solid-gold-shopify-ocr-import-batch.mjs"]],
  ["canidae", ["scripts/catalog-canidae-bigcommerce-import-batch.mjs"]],
  ["farmina-pet-foods", ["scripts/catalog-farmina-import-batch.mjs"]],
  ["petco-wholehearted", ["scripts/catalog-petco-snapshot-import-batch.mjs"]],
  ["petsmart-retail-catalog", ["scripts/catalog-petsmart-plp-import-batch.mjs", "--paginate", "--delay-ms", "500"]],
  ["petsmart-simply-nourish", ["scripts/catalog-petsmart-plp-import-batch.mjs", "--source", "petsmart-simply-nourish", "--plp-url", "https://www.petsmart.com/featured-brands/simply-nourish/", "--paginate", "--delay-ms", "500", "--expected-brand", "Simply Nourish"]],
  ["petsmart-authority", ["scripts/catalog-petsmart-plp-import-batch.mjs", "--source", "petsmart-authority", "--plp-url", "https://www.petsmart.com/featured-brands/authority/", "--paginate", "--delay-ms", "500", "--expected-brand", "Authority"]],
  ["lotus-pet-foods", ["scripts/catalog-lotus-api-import-batch.mjs"]],
  ["justfoodfordogs", ["scripts/catalog-justfoodfordogs-sfcc-import-batch.mjs"]],
]);

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function getArgs(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue;
    const value = process.argv[index + 1];
    if (value && !value.startsWith("--")) values.push(value);
  }
  return values;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value) {
  return compact(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function sourceTimeoutMs(target = null) {
  const explicitMs = positiveInteger(getArg("--source-timeout-ms"), 0);
  if (explicitMs > 0) return explicitMs;
  const explicitMinutes = positiveInteger(getArg("--source-timeout-minutes"), 0);
  if (explicitMinutes > 0) return explicitMinutes * 60_000;
  const discovery = target?.discovery || {};
  const configuredTimeoutMs = (
    positiveInteger(discovery.discoveryTimeoutMs, 120_000)
    + positiveInteger(discovery.extractTimeoutMs, 180_000)
    + positiveInteger(discovery.importTimeoutMs, 60_000)
    + 60_000
  );
  if (configuredTimeoutMs > DEFAULT_SOURCE_TIMEOUT_MS) return configuredTimeoutMs;
  return DEFAULT_SOURCE_TIMEOUT_MS;
}

function sourceSlugFor(target = {}) {
  return normalizeKey(target.sourceSlug || target.sourceOwner || target.brand || "catalog-source");
}

function windowSuffix() {
  const limit = positiveInteger(getArg("--url-limit"), 0);
  if (limit <= 0) return "";
  const offset = nonNegativeInteger(getArg("--url-offset"), 0);
  return `-window-${offset}-${limit}`;
}

function targetAccessStatus(target = {}) {
  return target.accessStatus || (target.discovery ? RUNNABLE_ACCESS_STATUS : "requires_authorized_feed");
}

function loadTargets() {
  return JSON.parse(fs.readFileSync(SOURCE_TARGETS_PATH, "utf8"))
    .map((target) => ({
      ...target,
      sourceSlug: sourceSlugFor(target),
    }))
    .sort((left, right) => {
      const leftTier = TARGET_PRIORITY[left.coverageTier] || 99;
      const rightTier = TARGET_PRIORITY[right.coverageTier] || 99;
      return leftTier - rightTier || sourceSlugFor(left).localeCompare(sourceSlugFor(right));
    });
}

function selectedTargets() {
  const tier = compact(getArg("--tier"));
  const brands = new Set(getArgs("--brand").map(normalizeKey));
  const sources = new Set(getArgs("--source").map(normalizeKey));
  const accessStatuses = new Set(getArgs("--access-status").map(compact).filter(Boolean));
  const includeNonRunnable = hasArg("--include-non-runnable");
  const limit = positiveInteger(getArg("--limit"), DEFAULT_LIMIT);
  const targets = loadTargets().filter((target) => {
    if (tier && target.coverageTier !== tier) return false;
    if (brands.size > 0) {
      const keys = [target.brand, ...(target.aliases || [])].map(normalizeKey);
      if (!keys.some((key) => brands.has(key))) return false;
    }
    if (sources.size > 0 && !sources.has(normalizeKey(target.sourceSlug))) return false;
    const accessStatus = targetAccessStatus(target);
    if (accessStatuses.size > 0 && !accessStatuses.has(accessStatus)) return false;
    if (!includeNonRunnable && accessStatuses.size === 0 && accessStatus !== RUNNABLE_ACCESS_STATUS) return false;
    return true;
  });
  return targets.slice(0, limit);
}

function runNode(args, { timeoutMs = 15 * 60_000 } = {}) {
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    maxBuffer: 200 * 1024 * 1024,
    timeout: timeoutMs,
  });
  if (result.status !== 0) {
    const timedOut = result.error?.code === "ETIMEDOUT" || result.signal;
    throw new Error([
      `${args.join(" ")} failed with ${timedOut ? `timeout after ${timeoutMs}ms` : `status ${result.status}`}`,
      result.error?.message,
      result.stderr,
      result.stdout,
    ].filter(Boolean).join("\n"));
  }
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function sourceQualityFor(target = {}) {
  if (target.sourcePriority === "gdsn") return "gdsn";
  if (target.sourcePriority === "retailer") return "retailer_verified";
  if (target.sourcePriority === "manufacturer") return "manufacturer";
  return "official";
}

function isBroadRetailCatalogTarget(target = {}) {
  return target.sourcePriority === "retailer"
    && (
      /\bretail\s+catalog\b/i.test(target.brand || "")
      || /-retail-catalog$/i.test(target.sourceSlug || "")
    );
}

function sourceDir(target) {
  return path.join(OUTPUT_ROOT, `${target.sourceSlug}${windowSuffix()}`);
}

function sourceDirAliases(target) {
  return [
    target.sourceSlug,
    ...(Array.isArray(target.outputAliases) ? target.outputAliases : []),
  ]
    .map(normalizeKey)
    .filter(Boolean);
}

function reportPathsFor(target) {
  return sourceDirAliases(target).flatMap((slug) => {
    const dir = path.join(OUTPUT_ROOT, slug);
    return [
      path.join(dir, "run-report.json"),
      path.join(dir, "report.json"),
    ];
  });
}

function existingReportIsFresh(target) {
  if (!hasArg("--changed-only")) return false;
  const reportPath = reportPathsFor(target).find((candidatePath) => fs.existsSync(candidatePath));
  if (!reportPath) return false;
  const stats = fs.statSync(reportPath);
  const maxAgeMs = positiveInteger(getArg("--changed-max-age-hours"), 24) * 60 * 60 * 1000;
  return Date.now() - stats.mtimeMs < maxAgeMs;
}

function writeSourceRunReport(target, row) {
  fs.mkdirSync(sourceDir(target), { recursive: true });
  const reportPath = path.join(sourceDir(target), "run-report.json");
  fs.writeFileSync(reportPath, `${JSON.stringify({
    generated_at: new Date().toISOString(),
    ...row,
  }, null, 2)}\n`, "utf8");
  return reportPath;
}

function genericBatchArgs(target) {
  const discovery = target.discovery || {};
  const args = [
    "scripts/catalog-source-import-batch.mjs",
    "--brand", target.brand,
    "--source", target.sourceSlug,
    "--output-dir", sourceDir(target),
    "--source-quality", sourceQualityFor(target),
    "--sql-chunk-size", String(positiveInteger(getArg("--sql-chunk-size"), DEFAULT_SQL_CHUNK_SIZE)),
  ];
  if (discovery.targetUrl || target.targetUrl) args.push("--target-url", discovery.targetUrl || target.targetUrl);
  if (discovery.requiredUrlPattern) args.push("--required-url-pattern", discovery.requiredUrlPattern);
  if (discovery.excludedUrlPattern) args.push("--excluded-url-pattern", discovery.excludedUrlPattern);
  if (discovery.fetchDelayMs) args.push("--fetch-delay-ms", String(discovery.fetchDelayMs));
  if (discovery.discoveryTimeoutMs) args.push("--discovery-timeout-ms", String(discovery.discoveryTimeoutMs));
  if (discovery.extractTimeoutMs) args.push("--extract-timeout-ms", String(discovery.extractTimeoutMs));
  if (discovery.importTimeoutMs) args.push("--import-timeout-ms", String(discovery.importTimeoutMs));
  if (hasArg("--allow-partial-pages") || target.coverageTier === "tier_2_us_retail") args.push("--allow-partial-pages");
  if (hasArg("--generic-only")) args.push("--allow-source-brand-mismatch");
  appendWindowArgs(args);
  return args;
}

function appendValueArg(args, name) {
  const value = getArg(name);
  if (!value) return;
  args.push(name, value);
}

function appendWindowArgs(args) {
  appendValueArg(args, "--url-offset");
  appendValueArg(args, "--url-limit");
}

function extractionArgs(target) {
  if (!hasArg("--generic-only") && SPECIALIZED_IMPORTERS.has(target.sourceSlug)) {
    const args = [...SPECIALIZED_IMPORTERS.get(target.sourceSlug)];
    if (!args.includes("--output-dir")) args.push("--output-dir", sourceDir(target));
    appendWindowArgs(args);
    appendValueArg(args, "--sql-chunk-size");
    return args;
  }
  return genericBatchArgs(target);
}

function runDiscover(target) {
  const discovery = target.discovery || {};
  const targetUrl = discovery.targetUrl || target.targetUrl;
  if (!targetUrl) {
    return { skipped: true, reason: "missing_target_url" };
  }
  fs.mkdirSync(sourceDir(target), { recursive: true });
  const args = [
    "scripts/catalog-source-url-discovery.mjs",
    "--target-url", targetUrl,
    "--brand-term", target.brand,
    "--max-urls", String(positiveInteger(discovery.maxUrls, 250)),
    "--min-score", String(discovery.minScore ?? 3),
  ];
  if (discovery.requiredUrlPattern) args.push("--required-url-pattern", discovery.requiredUrlPattern);
  if (discovery.excludedUrlPattern) args.push("--excluded-url-pattern", discovery.excludedUrlPattern);
  const result = runNode(args, { timeoutMs: 120_000 });
  const urlPath = path.join(sourceDir(target), "urls.txt");
  fs.writeFileSync(urlPath, result.stdout, "utf8");
  return { skipped: false, urls_path: urlPath, stderr: compact(result.stderr) };
}

function runExtract(target) {
  fs.mkdirSync(sourceDir(target), { recursive: true });
  const result = runNode(extractionArgs(target), { timeoutMs: sourceTimeoutMs(target) });
  return {
    stdout: compact(result.stdout),
    stderr: compact(result.stderr),
  };
}

function runValidate(target) {
  const feedPath = path.join(sourceDir(target), "feed.csv");
  if (!fs.existsSync(feedPath)) {
    return { skipped: true, reason: "missing_feed" };
  }
  const args = [
    "scripts/catalog-scraper-validate.mjs",
    "--file", feedPath,
    "--source", target.sourceSlug,
    "--brand", target.brand,
    "--source-quality", sourceQualityFor(target),
  ];
  if (target.discovery?.requiredUrlPattern) {
    args.push("--required-source-url-pattern", target.discovery.requiredUrlPattern);
  }
  if (!isBroadRetailCatalogTarget(target)) {
    for (const expectedBrand of [target.brand, ...(target.aliases || [])]) {
      args.push("--expected-brand", expectedBrand);
    }
  }
  const result = runNode(args, { timeoutMs: 120_000 });
  return JSON.parse(result.stdout);
}

function validationAcceptedCount(validation) {
  return Number(validation?.summary?.accepted_candidates || 0);
}

function validationRejectedCount(validation) {
  return Number(validation?.summary?.rejected_candidates || 0);
}

function enforceImportValidation(validation, target) {
  const accepted = validationAcceptedCount(validation);
  const rejected = validationRejectedCount(validation);
  if (accepted <= 0) {
    throw new Error(`${target.sourceSlug} import blocked: validation accepted 0 verified catalog candidates.`);
  }
  if (hasArg("--strict-import-validation") && rejected > 0) {
    throw new Error(`${target.sourceSlug} import blocked: --strict-import-validation rejected ${rejected} candidate(s).`);
  }
}

function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}

function readOnlyKey() {
  return (
    serviceRoleKey()
    || process.env.SUPABASE_ANON_KEY
    || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    || ""
  );
}

function supabaseClient({ readOnly = false } = {}) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = readOnly ? readOnlyKey() : serviceRoleKey();
  if (!supabaseUrl || !key) return null;
  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function runReport() {
  const client = supabaseClient({ readOnly: true });
  if (!client) {
    return {
      note: "Set SUPABASE_SERVICE_ROLE_KEY to include live Supabase readiness counts.",
      source_target_count: loadTargets().length,
    };
  }

  if (serviceRoleKey()) {
    const { data, error } = await client.rpc("catalog_product_evidence_gap_summary", { p_limit: 25 });
    if (!error && data) {
      return {
        ...data,
        source_target_count: loadTargets().length,
        report_source: "catalog_product_evidence_gap_summary",
      };
    }
    if (!hasArg("--allow-client-report-scan")) {
      return {
        note: "Live report RPC failed. Apply supabase/migrations/220_catalog_product_evidence_gap_summary.sql or rerun with --allow-client-report-scan for the legacy paged scan.",
        rpc_error: error?.message || String(error),
        source_target_count: loadTargets().length,
      };
    }
  } else if (!hasArg("--allow-client-report-scan")) {
    return {
      note: "Set SUPABASE_SERVICE_ROLE_KEY for timeout-safe live catalog reporting, or rerun with --allow-client-report-scan for the legacy paged scan.",
      source_target_count: loadTargets().length,
    };
  }

  const rows = [];
  for (let offset = 0; ; offset += REPORT_PAGE_SIZE) {
    const { data, error } = await client
      .from("product_data")
      .select("brand,source,pet_type,ingredient_verification_status,image_verification_status,source_url,image_url,ingredient_text,ingredient_count,is_complete_food,catalog_exclusion_reason,expires_at")
      .range(offset, offset + REPORT_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < REPORT_PAGE_SIZE) break;
  }
  const verifiedIngredients = new Set(["gdsn", "official", "manufacturer", "retailer_verified", "label_ocr_verified"]);
  const verifiedImages = new Set(["official", "manufacturer", "retailer_verified"]);
  const rowIsInScope = (row) => (
    ["dog", "cat"].includes(row.pet_type)
    && row.is_complete_food === true
    && !compact(row.catalog_exclusion_reason)
    && (!row.expires_at || new Date(row.expires_at) > new Date())
  );
  const rowHasVerifiedIngredients = (row) => (
    verifiedIngredients.has(row.ingredient_verification_status)
    && compact(row.source_url)
    && compact(row.ingredient_text)
    && Number(row.ingredient_count || 0) >= 5
  );
  const rowHasVerifiedImage = (row) => (
    verifiedImages.has(row.image_verification_status)
    && compact(row.image_url)
    && !/^data:/i.test(row.image_url)
  );
  const rowQualityState = (row) => {
    if (!rowIsInScope(row)) return "excluded_or_out_of_scope";
    if (!rowHasVerifiedIngredients(row)) return "needs_ingredients";
    if (!rowHasVerifiedImage(row)) return "needs_image";
    return "verified_ready";
  };
  const targetsBySource = new Map(loadTargets().map((target) => [normalizeKey(target.sourceSlug), target]));
  const needsIngredientsActionFor = (row) => {
    const source = normalizeKey(row.source);
    const sourceUrl = compact(row.source_url);
    const ingredientStatus = compact(row.ingredient_verification_status);
    const hasIngredientText = compact(row.ingredient_text);
    const target = targetsBySource.get(source);

    if (hasIngredientText && !sourceUrl && ingredientStatus === "unverified") {
      return "legacy_no_source_do_not_promote";
    }
    if (!sourceUrl && ["dfa", "opff", "user-ocr"].includes(source)) {
      return "third_party_no_source_review_required";
    }
    if (source === "amazon") return "authorized_feed_or_official_import_required";
    if (target && targetAccessStatus(target) === RUNNABLE_ACCESS_STATUS) return "runnable_source_reextract_or_validate";
    if (target) return targetAccessStatus(target);
    if (!sourceUrl) return "missing_source_url";
    return "unmapped_source_review";
  };
  const verifiedReady = rows.filter((row) => rowQualityState(row) === "verified_ready");

  const sourceBreakdown = new Map();
  const qualityStateCounts = new Map();
  const needsIngredientsBreakdown = new Map();
  const needsIngredientsActionCounts = new Map();
  let legacyUnverifiedNoSourceRows = 0;
  for (const row of verifiedReady) {
    const source = compact(row.source) || "unknown";
    sourceBreakdown.set(source, (sourceBreakdown.get(source) || 0) + 1);
  }
  for (const row of rows) {
    const qualityState = rowQualityState(row);
    qualityStateCounts.set(qualityState, (qualityStateCounts.get(qualityState) || 0) + 1);
    if (
      rowIsInScope(row)
      && compact(row.ingredient_text)
      && !compact(row.source_url)
      && compact(row.ingredient_verification_status) === "unverified"
    ) {
      legacyUnverifiedNoSourceRows += 1;
    }
    if (qualityState === "needs_ingredients") {
      const recommendedAction = needsIngredientsActionFor(row);
      const key = JSON.stringify({
        brand: compact(row.brand) || "unknown",
        source: compact(row.source) || "unknown",
        recommended_action: recommendedAction,
      });
      needsIngredientsBreakdown.set(key, (needsIngredientsBreakdown.get(key) || 0) + 1);
      needsIngredientsActionCounts.set(recommendedAction, (needsIngredientsActionCounts.get(recommendedAction) || 0) + 1);
    }
  }
  const topNeedsIngredientsByBrandSource = [...needsIngredientsBreakdown.entries()]
    .map(([key, count]) => ({ ...JSON.parse(key), count }))
    .sort((left, right) => right.count - left.count || left.brand.localeCompare(right.brand))
    .slice(0, 25);

  return {
    total_rows_sampled: rows.length,
    verified_ready_rows: verifiedReady.length,
    quality_state_counts: Object.fromEntries([...qualityStateCounts.entries()].sort()),
    needs_ingredients_action_counts: Object.fromEntries([...needsIngredientsActionCounts.entries()].sort()),
    legacy_unverified_no_source_rows: legacyUnverifiedNoSourceRows,
    source_target_count: loadTargets().length,
    source_breakdown: Object.fromEntries([...sourceBreakdown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)),
    top_needs_ingredients_by_brand_source: topNeedsIngredientsByBrandSource,
  };
}

async function runImport(target, { dryRun }) {
  const feedPath = path.join(sourceDir(target), "feed.csv");
  if (!fs.existsSync(feedPath)) {
    runExtract(target);
  }
  const validation = runValidate(target);
  enforceImportValidation(validation, target);
  if (dryRun) {
    return {
      preflight_validation: validation,
      skipped_live_import: true,
      reason: "dry_run",
    };
  }

  const args = [
    "scripts/catalog-official-feed-import-all.mjs",
    "--source", target.sourceSlug,
    "--batch-size", String(positiveInteger(getArg("--batch-size"), 500)),
  ];
  if (!dryRun) args.push("--execute");
  const result = runNode(args, { timeoutMs: 20 * 60_000 });
  return {
    preflight_validation: validation,
    stdout: compact(result.stdout),
    stderr: compact(result.stderr),
  };
}

async function main() {
  const mode = compact(getArg("--mode", "report"));
  const dryRun = hasArg("--dry-run");
  const concurrency = positiveInteger(getArg("--concurrency"), DEFAULT_CONCURRENCY);
  if (concurrency !== 1) {
    console.error("Concurrency is currently serialized per host/source to preserve source safety; --concurrency is accepted for future worker rollout.");
  }

  if (mode === "report") {
    console.log(JSON.stringify(await runReport(), null, 2));
    return;
  }

  const targets = selectedTargets();
  if (targets.length === 0) throw new Error("No catalog source targets matched the requested filters.");

  const results = [];
  for (const target of targets) {
    const startedAt = Date.now();
    const row = {
      source: target.sourceSlug,
      brand: target.brand,
      coverage_tier: target.coverageTier,
      access_status: targetAccessStatus(target),
      mode,
      extractor_version: SCRAPER_EXTRACTOR_VERSION,
      output_dir: sourceDir(target),
    };
    try {
      if (existingReportIsFresh(target)) {
        row.status = "skipped";
        row.reason = "changed_only_recent_report";
      } else if (mode === "discover") {
        row.result = runDiscover(target);
        row.status = "succeeded";
      } else if (mode === "extract") {
        row.result = runExtract(target);
        row.validation = runValidate(target);
        row.status = "succeeded";
      } else if (mode === "validate") {
        row.validation = runValidate(target);
        row.status = "succeeded";
      } else if (mode === "import") {
        const importResult = await runImport(target, { dryRun });
        row.validation = importResult.preflight_validation;
        row.result = {
          ...importResult,
          preflight_validation: undefined,
        };
        row.status = "succeeded";
      } else {
        throw new Error(`Unsupported --mode ${mode}. Use discover, extract, validate, import, or report.`);
      }
    } catch (error) {
      row.status = "failed";
      row.error = error.message || String(error);
      if (!hasArg("--continue-on-error")) {
        row.duration_ms = Date.now() - startedAt;
        row.run_report_path = writeSourceRunReport(target, row);
        results.push(row);
        console.log(JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2));
        process.exit(1);
      }
    } finally {
      row.duration_ms = Date.now() - startedAt;
    }
    row.run_report_path = writeSourceRunReport(target, row);
    results.push(row);
  }

  console.log(JSON.stringify({
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    mode,
    target_count: targets.length,
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
