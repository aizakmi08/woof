import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SOURCE_TARGETS_PATH = "scripts/catalog-source-targets.json";
const DEFAULT_IMPORT_ROOT = "outputs/catalog-source-imports";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-live-gap-action-plan";
const DEFAULT_LIMIT = 50;
const PAGE_SIZE = 1000;
const VERIFIED_SOURCE_QUALITIES = new Set(["gdsn", "official", "manufacturer", "retailer_verified"]);
const VERIFIED_INGREDIENT_STATUSES = new Set(["gdsn", "official", "manufacturer", "retailer_verified", "label_ocr_verified"]);
const VERIFIED_IMAGE_STATUSES = new Set(["official", "manufacturer", "retailer_verified"]);
const RETAILER_DEMAND_SOURCES = new Set(["amazon", "chewy", "petco", "petsmart", "target", "walmart", "tractorsupply", "tractor-supply", "petsense"]);
const COMMUNITY_DEMAND_SOURCES = new Set(["dfa", "opff", "open-food-facts"]);
const LEGACY_WEB_DEMAND_SOURCES = new Set(["web", "web-verified", "web_verified"]);
const USER_CAPTURE_DEMAND_SOURCES = new Set(["user-ocr", "user_ocr", "label-ocr", "label_ocr"]);
const OFFICIAL_DEMAND_SOURCE_QUALITIES = new Set(["gdsn", "official", "manufacturer", "retailer_verified"]);

const ACTION_ORDER = {
  apply_missing_live_sql: 1,
  apply_generated_source_sql: 2,
  reconcile_queue_hygiene: 3,
  expand_official_source_import: 4,
  run_official_importer: 5,
  inspect_extraction_gates_or_request_feed: 6,
  request_authorized_feed: 7,
  collect_browser_snapshot: 8,
  use_shared_source_importer_or_feed: 9,
  mark_discontinued_or_exclude_queue_noise: 10,
  add_source_target_or_feed_request: 11,
};

const LOCAL_STATUS_ORDER = {
  missing_live_sql_ready: 1,
  missing_live_candidates_rejected: 2,
  generated_source_sql_ready: 3,
  live_coverage_no_missing_rows: 4,
  no_local_extraction: 5,
  no_verified_candidates: 6,
  local_report_available: 7,
  not_applicable: 8,
};

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

function nonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function normalizeKey(value) {
  return compact(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function shellQuote(value) {
  return `"${String(value || "").replace(/(["\\$`])/g, "\\$1")}"`;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvLine(row, headers) {
  return headers.map((header) => csvEscape(row?.[header] ?? "")).join(",");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"" && inQuotes && next === "\"") {
      cell += "\"";
      index += 1;
      continue;
    }
    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => compact(value))) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  row.push(cell);
  if (row.some((value) => compact(value))) rows.push(row);
  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => compact(header));
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function readJsonIfExists(filePath, fallback = null) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function gapPayloadFromParsedJson(parsed) {
  if (!parsed || typeof parsed !== "object") return parsed;
  if (!Array.isArray(parsed) && parsed.catalog_live_gap_summary && typeof parsed.catalog_live_gap_summary === "object") {
    return parsed.catalog_live_gap_summary;
  }
  if (Array.isArray(parsed) && parsed.length === 1 && parsed[0]?.catalog_live_gap_summary) {
    return parsed[0].catalog_live_gap_summary;
  }
  if (Array.isArray(parsed?.results?.[0]?.rows) && parsed.results[0].rows.length === 1 && parsed.results[0].rows[0]?.catalog_live_gap_summary) {
    return parsed.results[0].rows[0].catalog_live_gap_summary;
  }
  return parsed;
}

function rowsFromParsedGapPayload(parsed) {
  const payload = gapPayloadFromParsedJson(parsed);
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    if (Array.isArray(payload.rows)) return payload.rows;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.result)) return payload.result;
    if (Array.isArray(payload.results?.[0]?.rows)) return payload.results[0].rows;
    if (Array.isArray(payload.catalog_restricted_source_gaps)) return payload.catalog_restricted_source_gaps;
    if (Array.isArray(payload.top_open_gaps)) return payload.top_open_gaps;
  }
  if (Array.isArray(payload)) return payload;
  return [];
}

function loadJsonOrCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  if (/\.json$/i.test(filePath)) {
    const parsed = JSON.parse(text);
    return rowsFromParsedGapPayload(parsed);
  }
  return parseCsv(text);
}

function loadGapSummaryFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  if (!/\.json$/i.test(filePath)) {
    return {
      rows: parseCsv(text),
      metadata: {},
    };
  }

  const parsed = JSON.parse(text);
  const payload = gapPayloadFromParsedJson(parsed);
  const rows = loadJsonOrCsv(filePath);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      rows,
      metadata: {},
    };
  }

  return {
    rows,
    metadata: {
      gap_source: compact(payload.gap_source || payload.source || payload.export_source),
      gap_exported_at: compact(payload.gap_exported_at || payload.exported_at || payload.generated_at),
      gap_row_scope: compact(payload.gap_row_scope || payload.row_scope || payload.scope),
      input_gap_brand_count: numeric(payload.input_gap_brand_count ?? payload.brand_count ?? payload.totals?.brand_count),
      input_gap_open_rows: numeric(payload.input_gap_open_rows ?? payload.open_rows ?? payload.total_open_rows ?? payload.totals?.open_rows),
      input_gap_affected_products: numeric(payload.input_gap_affected_products ?? payload.affected_products ?? payload.total_affected_products ?? payload.totals?.affected_products),
      input_gap_actionable_open_rows: numeric(payload.input_gap_actionable_open_rows ?? payload.actionable_open_rows ?? payload.totals?.actionable_open_rows),
      input_gap_actionable_affected_products: numeric(payload.input_gap_actionable_affected_products ?? payload.actionable_affected_products ?? payload.totals?.actionable_affected_products),
      input_gap_brand_rollup_rows: numeric(payload.input_gap_brand_rollup_rows ?? payload.brand_rollup_rows ?? payload.totals?.brand_rollup_rows),
      input_gap_brand_rollup_affected_products: numeric(payload.input_gap_brand_rollup_affected_products ?? payload.brand_rollup_affected_products ?? payload.totals?.brand_rollup_affected_products),
      requested_limit: numeric(payload.requested_limit),
      scoped_brand_count: numeric(payload.scoped_brand_count),
      page_offset: numeric(payload.page_offset),
      page_size: numeric(payload.page_size),
      page_row_count: numeric(payload.page_row_count),
    },
  };
}

function gapSummaryFilesInDirectory(dirPath) {
  return fs.readdirSync(dirPath)
    .filter((name) => /\.(json|csv)$/i.test(name))
    .map((name) => path.join(dirPath, name))
    .sort((left, right) => left.localeCompare(right));
}

