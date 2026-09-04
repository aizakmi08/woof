import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SOURCE_TARGETS_PATH = "scripts/catalog-source-targets.json";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-us-market-coverage-dashboard/current";
const DEFAULT_IMPORT_ROOT = "outputs/catalog-source-imports";
const DEFAULT_ACTION_PLAN = "outputs/catalog-live-gap-action-plan/current/action-plan.json";
const DEFAULT_REJECTED_WORKLIST = "outputs/catalog-rejected-candidate-worklist/current/worklist.json";
const DEFAULT_REPAIR_SUMMARY = "outputs/catalog-evidence-repair-imports/summary.json";
const DEFAULT_PENDING_IMPORT_DELTA = "outputs/catalog-pending-import-delta/current/manifest.json";
const DEFAULT_VERIFIED_READY_GOAL = 12000;
const PAGE_SIZE = 1000;
const ACTION_PLAN_STALE_HOURS = 24;
const LIVE_ACTION_PLAN_GAP_SOURCE = "live_supabase_catalog_acquisition_queue";
const VERIFIED_SOURCE_QUALITIES = new Set(["gdsn", "official", "manufacturer", "retailer_verified"]);
const VERIFIED_INGREDIENT_STATUSES = new Set(["gdsn", "official", "manufacturer", "retailer_verified", "label_ocr_verified"]);
const VERIFIED_IMAGE_STATUSES = new Set(["official", "manufacturer", "retailer_verified"]);
const BROAD_SOURCE_PREFIXES = new Set([
  "amazon",
  "chewy",
  "kroger",
  "mars-petcare",
  "nestle-purina",
  "petsmart",
  "purina",
  "target",
  "walmart",
]);
const SOURCE_RUN_SUFFIX_PATTERN = /^(?:\d|api|consolidated|debug|expanded|focused|inline|label-pdf|multimode|one-row|page\d|probe|products-json|refresh|repair|salsify|test|v\d|window)(?:-|$)/;

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function normalizeKey(value) {
  return compact(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sourceSlugFor(target = {}) {
  return normalizeKey(target.sourceSlug || target.sourceOwner || target.brand || "catalog-source");
}

function targetAccessStatus(target = {}) {
  return target.accessStatus || (target.discovery ? "runnable" : "requires_authorized_feed");
}

function sourceAliasesFor(target = {}) {
  return [
    sourceSlugFor(target),
    ...(Array.isArray(target.outputAliases) ? target.outputAliases : []),
  ].map(normalizeKey).filter(Boolean);
}

function sourceOutputDirMatchesAlias(source, alias) {
  const key = normalizeKey(source);
  return Boolean(key && alias) && (
    key === alias
    || (
      !BROAD_SOURCE_PREFIXES.has(alias)
      && key.startsWith(`${alias}-`)
      && SOURCE_RUN_SUFFIX_PATTERN.test(key.slice(alias.length + 1))
    )
  );
}

function sourceOutputDirsFor(importRoot, target) {
  const aliases = sourceAliasesFor(target);
  const dirs = new Map();
  for (const alias of aliases) {
    const dir = path.join(importRoot, alias);
    if (fs.existsSync(dir)) dirs.set(alias, dir);
  }
  if (!fs.existsSync(importRoot)) return [...dirs.values()];
  for (const entry of fs.readdirSync(importRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const source = normalizeKey(entry.name);
    if (!aliases.some((alias) => sourceOutputDirMatchesAlias(source, alias))) continue;
    dirs.set(source, path.join(importRoot, entry.name));
  }
  return [...dirs.values()].sort();
}

function brandAliasesFor(target = {}) {
  return [
    target.brand,
    ...(Array.isArray(target.aliases) ? target.aliases : []),
  ].map(normalizeKey).filter(Boolean);
}

function sharedSourceAliasesFor(target = {}) {
  return [
    target.sharedSourceSlug,
    ...(Array.isArray(target.sharedSourceAliases) ? target.sharedSourceAliases : []),
  ].map(normalizeKey).filter(Boolean);
}

function readJsonIfExists(filePath, fallback = null) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvLine(row, headers) {
  return headers.map((header) => csvEscape(row?.[header] ?? "")).join(",");
}

function writeCsv(rows, filePath, headers) {
  fs.writeFileSync(filePath, `${[headers.join(","), ...rows.map((row) => csvLine(row, headers))].join("\n")}\n`, "utf8");
}

function loadTargets(filePath) {
  const targets = readJsonIfExists(filePath, []);
  const bySource = new Map();
  const byBrand = new Map();

  for (const target of targets) {
    const normalized = {
      ...target,
      sourceSlug: sourceSlugFor(target),
      accessStatus: targetAccessStatus(target),
    };
    for (const sourceKey of sourceAliasesFor(normalized)) bySource.set(sourceKey, normalized);
    for (const brandKey of brandAliasesFor(normalized)) {
      if (!byBrand.has(brandKey)) byBrand.set(brandKey, normalized);
    }
  }

  return { rows: targets.map((target) => ({ ...target, sourceSlug: sourceSlugFor(target), accessStatus: targetAccessStatus(target) })), bySource, byBrand };
}

function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}

function readOnlyKey() {
  return serviceRoleKey() || process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
}

function supabaseClient() {
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

async function fetchProductRowsFromSupabase() {
  const client = supabaseClient();
  if (!client) return { rows: [], source: "missing_supabase_env", live: false };
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from("product_data")
      .select([
        "cache_key",
        "gtin",
        "product_name",
        "brand",
        "source",
        "source_quality",
        "source_url",
        "pet_type",
        "image_url",
        "ingredient_text",
        "ingredient_count",
        "ingredient_verification_status",
        "image_verification_status",
        "verified_at",
        "expires_at",
        "is_complete_food",
        "catalog_exclusion_reason",
      ].join(","))
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { rows, source: "live_supabase_product_data", live: true };
}

function loadProductRows(options) {
  if (!options.catalogSnapshotPath) return null;
  const parsed = readJsonIfExists(options.catalogSnapshotPath, []);
  if (Array.isArray(parsed)) return { rows: parsed, source: options.catalogSnapshotPath, live: false };
  if (Array.isArray(parsed.rows)) return { rows: parsed.rows, source: options.catalogSnapshotPath, live: false };
  if (Array.isArray(parsed.products)) return { rows: parsed.products, source: options.catalogSnapshotPath, live: false };
  return { rows: [], source: options.catalogSnapshotPath, live: false };
}

function hasSourceEvidence(row = {}) {
  return Boolean(compact(row.source_url || row.product_url || row.url));
}

function hasIngredientText(row = {}) {
  return Boolean(compact(row.ingredient_text || row.ingredient_statement || row.ingredients_text));
}

function hasFrontImage(row = {}) {
  const imageUrl = compact(row.image_url || row.front_image_url || row.product_image_url);
  return Boolean(imageUrl) && !/^data:/i.test(imageUrl);
}

function isCurrentCompleteDogCatFood(row = {}) {
  if (row.pet_type !== "dog" && row.pet_type !== "cat") return false;
  if (row.is_complete_food === false) return false;
  if (compact(row.catalog_exclusion_reason)) return false;
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) return false;
  return true;
}

function isVerifiedReady(row = {}) {
  return (
    isCurrentCompleteDogCatFood(row)
    && numeric(row.ingredient_count) >= 5
    && hasIngredientText(row)
    && hasSourceEvidence(row)
    && hasFrontImage(row)
    && VERIFIED_SOURCE_QUALITIES.has(compact(row.source_quality || "manufacturer").toLowerCase())
    && VERIFIED_INGREDIENT_STATUSES.has(compact(row.ingredient_verification_status).toLowerCase())
    && VERIFIED_IMAGE_STATUSES.has(compact(row.image_verification_status).toLowerCase())
  );
}

function targetForProduct(row, targets) {
  const sourceKey = normalizeKey(row.source);
  const brandTarget = targets.byBrand.get(normalizeKey(row.brand));
  if (
    brandTarget?.accessStatus === "shared_catalog_source"
    && sharedSourceAliasesFor(brandTarget).includes(sourceKey)
  ) {
    return brandTarget;
  }
  return targets.bySource.get(sourceKey) || brandTarget || null;
}

function emptyProductStats() {
  return {
    total_rows: 0,
    dog_cat_rows: 0,
    verified_ready_rows: 0,
    dog_verified_ready_rows: 0,
    cat_verified_ready_rows: 0,
    needs_verified_ingredients_rows: 0,
    needs_verified_image_rows: 0,
    excluded_rows: 0,
    stale_rows: 0,
    latest_verified_at: "",
  };
}

function accumulateProductStats(stats, row) {
  stats.total_rows += 1;
  if (row.pet_type === "dog" || row.pet_type === "cat") stats.dog_cat_rows += 1;
  if (row.is_complete_food === false || compact(row.catalog_exclusion_reason)) stats.excluded_rows += 1;
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) stats.stale_rows += 1;

  const current = isCurrentCompleteDogCatFood(row);
  const verifiedReady = isVerifiedReady(row);
  if (verifiedReady) {
    stats.verified_ready_rows += 1;
    if (row.pet_type === "dog") stats.dog_verified_ready_rows += 1;
    if (row.pet_type === "cat") stats.cat_verified_ready_rows += 1;
  }
  if (current && (!hasIngredientText(row) || !VERIFIED_INGREDIENT_STATUSES.has(compact(row.ingredient_verification_status).toLowerCase()))) {
    stats.needs_verified_ingredients_rows += 1;
  }
  if (current && (!hasFrontImage(row) || !VERIFIED_IMAGE_STATUSES.has(compact(row.image_verification_status).toLowerCase()))) {
    stats.needs_verified_image_rows += 1;
  }
  if (row.verified_at && (!stats.latest_verified_at || row.verified_at > stats.latest_verified_at)) {
    stats.latest_verified_at = row.verified_at;
  }
}

function productStatsByTarget(productRows, targets) {
  const bySource = new Map();
  const unmapped = emptyProductStats();

  for (const row of productRows) {
    const target = targetForProduct(row, targets);
    const key = target ? target.sourceSlug : "unmapped";
    const stats = bySource.get(key) || emptyProductStats();
    accumulateProductStats(stats, row);
    bySource.set(key, stats);
    if (!target) accumulateProductStats(unmapped, row);
  }

  return { bySource, unmapped };
}

function loadActionPlan(filePath) {
  const payload = readJsonIfExists(filePath, {});
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const bySource = new Map();
  const byBrand = new Map();
  for (const row of rows) {
    if (compact(row.source_slug)) bySource.set(normalizeKey(row.source_slug), row);
    if (compact(row.brand)) byBrand.set(normalizeKey(row.brand), row);
  }
  return { path: filePath, payload, rows, bySource, byBrand };
}

function hoursSince(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Number(((Date.now() - timestamp) / (60 * 60 * 1000)).toFixed(2));
}

function actionPlanStatus(actionPlan, { productSourceLive } = {}) {
  const generatedAt = compact(actionPlan.payload?.generated_at);
  const gapSource = compact(actionPlan.payload?.gap_source);
  const gapExportedAt = compact(actionPlan.payload?.gap_exported_at);
  const gapRowScope = compact(actionPlan.payload?.gap_row_scope);
  const freshnessTimestamp = gapExportedAt || generatedAt;
  const ageHours = freshnessTimestamp ? hoursSince(freshnessTimestamp) : null;
  const partialTopScope = /^top_[0-9]+_brands$/.test(gapRowScope);
  const knownFullScope = ["all", "all_brands", "target_brands"].includes(gapRowScope);
  const refreshWarnings = [];
  const scopeWarnings = [];

  if (actionPlan.rows.length === 0) refreshWarnings.push("action_plan_missing_or_empty");
  if (!generatedAt) refreshWarnings.push("action_plan_missing_generated_at");
  if (gapSource === LIVE_ACTION_PLAN_GAP_SOURCE && !gapExportedAt) refreshWarnings.push("action_plan_missing_gap_exported_at");
  if (gapSource === LIVE_ACTION_PLAN_GAP_SOURCE && partialTopScope) {
    scopeWarnings.push("action_plan_gap_row_scope_partial");
  } else if (gapSource === LIVE_ACTION_PLAN_GAP_SOURCE && !knownFullScope) {
    scopeWarnings.push("action_plan_gap_row_scope_unknown");
  }
  if (ageHours !== null && ageHours > ACTION_PLAN_STALE_HOURS) refreshWarnings.push("action_plan_stale");
  if (!gapSource) {
    refreshWarnings.push("action_plan_gap_source_unknown");
  } else if (productSourceLive && gapSource !== LIVE_ACTION_PLAN_GAP_SOURCE) {
    refreshWarnings.push("action_plan_gap_source_snapshot");
  }
  const warnings = refreshWarnings.concat(scopeWarnings);

  return {
    path: actionPlan.path,
    generated_at: generatedAt,
    gap_source: gapSource,
    gap_exported_at: gapExportedAt,
    gap_row_scope: gapRowScope,
    age_hours: ageHours,
    live_gap_source: gapSource === LIVE_ACTION_PLAN_GAP_SOURCE,
    stale_after_hours: ACTION_PLAN_STALE_HOURS,
    freshness: refreshWarnings.length > 0 ? "needs_refresh" : "fresh",
    warnings,
    refresh_warnings: refreshWarnings,
    scope_warnings: scopeWarnings,
  };
}

function actionPlanRowForTarget(target, actionPlan) {
  return (
    actionPlan.bySource.get(normalizeKey(target.sourceSlug))
    || actionPlan.byBrand.get(normalizeKey(target.brand))
    || null
  );
}

function rejectedRowsBySource(filePath) {
  const payload = readJsonIfExists(filePath, {});
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const bySource = new Map();
  for (const row of rows) {
    const source = normalizeKey(row.source);
    if (!source) continue;
    const stats = bySource.get(source) || {
      rows: 0,
      repair_rows: 0,
      excluded_rows: 0,
      official_source_text_failed_validation: 0,
      official_label_ocr_failed_validation: 0,
    };
    stats.rows += 1;
    const excluded = compact(row.repair_type).startsWith("exclude_");
    if (excluded) {
      stats.excluded_rows += 1;
    } else {
      stats.repair_rows += 1;
      const issue = compact(row.evidence_issue);
      if (Object.hasOwn(stats, issue)) stats[issue] += 1;
    }
    bySource.set(source, stats);
  }
  return { payload, rows, bySource };
}

function repairSummaryBySource(filePath) {
  const payload = readJsonIfExists(filePath, {});
  const bySource = new Map();
  for (const report of payload.reports || []) {
    const source = normalizeKey(report.source);
    if (!source) continue;
    const stats = bySource.get(source) || { input_rows: 0, accepted_rows: 0, sql_rows: 0, failed_count: 0 };
    stats.input_rows += numeric(report.input_rows);
    stats.accepted_rows += numeric(report.accepted_rows);
    stats.sql_rows += numeric(report.sql_rows);
    if (report.status !== "succeeded") stats.failed_count += 1;
    bySource.set(source, stats);
  }
  return { payload, bySource };
}

function hasLocalExtraction(importRoot, target) {
  for (const dir of sourceOutputDirsFor(importRoot, target)) {
    if (
      fs.existsSync(path.join(dir, "report.json"))
      || fs.existsSync(path.join(dir, "run-report.json"))
      || fs.existsSync(path.join(dir, "sql", "manifest.json"))
    ) {
      return true;
    }
  }
  return false;
}

function fileMtimeMs(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return 0;
  return fs.statSync(filePath).mtimeMs;
}

function timestampMs(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function newestManifest(candidates) {
  return candidates
    .filter(Boolean)
    .map((filePath) => {
      const manifest = readJsonIfExists(filePath, {});
      return {
        filePath,
        manifest,
        timestamp: timestampMs(manifest.generated_at) || fileMtimeMs(filePath),
      };
    })
    .sort((left, right) => right.timestamp - left.timestamp)[0] || null;
}

function decodeSqlPayloadRows(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8");
  const marker = "decode('";
  const start = text.indexOf(marker);
  if (start === -1) return [];
  const payloadStart = start + marker.length;
  const payloadEnd = text.indexOf("'", payloadStart);
  if (payloadEnd === -1) return [];
  const decoded = Buffer.from(text.slice(payloadStart, payloadEnd), "base64").toString("utf8");
  const rows = JSON.parse(decoded);
  return Array.isArray(rows) ? rows : [];
}

function sourceGtinKey(source, gtin) {
  const normalizedSource = normalizeKey(source);
  const normalizedGtin = compact(gtin).replace(/\D+/g, "");
  return normalizedSource && normalizedGtin ? `${normalizedSource}:${normalizedGtin}` : "";
}

function sourceUrlKey(sourceUrl) {
  return compact(sourceUrl).toLowerCase().replace(/\/+$/g, "");
}

function manifestPayloadRows(sqlManifest = {}) {
  const chunks = Array.isArray(sqlManifest.chunks) ? sqlManifest.chunks : [];
  const rows = [];
  for (const chunk of chunks) {
    rows.push(...decodeSqlPayloadRows(chunk.file));
  }
  return rows;
}

function manifestRowKey(row = {}) {
  return (
    compact(row.cache_key)
    || sourceGtinKey(row.source, row.gtin)
    || sourceUrlKey(row.source_url)
    || [
      normalizeKey(row.source),
      normalizeKey(row.brand),
      normalizeKey(row.product_name),
      normalizeKey(row.package_size),
      normalizeKey(row.pet_type),
    ].filter(Boolean).join("|")
  );
}

function dedupeManifestRows(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = manifestRowKey(row);
    if (!key) continue;
    byKey.set(key, row);
  }
  return [...byKey.values()];
}

function reportAcceptedCandidates(report = {}) {
  return (
    numeric(report.validation?.summary?.accepted_candidates)
    || numeric(report.validation_summary?.accepted_candidates)
    || numeric(report.summary?.accepted_candidates)
    || numeric(report.accepted_candidates)
    || numeric(report.accepted_rows)
  );
}

function reportRejectedCandidates(report = {}) {
  return (
    numeric(report.validation?.summary?.rejected_candidates)
    || numeric(report.validation_summary?.rejected_candidates)
    || numeric(report.summary?.rejected_candidates)
    || numeric(report.rejected_candidates)
    || numeric(report.rejected_rows)
  );
}

function localImportState(importRoot, target, stats = {}, liveVerified = {}) {
  const reportPaths = [];
  const manifestPaths = [];

  for (const dir of sourceOutputDirsFor(importRoot, target)) {
    for (const file of ["report.json", "run-report.json"]) {
      const filePath = path.join(dir, file);
      if (fs.existsSync(filePath)) reportPaths.push(filePath);
    }
    for (const dirName of ["sql", "sql-mcp"]) {
      const filePath = path.join(dir, dirName, "manifest.json");
      if (fs.existsSync(filePath)) manifestPaths.push(filePath);
    }
  }

  const reports = reportPaths.map((reportPath) => readJsonIfExists(reportPath, {}));
  const selectedManifest = newestManifest(manifestPaths);
  const manifestEntries = manifestPaths
    .map((filePath) => ({
      filePath,
      manifest: readJsonIfExists(filePath, {}),
    }))
    .filter((entry) => numeric(entry.manifest?.total_sql_rows) > 0);
  const manifestRows = dedupeManifestRows(manifestEntries.flatMap((entry) => manifestPayloadRows(entry.manifest)));
  const generatedSqlRows = manifestRows.length;
  const manifestCacheKeys = Array.from(new Set(manifestRows.map((row) => compact(row.cache_key)).filter(Boolean)));
  const missingVerifiedRows = manifestRows.filter((row) => {
    const cacheKey = compact(row.cache_key);
    const gtinKey = sourceGtinKey(row.source, row.gtin);
    const urlKey = sourceUrlKey(row.source_url);
    return (
      (cacheKey && liveVerified.byCacheKey?.get(cacheKey) === true)
      || (gtinKey && liveVerified.bySourceGtin?.get(gtinKey) === true)
      || (urlKey && liveVerified.bySourceUrl?.get(urlKey) === true)
    ) !== true;
  });
  const missingVerifiedIdentitySamples = missingVerifiedRows.map((row) => compact(row.cache_key || row.gtin || row.source_url)).filter(Boolean);
  const acceptedCandidates = reports.reduce((sum, report) => sum + reportAcceptedCandidates(report), 0);
  const rejectedCandidates = reports.reduce((sum, report) => sum + reportRejectedCandidates(report), 0);
  const latestVerifiedAt = compact(stats.latest_verified_at);
  const manifestGeneratedAt = compact(selectedManifest?.manifest?.generated_at);
  const sqlManifestIsNewerThanLive = (
    generatedSqlRows > 0
    && manifestEntries.some((entry) => timestampMs(entry.manifest?.generated_at) > timestampMs(latestVerifiedAt))
  );
  const pendingImportDeltaRows = manifestCacheKeys.length > 0
    ? missingVerifiedRows.length
    : Math.max(generatedSqlRows - numeric(stats.verified_ready_rows), 0);
  const pendingImportSqlRows = generatedSqlRows > 0 && pendingImportDeltaRows > 0 ? pendingImportDeltaRows : 0;

  let localImportStatus = "no_local_extraction";
  if (pendingImportSqlRows > 0) {
    localImportStatus = "source_sql_ready_for_import";
  } else if (generatedSqlRows > 0) {
    localImportStatus = "source_sql_applied_or_covered";
  } else if (reportPaths.length > 0 && acceptedCandidates === 0) {
    localImportStatus = "no_verified_candidates";
  } else if (reportPaths.length > 0) {
    localImportStatus = "local_report_available";
  }

  return {
    local_extraction_present: reportPaths.length > 0 || manifestPaths.length > 0,
    local_import_status: localImportStatus,
    report_paths: reportPaths,
    sql_manifest_path: selectedManifest?.filePath || "",
    generated_sql_rows: generatedSqlRows,
    manifest_cache_key_rows: manifestCacheKeys.length,
    local_accepted_candidates: acceptedCandidates,
    local_rejected_candidates: rejectedCandidates,
    pending_import_sql_rows: pendingImportSqlRows,
    pending_import_delta_rows: pendingImportSqlRows > 0 ? pendingImportDeltaRows : 0,
    pending_import_cache_keys_sample: pendingImportDeltaRows > 0 ? missingVerifiedIdentitySamples.slice(0, 12) : [],
    pending_import_chunks: manifestEntries.reduce((sum, entry) => sum + (Array.isArray(entry.manifest.chunks) ? entry.manifest.chunks.length : 0), 0),
    pending_import_manifest_path: pendingImportSqlRows > 0 ? (selectedManifest?.filePath || "") : "",
    sql_manifest_newer_than_live: sqlManifestIsNewerThanLive,
    local_last_generated_at: manifestGeneratedAt,
  };
}

function sourceMatchesAlias(source, aliases) {
  const key = normalizeKey(source);
  return Boolean(key) && aliases.some((alias) => (
    key === alias
    || (
      !BROAD_SOURCE_PREFIXES.has(alias)
      && key.startsWith(`${alias}-`)
      && SOURCE_RUN_SUFFIX_PATTERN.test(key.slice(alias.length + 1))
    )
  ));
}

function pendingImportDeltaBySource(filePath) {
  const payload = readJsonIfExists(filePath, null);
  const bySource = new Map();
  for (const summary of payload?.source_summaries || []) {
    const source = normalizeKey(summary.source);
    if (!source) continue;
    bySource.set(source, {
      source,
      source_manifest_path: compact(summary.source_manifest_path),
      manifest_rows: numeric(summary.manifest_rows),
      pending_rows: numeric(summary.pending_rows),
      import_rejected_rows: numeric(summary.import_rejected_rows),
      sql_chunks: numeric(summary.sql_chunks),
      sample_pending_identity: compact(summary.sample_pending_identity),
    });
  }
  return {
    payload,
    bySource,
    rows: [...bySource.values()],
  };
}

function pendingImportDeltaForTarget(target, pendingImportDelta) {
  const aliases = sourceAliasesFor(target);
  const matches = pendingImportDelta.rows.filter((row) => sourceMatchesAlias(row.source, aliases));
  const pendingRows = matches.reduce((sum, row) => sum + numeric(row.pending_rows), 0);
  const importRejectedRows = matches.reduce((sum, row) => sum + numeric(row.import_rejected_rows), 0);
  const manifestRows = matches.reduce((sum, row) => sum + numeric(row.manifest_rows), 0);
  const sqlChunks = matches.reduce((sum, row) => sum + numeric(row.sql_chunks), 0);
  const pendingManifest = matches.find((row) => numeric(row.pending_rows) > 0)?.source_manifest_path || "";
  return {
    matched_sources: matches.map((row) => row.source),
    manifest_rows: manifestRows,
    pending_rows: pendingRows,
    import_rejected_rows: importRejectedRows,
    sql_chunks: sqlChunks,
    pending_manifest_path: pendingManifest,
    sample_pending_identity: matches.map((row) => row.sample_pending_identity).filter(Boolean).join("; "),
  };
}

function defaultNextAction(target, stats, localExtraction) {
  if (target.accessStatus === "requires_authorized_feed" || target.accessStatus === "blocked_by_source") return "request_authorized_feed";
  if (target.accessStatus === "requires_browser_snapshot") return "collect_browser_snapshot";
  if (target.accessStatus === "shared_catalog_source") {
    return stats.verified_ready_rows > 0 ? "monitor_or_expand_coverage" : "use_shared_source_importer_or_feed";
  }
  if (target.accessStatus === "discontinued") return "mark_discontinued_or_exclude_queue_noise";
  if (stats.verified_ready_rows === 0 && !localExtraction && target.accessStatus === "runnable") return "run_official_importer";
  if (stats.needs_verified_ingredients_rows > 0 || stats.needs_verified_image_rows > 0) return "inspect_extraction_gates_or_request_feed";
  return "monitor_or_expand_coverage";
}

function dashboardAction(action, target, stats, localImport, pendingDelta = {}, rejectedStats = {}) {
  if (numeric(localImport.pending_import_sql_rows) > 0) return "apply_generated_source_sql";
  if (numeric(pendingDelta.import_rejected_rows) > 0 && numeric(rejectedStats.repair_rows) > 0) return "repair_rejected_import_evidence";
  const plannedAction = action?.recommended_action || "";
  if (
    plannedAction === "apply_generated_source_sql"
    && numeric(action?.generated_sql_rows) > 0
    && numeric(stats.verified_ready_rows) >= numeric(action.generated_sql_rows)
  ) {
    return "reconcile_queue_hygiene";
  }
  if (
    plannedAction === "apply_missing_live_sql"
    && numeric(localImport.pending_import_sql_rows) === 0
    && localImport.local_import_status === "source_sql_applied_or_covered"
  ) {
    return "reconcile_queue_hygiene";
  }
  if (
    plannedAction === "run_official_importer"
    && numeric(localImport.pending_import_sql_rows) === 0
    && localImport.local_import_status === "source_sql_applied_or_covered"
  ) {
    return "reconcile_queue_hygiene";
  }
  return plannedAction || defaultNextAction(target, stats, localImport.local_extraction_present);
}

function nextCommandFor(target, action, localImport = {}) {
  if (action === "run_official_importer") {
    return `npm run catalog:scrape-all -- --source "${target.sourceSlug}" --mode import --limit 1 --strict-import-validation`;
  }
  if (action === "apply_generated_source_sql") {
    const manifestPath = localImport.pending_import_manifest_path || localImport.sql_manifest_path || "the generated source SQL manifest";
    return `Review and apply SQL chunks from ${manifestPath}, then refresh the catalog acquisition queue and run the live verified contract audit.`;
  }
  if (action === "repair_rejected_import_evidence") {
    return `Open outputs/catalog-rejected-evidence-requests/current/templates/${target.sourceSlug}.csv, repair exact source-backed ingredients/front image evidence, then run npm run catalog:rejected-evidence-drop-import.`;
  }
  if (action === "reconcile_queue_hygiene") {
    return `Audit duplicate closures, then run bounded SQL: SELECT public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand('${String(target.brand).replace(/'/g, "''")}', 50);`;
  }
  if (action === "request_authorized_feed") {
    return `npm run catalog:authorized-feed-request-pack -- --brand "${target.brand}" --all-restricted`;
  }
  if (action === "collect_browser_snapshot") {
    return `Collect rendered browser evidence under inputs/catalog-browser-snapshots/${target.sourceSlug}/, then run the documented snapshot importer.`;
  }
  if (action === "inspect_extraction_gates_or_request_feed") {
    return `Inspect local source report for ${target.sourceSlug}; repair extractor gates or request authorized feed evidence.`;
  }
  if (action === "mark_discontinued_or_exclude_queue_noise") {
    return "Resolve matching queue rows as discontinued/non-active US shelf coverage.";
  }
  if (action === "use_shared_source_importer_or_feed") {
    return "Use the shared source importer noted in catalog-source-targets.json.";
  }
  return "";
}

function priorityScore(row) {
  return (
    (row.coverage_tier === "tier_1_us_retail" ? 100000 : 0)
    + numeric(row.open_gap_affected_products) * 100
    + numeric(row.pending_import_sql_rows) * 75
    + numeric(row.rejected_repair_rows) * 500
    + (row.verified_ready_rows === 0 ? 1000 : 0)
    + (row.access_status === "requires_authorized_feed" ? 300 : 0)
    + (row.access_status === "blocked_by_source" ? 200 : 0)
    - numeric(row.verified_ready_rows)
  );
}

function buildDashboardRows({ targets, productStats, productRows, actionPlan, rejected, repairSummary, importRoot, pendingImportDelta }) {
  const liveVerified = {
    byCacheKey: new Map(),
    bySourceGtin: new Map(),
    bySourceUrl: new Map(),
  };
  for (const row of productRows) {
    const verifiedReady = isVerifiedReady(row);
    const cacheKey = compact(row.cache_key);
    const gtinKey = sourceGtinKey(row.source, row.gtin);
    const urlKey = sourceUrlKey(row.source_url);
    if (cacheKey) liveVerified.byCacheKey.set(cacheKey, liveVerified.byCacheKey.get(cacheKey) || verifiedReady);
    if (gtinKey) liveVerified.bySourceGtin.set(gtinKey, liveVerified.bySourceGtin.get(gtinKey) || verifiedReady);
    if (urlKey) liveVerified.bySourceUrl.set(urlKey, liveVerified.bySourceUrl.get(urlKey) || verifiedReady);
  }
  const rows = targets.rows.map((target) => {
    const stats = productStats.bySource.get(target.sourceSlug) || emptyProductStats();
    const action = actionPlanRowForTarget(target, actionPlan);
    const rejectedStats = rejected.bySource.get(target.sourceSlug) || {};
    const repairStats = repairSummary.bySource.get(target.sourceSlug) || {};
    const localImport = localImportState(importRoot, target, stats, liveVerified);
    const pendingDelta = pendingImportDeltaForTarget(target, pendingImportDelta);
    if (pendingImportDelta.payload && pendingDelta.matched_sources.length > 0) {
      localImport.pending_import_sql_rows = pendingDelta.pending_rows;
      localImport.pending_import_delta_rows = pendingDelta.pending_rows;
      localImport.pending_import_chunks = pendingDelta.sql_chunks;
      localImport.pending_import_manifest_path = pendingDelta.pending_manifest_path;
      localImport.pending_import_cache_keys_sample = pendingDelta.sample_pending_identity
        ? pendingDelta.sample_pending_identity.split("; ").slice(0, 12)
        : [];
      if (pendingDelta.pending_rows > 0) {
        localImport.local_import_status = "source_sql_ready_for_import";
      } else if (pendingDelta.import_rejected_rows > 0) {
        localImport.local_import_status = "import_rejected_needs_repair";
      } else if (localImport.generated_sql_rows > 0 && localImport.local_import_status === "source_sql_ready_for_import") {
        localImport.local_import_status = "source_sql_applied_or_covered";
      }
    }
    const localExtraction = localImport.local_extraction_present || hasLocalExtraction(importRoot, target);
    const recommendedAction = dashboardAction(action, target, stats, localImport, pendingDelta, rejectedStats);
    const row = {
      brand: target.brand,
      source_slug: target.sourceSlug,
      source_owner: target.sourceOwner || "",
      source_priority: target.sourcePriority || "",
      coverage_tier: target.coverageTier || "",
      access_status: target.accessStatus,
      target_url: target.targetUrl || "",
      local_extraction_present: localExtraction,
      local_import_status: localImport.local_import_status,
      local_last_generated_at: localImport.local_last_generated_at,
      local_accepted_candidates: localImport.local_accepted_candidates,
      local_rejected_candidates: localImport.local_rejected_candidates,
      generated_sql_rows: localImport.generated_sql_rows,
      manifest_cache_key_rows: localImport.manifest_cache_key_rows,
      pending_import_sql_rows: localImport.pending_import_sql_rows,
      pending_import_delta_rows: localImport.pending_import_delta_rows,
      import_rejected_rows: pendingDelta.import_rejected_rows,
      pending_import_delta_matched_sources: pendingDelta.matched_sources.join("; "),
      pending_import_cache_keys_sample: localImport.pending_import_cache_keys_sample.join("; "),
      pending_import_chunks: localImport.pending_import_chunks,
      pending_import_manifest_path: localImport.pending_import_manifest_path,
      sql_manifest_newer_than_live: localImport.sql_manifest_newer_than_live,
      verified_ready_rows: stats.verified_ready_rows,
      dog_verified_ready_rows: stats.dog_verified_ready_rows,
      cat_verified_ready_rows: stats.cat_verified_ready_rows,
      total_catalog_rows: stats.total_rows,
      current_dog_cat_rows: stats.dog_cat_rows,
      needs_verified_ingredients_rows: stats.needs_verified_ingredients_rows,
      needs_verified_image_rows: stats.needs_verified_image_rows,
      excluded_rows: stats.excluded_rows,
      stale_rows: stats.stale_rows,
      latest_verified_at: stats.latest_verified_at,
      open_gap_rows: numeric(action?.actionable_open_rows ?? action?.open_rows),
      open_gap_affected_products: numeric(action?.actionable_affected_products ?? action?.affected_products),
      total_open_gap_rows: numeric(action?.open_rows),
      total_open_gap_affected_products: numeric(action?.affected_products),
      brand_rollup_rows: numeric(action?.brand_rollup_rows),
      brand_rollup_affected_products: numeric(action?.brand_rollup_affected_products),
      retailer_gap_open_rows: numeric(action?.retailer_gap_open_rows),
      community_gap_open_rows: numeric(action?.community_gap_open_rows),
      legacy_web_gap_open_rows: numeric(action?.legacy_web_gap_open_rows),
      user_capture_gap_open_rows: numeric(action?.user_capture_gap_open_rows),
      official_quality_gap_open_rows: numeric(action?.official_quality_gap_open_rows),
      gap_source_profile: compact(action?.gap_source_profile),
      live_gap_action: action?.recommended_action || "",
      local_status: action?.local_status || "",
      rejected_worklist_rows: numeric(rejectedStats.rows),
      rejected_repair_rows: numeric(rejectedStats.repair_rows),
      rejected_excluded_rows: numeric(rejectedStats.excluded_rows),
      official_source_text_failed_validation: numeric(rejectedStats.official_source_text_failed_validation),
      official_label_ocr_failed_validation: numeric(rejectedStats.official_label_ocr_failed_validation),
      repair_import_sql_rows: numeric(repairStats.sql_rows),
      recommended_action: recommendedAction,
      next_command: recommendedAction === action?.recommended_action
        ? (action?.next_command || nextCommandFor(target, recommendedAction, localImport))
        : nextCommandFor(target, recommendedAction, localImport),
      notes: target.notes || "",
      priority_score: 0,
    };
    row.priority_score = priorityScore(row);
    return row;
  });

  rows.sort((left, right) => (
    right.priority_score - left.priority_score
    || right.open_gap_affected_products - left.open_gap_affected_products
    || right.rejected_repair_rows - left.rejected_repair_rows
    || left.brand.localeCompare(right.brand)
  ));
  return rows;
}

function countBy(rows, field) {
  return rows.reduce((map, row) => {
    const key = compact(row[field]) || "unknown";
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});
}

function summarize({ rows, productRows, productSource, actionPlan, rejected, repairSummary, verifiedReadyGoal }) {
  const verifiedReadyRows = rows.reduce((sum, row) => sum + numeric(row.verified_ready_rows), 0);
  const dogVerifiedReadyRows = rows.reduce((sum, row) => sum + numeric(row.dog_verified_ready_rows), 0);
  const catVerifiedReadyRows = rows.reduce((sum, row) => sum + numeric(row.cat_verified_ready_rows), 0);
  const activeCoverageRows = rows.filter((row) => row.access_status !== "discontinued");
  const sourceTargetsWithoutReadyRows = activeCoverageRows.filter((row) => numeric(row.verified_ready_rows) === 0);
  const authorizedFeedTargetsPending = rows.filter((row) => ["requires_authorized_feed", "blocked_by_source"].includes(row.access_status));
  const rejectedRepairRows = rows.reduce((sum, row) => sum + numeric(row.rejected_repair_rows), 0);
  const rejectedExcludedRows = rows.reduce((sum, row) => sum + numeric(row.rejected_excluded_rows), 0);
  const pendingImportSqlRows = rows.reduce((sum, row) => sum + numeric(row.pending_import_sql_rows), 0);
  const pendingImportDeltaRows = rows.reduce((sum, row) => sum + numeric(row.pending_import_delta_rows), 0);
  const pendingImportSourceTargets = rows.filter((row) => numeric(row.pending_import_sql_rows) > 0).length;
  const representedOpenGapRows = rows.reduce((sum, row) => sum + numeric(row.open_gap_rows), 0);
  const representedOpenGapAffectedProducts = rows.reduce((sum, row) => sum + numeric(row.open_gap_affected_products), 0);
  const currentActionPlanStatus = actionPlanStatus(actionPlan, { productSourceLive: productSource.live });
  const actionPlanTotalOpenRows = numeric(actionPlan.payload?.total_open_rows);
  const actionPlanTotalAffectedProducts = numeric(actionPlan.payload?.total_affected_products);
  const actionPlanTotalActionableOpenRows = numeric(actionPlan.payload?.total_actionable_open_rows);
  const actionPlanTotalActionableAffectedProducts = numeric(actionPlan.payload?.total_actionable_affected_products);
  const actionPlanTotalBrandRollupRows = numeric(actionPlan.payload?.total_brand_rollup_rows);
  const actionPlanTotalBrandRollupAffectedProducts = numeric(actionPlan.payload?.total_brand_rollup_affected_products);
  const actionPlanInputGapBrandCount = numeric(actionPlan.payload?.input_gap_brand_count);
  const actionPlanInputGapOpenRows = numeric(actionPlan.payload?.input_gap_open_rows);
  const actionPlanInputGapAffectedProducts = numeric(actionPlan.payload?.input_gap_affected_products);
  const actionPlanInputGapActionableOpenRows = numeric(actionPlan.payload?.input_gap_actionable_open_rows);
  const actionPlanInputGapActionableAffectedProducts = numeric(actionPlan.payload?.input_gap_actionable_affected_products);
  const actionPlanInputGapBrandRollupRows = numeric(actionPlan.payload?.input_gap_brand_rollup_rows);
  const actionPlanInputGapBrandRollupAffectedProducts = numeric(actionPlan.payload?.input_gap_brand_rollup_affected_products);
  const actionPlanRetailerGapOpenRows = numeric(actionPlan.payload?.total_retailer_gap_open_rows) || rows.reduce((sum, row) => sum + numeric(row.retailer_gap_open_rows), 0);
  const actionPlanCommunityGapOpenRows = numeric(actionPlan.payload?.total_community_gap_open_rows) || rows.reduce((sum, row) => sum + numeric(row.community_gap_open_rows), 0);
  const actionPlanLegacyWebGapOpenRows = numeric(actionPlan.payload?.total_legacy_web_gap_open_rows) || rows.reduce((sum, row) => sum + numeric(row.legacy_web_gap_open_rows), 0);
  const actionPlanUserCaptureGapOpenRows = numeric(actionPlan.payload?.total_user_capture_gap_open_rows) || rows.reduce((sum, row) => sum + numeric(row.user_capture_gap_open_rows), 0);
  const actionPlanOfficialQualityGapOpenRows = numeric(actionPlan.payload?.total_official_quality_gap_open_rows) || rows.reduce((sum, row) => sum + numeric(row.official_quality_gap_open_rows), 0);
  const authoritativeOpenGapRows = Math.max(representedOpenGapRows, actionPlanInputGapActionableOpenRows, actionPlanTotalActionableOpenRows);
  const authoritativeOpenGapAffectedProducts = Math.max(
    representedOpenGapAffectedProducts,
    actionPlanInputGapActionableAffectedProducts,
    actionPlanTotalActionableAffectedProducts,
  );
  const completionBlockers = [];

  if (verifiedReadyRows < verifiedReadyGoal) completionBlockers.push("verified_ready_goal_not_met");
  if (sourceTargetsWithoutReadyRows.length > 0) completionBlockers.push("source_targets_without_verified_ready_rows");
  if (authorizedFeedTargetsPending.length > 0) completionBlockers.push("authorized_or_blocked_source_targets_pending");
  if (rejectedRepairRows > 0) completionBlockers.push("rejected_evidence_repairs_pending");
  if (pendingImportSqlRows > 0) completionBlockers.push("validated_import_sql_pending");
  if (authoritativeOpenGapAffectedProducts > 0) completionBlockers.push("open_acquisition_gaps_pending");
  if (currentActionPlanStatus.refresh_warnings.length > 0) completionBlockers.push("action_plan_refresh_needed");

  return {
    generated_at: new Date().toISOString(),
    product_source: productSource.source,
    live_product_data: productSource.live,
    source_targets: rows.length,
    tier_1_targets: rows.filter((row) => row.coverage_tier === "tier_1_us_retail").length,
    tier_2_targets: rows.filter((row) => row.coverage_tier === "tier_2_us_retail").length,
    access_status_counts: countBy(rows, "access_status"),
    recommended_action_counts: countBy(rows, "recommended_action"),
    product_rows_scanned: productRows.length,
    verified_ready_rows: verifiedReadyRows,
    dog_verified_ready_rows: dogVerifiedReadyRows,
    cat_verified_ready_rows: catVerifiedReadyRows,
    verified_ready_goal: verifiedReadyGoal,
    verified_ready_goal_gap: Math.max(verifiedReadyGoal - verifiedReadyRows, 0),
    verified_ready_goal_percent: verifiedReadyGoal > 0 ? Number((verifiedReadyRows / verifiedReadyGoal).toFixed(4)) : 0,
    source_targets_with_verified_ready_rows: activeCoverageRows.filter((row) => numeric(row.verified_ready_rows) > 0).length,
    source_targets_without_verified_ready_rows: sourceTargetsWithoutReadyRows.length,
    authorized_feed_targets_pending: authorizedFeedTargetsPending.length,
    pending_import_sql_rows: pendingImportSqlRows,
    pending_import_delta_rows: pendingImportDeltaRows,
    pending_import_source_targets: pendingImportSourceTargets,
    open_gap_rows: authoritativeOpenGapRows,
    open_gap_affected_products: authoritativeOpenGapAffectedProducts,
    represented_open_gap_rows: representedOpenGapRows,
    represented_open_gap_affected_products: representedOpenGapAffectedProducts,
    total_queue_open_rows: Math.max(actionPlanInputGapOpenRows, actionPlanTotalOpenRows, representedOpenGapRows),
    total_queue_affected_products: Math.max(actionPlanInputGapAffectedProducts, actionPlanTotalAffectedProducts, representedOpenGapAffectedProducts),
    brand_rollup_rows: Math.max(actionPlanInputGapBrandRollupRows, actionPlanTotalBrandRollupRows),
    brand_rollup_affected_products: Math.max(actionPlanInputGapBrandRollupAffectedProducts, actionPlanTotalBrandRollupAffectedProducts),
    action_plan_path: currentActionPlanStatus.path,
    action_plan_generated_at: currentActionPlanStatus.generated_at,
    action_plan_gap_source: currentActionPlanStatus.gap_source,
    action_plan_gap_exported_at: currentActionPlanStatus.gap_exported_at,
    action_plan_gap_row_scope: currentActionPlanStatus.gap_row_scope,
    action_plan_total_open_rows: actionPlanTotalOpenRows,
    action_plan_total_affected_products: actionPlanTotalAffectedProducts,
    action_plan_total_actionable_open_rows: actionPlanTotalActionableOpenRows,
    action_plan_total_actionable_affected_products: actionPlanTotalActionableAffectedProducts,
    action_plan_total_brand_rollup_rows: actionPlanTotalBrandRollupRows,
    action_plan_total_brand_rollup_affected_products: actionPlanTotalBrandRollupAffectedProducts,
    action_plan_input_gap_brand_count: actionPlanInputGapBrandCount,
    action_plan_input_gap_open_rows: actionPlanInputGapOpenRows,
    action_plan_input_gap_affected_products: actionPlanInputGapAffectedProducts,
    action_plan_input_gap_actionable_open_rows: actionPlanInputGapActionableOpenRows,
    action_plan_input_gap_actionable_affected_products: actionPlanInputGapActionableAffectedProducts,
    action_plan_input_gap_brand_rollup_rows: actionPlanInputGapBrandRollupRows,
    action_plan_input_gap_brand_rollup_affected_products: actionPlanInputGapBrandRollupAffectedProducts,
    action_plan_retailer_gap_open_rows: actionPlanRetailerGapOpenRows,
    action_plan_community_gap_open_rows: actionPlanCommunityGapOpenRows,
    action_plan_legacy_web_gap_open_rows: actionPlanLegacyWebGapOpenRows,
    action_plan_user_capture_gap_open_rows: actionPlanUserCaptureGapOpenRows,
    action_plan_official_quality_gap_open_rows: actionPlanOfficialQualityGapOpenRows,
    action_plan_represented_gap_row_percent: authoritativeOpenGapRows > 0
      ? Number((representedOpenGapRows / authoritativeOpenGapRows).toFixed(4))
      : 0,
    action_plan_represented_gap_affected_percent: authoritativeOpenGapAffectedProducts > 0
      ? Number((representedOpenGapAffectedProducts / authoritativeOpenGapAffectedProducts).toFixed(4))
      : 0,
    action_plan_age_hours: currentActionPlanStatus.age_hours,
    action_plan_stale_after_hours: currentActionPlanStatus.stale_after_hours,
    action_plan_live_gap_source: currentActionPlanStatus.live_gap_source,
    action_plan_freshness: currentActionPlanStatus.freshness,
    action_plan_warnings: currentActionPlanStatus.warnings,
    action_plan_refresh_warnings: currentActionPlanStatus.refresh_warnings,
    action_plan_scope_warnings: currentActionPlanStatus.scope_warnings,
    rejected_repair_rows: rejectedRepairRows,
    rejected_excluded_rows: rejectedExcludedRows,
    repair_import_sql_rows: rows.reduce((sum, row) => sum + numeric(row.repair_import_sql_rows), 0),
    action_plan_rows: actionPlan.rows.length,
    rejected_worklist_rows: rejected.rows.length,
    repair_summary_reports: repairSummary.payload?.reports?.length || 0,
    completion_state: completionBlockers.length === 0 ? "complete" : "incomplete",
    completion_blockers: completionBlockers,
  };
}

function markdown(summary, rows) {
  return [
    "# US Pet Food Catalog Coverage Dashboard",
    "",
    `Generated at: ${summary.generated_at}`,
    `Completion state: ${summary.completion_state}`,
    "",
    "## Summary",
    "",
    `- Verified-ready rows: ${summary.verified_ready_rows}/${summary.verified_ready_goal} (${(summary.verified_ready_goal_percent * 100).toFixed(1)}%)`,
    `- Dog verified-ready rows: ${summary.dog_verified_ready_rows}`,
    `- Cat verified-ready rows: ${summary.cat_verified_ready_rows}`,
    `- Source targets: ${summary.source_targets} (${summary.tier_1_targets} tier 1, ${summary.tier_2_targets} tier 2)`,
    `- Source targets without verified-ready rows: ${summary.source_targets_without_verified_ready_rows}`,
    `- Authorized/blocked feed targets pending: ${summary.authorized_feed_targets_pending}`,
    `- Rejected evidence repairs pending: ${summary.rejected_repair_rows}`,
    `- Rejected rows intentionally excluded: ${summary.rejected_excluded_rows}`,
    `- Pending validated import SQL rows: ${summary.pending_import_sql_rows} across ${summary.pending_import_source_targets} source targets`,
    `- Estimated verified-ready delta from pending SQL: ${summary.pending_import_delta_rows}`,
    `- Import-rejected local rows: ${summary.import_rejected_rows}`,
    `- Open acquisition affected products: ${summary.open_gap_affected_products}`,
    `- Represented open acquisition affected products: ${summary.represented_open_gap_affected_products}`,
    `- Total queue affected products including brand rollups: ${summary.total_queue_affected_products}`,
    `- Brand-rollup affected products: ${summary.brand_rollup_affected_products}`,
    `- Action-plan freshness: ${summary.action_plan_freshness}`,
    `- Action-plan gap source: ${summary.action_plan_gap_source || "unknown"}`,
    `- Action-plan gap exported at: ${summary.action_plan_gap_exported_at || "unknown"}`,
    `- Action-plan gap row scope: ${summary.action_plan_gap_row_scope || "unknown"}`,
    `- Action-plan input open rows: ${summary.action_plan_input_gap_open_rows}`,
    `- Action-plan input affected products: ${summary.action_plan_input_gap_affected_products}`,
    `- Action-plan input actionable open rows: ${summary.action_plan_input_gap_actionable_open_rows}`,
    `- Action-plan input actionable affected products: ${summary.action_plan_input_gap_actionable_affected_products}`,
    `- Retailer-origin open rows: ${summary.action_plan_retailer_gap_open_rows}`,
    `- Community-origin open rows: ${summary.action_plan_community_gap_open_rows}`,
    `- Legacy web-origin open rows: ${summary.action_plan_legacy_web_gap_open_rows}`,
    `- User-capture open rows: ${summary.action_plan_user_capture_gap_open_rows}`,
    `- Official-quality open rows: ${summary.action_plan_official_quality_gap_open_rows}`,
    `- Action-plan represented affected coverage: ${(summary.action_plan_represented_gap_affected_percent * 100).toFixed(1)}%`,
    `- Action-plan generated at: ${summary.action_plan_generated_at || "unknown"}`,
    ...(summary.action_plan_warnings.length > 0
      ? [`- Action-plan warnings: ${summary.action_plan_warnings.join(", ")}`]
      : []),
    "",
    "## Completion Blockers",
    "",
    ...(summary.completion_blockers.length > 0 ? summary.completion_blockers.map((blocker) => `- ${blocker}`) : ["- none"]),
    "",
    "## Recommended Actions",
    "",
    ...Object.entries(summary.recommended_action_counts).map(([action, count]) => `- ${action}: ${count}`),
    "",
    "## Top Source Rows",
    "",
    "| Brand | Ready | Pending Delta | Import Rejects | Dog | Cat | Access | Action | Source Profile | Repair Tasks | Excluded Rejects | Open Affected |",
    "|---|---:|---:|---:|---:|---:|---|---|---|---:|---:|---:|",
    ...rows.slice(0, 40).map((row) => [
      row.brand,
      row.verified_ready_rows,
      row.pending_import_delta_rows,
      row.import_rejected_rows,
      row.dog_verified_ready_rows,
      row.cat_verified_ready_rows,
      row.access_status,
      row.recommended_action,
      row.gap_source_profile,
      row.rejected_repair_rows,
      row.rejected_excluded_rows,
      row.open_gap_affected_products,
    ].map((value) => compact(value).replace(/\|/g, "\\|")).join(" | ")).map((line) => `| ${line} |`),
    "",
  ].join("\n");
}

function writeDashboard({ summary, rows, outputDir }) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "dashboard.json"), `${JSON.stringify({ ...summary, rows }, null, 2)}\n`, "utf8");
  writeCsv(rows, path.join(outputDir, "dashboard.csv"), [
    "brand",
    "source_slug",
    "coverage_tier",
    "access_status",
    "verified_ready_rows",
    "dog_verified_ready_rows",
    "cat_verified_ready_rows",
    "total_catalog_rows",
    "current_dog_cat_rows",
    "needs_verified_ingredients_rows",
    "needs_verified_image_rows",
    "local_extraction_present",
    "local_import_status",
    "local_last_generated_at",
    "local_accepted_candidates",
    "local_rejected_candidates",
    "generated_sql_rows",
    "manifest_cache_key_rows",
    "pending_import_sql_rows",
    "pending_import_delta_rows",
    "import_rejected_rows",
    "pending_import_delta_matched_sources",
    "pending_import_cache_keys_sample",
    "pending_import_chunks",
    "pending_import_manifest_path",
    "sql_manifest_newer_than_live",
    "local_status",
    "open_gap_rows",
    "open_gap_affected_products",
    "total_open_gap_rows",
    "total_open_gap_affected_products",
    "brand_rollup_rows",
    "brand_rollup_affected_products",
    "retailer_gap_open_rows",
    "community_gap_open_rows",
    "legacy_web_gap_open_rows",
    "user_capture_gap_open_rows",
    "official_quality_gap_open_rows",
    "gap_source_profile",
    "rejected_repair_rows",
    "rejected_excluded_rows",
    "repair_import_sql_rows",
    "recommended_action",
    "priority_score",
    "next_command",
  ]);
  fs.writeFileSync(path.join(outputDir, "dashboard.md"), `${markdown(summary, rows)}\n`, "utf8");
}

