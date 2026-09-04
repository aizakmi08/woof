import fs from "node:fs";
import path from "node:path";

const DEFAULT_MANIFEST_PATH = "outputs/catalog-authorized-feed-requests/current/manifest.json";
const DEFAULT_INPUT_DIR = "inputs/catalog-authorized-feeds";
const DEFAULT_SNAPSHOT_DIR = "inputs/catalog-browser-snapshots";
const DEFAULT_IMPORT_OUTPUT_DIR = "outputs/catalog-authorized-feed-imports";
const FEED_EXTENSIONS = new Set([".csv", ".tsv", ".tab", ".psv", ".txt", ".json", ".jsonl", ".ndjson", ".xml"]);
const ACCESS_STATUS_ORDER = {
  requires_authorized_feed: 1,
  requires_browser_snapshot: 2,
  blocked_by_source: 3,
  shared_catalog_source: 4,
  discontinued: 5,
};
const READINESS_ORDER = {
  import_failed: 1,
  import_sql_ready: 2,
  ready_for_feed_import: 3,
  ready_for_snapshot_import: 4,
  waiting_for_authorized_feed: 5,
  waiting_for_browser_snapshot: 6,
  blocked_source_requires_authorized_feed: 7,
  shared_source_waiting_for_feed_or_runnable_target: 8,
  discontinued: 9,
};

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

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function walkFiles(rootDir, predicate) {
  const files = [];
  if (!rootDir || !fs.existsSync(rootDir)) return files;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && predicate(fullPath)) {
        files.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return files;
}

function stripCompressionExtension(filePath) {
  return filePath.replace(/\.gz$/i, "");
}

function feedExtension(filePath) {
  return path.extname(stripCompressionExtension(filePath)).toLowerCase();
}

function isFeedFile(filePath) {
  return FEED_EXTENSIONS.has(feedExtension(filePath));
}

function fileBytes(files) {
  return files.reduce((sum, filePath) => {
    try {
      return sum + fs.statSync(filePath).size;
    } catch {
      return sum;
    }
  }, 0);
}

function loadManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing authorized feed request manifest: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.targets)) {
    throw new Error(`Authorized feed request manifest has no targets array: ${manifestPath}`);
  }
  return manifest;
}

function loadGapRows(gapSummaryPath) {
  const filePath = compact(gapSummaryPath);
  if (!filePath) return [];
  if (!fs.existsSync(filePath)) throw new Error(`Missing gap summary file: ${filePath}`);

  const text = fs.readFileSync(filePath, "utf8");
  if (/\.json$/i.test(filePath)) {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.rows)) return parsed.rows;
    if (Array.isArray(parsed.data)) return parsed.data;
    if (Array.isArray(parsed.result)) return parsed.result;
    if (Array.isArray(parsed.results?.[0]?.rows)) return parsed.results[0].rows;
    if (Array.isArray(parsed.catalog_restricted_source_gaps)) return parsed.catalog_restricted_source_gaps;
    return [];
  }

  return parseCsv(text);
}

function buildGapIndex(rows) {
  const bySource = new Map();
  const byBrand = new Map();

  for (const row of rows) {
    const sourceKey = normalizeKey(row.source_slug || row.source || row.sourceSlug);
    const brandKey = normalizeKey(row.brand);
    if (sourceKey) bySource.set(sourceKey, row);
    if (brandKey) byBrand.set(brandKey, row);
  }

  return { bySource, byBrand };
}

function gapForTarget(target, gapIndex) {
  return (
    gapIndex.bySource.get(normalizeKey(target.source_slug))
    || gapIndex.byBrand.get(normalizeKey(target.brand))
    || {}
  );
}

function sourceFeedRoot(inputDir, sourceSlug) {
  return path.join(inputDir, sourceSlug);
}

function sourceSnapshotRoot(snapshotDir, sourceSlug) {
  return path.join(snapshotDir, sourceSlug);
}