function mergeGapSummaries(summaries) {
  const rowsByBrand = new Map();
  const metadataRows = summaries.map((summary) => summary.metadata || {});
  for (const summary of summaries) {
    for (const row of summary.rows || []) {
      const brand = compact(row.brand);
      if (!brand || rowsByBrand.has(brand)) continue;
      rowsByBrand.set(brand, row);
    }
  }

  const rows = Array.from(rowsByBrand.values());
  const first = metadataRows.find((row) => row.gap_source || row.gap_exported_at || row.gap_row_scope) || {};
  const requestedLimit = Math.max(...metadataRows.map((row) => numeric(row.requested_limit)), 0);
  const scopedBrandCount = Math.max(...metadataRows.map((row) => numeric(row.scoped_brand_count)), 0);
  const inputGapBrandCount = Math.max(...metadataRows.map((row) => numeric(row.input_gap_brand_count)), 0);
  const expectedRows = scopedBrandCount || (requestedLimit > 0 && inputGapBrandCount > 0 ? Math.min(requestedLimit, inputGapBrandCount) : inputGapBrandCount);
  const completePagedExport = expectedRows > 0 && rows.length >= expectedRows;
  const pageScopeBase = requestedLimit > 0 ? `top_${requestedLimit}_brands` : "all_brands";
  const pageScopes = metadataRows.map((row) => compact(row.gap_row_scope)).filter(Boolean);
  const usesPagedScope = pageScopes.some((scope) => /_page$/.test(scope));

  return {
    rows,
    metadata: {
      gap_source: first.gap_source || "",
      gap_exported_at: metadataRows.map((row) => compact(row.gap_exported_at)).filter(Boolean).sort().pop() || "",
      gap_row_scope: usesPagedScope ? (completePagedExport ? pageScopeBase : `${pageScopeBase}_partial`) : (first.gap_row_scope || ""),
      input_gap_brand_count: inputGapBrandCount,
      input_gap_open_rows: Math.max(...metadataRows.map((row) => numeric(row.input_gap_open_rows)), 0),
      input_gap_affected_products: Math.max(...metadataRows.map((row) => numeric(row.input_gap_affected_products)), 0),
      input_gap_actionable_open_rows: Math.max(...metadataRows.map((row) => numeric(row.input_gap_actionable_open_rows)), 0),
      input_gap_actionable_affected_products: Math.max(...metadataRows.map((row) => numeric(row.input_gap_actionable_affected_products)), 0),
      input_gap_brand_rollup_rows: Math.max(...metadataRows.map((row) => numeric(row.input_gap_brand_rollup_rows)), 0),
      input_gap_brand_rollup_affected_products: Math.max(...metadataRows.map((row) => numeric(row.input_gap_brand_rollup_affected_products)), 0),
      requested_limit: requestedLimit,
      scoped_brand_count: scopedBrandCount,
      merged_gap_summary_files: summaries.length,
      merged_gap_row_count: rows.length,
    },
  };
}

function loadGapSummary(inputPath) {
  if (!fs.statSync(inputPath).isDirectory()) return loadGapSummaryFile(inputPath);
  const files = gapSummaryFilesInDirectory(inputPath);
  if (files.length === 0) throw new Error(`Gap summary directory has no .json or .csv files: ${inputPath}`);
  return mergeGapSummaries(files.map(loadGapSummaryFile));
}

function liveGapSql({ limit, sqlPageSize = 0, sqlOffset = 0 }) {
  const pageClause = sqlPageSize > 0 ? `\n  LIMIT ${sqlPageSize}\n  OFFSET ${sqlOffset}` : "";
  const rowScope = sqlPageSize > 0
    ? (limit > 0 ? `top_${limit}_brands_page` : "all_brands_page")
    : (limit > 0 ? `top_${limit}_brands` : "all_brands");
  return `
-- Run with a privileged role, save the catalog_live_gap_summary JSON value,
-- then rerun this script with --gap-summary <saved-json-or-directory>.
WITH brand_rows AS (
  SELECT
    brand,
    count(*)::int AS open_rows,
    COALESCE(sum(affected_product_count), 0)::int AS affected_products,
    count(*) FILTER (WHERE gap_type <> 'brand')::int AS actionable_open_rows,
    COALESCE(sum(affected_product_count) FILTER (WHERE gap_type <> 'brand'), 0)::int AS actionable_affected_products,
    count(*) FILTER (WHERE gap_type = 'brand')::int AS brand_rollup_rows,
    COALESCE(sum(affected_product_count) FILTER (WHERE gap_type = 'brand'), 0)::int AS brand_rollup_affected_products,
    count(*) FILTER (
      WHERE gap_type <> 'brand'
        AND sample_metadata->>'last_reconcile_checked_by' = 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand'
    )::int AS direct_duplicate_checked_open_rows,
    COALESCE(sum(affected_product_count) FILTER (
      WHERE gap_type <> 'brand'
        AND sample_metadata->>'last_reconcile_checked_by' = 'exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand'
    ), 0)::int AS direct_duplicate_checked_affected_products,
    count(*) FILTER (
      WHERE gap_type <> 'brand'
        AND sample_metadata->>'last_reconcile_checked_by' = 'exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand'
    )::int AS alias_duplicate_checked_open_rows,
    COALESCE(sum(affected_product_count) FILTER (
      WHERE gap_type <> 'brand'
        AND sample_metadata->>'last_reconcile_checked_by' = 'exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand'
    ), 0)::int AS alias_duplicate_checked_affected_products,
    count(*) FILTER (WHERE needs_verified_ingredients)::int AS needs_ingredients_rows,
    count(*) FILTER (WHERE needs_verified_image)::int AS needs_image_rows,
    count(*) FILTER (WHERE needs_pet_type)::int AS needs_pet_type_rows,
    count(*) FILTER (
      WHERE gap_type <> 'brand'
        AND (
          product_source IN ('amazon', 'chewy', 'petco', 'petsmart', 'target', 'walmart', 'tractorsupply', 'tractor-supply', 'petsense')
          OR source_quality = 'retailer'
        )
    )::int AS retailer_gap_open_rows,
    count(*) FILTER (
      WHERE gap_type <> 'brand'
        AND (
          product_source IN ('dfa', 'opff', 'open-food-facts')
          OR source_quality = 'community'
        )
    )::int AS community_gap_open_rows,
    count(*) FILTER (
      WHERE gap_type <> 'brand'
        AND product_source IN ('web', 'web_verified')
    )::int AS legacy_web_gap_open_rows,
    count(*) FILTER (
      WHERE gap_type <> 'brand'
        AND (
          product_source IN ('user_ocr', 'user-ocr', 'label_ocr', 'label-ocr')
          OR source_quality = 'user_ocr'
        )
    )::int AS user_capture_gap_open_rows,
    count(*) FILTER (
      WHERE gap_type <> 'brand'
        AND source_quality IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
    )::int AS official_quality_gap_open_rows,
    jsonb_strip_nulls(jsonb_build_object(
      'amazon', NULLIF(count(*) FILTER (WHERE gap_type <> 'brand' AND product_source = 'amazon'), 0),
      'brand', NULLIF(count(*) FILTER (WHERE gap_type <> 'brand' AND product_source = 'brand'), 0),
      'web_verified', NULLIF(count(*) FILTER (WHERE gap_type <> 'brand' AND product_source = 'web_verified'), 0),
      'web', NULLIF(count(*) FILTER (WHERE gap_type <> 'brand' AND product_source = 'web'), 0),
      'dfa', NULLIF(count(*) FILTER (WHERE gap_type <> 'brand' AND product_source = 'dfa'), 0),
      'opff', NULLIF(count(*) FILTER (WHERE gap_type <> 'brand' AND product_source = 'opff'), 0),
      'user_ocr', NULLIF(count(*) FILTER (WHERE gap_type <> 'brand' AND product_source = 'user_ocr'), 0)
    )) AS gap_source_profile,
    COALESCE(max(priority_score), 0)::int AS max_priority
  FROM public.catalog_acquisition_queue
  WHERE status = 'open'
  GROUP BY brand
),
totals AS (
  SELECT
    count(*)::int AS brand_count,
    COALESCE(sum(open_rows), 0)::int AS open_rows,
    COALESCE(sum(affected_products), 0)::int AS affected_products,
    COALESCE(sum(actionable_open_rows), 0)::int AS actionable_open_rows,
    COALESCE(sum(actionable_affected_products), 0)::int AS actionable_affected_products,
    COALESCE(sum(brand_rollup_rows), 0)::int AS brand_rollup_rows,
    COALESCE(sum(brand_rollup_affected_products), 0)::int AS brand_rollup_affected_products
  FROM brand_rows
),
ordered_rows AS (
  SELECT
    brand_rows.*,
    row_number() OVER (ORDER BY affected_products DESC, open_rows DESC, brand ASC)::int AS sort_index
  FROM brand_rows
),
bounded_rows AS (
  SELECT *
  FROM ordered_rows
  WHERE ${limit > 0 ? `sort_index <= ${limit}` : "TRUE"}
),
bounded_totals AS (
  SELECT count(*)::int AS scoped_brand_count
  FROM bounded_rows
),
scoped_rows AS (
  SELECT *
  FROM bounded_rows
  ORDER BY sort_index ASC${pageClause}
)
SELECT jsonb_build_object(
  'gap_source', 'live_supabase_catalog_acquisition_queue',
  'gap_exported_at', now(),
  'gap_row_scope', '${rowScope}',
  'input_gap_brand_count', (SELECT brand_count FROM totals),
  'input_gap_open_rows', (SELECT open_rows FROM totals),
  'input_gap_affected_products', (SELECT affected_products FROM totals),
  'input_gap_actionable_open_rows', (SELECT actionable_open_rows FROM totals),
  'input_gap_actionable_affected_products', (SELECT actionable_affected_products FROM totals),
  'input_gap_brand_rollup_rows', (SELECT brand_rollup_rows FROM totals),
  'input_gap_brand_rollup_affected_products', (SELECT brand_rollup_affected_products FROM totals),
  'requested_limit', ${limit},
  'scoped_brand_count', (SELECT scoped_brand_count FROM bounded_totals),
  'page_offset', ${sqlOffset},
  'page_size', ${sqlPageSize},
  'page_row_count', (SELECT count(*)::int FROM scoped_rows),
  'rows', COALESCE((
    SELECT jsonb_agg(to_jsonb(scoped_rows) - 'sort_index' ORDER BY sort_index ASC)
    FROM scoped_rows
  ), '[]'::jsonb)
) AS catalog_live_gap_summary;`.trim();
}


