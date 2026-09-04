import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SOURCE_TARGETS_PATH = "scripts/catalog-source-targets.json";
const DEFAULT_IMPORT_ROOT = "outputs/catalog-source-imports";
const LIVE_GAP_REPORT_PATH = "outputs/catalog-source-imports/live-gap-report.json";
const DEFAULT_ACTION_PLAN = "outputs/catalog-live-gap-action-plan/current/action-plan.json";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-source-feed-worklist/current";
const DEFAULT_LIMIT = 50;
const DEFAULT_TEMPLATE_SAMPLE_LIMIT = 25;
const PAGE_SIZE = 1000;
const BROAD_SOURCE_PREFIXES = new Set([
  "nestle-purina",
  "mars-petcare",
  "chewy",
  "petsmart",
  "walmart",
  "target",
  "kroger",
  "amazon",
]);
const SOURCE_RUN_SUFFIX_PATTERN = /^(?:\d{2,4}(?:-|$)|window-|refresh-|rerun-|probe-|fixed-|expanded-|consolidated$|repair$)/i;
const TEMPLATE_HEADERS = [
  "gtin",
  "product_name",
  "brand",
  "product_line",
  "flavor",
  "life_stage",
  "food_form",
  "package_size",
  "pet_type",
  "ingredient_statement",
  "product_image_url",
  "product_url",
  "is_complete_food",
  "guaranteed_analysis",
];

const SOURCE_WORKLIST_COLUMNS = [
  "priorityRank",
  "queueSource",
  "coverageTier",
  "sourceOwner",
  "sourceSlug",
  "sourcePriority",
  "runnableStatus",
  "recommendedNextAction",
  "accessStatus",
  "sourceTargetUrl",
  "discoveryTargetUrl",
  "brands",
  "need",
  "actionableAffectedProducts",
  "actionableRows",
  "brandRollupAffectedProducts",
  "brandRollupRows",
  "affectedProducts",
  "openRows",
  "demandEvents",
  "maxPriority",
  "speciesExplicitRows",
  "speciesAmbiguousRows",
  "currentSources",
  "localReportPath",
  "localGeneratedAt",
  "localFeedRows",
  "localCompleteRows",
  "localIngredientRows",
  "localImageRows",
  "localSqlRows",
  "localRejectedRows",
  "liveGeneratedMissingUrls",
  "localSkipSummary",
  "sampleProducts",
  "proofRequired",
  "templateHeaders",
  "scrapeExtractCommand",
  "scrapeValidateCommand",
  "scrapeImportCommand",
  "urlDiscoveryCommand",
  "pageExtractCommand",
  "importCommand",
];

const EVIDENCE_WORKLIST_COLUMNS = [
  "action",
  "sourceOwner",
  "sourceSlug",
  "sourcePriority",
  "accessStatus",
  "coverageTier",
  "source",
  "brand",
  "rows",
  "rowsWithIngredientText",
  "rowsWithImage",
  "rowsWithSourceUrl",
  "sampleProducts",
  "proofRequired",
  "importCommand",
];

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function importRoot() {
  return compact(getArg("--import-root", DEFAULT_IMPORT_ROOT));
}