function printSummary(summary, outputDir) {
  console.log("US pet food catalog coverage dashboard");
  console.log(`Verified-ready rows: ${summary.verified_ready_rows}/${summary.verified_ready_goal}`);
  console.log(`Source targets without verified-ready rows: ${summary.source_targets_without_verified_ready_rows}`);
  console.log(`Authorized/blocked feed targets pending: ${summary.authorized_feed_targets_pending}`);
  console.log(`Rejected repairs pending: ${summary.rejected_repair_rows}`);
  console.log(`Rejected rows intentionally excluded: ${summary.rejected_excluded_rows}`);
  console.log(`Pending validated import SQL rows: ${summary.pending_import_sql_rows}`);
  console.log(`Estimated verified-ready delta from pending SQL: ${summary.pending_import_delta_rows}`);
  console.log(`Import-rejected local rows: ${summary.import_rejected_rows}`);
  console.log(`Open acquisition affected products: ${summary.open_gap_affected_products}`);
  console.log(`Action-plan actionable affected products: ${summary.action_plan_total_actionable_affected_products}`);
  console.log(`Total queue affected products: ${summary.total_queue_affected_products}`);
  console.log(`Action-plan freshness: ${summary.action_plan_freshness}`);
  console.log(`Completion state: ${summary.completion_state}`);
  console.log(`Report: ${path.join(outputDir, "dashboard.json")}`);
}