function targetAccessStatus(target = {}) {
  return target.accessStatus || (target.discovery ? "runnable" : "requires_authorized_feed");
}

function sourceSlugFor(target = {}) {
  return normalizeKey(target.sourceSlug || target.sourceOwner || target.brand || "catalog-source");
}

function sourceAliasesFor(target = {}) {
  return [
    sourceSlugFor(target),
    ...(Array.isArray(target.outputAliases) ? target.outputAliases : []),
  ].map(normalizeKey).filter(Boolean);
}

function targetBrandKeys(target = {}) {
  return [
    target.brand,
    ...(Array.isArray(target.aliases) ? target.aliases : []),
  ].map(normalizeKey).filter(Boolean);
}

function loadTargets() {
  const rows = JSON.parse(fs.readFileSync(SOURCE_TARGETS_PATH, "utf8"))
    .map((target) => ({
      ...target,
      sourceSlug: sourceSlugFor(target),
      accessStatus: targetAccessStatus(target),
    }));
  const byBrand = new Map();
  const bySource = new Map();

  for (const target of rows) {
    bySource.set(normalizeKey(target.sourceSlug), target);
    for (const alias of sourceAliasesFor(target)) bySource.set(alias, target);
    for (const key of targetBrandKeys(target)) {
      if (!byBrand.has(key)) byBrand.set(key, target);
    }
  }

  return { rows, byBrand, bySource };
}

function isVerifiedReadyProduct(row = {}) {
  const expiresAt = row.expires_at ? Date.parse(row.expires_at) : NaN;
  return (
    row.pet_type === "dog" || row.pet_type === "cat"
  )
    && row.is_complete_food === true
    && !compact(row.catalog_exclusion_reason)
    && compact(row.ingredient_text)
    && numeric(row.ingredient_count) >= 5
    && VERIFIED_SOURCE_QUALITIES.has(compact(row.source_quality))
    && VERIFIED_INGREDIENT_STATUSES.has(compact(row.ingredient_verification_status))
    && compact(row.image_url)
    && !compact(row.image_url).startsWith("data:")
    && VERIFIED_IMAGE_STATUSES.has(compact(row.image_verification_status))
    && compact(row.source_url)
    && (!Number.isFinite(expiresAt) || expiresAt > Date.now());
}

async function fetchLiveProductStats(targets) {
  const client = supabaseClient();
  if (!client) return new Map();

  const sourceKeys = new Set();
  for (const target of targets.rows) {
    for (const sourceKey of sourceAliasesFor(target)) sourceKeys.add(sourceKey);
  }

  const stats = new Map();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from("product_data")
      .select([
        "source",
        "pet_type",
        "is_complete_food",
        "catalog_exclusion_reason",
        "ingredient_text",
        "ingredient_count",
        "ingredient_verification_status",
        "image_url",
        "image_verification_status",
        "source_quality",
        "source_url",
        "expires_at",
      ].join(","))
      .in("source", [...sourceKeys])
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      if (/permission denied|JWT|not exposed|schema cache/i.test(error.message || "")) return new Map();
      throw error;
    }
    for (const row of data || []) {
      const key = normalizeKey(row.source);
      const sourceStats = stats.get(key) || { verified_ready_rows: 0, total_rows: 0 };
      sourceStats.total_rows += 1;
      if (isVerifiedReadyProduct(row)) sourceStats.verified_ready_rows += 1;
      stats.set(key, sourceStats);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }

  return stats;
}

function isRawQueueRow(row) {
  return (
    Object.hasOwn(row, "affected_product_count")
    || Object.hasOwn(row, "needs_verified_ingredients")
    || Object.hasOwn(row, "needs_verified_image")
    || Object.hasOwn(row, "gap_type")
  );
}