function getArgs(name) {
  const values = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
      index += 1;
    }
  }
  return values;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function slug(value) {
  return compact(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function normalizedBrand(value) {
  return compact(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvLineFromObject(row, headers) {
  return headers.map((header) => csvEscape(row?.[header] ?? "")).join(",");
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readFixtureRows(filePath, label) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
  if (!Array.isArray(rows)) {
    throw new Error(`${label} fixture must be a JSON array or an object with a rows array`);
  }
  return rows;
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function numberFromText(text, pattern) {
  const match = compact(text).match(pattern);
  return match ? Number(match[1]) || 0 : 0;
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

function clientFromEnv() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = readOnlyKey();
  if (!supabaseUrl || !key) return null;

  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function loadSourceTargets() {
  const rows = JSON.parse(fs.readFileSync(SOURCE_TARGETS_PATH, "utf8"));
  const byBrand = new Map();

  for (const target of rows) {
    for (const value of [target.brand, ...(Array.isArray(target.aliases) ? target.aliases : [])]) {
      const key = normalizedBrand(value);
      if (key) byBrand.set(key, target);
    }
  }

  return { rows, byBrand };
}

function fallbackSql({ limit }) {
  return `
-- Run in Supabase SQL Editor with a privileged role, then export as CSV.
SELECT
  brand,
  product_name,
  pet_type,
  gap_type,
  priority_score,
  affected_product_count,
  demand_events,
  needs_verified_ingredients,
  needs_verified_image,
  needs_pet_type,
  sample_metadata,
  source_url
FROM public.catalog_acquisition_queue
WHERE status = 'open'
ORDER BY (gap_type <> 'brand') DESC, priority_score DESC, affected_product_count DESC, updated_at DESC
LIMIT ${limit};`.trim();
}

function actionPlanRows(filePath) {
  const payload = readJsonIfExists(filePath);
  if (!payload || !Array.isArray(payload.rows)) return [];
  return payload.rows.map((row) => ({
    __action_plan_rollup: true,
    brand: compact(row.brand),
    source_slug: compact(row.source_slug),
    source_owner: compact(row.source_owner),
    source_priority: compact(row.source_priority),
    coverage_tier: compact(row.coverage_tier),
    access_status: compact(row.access_status),
    gap_type: "action_plan_rollup",
    priority_score: Number(row.priority_score || 0),
    affected_product_count: Number(row.affected_products || 0),
    actionable_open_rows: Number(row.actionable_open_rows || 0),
    actionable_affected_products: Number(row.actionable_affected_products || 0),
    brand_rollup_rows: Number(row.brand_rollup_rows || 0),
    brand_rollup_affected_products: Number(row.brand_rollup_affected_products || 0),
    open_rows: Number(row.open_rows || 0),
    demand_events: Number(row.demand_events || 0),
    needs_verified_ingredients: Number(row.needs_ingredients_rows || 0) > 0,
    needs_verified_image: Number(row.needs_image_rows || 0) > 0,
    needs_pet_type: Number(row.needs_pet_type_rows || 0) > 0,
    sample_metadata: { sources: [compact(row.source_slug)].filter(Boolean) },
    recommended_action: compact(row.recommended_action),
    next_command: compact(row.next_command),
    local_status: compact(row.local_status),
    evidence_path: compact(row.evidence_path),
    notes: compact(row.notes),
  })).filter((row) => row.brand);
}

async function fetchOpenQueueRows(client) {
  const rows = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from("catalog_acquisition_queue")
      .select([
        "brand",
        "gap_type",
        "priority_score",
        "affected_product_count",
        "demand_events",
        "needs_verified_ingredients",
        "needs_verified_image",
        "needs_pet_type",
        "product_name",
        "pet_type",
        "sample_metadata",
        "source_url",
      ].join(","))
      .eq("status", "open")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchProductEvidenceGapRows(client) {
  const rows = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from("product_data")
      .select([
        "cache_key",
        "brand",
        "source",
        "product_name",
        "product_line",
        "flavor",
        "life_stage",
        "food_form",
        "package_size",
        "pet_type",
        "gtin",
        "ingredient_verification_status",
        "image_verification_status",
        "source_url",
        "image_url",
        "ingredient_text",
        "ingredient_count",
        "is_complete_food",
        "catalog_exclusion_reason",
        "expires_at",
      ].join(","))
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchProductEvidenceGapSummary(client, { limit }) {
  const { data, error } = await client.rpc("catalog_product_evidence_gap_summary", { p_limit: limit });
  if (error) throw error;
  return data || {};
}

function needLabel(stats) {
  const needs = [];
  if (stats.needsVerifiedIngredients) needs.push("verified ingredient statements");
  if (stats.needsVerifiedImage) needs.push("verified product images");
  if (stats.needsPetType) needs.push("pet-type taxonomy");
  return needs.join(" + ") || "review";
}

function sourceQualityFor(target) {
  if (target?.sourcePriority === "gdsn") return "gdsn";
  if (target?.sourcePriority === "retailer") return "retailer_verified";
  if (target?.sourcePriority === "manufacturer") return "manufacturer";
  return "official";
}

const VERIFIED_INGREDIENT_STATUSES = new Set(["gdsn", "official", "manufacturer", "retailer_verified", "label_ocr_verified"]);

function rowIsInScopeFood(row) {
  return (
    ["dog", "cat"].includes(compact(row.pet_type).toLowerCase())
    && row.is_complete_food === true
    && !compact(row.catalog_exclusion_reason)
    && (!row.expires_at || new Date(row.expires_at) > new Date())
  );
}

function rowHasVerifiedIngredients(row) {
  return (
    VERIFIED_INGREDIENT_STATUSES.has(compact(row.ingredient_verification_status))
    && compact(row.source_url)
    && compact(row.ingredient_text)
    && Number(row.ingredient_count || 0) >= 5
  );
}

function productEvidenceAction(row, sourceTargets) {
  const source = slug(row.source);
  const brandKey = normalizedBrand(row.brand);
  const target = sourceTargets.get(brandKey);
  const hasIngredientText = compact(row.ingredient_text);
  const sourceUrl = compact(row.source_url);
  const ingredientStatus = compact(row.ingredient_verification_status);

  if (hasIngredientText && !sourceUrl && ingredientStatus === "unverified") {
    return "legacy_no_source_do_not_promote";
  }
  if (!sourceUrl && ["dfa", "opff", "user-ocr"].includes(source)) {
    return "third_party_no_source_review_required";
  }
  if (source === "amazon") return "authorized_feed_or_official_import_required";
  if (target?.accessStatus && target.accessStatus !== "runnable") return target.accessStatus;
  if (target?.discovery) return "runnable_source_reextract_or_validate";
  if (target) return "request_or_load_authorized_feed";
  if (!sourceUrl) return "missing_source_url";
  return "unmapped_source_review";
}

function productEvidenceRows(rows, sourceTargets) {
  return rows
    .filter((row) => rowIsInScopeFood(row) && !rowHasVerifiedIngredients(row))
    .map((row) => {
      const target = sourceTargets.get(normalizedBrand(row.brand));
      const sourceSlug = target?.sourceSlug || slug(row.source || row.brand);
      const action = productEvidenceAction(row, sourceTargets);
      return {
        action,
        sourceOwner: target?.sourceOwner || compact(row.source) || "[unassigned]",
        sourceSlug,
        sourcePriority: target?.sourcePriority || "",
        accessStatus: target?.accessStatus || (target?.discovery ? "runnable" : ""),
        coverageTier: target?.coverageTier || "",
        brand: compact(row.brand),
        source: compact(row.source),
        productName: compact(row.product_name),
        productLine: compact(row.product_line),
        flavor: compact(row.flavor),
        lifeStage: compact(row.life_stage),
        foodForm: compact(row.food_form),
        packageSize: compact(row.package_size),
        petType: compact(row.pet_type),
        gtin: compact(row.gtin),
        ingredientVerificationStatus: compact(row.ingredient_verification_status),
        imageVerificationStatus: compact(row.image_verification_status),
        hasIngredientText: Boolean(compact(row.ingredient_text)),
        ingredientCount: Number(row.ingredient_count || 0),
        hasImage: Boolean(compact(row.image_url)),
        hasSourceUrl: Boolean(compact(row.source_url)),
        sourceUrl: compact(row.source_url),
        proofRequired: "official/authorized product URL, exact ingredient statement, front image URL, dog/cat pet_type, complete-food flag",
        importCommand: importCommand({
          sourceBrand: target?.brand || row.brand,
          sourceOwner: target?.sourceOwner || row.source,
          sourceSlug,
          target,
        }),
      };
    });
}

function aggregateEvidenceRows(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = JSON.stringify({
      action: row.action,
      sourceOwner: row.sourceOwner,
      sourceSlug: row.sourceSlug,
      source: row.source,
      brand: row.brand,
    });
    const stats = byKey.get(key) || {
      action: row.action,
      sourceOwner: row.sourceOwner,
      sourceSlug: row.sourceSlug,
      sourcePriority: row.sourcePriority,
      accessStatus: row.accessStatus,
      coverageTier: row.coverageTier,
      source: row.source,
      brand: row.brand,
      rows: 0,
      rowsWithIngredientText: 0,
      rowsWithImage: 0,
      rowsWithSourceUrl: 0,
      sampleProducts: [],
      templateRows: [],
      proofRequired: row.proofRequired,
      importCommand: row.importCommand,
    };
    stats.rows += 1;
    if (row.hasIngredientText) stats.rowsWithIngredientText += 1;
    if (row.hasImage) stats.rowsWithImage += 1;
    if (row.hasSourceUrl) stats.rowsWithSourceUrl += 1;
    if (stats.sampleProducts.length < 5 && row.productName) stats.sampleProducts.push(row.productName);
    if (stats.templateRows.length < DEFAULT_TEMPLATE_SAMPLE_LIMIT && row.productName) {
      stats.templateRows.push({
        gtin: row.gtin,
        product_name: row.productName,
        brand: row.brand,
        product_line: row.productLine,
        flavor: row.flavor,
        life_stage: row.lifeStage,
        food_form: row.foodForm,
        package_size: row.packageSize,
        pet_type: row.petType,
        is_complete_food: "true",
      });
    }
    byKey.set(key, stats);
  }

  return [...byKey.values()].sort((left, right) => (
    right.rows - left.rows
    || left.action.localeCompare(right.action)
    || left.brand.localeCompare(right.brand)
  ));
}

function evidenceRowsFromSummary(summary, sourceTargets) {
  const rows = Array.isArray(summary?.top_needs_ingredients_by_brand_source)
    ? summary.top_needs_ingredients_by_brand_source
    : [];

  return rows.map((row) => {
    const brand = compact(row.brand);
    const source = compact(row.source);
    const target = sourceTargets.get(normalizedBrand(brand));
    const sourceSlug = target?.sourceSlug || slug(source || brand);
    const action = compact(row.recommended_action || row.action);
    const sampleProducts = Array.isArray(row.sample_products)
      ? row.sample_products.map(compact).filter(Boolean)
      : [];

    return {
      action,
      sourceOwner: target?.sourceOwner || source || "[unassigned]",
      sourceSlug,
      sourcePriority: target?.sourcePriority || "",
      accessStatus: target?.accessStatus || (target?.discovery ? "runnable" : ""),
      coverageTier: target?.coverageTier || "",
      source,
      brand,
      rows: Number(row.rows || row.count || 0),
      rowsWithIngredientText: Number(row.rows_with_ingredient_text || row.rowsWithIngredientText || 0),
      rowsWithImage: Number(row.rows_with_image || row.rowsWithImage || 0),
      rowsWithSourceUrl: Number(row.rows_with_source_url || row.rowsWithSourceUrl || 0),
      sampleProducts,
      templateRows: sampleProducts.slice(0, DEFAULT_TEMPLATE_SAMPLE_LIMIT).map((productName) => ({
        product_name: productName,
        brand,
        is_complete_food: "true",
      })),
      proofRequired: "official/authorized product URL, exact ingredient statement, front image URL, dog/cat pet_type, complete-food flag",
      importCommand: importCommand({
        sourceBrand: target?.brand || brand,
        sourceOwner: target?.sourceOwner || source,
        sourceSlug,
        target,
      }),
    };
  }).sort((left, right) => (
    right.rows - left.rows
    || left.action.localeCompare(right.action)
    || left.brand.localeCompare(right.brand)
  ));
}

function sourceSlugFor(stats) {
  return compact(stats.sourceSlug) || slug(stats.sourceOwner || stats.sourceBrand || stats.key);
}

function sourceReportSlugs(stats) {
  return [
    sourceSlugFor(stats),
    ...(Array.isArray(stats.target?.outputAliases) ? stats.target.outputAliases : []),
  ].map(slug).filter(Boolean);
}

function sourceImportDirsFor(stats) {
  const slugs = sourceReportSlugs(stats);
  const dirs = new Map();
  const root = importRoot();
  const rootEntries = fs.existsSync(root)
    ? fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];

  for (const sourceSlug of sourceReportSlugs(stats)) {
    const exactDir = path.join(root, sourceSlug);
    if (fs.existsSync(exactDir)) dirs.set(sourceSlug, exactDir);
    if (BROAD_SOURCE_PREFIXES.has(sourceSlug)) continue;
    for (const entryName of rootEntries) {
      if (!entryName.startsWith(`${sourceSlug}-`)) continue;
      const suffix = entryName.slice(sourceSlug.length + 1);
      if (!SOURCE_RUN_SUFFIX_PATTERN.test(suffix)) continue;
      dirs.set(entryName, path.join(root, entryName));
    }
  }

  for (const sourceSlug of slugs) {
    const exactDir = path.join(root, sourceSlug);
    if (fs.existsSync(exactDir)) dirs.set(sourceSlug, exactDir);
  }

  return [...dirs.values()];
}

function reportPathsFor(stats) {
  const paths = [];
  for (const dir of sourceImportDirsFor(stats)) {
    paths.push(path.join(dir, "report.json"));
    paths.push(path.join(dir, "run-report.json"));
  }
  return paths;
}

function sqlManifestPathsFor(stats) {
  const paths = [];
  for (const dir of sourceImportDirsFor(stats)) {
    paths.push(path.join(dir, "sql", "manifest.json"));
    paths.push(path.join(dir, "sql-mcp", "manifest.json"));
  }
  return paths;
}

function reportHasLocalMetrics(report) {
  return (
    reportFeedMetric(report, "rows") > 0
    || reportFeedMetric(report, "complete_food_rows") > 0
    || reportSqlRows(report) > 0
    || Number(report?.validation?.summary?.accepted_candidates || 0) > 0
    || Number(report?.summary?.accepted_candidates || 0) > 0
  );
}

function latestJsonFile(paths) {
  return paths
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => ({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
}

function latestReportFor(stats) {
  const candidates = latestJsonFile(reportPathsFor(stats))
    .map((candidate) => {
      const report = readJsonIfExists(candidate.filePath);
      return {
        ...candidate,
        report,
        sqlRows: reportSqlRows(report),
        feedRows: reportFeedMetric(report, "rows"),
        acceptedRows: Math.max(
          Number(report?.validation?.summary?.accepted_candidates || 0),
          Number(report?.summary?.accepted_candidates || 0)
        ),
      };
    })
    .sort((left, right) => (
      Number(reportHasLocalMetrics(right.report)) - Number(reportHasLocalMetrics(left.report))
      || right.sqlRows - left.sqlRows
      || right.acceptedRows - left.acceptedRows
      || right.feedRows - left.feedRows
      || right.mtimeMs - left.mtimeMs
    ));
  if (candidates.length === 0) return { report: null, path: "" };
  const latest = candidates[0];
  return { report: latest.report, path: latest.filePath };
}

function latestSqlManifestFor(stats) {
  const latest = latestJsonFile(sqlManifestPathsFor(stats))
    .map((candidate) => {
      const manifest = readJsonIfExists(candidate.filePath);
      return {
        ...candidate,
        manifest,
        totalSqlRows: Number(manifest?.total_sql_rows || 0),
      };
    })
    .sort((left, right) => right.totalSqlRows - left.totalSqlRows || right.mtimeMs - left.mtimeMs)[0];
  if (!latest) return { manifest: null, path: "" };
  return { manifest: latest.manifest, path: latest.filePath };
}

function reportFeedMetric(report, key) {
  return firstNumber(report?.feed?.[key], report?.[key]);
}

function reportSqlRows(report) {
  return firstNumber(
    report?.sql?.rows,
    report?.sql_rows,
    report?.sqlRows,
    report?.pack_rows && report?.sql_rows,
    numberFromText(report?.import_warnings, /SQL rows:\s*(\d+)/i),
    numberFromText(report?.import_output, /SQL rows:\s*(\d+)/i)
  );
}

function localReportStats(stats) {
  const { report, path: reportPath } = latestReportFor(stats);
  const { manifest, path: manifestPath } = latestSqlManifestFor(stats);
  if (!report) {
    const manifestSqlRows = Number(manifest?.total_sql_rows || 0);
    return {
      localReportPath: manifestPath,
      localGeneratedAt: manifest?.generated_at || "",
      localFeedRows: 0,
      localCompleteRows: 0,
      localIngredientRows: 0,
      localImageRows: 0,
      localSqlRows: manifestSqlRows,
      localRejectedRows: 0,
      localSkipSummary: "",
    };
  }

  const localFeedRows = reportFeedMetric(report, "rows");
  const localSqlRows = Math.max(reportSqlRows(report), Number(manifest?.total_sql_rows || 0));
  const localCompleteRows = reportFeedMetric(report, "complete_food_rows");
  const localSkipSummary = compact(
    report.import_warnings
      || (report.skipped_products ? `skipped_products=${report.skipped_products.length}` : "")
      || (report.warnings ? `warnings=${report.warnings.length}` : "")
  );

  return {
    localReportPath: reportPath,
    localGeneratedAt: report.generated_at || report.sql?.regenerated_at || "",
    localFeedRows,
    localCompleteRows,
    localIngredientRows: reportFeedMetric(report, "rows_with_ingredients"),
    localImageRows: reportFeedMetric(report, "rows_with_images"),
    localSqlRows,
    localRejectedRows: Math.max(localFeedRows - localSqlRows, 0),
    localSkipSummary,
  };
}

function liveGapStatsBySource() {
  const report = readJsonIfExists(LIVE_GAP_REPORT_PATH);
  const bySource = new Map();
  for (const row of report?.top || []) {
    const source = compact(row.source);
    if (source) bySource.set(source, row);
  }
  return bySource;
}

function runnableStatus(stats) {
  if (!stats.target) return "unassigned_source_target";
  if (stats.target.accessStatus && stats.target.accessStatus !== "runnable") {
    return stats.target.accessStatus;
  }
  if (!stats.sourceSlug) return "missing_source_slug";
  if (!stats.target.discovery) return "authorized_feed_or_shared_target_required";
  if (stats.sourcePriority === "retailer") return "retailer_terms_review_required";
  return "ready";
}

function nextActionFor(stats, localStats, liveGapStats) {
  const status = runnableStatus(stats);
  const demandProducts = stats.actionableAffectedProducts || stats.affectedProducts;
  if (liveGapStats?.strict_missing_source_urls > 0) return "import_missing_generated_sql";
  if (status === "requires_authorized_feed") return "request_or_load_authorized_feed";
  if (status === "requires_browser_snapshot") return "capture_allowed_browser_snapshot_or_feed";
  if (status === "blocked_by_source") return "seek_source_permission_or_alternate_official_feed";
  if (status === "discontinued") return "keep_excluded_or_mark_discontinued";
  if (status === "shared_catalog_source") return "map_to_shared_catalog_source";
  if (status === "unassigned_source_target") return "add_source_target_or_authorized_feed";
  if (status === "missing_source_slug") return "add_stable_source_slug";
  if (status === "authorized_feed_or_shared_target_required") return "define_discovery_or_authorized_feed";
  if (status === "retailer_terms_review_required") return "authorized_retailer_feed_required";
  if (!localStats.localReportPath) return "run_official_source_extraction";
  if (localStats.localSqlRows === 0) return "fix_extractor_or_add_authorized_feed";
  if (localStats.localCompleteRows > localStats.localSqlRows) return "review_rejected_verified_source_rows";
  if (demandProducts > Math.max(localStats.localSqlRows, 1) * 2) return "expand_discovery_or_authorized_feed_for_remaining_variants";
  return "official_source_current_acquire_feed_for_remaining_queue";
}

function scrapeAllCommand(stats, mode) {
  const source = sourceSlugFor(stats);
  return [
    "node scripts/catalog-scrape-all.mjs",
    `--mode ${mode}`,
    `--source ${source}`,
    "--limit 1",
  ].join(" ");
}

function importCommand(stats) {
  const sourceQuality = sourceQualityFor(stats.target);
  const source = sourceSlugFor(stats);
  const fileName = `outputs/catalog-feed-templates/${source}.csv`;
  const ingredientVerification = sourceQuality === "gdsn"
    ? "gdsn"
    : sourceQuality === "manufacturer"
      ? "manufacturer"
      : sourceQuality === "retailer_verified"
        ? "retailer_verified"
        : "official";
  const imageVerification = sourceQuality === "manufacturer"
    ? "manufacturer"
    : sourceQuality === "retailer_verified"
      ? "retailer_verified"
      : "official";

  return [
    "node scripts/catalog-official-feed-import.mjs",
    `--file ${fileName}`,
    `--source ${source}`,
    `--source-quality ${sourceQuality}`,
    `--ingredient-verification ${ingredientVerification}`,
    `--image-verification ${imageVerification}`,
  ].join(" ");
}

function urlDiscoveryCommand(stats) {
  const source = sourceSlugFor(stats);
  const urlListName = `outputs/catalog-url-lists/${source}.txt`;
  const targetUrl = stats.discoveryTargetUrl || stats.sourceTargetUrl || "<source_target_url>";

  return [
    "node scripts/catalog-source-url-discovery.mjs",
    `--target-url ${targetUrl}`,
    `> ${urlListName}`,
  ].join(" ");
}

function pageExtractCommand(stats) {
  const source = sourceSlugFor(stats);
  const urlListName = `outputs/catalog-url-lists/${source}.txt`;
  const fileName = `outputs/catalog-feed-templates/${source}.csv`;
  const brand = stats.sourceBrand && stats.sourceBrand !== "[unknown brand]"
    ? `--brand "${stats.sourceBrand.replace(/"/g, '\\"')}"`
    : "";

  return [
    "node scripts/catalog-page-feed-extract.mjs",
    `--file ${urlListName}`,
    brand,
    "--strict",
    `> ${fileName}`,
  ].filter(Boolean).join(" ");
}

function aggregateBySourceOwner(rows, sourceTargets) {
  const byOwner = new Map();

  for (const row of rows) {
    const brandKey = normalizedBrand(row.brand);
    const target = sourceTargets.get(brandKey);
    const sourceOwner = target?.sourceOwner || compact(row.source_owner) || "[unassigned]";
    const sourceBrand = target?.brand || compact(row.brand) || "[unknown brand]";
    const key = `${sourceOwner}::${target?.targetUrl || ""}`;
    const stats = byOwner.get(key) || {
      key,
      sourceOwner,
      sourceBrand,
      sourceSlug: target?.sourceSlug || compact(row.source_slug) || "",
      sourcePriority: target?.sourcePriority || compact(row.source_priority) || "",
      sourceTargetUrl: target?.targetUrl || "",
      discoveryTargetUrl: target?.discovery?.targetUrl || "",
      accessStatus: target?.accessStatus || compact(row.access_status) || "",
      coverageTier: target?.coverageTier || compact(row.coverage_tier) || "",
      target,
      brands: new Set(),
      openRows: 0,
      affectedProducts: 0,
      actionableRows: 0,
      actionableAffectedProducts: 0,
      brandRollupRows: 0,
      brandRollupAffectedProducts: 0,
      demandEvents: 0,
      maxPriority: 0,
      needsVerifiedIngredients: false,
      needsVerifiedImage: false,
      needsPetType: false,
      speciesExplicitRows: 0,
      speciesAmbiguousRows: 0,
      currentSources: new Set(),
      templateRows: [],
    };

    if (row.brand) stats.brands.add(row.brand);
    const affectedProductCount = Number(row.affected_product_count || 0);
    if (row.__action_plan_rollup) {
      stats.brandRollupRows += Number(row.brand_rollup_rows || 0);
      stats.brandRollupAffectedProducts += Number(row.brand_rollup_affected_products || 0);
      stats.actionableRows += Number(row.actionable_open_rows || 0);
      stats.actionableAffectedProducts += Number(row.actionable_affected_products || 0);
      stats.openRows += Number(row.open_rows || 0);
      stats.affectedProducts += affectedProductCount;
    } else if (row.gap_type === "brand") {
      stats.brandRollupRows += 1;
      stats.brandRollupAffectedProducts += affectedProductCount;
      stats.openRows += 1;
      stats.affectedProducts += affectedProductCount;
    } else {
      stats.actionableRows += 1;
      stats.actionableAffectedProducts += affectedProductCount;
      stats.openRows += 1;
      stats.affectedProducts += affectedProductCount;
    }
    stats.demandEvents += Number(row.demand_events || 0);
    stats.maxPriority = Math.max(stats.maxPriority, Number(row.priority_score || 0));
    stats.needsVerifiedIngredients ||= Boolean(row.needs_verified_ingredients);
    stats.needsVerifiedImage ||= Boolean(row.needs_verified_image);
    stats.needsPetType ||= Boolean(row.needs_pet_type);
    const productNameText = compact(row.product_name);
    const petTypeText = compact(row.pet_type).toLowerCase();
    const hasDogSignal = petTypeText === "dog" || /\b(dog|dogs|puppy|puppies|canine)\b/i.test(productNameText);
    const hasCatSignal = petTypeText === "cat" || /\b(cat|cats|kitten|kittens|feline)\b/i.test(productNameText);
    if (hasDogSignal !== hasCatSignal) stats.speciesExplicitRows += 1;
    else stats.speciesAmbiguousRows += 1;

    if (row.gap_type !== "brand" && productNameText && stats.templateRows.length < DEFAULT_TEMPLATE_SAMPLE_LIMIT) {
      stats.templateRows.push({
        product_name: productNameText,
        brand: compact(row.brand),
        pet_type: hasDogSignal && !hasCatSignal ? "dog" : hasCatSignal && !hasDogSignal ? "cat" : compact(row.pet_type),
        is_complete_food: "true",
      });
    }

    const sources = row.sample_metadata?.sources;
    if (Array.isArray(sources)) {
      for (const source of sources.map(compact).filter(Boolean)) stats.currentSources.add(source);
    }

    byOwner.set(key, stats);
  }

  return [...byOwner.values()].sort((left, right) => (
    right.actionableAffectedProducts - left.actionableAffectedProducts
    || right.affectedProducts - left.affectedProducts
    || right.maxPriority - left.maxPriority
    || left.sourceOwner.localeCompare(right.sourceOwner)
  ));
}

function formattedRows(rows) {
  const liveGaps = liveGapStatsBySource();
  return rows.map((stats, index) => {
    const sourceSlug = sourceSlugFor(stats);
    const localStats = localReportStats(stats);
    const liveGap = liveGaps.get(sourceSlug);

    return {
      priorityRank: index + 1,
      coverageTier: stats.coverageTier,
      sourceOwner: stats.sourceOwner,
      sourceSlug,
      sourcePriority: stats.sourcePriority,
      runnableStatus: runnableStatus(stats),
      recommendedNextAction: nextActionFor(stats, localStats, liveGap),
      accessStatus: stats.accessStatus,
      sourceTargetUrl: stats.sourceTargetUrl,
      discoveryTargetUrl: stats.discoveryTargetUrl,
      brands: [...stats.brands].sort().join("; "),
      need: needLabel(stats),
      actionableAffectedProducts: stats.actionableAffectedProducts,
      actionableRows: stats.actionableRows,
      brandRollupAffectedProducts: stats.brandRollupAffectedProducts,
      brandRollupRows: stats.brandRollupRows,
      affectedProducts: stats.affectedProducts,
      openRows: stats.openRows,
      demandEvents: stats.demandEvents,
      maxPriority: stats.maxPriority,
      speciesExplicitRows: stats.speciesExplicitRows,
      speciesAmbiguousRows: stats.speciesAmbiguousRows,
      currentSources: [...stats.currentSources].sort().join("; "),
      localReportPath: localStats.localReportPath,
      localGeneratedAt: localStats.localGeneratedAt,
      localFeedRows: localStats.localFeedRows,
      localCompleteRows: localStats.localCompleteRows,
      localIngredientRows: localStats.localIngredientRows,
      localImageRows: localStats.localImageRows,
      localSqlRows: localStats.localSqlRows,
      localRejectedRows: localStats.localRejectedRows,
      liveGeneratedMissingUrls: liveGap?.strict_missing_source_urls || 0,
      localSkipSummary: localStats.localSkipSummary,
      sampleProducts: stats.templateRows.map((templateRow) => templateRow.product_name).filter(Boolean).slice(0, 5).join("; "),
      templateRows: stats.templateRows,
      proofRequired: "product_url/evidence URL, exact ingredient statement, verified image URL, pet_type dog/cat, complete-food flag",
      templateHeaders: TEMPLATE_HEADERS.join("|"),
      scrapeExtractCommand: scrapeAllCommand(stats, "extract"),
      scrapeValidateCommand: scrapeAllCommand(stats, "validate"),
      scrapeImportCommand: scrapeAllCommand(stats, "import"),
      urlDiscoveryCommand: urlDiscoveryCommand(stats),
      pageExtractCommand: pageExtractCommand(stats),
      importCommand: importCommand(stats),
    };
  });
}

function printCsv(rows) {
  const columns = SOURCE_WORKLIST_COLUMNS;
  console.log(columns.join(","));
  for (const row of rows) {
    console.log(columns.map((column) => csvEscape(row[column])).join(","));
  }
}

function printReport(rows) {
  console.log("Catalog source feed worklist");
  console.log(`Source owners: ${rows.length}`);
  console.log("\nTop source owners:");
  console.table(rows.slice(0, 20).map((row) => ({
    rank: row.priorityRank,
    owner: row.sourceOwner,
    source: row.sourceSlug,
    status: row.runnableStatus,
    action: row.recommendedNextAction,
    tier: row.coverageTier,
    affectedProducts: row.affectedProducts,
    actionableAffectedProducts: row.actionableAffectedProducts,
    brandRollupAffectedProducts: row.brandRollupAffectedProducts,
    openRows: row.openRows,
    localSqlRows: row.localSqlRows,
    localRejectedRows: row.localRejectedRows,
    liveMissingUrls: row.liveGeneratedMissingUrls,
    speciesExplicitRows: row.speciesExplicitRows,
    speciesAmbiguousRows: row.speciesAmbiguousRows,
    need: row.need,
    url: row.sourceTargetUrl,
  })));
}

function printEvidenceCsv(rows) {
  const columns = EVIDENCE_WORKLIST_COLUMNS;
  console.log(columns.join(","));
  for (const row of rows) {
    console.log(columns.map((column) => csvEscape(Array.isArray(row[column]) ? row[column].join("; ") : row[column])).join(","));
  }
}

function printEvidenceReport(rows) {
  console.log("Catalog product evidence gap worklist");
  console.log(`Brand/source groups: ${rows.length}`);
  console.log("\nTop product evidence gaps:");
  console.table(rows.slice(0, 25).map((row) => ({
    action: row.action,
    source: row.source,
    brand: row.brand,
    rows: row.rows,
    sourceSlug: row.sourceSlug,
    status: row.accessStatus,
    rowsWithText: row.rowsWithIngredientText,
    rowsWithImage: row.rowsWithImage,
    samples: row.sampleProducts.join("; "),
  })));
}

function writeTemplates(rows, templateDir, { sampleLimit = DEFAULT_TEMPLATE_SAMPLE_LIMIT } = {}) {
  if (!templateDir) return;
  fs.mkdirSync(templateDir, { recursive: true });

  for (const row of rows) {
    const filePath = path.join(templateDir, `${slug(row.sourceSlug || row.sourceOwner)}.csv`);
    const templateRows = Array.isArray(row.templateRows)
      ? row.templateRows.slice(0, sampleLimit)
      : [];
    const lines = [
      TEMPLATE_HEADERS.join(","),
      ...(templateRows.length > 0
        ? templateRows.map((templateRow) => csvLineFromObject(templateRow, TEMPLATE_HEADERS))
        : [TEMPLATE_HEADERS.map(() => "").join(",")]),
    ];
    fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
  }
}

function csvValue(row, column) {
  const value = row?.[column];
  return Array.isArray(value) ? value.join("; ") : value;
}

function writeCsvFile(rows, filePath, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(csvValue(row, column))).join(",")),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function sourceMarkdown(rows, summary) {
  return [
    "# Catalog Source Feed Worklist",
    "",
    `Generated at: ${summary.generated_at}`,
    `Queue source: ${summary.queue_source}`,
    `Source owners: ${summary.row_count}`,
    "",
    "## Recommended Actions",
    "",
    ...Object.entries(summary.recommended_action_counts).map(([action, count]) => `- ${action}: ${count}`),
    "",
    "## Top Sources",
    "",
    "| Rank | Source | Action | Affected | Actionable | Local SQL | Rejected | Need |",
    "|---:|---|---|---:|---:|---:|---:|---|",
    ...rows.slice(0, 40).map((row) => `| ${row.priorityRank} | ${row.sourceSlug} | ${row.recommendedNextAction} | ${row.affectedProducts} | ${row.actionableAffectedProducts} | ${row.localSqlRows} | ${row.localRejectedRows} | ${String(row.need || "").replace(/\|/g, "\\|")} |`),
    "",
  ].join("\n");
}

function evidenceMarkdown(rows, summary) {
  return [
    "# Catalog Product Evidence Gap Worklist",
    "",
    `Generated at: ${summary.generated_at}`,
    `Groups: ${summary.row_count}`,
    "",
    "## Actions",
    "",
    ...Object.entries(summary.action_counts).map(([action, count]) => `- ${action}: ${count}`),
    "",
    "## Top Evidence Gaps",
    "",
    "| Source | Brand | Action | Rows | Text | Image | URL |",
    "|---|---|---|---:|---:|---:|---:|",
    ...rows.slice(0, 40).map((row) => `| ${row.sourceSlug} | ${String(row.brand || "").replace(/\|/g, "\\|")} | ${row.action} | ${row.rows} | ${row.rowsWithIngredientText} | ${row.rowsWithImage} | ${row.rowsWithSourceUrl} |`),
    "",
  ].join("\n");
}

function countBy(rows, field) {
  return rows.reduce((map, row) => {
    const key = compact(row[field]) || "unknown";
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});
}

function writeSourceWorklistOutputs(rows, outputDir, queueSource) {
  if (!outputDir) return null;
  fs.mkdirSync(outputDir, { recursive: true });
  const summary = {
    generated_at: new Date().toISOString(),
    type: "source_feed_worklist",
    queue_source: queueSource,
    row_count: rows.length,
    recommended_action_counts: countBy(rows, "recommendedNextAction"),
    output_dir: outputDir,
    templates_dir: path.join(outputDir, "templates"),
  };
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "worklist.json"), `${JSON.stringify({ ...summary, rows }, null, 2)}\n`, "utf8");
  writeCsvFile(rows, path.join(outputDir, "worklist.csv"), SOURCE_WORKLIST_COLUMNS);
  fs.writeFileSync(path.join(outputDir, "worklist.md"), `${sourceMarkdown(rows, summary)}\n`, "utf8");
  return summary;
}

function writeEvidenceWorklistOutputs(rows, outputDir) {
  if (!outputDir) return null;
  fs.mkdirSync(outputDir, { recursive: true });
  const summary = {
    generated_at: new Date().toISOString(),
    type: "product_evidence_gap_worklist",
    row_count: rows.length,
    action_counts: countBy(rows, "action"),
    output_dir: outputDir,
    templates_dir: path.join(outputDir, "templates"),
  };
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "worklist.json"), `${JSON.stringify({ ...summary, rows }, null, 2)}\n`, "utf8");
  writeCsvFile(rows, path.join(outputDir, "worklist.csv"), EVIDENCE_WORKLIST_COLUMNS);
  fs.writeFileSync(path.join(outputDir, "worklist.md"), `${evidenceMarkdown(rows, summary)}\n`, "utf8");
  return summary;
}

async function main() {
  const limit = positiveInteger(getArg("--limit"), DEFAULT_LIMIT);
  const csv = hasArg("--csv");
  const json = hasArg("--json");
  const evidenceGaps = hasArg("--evidence-gaps");
  const outputDir = getArg("--output-dir", DEFAULT_OUTPUT_DIR);
  const templateDir = getArg("--template-dir", path.join(outputDir, "templates"));
  const templateSampleLimit = positiveInteger(getArg("--template-sample-limit"), DEFAULT_TEMPLATE_SAMPLE_LIMIT);
  const fixtureQueueJson = getArg("--fixture-queue-json");
  const fixtureEvidenceJson = getArg("--fixture-evidence-json");
  const actionPlanPath = getArg("--action-plan", DEFAULT_ACTION_PLAN);
  const client = clientFromEnv();
  const { byBrand } = loadSourceTargets();

  if (!client && !fixtureQueueJson && !(evidenceGaps && fixtureEvidenceJson)) {
    console.log("Missing SUPABASE_URL and a read key (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY).");
    console.log("Use this SQL instead:\n");
    console.log(fallbackSql({ limit }));
    return;
  }

  if (evidenceGaps) {
    const actionFilters = new Set(getArgs("--action").map(compact).filter(Boolean));
    let productRows;
    let allRows;
    if (fixtureEvidenceJson) {
      productRows = readFixtureRows(fixtureEvidenceJson, "evidence gap");
      allRows = aggregateEvidenceRows(productEvidenceRows(productRows, byBrand));
    } else if (serviceRoleKey()) {
      try {
        const summary = await fetchProductEvidenceGapSummary(client, { limit: Math.max(limit, 25) });
        allRows = evidenceRowsFromSummary(summary, byBrand);
      } catch (error) {
        if (!hasArg("--allow-client-evidence-scan")) {
          console.log("Product evidence gap worklist skipped because catalog_product_evidence_gap_summary is not available.");
          console.log("Apply supabase/migrations/220_catalog_product_evidence_gap_summary.sql, or rerun with --allow-client-evidence-scan for the legacy paged scan.");
          if (json) console.error(error.message || error);
          return;
        }
      }
    } else if (!hasArg("--allow-client-evidence-scan")) {
      console.log("Product evidence gap worklist requires SUPABASE_SERVICE_ROLE_KEY for the timeout-safe live summary.");
      console.log("Rerun with --allow-client-evidence-scan to use the legacy paged scan with the configured read key.");
      return;
    }

    if (!allRows) {
      try {
        productRows = await fetchProductEvidenceGapRows(client);
        allRows = aggregateEvidenceRows(productEvidenceRows(productRows, byBrand));
      } catch (error) {
        console.log("Product evidence gap worklist skipped because product_data is not readable with the configured key.");
        if (json) console.error(error.message || error);
        return;
      }
    }

    const rows = allRows
      .filter((row) => actionFilters.size === 0 || actionFilters.has(row.action))
      .slice(0, limit);
    writeTemplates(rows, templateDir, { sampleLimit: templateSampleLimit });
    const summary = writeEvidenceWorklistOutputs(rows, outputDir);
    if (json) {
      console.log(JSON.stringify(rows, null, 2));
    } else if (csv) {
      printEvidenceCsv(rows);
    } else {
      printEvidenceReport(rows);
      if (summary) console.log(`\nWorklist: ${path.join(outputDir, "worklist.json")}`);
      if (templateDir) console.log(`\nWrote templates to ${templateDir}`);
    }
    return;
  }

  let queueRows;
  let queueSource = "live_supabase_catalog_acquisition_queue";
  let liveQueueFallbackReason = "";
  if (fixtureQueueJson) {
    queueRows = readFixtureRows(fixtureQueueJson, "queue");
    queueSource = "fixture_queue_json";
  } else {
    try {
      queueRows = await fetchOpenQueueRows(client);
    } catch (error) {
      queueRows = actionPlanRows(actionPlanPath);
      queueSource = "saved_action_plan";
      liveQueueFallbackReason = error.message || String(error);
      if (queueRows.length === 0) {
        console.log("Live queue worklist skipped because catalog_acquisition_queue is not readable with the configured key.");
        console.log("No saved action-plan rows were available.");
        console.log("Set SUPABASE_SERVICE_ROLE_KEY for a live prioritized worklist, or run this SQL in Supabase:\n");
        console.log(fallbackSql({ limit }));
        if (json) {
          console.error(error.message || error);
        }
        return;
      }
    }
  }
  const rows = formattedRows(aggregateBySourceOwner(queueRows, byBrand))
    .map((row) => ({ ...row, queueSource }))
    .slice(0, limit);
  writeTemplates(rows, templateDir, { sampleLimit: templateSampleLimit });
  const summary = writeSourceWorklistOutputs(rows, outputDir, queueSource);

  if (json) {
    console.log(JSON.stringify(rows, null, 2));
  } else if (csv) {
    printCsv(rows);
  } else {
    printReport(rows);
    if (queueSource === "saved_action_plan") {
      console.log("\nSet SUPABASE_SERVICE_ROLE_KEY for a live prioritized worklist.");
      console.log(`Saved action-plan fallback used because catalog_acquisition_queue was not readable with the configured key${liveQueueFallbackReason ? `: ${compact(liveQueueFallbackReason)}` : "."}`);
      console.log("Fallback SQL for Supabase SQL Editor:\n");
      console.log(fallbackSql({ limit }));
    }
    console.log(`\nQueue source: ${queueSource}`);
    if (summary) console.log(`\nWorklist: ${path.join(outputDir, "worklist.json")}`);
    if (templateDir) console.log(`\nWrote templates to ${templateDir}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