function feedDropPath(inputDir, sourceSlug) {
  return path.join(sourceFeedRoot(inputDir, sourceSlug), "feed.csv");
}

function isBroadRetailCatalogTarget(target = {}) {
  return target.source_priority === "retailer"
    && (
      /\bretail\s+catalog\b/i.test(target.brand || "")
      || /-retail-catalog$/i.test(target.source_slug || "")
    );
}

function coverageRequirement(target = {}) {
  return isBroadRetailCatalogTarget(target) ? "broad_retail_catalog_required" : "";
}

function feedFilesFor(target, inputDir) {
  return walkFiles(sourceFeedRoot(inputDir, target.source_slug), isFeedFile);
}

function snapshotFilesFor(target, snapshotDir) {
  return walkFiles(sourceSnapshotRoot(snapshotDir, target.source_slug), (filePath) => (
    /\.json$/i.test(filePath) && hasImportableSnapshotEntry(filePath)
  ));
}

function hasSnapshotBody(row = {}) {
  return [
    row.html,
    row.body_html,
    row.bodyHtml,
    row.text,
    row.page_text,
    row.pageText,
    row.rendered_text,
    row.renderedText,
    row.visible_text,
    row.visibleText,
  ].some((value) => compact(value));
}

function hasSnapshotUrl(row = {}) {
  return [
    row.source_url,
    row.sourceUrl,
    row.product_url,
    row.productUrl,
    row.url,
  ].some((value) => /^https:\/\/www\.petco\.com\/product\//i.test(compact(value)));
}

function snapshotObjects(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return Object.values(value).filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry));
}

function hasImportableSnapshotEntry(filePath) {
  try {
    return snapshotObjects(readJsonIfExists(filePath, null))
      .some((snapshot) => hasSnapshotBody(snapshot) && hasSnapshotUrl(snapshot));
  } catch {
    return false;
  }
}