function aggregateGapRows(rows) {
  const byBrand = new Map();

  for (const row of rows) {
    const brand = compact(row.brand || row.source_brand || row.brand_name) || "[blank]";
    const key = normalizeKey(brand);
    const existing = byBrand.get(key) || {
      brand,
      source_slug: compact(row.source_slug || row.source || row.sourceSlug),
      open_rows: 0,
      affected_products: 0,
      actionable_open_rows: 0,
      actionable_affected_products: 0,
      brand_rollup_rows: 0,
      brand_rollup_affected_products: 0,
      direct_duplicate_checked_open_rows: 0,
      direct_duplicate_checked_affected_products: 0,
      alias_duplicate_checked_open_rows: 0,
      alias_duplicate_checked_affected_products: 0,
      needs_ingredients_rows: 0,
      needs_image_rows: 0,
      needs_pet_type_rows: 0,
      retailer_gap_open_rows: 0,
      community_gap_open_rows: 0,
      legacy_web_gap_open_rows: 0,
      user_capture_gap_open_rows: 0,
      official_quality_gap_open_rows: 0,
      gap_source_profile: {},
      max_priority: 0,
    };
    const raw = isRawQueueRow(row);
    existing.open_rows += raw ? 1 : numeric(row.open_rows ?? row.openRows ?? row.rows ?? row.count ?? 1);
    existing.affected_products += raw
      ? numeric(row.affected_product_count)
      : numeric(row.affected_products ?? row.affectedProducts ?? row.affected_product_count ?? row.open_rows ?? 1);
    existing.actionable_open_rows += raw
      ? (row.gap_type === "brand" ? 0 : 1)
      : numeric(row.actionable_open_rows ?? row.actionableOpenRows ?? row.open_rows ?? row.openRows ?? row.rows ?? row.count ?? 1);
    existing.actionable_affected_products += raw
      ? (row.gap_type === "brand" ? 0 : numeric(row.affected_product_count))
      : numeric(row.actionable_affected_products ?? row.actionableAffectedProducts ?? row.affected_products ?? row.affectedProducts ?? row.affected_product_count ?? row.open_rows ?? 1);
    existing.brand_rollup_rows += raw
      ? (row.gap_type === "brand" ? 1 : 0)
      : numeric(row.brand_rollup_rows ?? row.brandRollupRows);
    existing.brand_rollup_affected_products += raw
      ? (row.gap_type === "brand" ? numeric(row.affected_product_count) : 0)
      : numeric(row.brand_rollup_affected_products ?? row.brandRollupAffectedProducts);
    const lastCheckedBy = compact(row.sample_metadata?.last_reconcile_checked_by || row.sampleMetadata?.last_reconcile_checked_by);
    const directChecked = lastCheckedBy === "exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand";
    const aliasChecked = lastCheckedBy === "exclude_alias_verified_duplicate_legacy_catalog_rows_for_brand";
    existing.direct_duplicate_checked_open_rows += raw
      ? (row.gap_type === "brand" || !directChecked ? 0 : 1)
      : numeric(row.direct_duplicate_checked_open_rows ?? row.directDuplicateCheckedOpenRows);
    existing.direct_duplicate_checked_affected_products += raw
      ? (row.gap_type === "brand" || !directChecked ? 0 : numeric(row.affected_product_count))
      : numeric(row.direct_duplicate_checked_affected_products ?? row.directDuplicateCheckedAffectedProducts);
    existing.alias_duplicate_checked_open_rows += raw
      ? (row.gap_type === "brand" || !aliasChecked ? 0 : 1)
      : numeric(row.alias_duplicate_checked_open_rows ?? row.aliasDuplicateCheckedOpenRows);
    existing.alias_duplicate_checked_affected_products += raw
      ? (row.gap_type === "brand" || !aliasChecked ? 0 : numeric(row.affected_product_count))
      : numeric(row.alias_duplicate_checked_affected_products ?? row.aliasDuplicateCheckedAffectedProducts);
    existing.needs_ingredients_rows += raw
      ? (row.needs_verified_ingredients ? 1 : 0)
      : numeric(row.needs_ingredients_rows ?? row.needsVerifiedIngredientsRows);
    existing.needs_image_rows += raw
      ? (row.needs_verified_image ? 1 : 0)
      : numeric(row.needs_image_rows ?? row.needsVerifiedImageRows);
    existing.needs_pet_type_rows += raw
      ? (row.needs_pet_type ? 1 : 0)
      : numeric(row.needs_pet_type_rows ?? row.needsPetTypeRows);
    const rawProductSource = normalizeKey(row.product_source || row.productSource || row.product_source_key || row.sourceKey);
    const rawSourceQuality = normalizeKey(row.source_quality || row.sourceQuality);
    if (raw) {
      const sourceKey = rawProductSource || "unknown";
      existing.gap_source_profile[sourceKey] = (existing.gap_source_profile[sourceKey] || 0) + 1;
      if (RETAILER_DEMAND_SOURCES.has(sourceKey) || rawSourceQuality === "retailer") existing.retailer_gap_open_rows += 1;
      if (COMMUNITY_DEMAND_SOURCES.has(sourceKey) || rawSourceQuality === "community") existing.community_gap_open_rows += 1;
      if (LEGACY_WEB_DEMAND_SOURCES.has(sourceKey)) existing.legacy_web_gap_open_rows += 1;
      if (USER_CAPTURE_DEMAND_SOURCES.has(sourceKey) || rawSourceQuality === "user-ocr" || rawSourceQuality === "user_ocr") existing.user_capture_gap_open_rows += 1;
      if (OFFICIAL_DEMAND_SOURCE_QUALITIES.has(rawSourceQuality)) existing.official_quality_gap_open_rows += 1;
    } else {
      existing.retailer_gap_open_rows += numeric(row.retailer_gap_open_rows ?? row.retailerGapOpenRows);
      existing.community_gap_open_rows += numeric(row.community_gap_open_rows ?? row.communityGapOpenRows);
      existing.legacy_web_gap_open_rows += numeric(row.legacy_web_gap_open_rows ?? row.legacyWebGapOpenRows);
      existing.user_capture_gap_open_rows += numeric(row.user_capture_gap_open_rows ?? row.userCaptureGapOpenRows);
      existing.official_quality_gap_open_rows += numeric(row.official_quality_gap_open_rows ?? row.officialQualityGapOpenRows);
      const profile = row.gap_source_profile || row.gapSourceProfile;
      if (profile && typeof profile === "object" && !Array.isArray(profile)) {
        for (const [sourceKey, count] of Object.entries(profile)) {
          const key = normalizeKey(sourceKey);
          if (!key) continue;
          existing.gap_source_profile[key] = (existing.gap_source_profile[key] || 0) + numeric(count);
        }
      }
    }
    existing.max_priority = Math.max(existing.max_priority, numeric(row.priority_score ?? row.max_priority));
    byBrand.set(key, existing);
  }

  return [...byBrand.values()].filter((row) => row.open_rows > 0);
}

function sourceProfileText(profile = {}) {
  return Object.entries(profile || {})
    .map(([source, count]) => ({ source: compact(source), count: numeric(count) }))
    .filter((row) => row.source && row.count > 0)
    .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source))
    .slice(0, 6)
    .map((row) => `${row.source}:${row.count}`)
    .join("; ");
}

function supabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    || ""
  );
  if (!supabaseUrl || !key) return null;
  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function fetchLiveGapRows() {
  const client = supabaseClient();
  if (!client) {
    throw new Error("Live mode requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY.");
  }

  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from("catalog_acquisition_queue")
      .select([
        "brand",
        "gap_type",
        "priority_score",
        "affected_product_count",
        "needs_verified_ingredients",
        "needs_verified_image",
        "needs_pet_type",
        "product_source",
        "source_quality",
        "sample_metadata",
        "status",
      ].join(","))
      .eq("status", "open")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function findReportPaths(importRoot, target) {
  const paths = [];
  for (const slug of sourceAliasesFor(target)) {
    const dir = path.join(importRoot, slug);
    for (const file of ["report.json", "run-report.json"]) {
      const filePath = path.join(dir, file);
      if (fs.existsSync(filePath)) paths.push(filePath);
    }
  }
  return paths;
}

function findSqlManifest(importRoot, target) {
  for (const slug of sourceAliasesFor(target)) {
    for (const dirName of ["sql", "sql-mcp"]) {
      const filePath = path.join(importRoot, slug, dirName, "manifest.json");
      if (fs.existsSync(filePath)) return filePath;
    }
  }
  return "";
}

function findMissingLiveManifest(importRoot, target) {
  const candidates = [];
  for (const slug of sourceAliasesFor(target)) {
    const dir = path.join(importRoot, slug);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith("missing-live-")) continue;
      const manifestPath = path.join(dir, entry.name, "manifest.json");
      if (fs.existsSync(manifestPath)) {
        const stats = fs.statSync(manifestPath);
        candidates.push({ manifestPath, mtimeMs: stats.mtimeMs, current: entry.name === "missing-live-current" });
      }
    }
  }
  candidates.sort((left, right) => Number(right.current) - Number(left.current) || right.mtimeMs - left.mtimeMs);
  return candidates[0]?.manifestPath || "";
}

function parseImportWarningSqlRows(report) {
  const match = compact(report.import_warnings).match(/SQL rows:\s*([0-9]+)/i);
  return match ? numeric(match[1]) : 0;
}

function liveStatsForTarget(liveProductStats, target = {}) {
  const combined = { verified_ready_rows: 0, total_rows: 0 };
  for (const sourceKey of sourceAliasesFor(target)) {
    const sourceStats = liveProductStats.get(sourceKey);
    if (!sourceStats) continue;
    combined.verified_ready_rows += numeric(sourceStats.verified_ready_rows);
    combined.total_rows += numeric(sourceStats.total_rows);
  }
  return combined;
}

function localSourceState(importRoot, target, liveProductStats = new Map()) {
  if (!target || target.accessStatus !== "runnable") {
    return {
      local_status: "not_applicable",
      report_paths: [],
      sql_manifest_path: "",
      missing_live_manifest_path: "",
      generated_sql_rows: 0,
      missing_live_rows: null,
      rejected_missing_rows: 0,
      complete_food_rows: 0,
      feed_rows: 0,
      live_verified_ready_rows: 0,
      live_total_rows: 0,
    };
  }

  const reportPaths = findReportPaths(importRoot, target);
  const reports = reportPaths.map((reportPath) => readJsonIfExists(reportPath, {}));
  const sqlManifestPath = findSqlManifest(importRoot, target);
  const sqlManifest = readJsonIfExists(sqlManifestPath, {});
  const missingLiveManifestPath = findMissingLiveManifest(importRoot, target);
  const missingLiveManifest = readJsonIfExists(missingLiveManifestPath, null);
  const generatedSqlRows = numeric(sqlManifest.total_sql_rows) || reports.reduce((sum, report) => sum + parseImportWarningSqlRows(report), 0);
  const completeFoodRows = reports.reduce((sum, report) => sum + numeric(report.feed?.complete_food_rows), 0);
  const feedRows = reports.reduce((sum, report) => sum + numeric(report.feed?.rows), 0);
  const liveStats = liveStatsForTarget(liveProductStats, target);
  const missingLiveRows = missingLiveManifest ? numeric(missingLiveManifest.total_missing_rows) : null;
  const rejectedMissingRows = missingLiveManifest ? numeric(missingLiveManifest.rejected_missing_rows) : 0;
  const missingLiveChunks = Array.isArray(missingLiveManifest?.chunks) ? missingLiveManifest.chunks.length : 0;

  let localStatus = "no_local_extraction";
  if (missingLiveRows !== null && missingLiveRows > 0 && missingLiveChunks > 0) {
    localStatus = "missing_live_sql_ready";
  } else if (missingLiveRows === 0 && rejectedMissingRows > 0) {
    localStatus = "missing_live_candidates_rejected";
  } else if (generatedSqlRows > 0 && liveStats.verified_ready_rows >= generatedSqlRows) {
    localStatus = "live_coverage_no_missing_rows";
  } else if (missingLiveRows === 0 && (generatedSqlRows > 0 || completeFoodRows > 0)) {
    localStatus = "live_coverage_no_missing_rows";
  } else if (generatedSqlRows > 0) {
    localStatus = "generated_source_sql_ready";
  } else if (reportPaths.length > 0 && completeFoodRows === 0) {
    localStatus = "no_verified_candidates";
  } else if (reportPaths.length > 0) {
    localStatus = "local_report_available";
  }

  return {
    local_status: localStatus,
    report_paths: reportPaths,
    sql_manifest_path: sqlManifestPath,
    missing_live_manifest_path: missingLiveManifestPath,
    generated_sql_rows: generatedSqlRows,
    missing_live_rows: missingLiveRows,
    rejected_missing_rows: rejectedMissingRows,
    complete_food_rows: completeFoodRows,
    feed_rows: feedRows,
    live_verified_ready_rows: liveStats.verified_ready_rows,
    live_total_rows: liveStats.total_rows,
  };
}

function sourceQualityFor(target = {}) {
  if (target.sourcePriority === "gdsn") return "gdsn";
  if (target.sourcePriority === "retailer") return "retailer_verified";
  if (target.sourcePriority === "manufacturer") return "manufacturer";
  return "official";
}

function commandForAction(action, target, local) {
  if (!target) return "Add a source target entry or generate an authorized-feed request for this brand.";
  if (action === "run_official_importer") {
    return `npm run catalog:scrape-all -- --source ${shellQuote(target.sourceSlug)} --mode import --limit 1 --strict-import-validation`;
  }
  if (action === "expand_official_source_import") {
    return `Official import is exhausted for current local rows but live gaps remain. Expand ${target.sourceSlug} discovery/source parser coverage, then rerun: npm run catalog:scrape-all -- --source ${shellQuote(target.sourceSlug)} --mode extract --limit 1`;
  }
  if (action === "reconcile_queue_hygiene") {
    return `Audit duplicate closures, then run bounded SQL: SELECT public.exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand('${String(target.brand).replace(/'/g, "''")}', 50);`;
  }
  if (action === "apply_missing_live_sql") {
    return `Review and apply SQL chunks from ${local.missing_live_manifest_path}, then run catalog live verified contract audit.`;
  }
  if (action === "apply_generated_source_sql") {
    return `Review and apply source SQL manifest ${local.sql_manifest_path}, then refresh catalog acquisition queue and audit.`;
  }
  if (action === "request_authorized_feed") {
    return `npm run catalog:authorized-feed-request-pack -- --brand ${shellQuote(target.brand)} --all-restricted`;
  }
  if (action === "collect_browser_snapshot") {
    return `Collect rendered browser JSON under inputs/catalog-browser-snapshots/${target.sourceSlug}/, then run the snapshot importer from the request-pack docs.`;
  }
  if (action === "inspect_extraction_gates_or_request_feed") {
    if (local.local_status === "missing_live_candidates_rejected") {
      return `Inspect validation_rejections in ${local.missing_live_manifest_path}; rerun extraction from official evidence or request an authorized feed.`;
    }
    return `Inspect ${local.report_paths[0] || "the source report"}; if official pages lack exact ingredients/images, request an authorized feed.`;
  }
  if (action === "use_shared_source_importer_or_feed") {
    return "Use the shared source importer noted in catalog-source-targets.json or request authorized source-owner feed.";
  }
  if (action === "mark_discontinued_or_exclude_queue_noise") {
    return "Confirm discontinued status, then exclude/resolve matching acquisition queue rows.";
  }
  return "";
}