async function main() {
  if (hasArg("--help")) {
    console.log([
      "Usage: node scripts/catalog-us-market-coverage-dashboard.mjs",
      "",
      "Builds a read-only US market coverage dashboard for verified pet-food catalog acquisition.",
      "",
      "Options:",
      "  --source-targets <path>       Default: scripts/catalog-source-targets.json",
      "  --catalog-snapshot <path>     Use local product_data-style rows instead of Supabase.",
      "  --action-plan <path>          Default: outputs/catalog-live-gap-action-plan/current/action-plan.json",
      "  --rejected-worklist <path>    Default: outputs/catalog-rejected-candidate-worklist/current/worklist.json",
      "  --repair-summary <path>       Default: outputs/catalog-evidence-repair-imports/summary.json",
      "  --import-root <dir>           Default: outputs/catalog-source-imports",
      "  --output-dir <dir>            Default: outputs/catalog-us-market-coverage-dashboard/current",
      "  --verified-ready-goal <n>     Default: 12000",
      "  --json",
    ].join("\n"));
    return;
  }

  const options = {
    sourceTargetsPath: compact(getArg("--source-targets", SOURCE_TARGETS_PATH)),
    catalogSnapshotPath: compact(getArg("--catalog-snapshot")),
    actionPlanPath: compact(getArg("--action-plan", DEFAULT_ACTION_PLAN)),
    rejectedWorklistPath: compact(getArg("--rejected-worklist", DEFAULT_REJECTED_WORKLIST)),
    repairSummaryPath: compact(getArg("--repair-summary", DEFAULT_REPAIR_SUMMARY)),
    pendingImportDeltaPath: compact(getArg("--pending-import-delta", DEFAULT_PENDING_IMPORT_DELTA)),
    importRoot: compact(getArg("--import-root", DEFAULT_IMPORT_ROOT)),
    outputDir: compact(getArg("--output-dir", DEFAULT_OUTPUT_DIR)),
    verifiedReadyGoal: positiveInteger(getArg("--verified-ready-goal"), DEFAULT_VERIFIED_READY_GOAL),
  };

  const targets = loadTargets(options.sourceTargetsPath);
  const snapshot = loadProductRows(options);
  const productSource = snapshot || await fetchProductRowsFromSupabase();
  const productStats = productStatsByTarget(productSource.rows, targets);
  const actionPlan = loadActionPlan(options.actionPlanPath);
  const rejected = rejectedRowsBySource(options.rejectedWorklistPath);
  const repairSummary = repairSummaryBySource(options.repairSummaryPath);
  const pendingImportDelta = pendingImportDeltaBySource(options.pendingImportDeltaPath);
  const rows = buildDashboardRows({
    targets,
    productStats,
    productRows: productSource.rows,
    actionPlan,
    rejected,
    repairSummary,
    importRoot: options.importRoot,
    pendingImportDelta,
  });
  const summary = summarize({
    rows,
    productRows: productSource.rows,
    productSource,
    actionPlan,
    rejected,
    repairSummary,
    verifiedReadyGoal: options.verifiedReadyGoal,
  });
  if (pendingImportDelta.payload) {
    const pendingRows = numeric(pendingImportDelta.payload.pending_rows);
    const effectivePendingRows = Math.max(numeric(summary.pending_import_sql_rows), pendingRows);
    const effectivePendingDeltaRows = Math.max(numeric(summary.pending_import_delta_rows), pendingRows);
    const effectivePendingSourceTargets = Math.max(
      numeric(summary.pending_import_source_targets),
      numeric(pendingImportDelta.payload.sources_with_pending_rows)
    );
    const completionBlockers = new Set(summary.completion_blockers || []);
    if (effectivePendingRows > 0) {
      completionBlockers.add("validated_import_sql_pending");
    } else {
      completionBlockers.delete("validated_import_sql_pending");
    }
    summary.pending_import_sql_rows = effectivePendingRows;
    summary.pending_import_delta_rows = effectivePendingDeltaRows;
    summary.pending_import_source_targets = effectivePendingSourceTargets;
    summary.import_rejected_rows = Math.max(numeric(summary.import_rejected_rows), numeric(pendingImportDelta.payload.import_rejected_rows));
    summary.pending_import_delta_manifest_path = options.pendingImportDeltaPath;
    summary.completion_blockers = Array.from(completionBlockers);
    summary.completion_state = summary.completion_blockers.length === 0 ? "complete" : "incomplete";
  }

  writeDashboard({ summary, rows, outputDir: options.outputDir });
  if (hasArg("--json")) {
    console.log(JSON.stringify({ ...summary, rows }, null, 2));
  } else {
    printSummary(summary, options.outputDir);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