function importReportsFor(target, importOutputDir) {
  const reports = [];
  const seen = new Set();
  const sourceKey = normalizeKey(target.source_slug);
  const summary = readJsonIfExists(path.join(importOutputDir, "summary.json"), null);

  for (const report of summary?.reports || []) {
    if (normalizeKey(report.source) !== sourceKey) continue;
    const key = `${report.file || ""}\n${report.reportPath || ""}\nsummary`;
    if (seen.has(key)) continue;
    seen.add(key);
    reports.push(report);
  }

  for (const reportPath of walkFiles(importOutputDir, (filePath) => path.basename(filePath) === "report.json")) {
    const report = readJsonIfExists(reportPath, null);
    if (!report || normalizeKey(report.source) !== sourceKey) continue;
    const key = `${report.file || ""}\n${reportPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    reports.push({ ...report, report_path: reportPath });
  }

  return reports;
}

function importSqlRows(reports) {
  return reports.reduce((sum, report) => sum + numeric(report.sql_rows), 0);
}

function failedImportCount(reports) {
  return reports.filter((report) => report.status && report.status !== "succeeded").length;
}

function readinessStatus({ target, feedFiles, snapshotFiles, importReports }) {
  const accessStatus = compact(target.access_status);
  const sqlRows = importSqlRows(importReports);
  const failures = failedImportCount(importReports);

  if (failures > 0) return "import_failed";
  if (sqlRows > 0) return "import_sql_ready";
  if (accessStatus === "discontinued") return "discontinued";
  if (accessStatus === "requires_browser_snapshot") {
    return snapshotFiles.length > 0 ? "ready_for_snapshot_import" : "waiting_for_browser_snapshot";
  }
  if (feedFiles.length > 0) return "ready_for_feed_import";
  if (accessStatus === "blocked_by_source") return "blocked_source_requires_authorized_feed";
  if (accessStatus === "shared_catalog_source") return "shared_source_waiting_for_feed_or_runnable_target";
  return "waiting_for_authorized_feed";
}

function nextAction({ target, status, snapshotDir }) {
  if (status === "import_failed") {
    return "Inspect generated import report, fix source feed columns/evidence, then rerun drop import.";
  }
  if (status === "import_sql_ready") {
    return "Review generated SQL manifest, apply valid chunks, then run catalog live verified contract audit.";
  }
  if (status === "ready_for_feed_import") {
    return target.drop_import_command || `node scripts/catalog-authorized-feed-drop-import.mjs --source "${target.source_slug}"`;
  }
  if (status === "ready_for_snapshot_import") {
    return target.snapshot_import_command || `npm run catalog:petco-snapshot-import-batch -- --source "${target.source_slug}"`;
  }
  if (status === "waiting_for_browser_snapshot") {
    return `Collect rendered browser JSON snapshot under ${sourceSnapshotRoot(snapshotDir || DEFAULT_SNAPSHOT_DIR, target.source_slug)}.`;
  }
  if (status === "blocked_source_requires_authorized_feed") {
    return "Request authorized manufacturer/feed export; do not bypass source protection.";
  }
  if (status === "shared_source_waiting_for_feed_or_runnable_target") {
    return "Use the shared source importer or request an authorized feed before verified promotion.";
  }
  if (status === "discontinued") {
    return "No acquisition action; keep excluded unless product is confirmed active again.";
  }
  return target.docs_path ? `Request authorized feed using ${target.docs_path}.` : "Request authorized feed from source owner.";
}

function evidencePath({ target, status, feedFiles, snapshotFiles, importReports }) {
  if (status === "import_sql_ready" || status === "import_failed") {
    return importReports.find((report) => report.sql_manifest)?.sql_manifest || importReports.find((report) => report.report_path)?.report_path || "";
  }
  if (status === "ready_for_feed_import") return feedFiles[0] || "";
  if (status === "ready_for_snapshot_import") return snapshotFiles[0] || "";
  return target.docs_path || target.template_path || "";
}

function rowPriority(row) {
  return (
    (row.coverage_requirement === "broad_retail_catalog_required" ? 100000 : 0)
    + numeric(row.affected_products) * 100
    + numeric(row.open_rows) * 30
    + numeric(row.needs_ingredients_rows) * 10
    + numeric(row.needs_image_rows) * 5
    + (row.coverage_tier === "tier_1_us_retail" ? 1000 : 0)
    - (READINESS_ORDER[row.readiness_status] || 99)
  );
}

function buildRows({ manifest, inputDir, snapshotDir, importOutputDir, gapRows, sourceFilters, brandFilters, limit }) {
  const gapIndex = buildGapIndex(gapRows);
  const rows = [];

  for (const target of manifest.targets) {
    if (sourceFilters.size > 0 && !sourceFilters.has(normalizeKey(target.source_slug))) continue;
    if (brandFilters.size > 0 && !brandFilters.has(normalizeKey(target.brand))) continue;

    const feeds = feedFilesFor(target, inputDir);
    const snapshots = snapshotFilesFor(target, snapshotDir);
    const reports = importReportsFor(target, importOutputDir);
    const status = readinessStatus({
      target,
      feedFiles: feeds,
      snapshotFiles: snapshots,
      importReports: reports,
    });
    const gap = gapForTarget(target, gapIndex);
    const requirement = coverageRequirement(target);

    rows.push({
      source_slug: target.source_slug,
      brand: target.brand,
      source_owner: target.source_owner || "",
      access_status: target.access_status,
      source_priority: target.source_priority || "",
      coverage_tier: target.coverage_tier || "",
      coverage_requirement: requirement,
      readiness_status: status,
      open_rows: numeric(gap.open_rows),
      affected_products: numeric(gap.affected_products),
      needs_ingredients_rows: numeric(gap.needs_ingredients_rows),
      needs_image_rows: numeric(gap.needs_image_rows),
      needs_pet_type_rows: numeric(gap.needs_pet_type_rows),
      product_sources: compact(gap.product_sources),
      feed_file_count: feeds.length,
      feed_bytes: fileBytes(feeds),
      snapshot_file_count: snapshots.length,
      snapshot_bytes: fileBytes(snapshots),
      import_report_count: reports.length,
      failed_imports: failedImportCount(reports),
      generated_sql_rows: importSqlRows(reports),
      template_path: target.template_path || "",
      docs_path: target.docs_path || "",
      queue_export_sql_path: target.sql_path || "",
      feed_drop_path: feedDropPath(inputDir, target.source_slug),
      snapshot_drop_path: sourceSnapshotRoot(snapshotDir, target.source_slug),
      evidence_path: evidencePath({ target, status, feedFiles: feeds, snapshotFiles: snapshots, importReports: reports }),
      next_action: nextAction({ target, status, snapshotDir }),
      priority_score: 0,
    });
  }

  for (const row of rows) row.priority_score = rowPriority(row);

  rows.sort((left, right) => (
    (READINESS_ORDER[left.readiness_status] || 99) - (READINESS_ORDER[right.readiness_status] || 99)
    || right.priority_score - left.priority_score
    || (ACCESS_STATUS_ORDER[left.access_status] || 99) - (ACCESS_STATUS_ORDER[right.access_status] || 99)
    || left.source_slug.localeCompare(right.source_slug)
  ));

  return limit > 0 ? rows.slice(0, limit) : rows;
}

function writeCsv(rows, filePath) {
  const headers = [
    "source_slug",
    "brand",
    "access_status",
    "readiness_status",
    "coverage_requirement",
    "open_rows",
    "affected_products",
    "needs_ingredients_rows",
    "needs_image_rows",
    "product_sources",
    "feed_file_count",
    "snapshot_file_count",
    "generated_sql_rows",
    "failed_imports",
    "priority_score",
    "feed_drop_path",
    "snapshot_drop_path",
    "evidence_path",
    "next_action",
  ];
  fs.writeFileSync(filePath, `${[headers.join(","), ...rows.map((row) => csvLine(row, headers))].join("\n")}\n`, "utf8");
}

function writeMarkdown(summary, rows, filePath) {
  const topRows = rows.slice(0, 20);
  const lines = [
    "# Restricted Source Readiness",
    "",
    `Generated at: ${summary.generated_at}`,
    "",
    "## Counts",
    "",
    ...Object.entries(summary.readiness_status_counts).map(([status, count]) => `- ${status}: ${count}`),
    "",
    "## Next Actions",
    "",
    "| Source | Brand | Status | Coverage | Open rows | Affected | Product sources | Feed drop | Action |",
    "|---|---|---:|---|---:|---:|---|---|---|",
    ...topRows.map((row) => `| ${row.source_slug} | ${row.brand} | ${row.readiness_status} | ${row.coverage_requirement || ""} | ${row.open_rows} | ${row.affected_products} | ${compact(row.product_sources) || ""} | ${row.feed_drop_path} | ${compact(row.next_action).replace(/\|/g, "\\|")} |`),
    "",
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function summarize(rows, options) {
  return {
    generated_at: new Date().toISOString(),
    manifest_path: options.manifestPath,
    input_dir: options.inputDir,
    snapshot_dir: options.snapshotDir,
    import_output_dir: options.importOutputDir,
    source_count: rows.length,
    readiness_status_counts: rows.reduce((map, row) => {
      map[row.readiness_status] = (map[row.readiness_status] || 0) + 1;
      return map;
    }, {}),
    access_status_counts: rows.reduce((map, row) => {
      map[row.access_status] = (map[row.access_status] || 0) + 1;
      return map;
    }, {}),
    coverage_requirement_counts: rows.reduce((map, row) => {
      const key = row.coverage_requirement || "none";
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {}),
    total_open_rows: rows.reduce((sum, row) => sum + numeric(row.open_rows), 0),
    total_affected_products: rows.reduce((sum, row) => sum + numeric(row.affected_products), 0),
    feed_file_count: rows.reduce((sum, row) => sum + numeric(row.feed_file_count), 0),
    snapshot_file_count: rows.reduce((sum, row) => sum + numeric(row.snapshot_file_count), 0),
    generated_sql_rows: rows.reduce((sum, row) => sum + numeric(row.generated_sql_rows), 0),
  };
}

function printTextSummary(summary, rows, outputDir) {
  console.log("Restricted source readiness");
  console.log(`Sources: ${summary.source_count}`);
  console.log(`Feed files: ${summary.feed_file_count}`);
  console.log(`Snapshot files: ${summary.snapshot_file_count}`);
  console.log(`Generated SQL rows: ${summary.generated_sql_rows}`);
  console.table(rows.slice(0, 20).map((row) => ({
    source: row.source_slug,
    brand: row.brand,
    status: row.readiness_status,
    open: row.open_rows || "",
    affected: row.affected_products || "",
    feeds: row.feed_file_count || "",
    snapshots: row.snapshot_file_count || "",
    sql_rows: row.generated_sql_rows || "",
  })));
  console.log(`Report: ${path.join(outputDir, "readiness-report.json")}`);
}

function main() {
  if (hasArg("--help")) {
    console.log([
      "Usage: node scripts/catalog-restricted-source-readiness.mjs",
      "",
      "Builds a read-only readiness report for restricted catalog sources.",
      "",
      "Options:",
      "  --manifest <file>              Default: outputs/catalog-authorized-feed-requests/current/manifest.json",
      "  --input-dir <dir>              Default: inputs/catalog-authorized-feeds",
      "  --snapshot-dir <dir>           Default: inputs/catalog-browser-snapshots",
      "  --import-output-dir <dir>      Default: outputs/catalog-authorized-feed-imports",
      "  --output-dir <dir>             Default: directory containing --manifest",
      "  --gap-summary <json|csv>       Optional export from restricted-source-gap-summary.sql.",
      "  --source <source-slug>         Repeatable source filter.",
      "  --brand <brand>                Repeatable brand filter.",
      "  --limit <n>",
      "  --json",
    ].join("\n"));
    return;
  }

  const manifestPath = compact(getArg("--manifest", DEFAULT_MANIFEST_PATH));
  const outputDir = compact(getArg("--output-dir", path.dirname(manifestPath)));
  const options = {
    manifestPath,
    inputDir: compact(getArg("--input-dir", DEFAULT_INPUT_DIR)),
    snapshotDir: compact(getArg("--snapshot-dir", DEFAULT_SNAPSHOT_DIR)),
    importOutputDir: compact(getArg("--import-output-dir", DEFAULT_IMPORT_OUTPUT_DIR)),
    outputDir,
  };
  const sourceFilters = new Set(getArgs("--source").map(normalizeKey).filter(Boolean));
  const brandFilters = new Set(getArgs("--brand").map(normalizeKey).filter(Boolean));
  const limit = positiveInteger(getArg("--limit"), 0);

  const manifest = loadManifest(manifestPath);
  const gapRows = loadGapRows(getArg("--gap-summary"));
  const rows = buildRows({
    manifest,
    inputDir: options.inputDir,
    snapshotDir: options.snapshotDir,
    importOutputDir: options.importOutputDir,
    gapRows,
    sourceFilters,
    brandFilters,
    limit,
  });
  const summary = summarize(rows, options);
  const report = { ...summary, rows };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "readiness-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeCsv(rows, path.join(outputDir, "readiness-report.csv"));
  writeMarkdown(summary, rows, path.join(outputDir, "readiness-report.md"));

  if (hasArg("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTextSummary(summary, rows, outputDir);
  }
}

main();