function chooseAction({ target, local, gap }) {
  if (!target) return "add_source_target_or_feed_request";
  if (target.accessStatus === "requires_authorized_feed" || target.accessStatus === "blocked_by_source") {
    return "request_authorized_feed";
  }
  if (target.accessStatus === "requires_browser_snapshot") return "collect_browser_snapshot";
  if (target.accessStatus === "shared_catalog_source") return "use_shared_source_importer_or_feed";
  if (target.accessStatus === "discontinued") return "mark_discontinued_or_exclude_queue_noise";

  if (local.local_status === "missing_live_sql_ready") return "apply_missing_live_sql";
  if (local.local_status === "missing_live_candidates_rejected") return "inspect_extraction_gates_or_request_feed";
  if (local.local_status === "generated_source_sql_ready") return "apply_generated_source_sql";
  if (local.local_status === "live_coverage_no_missing_rows") {
    const directCheckedRows = numeric(gap?.direct_duplicate_checked_open_rows);
    const actionableRows = numeric(gap?.actionable_open_rows);
    if (directCheckedRows >= Math.min(25, Math.max(actionableRows, 1))) {
      return "expand_official_source_import";
    }
    return "reconcile_queue_hygiene";
  }
  if (local.local_status === "no_local_extraction") return "run_official_importer";
  if (local.local_status === "no_verified_candidates") return "inspect_extraction_gates_or_request_feed";
  return "run_official_importer";
}

function priorityScore(row) {
  return (
    numeric(row.affected_products) * 100
    + numeric(row.open_rows) * 20
    + numeric(row.needs_ingredients_rows) * 10
    + numeric(row.needs_image_rows) * 5
    + (row.coverage_tier === "tier_1_us_retail" ? 1000 : 0)
    - (ACTION_ORDER[row.recommended_action] || 99)
    - (LOCAL_STATUS_ORDER[row.local_status] || 99)
  );
}

function buildPlanRows(gapRows, targets, importRoot, liveProductStats = new Map()) {
  const aggregated = aggregateGapRows(gapRows);
  const rows = aggregated.map((gap) => {
    const target = (
      targets.bySource.get(normalizeKey(gap.source_slug))
      || targets.byBrand.get(normalizeKey(gap.brand))
      || null
    );
    const local = localSourceState(importRoot, target, liveProductStats);
    const action = chooseAction({ target, local, gap });
    const row = {
      brand: gap.brand,
      source_slug: target?.sourceSlug || compact(gap.source_slug),
      access_status: target?.accessStatus || "unmapped",
      source_owner: target?.sourceOwner || "",
      source_priority: target?.sourcePriority || "",
      coverage_tier: target?.coverageTier || "",
      open_rows: gap.open_rows,
      affected_products: gap.affected_products,
      actionable_open_rows: gap.actionable_open_rows,
      actionable_affected_products: gap.actionable_affected_products,
      brand_rollup_rows: gap.brand_rollup_rows,
      brand_rollup_affected_products: gap.brand_rollup_affected_products,
      direct_duplicate_checked_open_rows: gap.direct_duplicate_checked_open_rows,
      direct_duplicate_checked_affected_products: gap.direct_duplicate_checked_affected_products,
      alias_duplicate_checked_open_rows: gap.alias_duplicate_checked_open_rows,
      alias_duplicate_checked_affected_products: gap.alias_duplicate_checked_affected_products,
      retailer_gap_open_rows: gap.retailer_gap_open_rows,
      community_gap_open_rows: gap.community_gap_open_rows,
      legacy_web_gap_open_rows: gap.legacy_web_gap_open_rows,
      user_capture_gap_open_rows: gap.user_capture_gap_open_rows,
      official_quality_gap_open_rows: gap.official_quality_gap_open_rows,
      gap_source_profile: sourceProfileText(gap.gap_source_profile),
      needs_ingredients_rows: gap.needs_ingredients_rows,
      needs_image_rows: gap.needs_image_rows,
      needs_pet_type_rows: gap.needs_pet_type_rows,
      local_status: local.local_status,
      generated_sql_rows: local.generated_sql_rows,
      live_verified_ready_rows: local.live_verified_ready_rows,
      live_total_rows: local.live_total_rows,
      missing_live_rows: local.missing_live_rows ?? "",
      rejected_missing_rows: local.rejected_missing_rows || "",
      complete_food_rows: local.complete_food_rows,
      evidence_path: local.missing_live_manifest_path || local.sql_manifest_path || local.report_paths[0] || "",
      recommended_action: action,
      next_command: commandForAction(action, target, local),
      notes: target?.notes || "",
      priority_score: 0,
    };
    row.priority_score = priorityScore(row);
    return row;
  });

  rows.sort((left, right) => (
    (ACTION_ORDER[left.recommended_action] || 99) - (ACTION_ORDER[right.recommended_action] || 99)
    || right.priority_score - left.priority_score
    || right.affected_products - left.affected_products
    || left.brand.localeCompare(right.brand)
  ));
  return rows;
}

function summarize(rows, options) {
  const countsFor = (field) => rows.reduce((map, row) => {
    const key = compact(row[field]) || "unknown";
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});

  return {
    generated_at: new Date().toISOString(),
    source_targets_path: SOURCE_TARGETS_PATH,
    gap_source: options.gapSource,
    gap_exported_at: options.gapExportedAt || "",
    gap_row_scope: options.gapRowScope || "",
    requested_limit: numeric(options.requestedLimit),
    scoped_brand_count: numeric(options.scopedBrandCount),
    merged_gap_summary_files: numeric(options.mergedGapSummaryFiles),
    merged_gap_row_count: numeric(options.mergedGapRowCount),
    import_root: options.importRoot,
    brand_count: rows.length,
    total_open_rows: rows.reduce((sum, row) => sum + numeric(row.open_rows), 0),
    total_affected_products: rows.reduce((sum, row) => sum + numeric(row.affected_products), 0),
    total_actionable_open_rows: rows.reduce((sum, row) => sum + numeric(row.actionable_open_rows), 0),
    total_actionable_affected_products: rows.reduce((sum, row) => sum + numeric(row.actionable_affected_products), 0),
    total_brand_rollup_rows: rows.reduce((sum, row) => sum + numeric(row.brand_rollup_rows), 0),
    total_brand_rollup_affected_products: rows.reduce((sum, row) => sum + numeric(row.brand_rollup_affected_products), 0),
    total_retailer_gap_open_rows: rows.reduce((sum, row) => sum + numeric(row.retailer_gap_open_rows), 0),
    total_community_gap_open_rows: rows.reduce((sum, row) => sum + numeric(row.community_gap_open_rows), 0),
    total_legacy_web_gap_open_rows: rows.reduce((sum, row) => sum + numeric(row.legacy_web_gap_open_rows), 0),
    total_user_capture_gap_open_rows: rows.reduce((sum, row) => sum + numeric(row.user_capture_gap_open_rows), 0),
    total_official_quality_gap_open_rows: rows.reduce((sum, row) => sum + numeric(row.official_quality_gap_open_rows), 0),
    input_gap_brand_count: numeric(options.inputGapBrandCount) || rows.length,
    input_gap_open_rows: numeric(options.inputGapOpenRows) || rows.reduce((sum, row) => sum + numeric(row.open_rows), 0),
    input_gap_affected_products: numeric(options.inputGapAffectedProducts) || rows.reduce((sum, row) => sum + numeric(row.affected_products), 0),
    input_gap_actionable_open_rows: numeric(options.inputGapActionableOpenRows) || rows.reduce((sum, row) => sum + numeric(row.actionable_open_rows), 0),
    input_gap_actionable_affected_products: numeric(options.inputGapActionableAffectedProducts) || rows.reduce((sum, row) => sum + numeric(row.actionable_affected_products), 0),
    input_gap_brand_rollup_rows: numeric(options.inputGapBrandRollupRows) || rows.reduce((sum, row) => sum + numeric(row.brand_rollup_rows), 0),
    input_gap_brand_rollup_affected_products: numeric(options.inputGapBrandRollupAffectedProducts) || rows.reduce((sum, row) => sum + numeric(row.brand_rollup_affected_products), 0),
    recommended_action_counts: countsFor("recommended_action"),
    access_status_counts: countsFor("access_status"),
    local_status_counts: countsFor("local_status"),
  };
}

function writeCsv(rows, filePath) {
  const headers = [
    "brand",
    "source_slug",
    "access_status",
    "coverage_tier",
    "open_rows",
    "affected_products",
    "actionable_open_rows",
    "actionable_affected_products",
    "brand_rollup_rows",
    "brand_rollup_affected_products",
    "direct_duplicate_checked_open_rows",
    "direct_duplicate_checked_affected_products",
    "alias_duplicate_checked_open_rows",
    "alias_duplicate_checked_affected_products",
    "retailer_gap_open_rows",
    "community_gap_open_rows",
    "legacy_web_gap_open_rows",
    "user_capture_gap_open_rows",
    "official_quality_gap_open_rows",
    "gap_source_profile",
    "needs_ingredients_rows",
    "needs_image_rows",
    "local_status",
    "generated_sql_rows",
    "live_verified_ready_rows",
    "live_total_rows",
    "missing_live_rows",
    "rejected_missing_rows",
    "recommended_action",
    "priority_score",
    "evidence_path",
    "next_command",
  ];
  fs.writeFileSync(filePath, `${[headers.join(","), ...rows.map((row) => csvLine(row, headers))].join("\n")}\n`, "utf8");
}

function writeMarkdown(summary, rows, filePath) {
  const lines = [
    "# Catalog Live Gap Action Plan",
    "",
    `Generated at: ${summary.generated_at}`,
    `Gap source: ${summary.gap_source}`,
    ...(summary.gap_exported_at ? [`Gap exported at: ${summary.gap_exported_at}`] : []),
    ...(summary.gap_row_scope ? [`Gap row scope: ${summary.gap_row_scope}`] : []),
    ...(summary.merged_gap_summary_files ? [`Merged gap summary files: ${summary.merged_gap_summary_files}`] : []),
    ...(summary.scoped_brand_count ? [`Scoped brand count: ${summary.scoped_brand_count}`] : []),
    "",
    "## Summary",
    "",
    `- Brands: ${summary.brand_count}`,
    `- Open rows: ${summary.total_open_rows}`,
    `- Affected products: ${summary.total_affected_products}`,
    `- Actionable open rows: ${summary.total_actionable_open_rows}`,
    `- Actionable affected products: ${summary.total_actionable_affected_products}`,
    `- Brand rollup rows: ${summary.total_brand_rollup_rows}`,
    `- Brand rollup affected products: ${summary.total_brand_rollup_affected_products}`,
    `- Retailer-origin open rows: ${summary.total_retailer_gap_open_rows}`,
    `- Community-origin open rows: ${summary.total_community_gap_open_rows}`,
    `- Legacy web-origin open rows: ${summary.total_legacy_web_gap_open_rows}`,
    `- User-capture open rows: ${summary.total_user_capture_gap_open_rows}`,
    `- Official-quality open rows: ${summary.total_official_quality_gap_open_rows}`,
    `- Input brands: ${summary.input_gap_brand_count}`,
    `- Input open rows: ${summary.input_gap_open_rows}`,
    `- Input affected products: ${summary.input_gap_affected_products}`,
    `- Input actionable open rows: ${summary.input_gap_actionable_open_rows}`,
    `- Input actionable affected products: ${summary.input_gap_actionable_affected_products}`,
    "",
    "## Recommended Actions",
    "",
    ...Object.entries(summary.recommended_action_counts).map(([action, count]) => `- ${action}: ${count}`),
    "",
    "## Top Rows",
    "",
    "| Brand | Action | Access | Local | Open | Affected | Source Profile | Rejected | Evidence |",
    "|---|---|---|---|---:|---:|---|---:|---|",
    ...rows.slice(0, 30).map((row) => [
      row.brand,
      row.recommended_action,
      row.access_status,
      row.local_status,
      row.open_rows,
      row.affected_products,
      row.gap_source_profile,
      row.rejected_missing_rows,
      row.evidence_path,
    ].map((value) => compact(value).replace(/\|/g, "\\|")).join(" | ")).map((line) => `| ${line} |`),
    "",
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function writeSqlPages({ outputDir, limit, sqlPageSize, sqlPageCount }) {
  if (sqlPageSize <= 0) throw new Error("--write-sql-pages requires --sql-page-size > 0.");
  if (sqlPageCount <= 0) throw new Error("--write-sql-pages requires --sql-page-count > 0.");
  fs.mkdirSync(outputDir, { recursive: true });
  for (const entry of fs.readdirSync(outputDir, { withFileTypes: true })) {
    if (!entry.isFile() || !/^live-gap-page-[0-9]+\.(?:sql|json)$/i.test(entry.name)) continue;
    fs.unlinkSync(path.join(outputDir, entry.name));
  }
  const pages = [];
  for (let index = 0; index < sqlPageCount; index += 1) {
    const offset = index * sqlPageSize;
    const file = `live-gap-page-${String(index + 1).padStart(4, "0")}.sql`;
    const filePath = path.join(outputDir, file);
    fs.writeFileSync(filePath, `${liveGapSql({ limit, sqlPageSize, sqlOffset: offset })}\n`, "utf8");
    pages.push({
      file,
      offset,
      page_size: sqlPageSize,
      save_result_as: `live-gap-page-${String(index + 1).padStart(4, "0")}.json`,
    });
  }
  const manifest = {
    generated_at: new Date().toISOString(),
    purpose: "Run each SQL page with a privileged Supabase role, save each catalog_live_gap_summary JSON value, then pass the directory of saved JSON pages to --gap-summary.",
    requested_limit: limit,
    page_size: sqlPageSize,
    page_count: sqlPageCount,
    pages,
    merge_command: `node scripts/catalog-live-gap-action-plan.mjs --gap-summary ${outputDir} --output-dir outputs/catalog-live-gap-action-plan/current --limit 0`,
  };
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Wrote ${pages.length} SQL pages to ${outputDir}`);
  console.log(`Manifest: ${path.join(outputDir, "manifest.json")}`);
}

function printSummary(summary, rows, outputDir) {
  console.log("Catalog live gap action plan");
  console.log(`Brands: ${summary.brand_count}`);
  console.log(`Open rows: ${summary.total_open_rows}`);
  console.log(`Affected products: ${summary.total_affected_products}`);
  console.table(rows.slice(0, 20).map((row) => ({
    brand: row.brand,
    action: row.recommended_action,
    access: row.access_status,
    local: row.local_status,
    rejected: row.rejected_missing_rows,
    open: row.open_rows,
    affected: row.affected_products,
  })));
  console.log(`Report: ${path.join(outputDir, "action-plan.json")}`);
}

async function main() {
  if (hasArg("--help")) {
    console.log([
      "Usage: node scripts/catalog-live-gap-action-plan.mjs [--live | --gap-summary file]",
      "",
      "Maps acquisition gaps to the next safe catalog action.",
      "",
      "Options:",
      "  --live                    Read open catalog_acquisition_queue rows from Supabase.",
      "  --gap-summary <path>      Read exported gap rows from a JSON/CSV file or directory of paged exports.",
      "  --gap-source <name>       Override gap source for exported summaries.",
      "  --gap-exported-at <iso>    Override live export timestamp for exported summaries.",
      "  --gap-row-scope <scope>    Optional export scope, e.g. all or target_brands.",
      "  --import-root <dir>       Default: outputs/catalog-source-imports",
      "  --output-dir <dir>        Default: outputs/catalog-live-gap-action-plan",
      "  --limit <n>               Default: 50, use 0 for all rows.",
      "  --sql                     Print privileged SQL for exporting a live gap summary JSON object.",
      "  --sql-page-size <n>        Print paged SQL with LIMIT n for large all-brand exports.",
      "  --sql-offset <n>           Zero-based OFFSET for --sql-page-size.",
      "  --sql-page-count <n>       Page count for --write-sql-pages.",
      "  --write-sql-pages <dir>    Write a repeatable bundle of paged privileged SQL files.",
      "  --skip-live-product-stats  Do not read product_data for live source counts.",
      "  --json                    Print full JSON report.",
      "",
      "When Supabase read credentials are available, the planner also checks live",
      "product_data counts so already-imported generated SQL manifests are treated",
      "as queue hygiene instead of duplicate import work.",
    ].join("\n"));
    return;
  }

  const importRoot = compact(getArg("--import-root", DEFAULT_IMPORT_ROOT));
  const outputDir = compact(getArg("--output-dir", DEFAULT_OUTPUT_DIR));
  const gapSummaryPath = compact(getArg("--gap-summary"));
  const gapSourceOverride = compact(getArg("--gap-source"));
  const gapExportedAtOverride = compact(getArg("--gap-exported-at"));
  const gapRowScopeOverride = compact(getArg("--gap-row-scope"));
  const limit = nonNegativeInteger(getArg("--limit"), DEFAULT_LIMIT);
  const sqlPageSize = nonNegativeInteger(getArg("--sql-page-size"), 0);
  const sqlOffset = nonNegativeInteger(getArg("--sql-offset"), 0);
  const sqlPageCount = nonNegativeInteger(getArg("--sql-page-count"), 0);
  const writeSqlPagesDir = compact(getArg("--write-sql-pages"));
  const skipLiveProductStats = hasArg("--skip-live-product-stats") || hasArg("--no-live-product-stats");
  let gapRows = [];
  let gapSource = "";
  let gapMetadata = {};

  if (hasArg("--sql")) {
    console.log(liveGapSql({ limit, sqlPageSize, sqlOffset }));
    return;
  }

  if (writeSqlPagesDir) {
    writeSqlPages({ outputDir: writeSqlPagesDir, limit, sqlPageSize, sqlPageCount });
    return;
  }

  if (hasArg("--live")) {
    gapRows = await fetchLiveGapRows();
    gapSource = "live_supabase_catalog_acquisition_queue";
  } else if (gapSummaryPath) {
    if (!fs.existsSync(gapSummaryPath)) throw new Error(`Missing gap summary: ${gapSummaryPath}`);
    const loaded = loadGapSummary(gapSummaryPath);
    gapRows = loaded.rows;
    gapMetadata = loaded.metadata || {};
    gapSource = gapSourceOverride || gapMetadata.gap_source || gapSummaryPath;
  } else {
    throw new Error("Provide --live or --gap-summary <json|csv>.");
  }

  const targets = loadTargets();
  const liveProductStats = skipLiveProductStats ? new Map() : await fetchLiveProductStats(targets);
  let rows = buildPlanRows(gapRows, targets, importRoot, liveProductStats);
  if (limit > 0) rows = rows.slice(0, limit);
  const summary = summarize(rows, {
    gapSource,
    gapExportedAt: gapExportedAtOverride || gapMetadata.gap_exported_at || "",
    gapRowScope: gapRowScopeOverride || gapMetadata.gap_row_scope || "",
    inputGapBrandCount: gapMetadata.input_gap_brand_count,
    inputGapOpenRows: gapMetadata.input_gap_open_rows,
    inputGapAffectedProducts: gapMetadata.input_gap_affected_products,
    inputGapActionableOpenRows: gapMetadata.input_gap_actionable_open_rows,
    inputGapActionableAffectedProducts: gapMetadata.input_gap_actionable_affected_products,
    inputGapBrandRollupRows: gapMetadata.input_gap_brand_rollup_rows,
    inputGapBrandRollupAffectedProducts: gapMetadata.input_gap_brand_rollup_affected_products,
    requestedLimit: gapMetadata.requested_limit,
    scopedBrandCount: gapMetadata.scoped_brand_count,
    mergedGapSummaryFiles: gapMetadata.merged_gap_summary_files,
    mergedGapRowCount: gapMetadata.merged_gap_row_count,
    importRoot,
  });
  const report = { ...summary, rows };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "action-plan.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeCsv(rows, path.join(outputDir, "action-plan.csv"));
  writeMarkdown(summary, rows, path.join(outputDir, "action-plan.md"));

  if (hasArg("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printSummary(summary, rows, outputDir);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
