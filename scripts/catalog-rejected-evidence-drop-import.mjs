import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_INPUT_DIR = "inputs/catalog-evidence-repairs";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-evidence-repair-imports";
const DEFAULT_WORKLIST = "outputs/catalog-rejected-candidate-worklist/current/worklist.json";
const OFFICIAL_IMPORT_SCRIPT = "scripts/catalog-official-feed-import.mjs";
const DEFAULT_SQL_CHUNK_SIZE = 25;
const FEED_EXTENSIONS = new Set([".csv", ".tsv", ".tab", ".psv", ".txt", ".json", ".jsonl", ".ndjson"]);
const VERIFIED_SOURCE_QUALITIES = new Set(["gdsn", "official", "manufacturer", "retailer_verified"]);
const VERIFIED_INGREDIENT_STATUSES = new Set(["gdsn", "official", "manufacturer", "retailer_verified"]);
const VERIFIED_IMAGE_STATUSES = new Set(["official", "manufacturer", "retailer_verified"]);

const REPAIR_FEED_HEADERS = [
  "cache_key",
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
  "source",
  "source_quality",
  "ingredient_verification_status",
  "image_verification_status",
  "ingredient_source_url",
  "image_source_url",
  "is_complete_food",
  "guaranteed_analysis",
  "verified_at",
];

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

function normalizeHeader(value) {
  return compact(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeEvidenceText(value) {
  return compact(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function uniqueValues(values) {
  const seen = new Set();
  const output = [];
  for (const value of values.map(compact).filter(Boolean)) {
    const key = normalizeKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvLine(row, headers) {
  return headers.map((header) => csvCell(row?.[header] ?? "")).join(",");
}

function writeCsv(rows, filePath, headers) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${[headers.join(","), ...rows.map((row) => csvLine(row, headers))].join("\n")}\n`, "utf8");
}

function stripCompressionExtension(filePath) {
  return filePath.replace(/\.gz$/i, "");
}

function feedExtension(filePath) {
  return path.extname(stripCompressionExtension(filePath)).toLowerCase();
}

function feedStem(filePath) {
  const withoutCompression = stripCompressionExtension(filePath);
  return path.basename(withoutCompression, path.extname(withoutCompression));
}

function isFeedFile(filePath) {
  return FEED_EXTENSIONS.has(feedExtension(filePath));
}

function outputSlugForFile(filePath, inputDir) {
  const relativePath = stripCompressionExtension(path.relative(inputDir, filePath));
  const withoutExtension = relativePath.slice(0, -path.extname(relativePath).length) || relativePath;
  return normalizeKey(withoutExtension) || normalizeKey(feedStem(filePath)) || "feed";
}

function walkFeedFiles(rootDir) {
  const files = [];
  if (!fs.existsSync(rootDir)) return files;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && isFeedFile(fullPath)) {
        files.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return files;
}

function delimiterFieldCount(line, delimiter) {
  let fields = 1;
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && next === '"') {
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && char === delimiter) {
      fields += 1;
    }
  }
  return fields;
}

function detectDelimiter(raw) {
  const headerLine = raw.split(/\r?\n/).find((line) => compact(line)) || "";
  const candidates = [",", "\t", "|", ";"];
  return candidates
    .map((delimiter) => ({ delimiter, fields: delimiterFieldCount(headerLine, delimiter) }))
    .sort((left, right) => right.fields - left.fields)[0]?.delimiter || ",";
}

function parseDelimited(raw, delimiter = detectDelimiter(raw)) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const next = raw[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);

  const [headerRow, ...dataRows] = rows.filter((csvRow) => csvRow.some((value) => compact(value)));
  if (!headerRow) return [];

  const headers = headerRow.map(normalizeHeader);
  return dataRows.map((csvRow) => {
    const record = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = compact(csvRow[index]);
    });
    return record;
  });
}

function parseJsonFeed(raw) {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.rows)) return parsed.rows;
  if (Array.isArray(parsed.products)) return parsed.products;
  throw new Error("Repair JSON feed must be an array or an object with rows/products.");
}

function parseNdjsonFeed(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function parseFeed(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return [];
  if (raw.startsWith("[") || raw.startsWith("{")) return parseJsonFeed(raw).map(normalizeRecordKeys);
  if (/\.(?:jsonl|ndjson)$/i.test(filePath)) return parseNdjsonFeed(raw).map(normalizeRecordKeys);
  return parseDelimited(raw).map(normalizeRecordKeys);
}

function normalizeRecordKeys(row = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(row || {})) {
    normalized[normalizeHeader(key)] = value;
  }
  return normalized;
}

function readJsonIfExists(filePath, fallback = null) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sourceFromFile(filePath, inputDir) {
  const segments = path.relative(inputDir, filePath).split(path.sep).filter(Boolean);
  return segments.length > 1 ? segments[0] : feedStem(filePath);
}

function sourceFromRow(row, filePath, options) {
  return compact(
    options.sourceOverride
    || row.source_name
    || row.source
    || row.source_slug
    || sourceFromFile(filePath, options.inputDir)
  );
}

function requestKey(source, cacheKey) {
  return `${normalizeKey(source)}|${compact(cacheKey)}`;
}

function loadRequestedRows(worklistPath) {
  const payload = readJsonIfExists(worklistPath, {});
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const byKey = new Map();
  for (const row of rows) {
    const source = compact(row.source);
    const cacheKey = compact(row.cache_key);
    if (!source || !cacheKey) continue;
    byKey.set(requestKey(source, cacheKey), row);
  }
  return { rows, byKey };
}

function isHttpUrl(value) {
  try {
    const url = new URL(compact(value));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidVerificationDate(value) {
  const text = compact(value);
  if (!text) return false;
  const time = Date.parse(text);
  return Number.isFinite(time);
}

function defaultIngredientStatus(sourceQuality) {
  if (sourceQuality === "gdsn") return "gdsn";
  if (sourceQuality === "retailer_verified") return "retailer_verified";
  if (sourceQuality === "official") return "official";
  return "manufacturer";
}

function defaultImageStatus(sourceQuality) {
  if (sourceQuality === "retailer_verified") return "retailer_verified";
  if (sourceQuality === "official") return "official";
  return "manufacturer";
}

function unsafeTailReused(ingredientText, tail) {
  const ingredient = normalizeEvidenceText(ingredientText);
  const candidateTail = normalizeEvidenceText(tail);
  if (candidateTail.length < 30) return false;
  if (ingredient === candidateTail) return true;
  const copiedTailOnlyWithSmallPrefix = ingredient.includes(candidateTail)
    && ingredient.length <= candidateTail.length + 40;
  return copiedTailOnlyWithSmallPrefix;
}

function completedRepairForRow(row, { filePath, options, requested }) {
  const source = sourceFromRow(row, filePath, options);
  const cacheKey = compact(row.cache_key || row.cachekey);
  const request = requested.byKey.get(requestKey(source, cacheKey));
  const reasons = [];

  if (!cacheKey) reasons.push("missing_cache_key");
  if (!source) reasons.push("missing_source");
  if (cacheKey && source && !request) reasons.push("unrequested_cache_key");

  const requestedBrand = compact(request?.brand);
  const brand = compact(row.brand || requestedBrand);
  if (!brand) reasons.push("missing_brand");
  if (requestedBrand && normalizeKey(brand) !== normalizeKey(requestedBrand)) {
    reasons.push("brand_request_mismatch");
  }

  const ingredientText = compact(row.ingredient_statement || row.ingredient_text || row.ingredients_text);
  if (!ingredientText) reasons.push("missing_ingredient_statement");
  if (request && unsafeTailReused(ingredientText, request.ingredient_text_tail || row.candidate_ingredient_text_tail)) {
    reasons.push("candidate_ingredient_text_tail_reused");
  }

  const imageUrl = compact(row.product_image_url || row.front_image_url || row.image_url || request?.image_url);
  if (!imageUrl) reasons.push("missing_product_image_url");
  if (imageUrl && (!isHttpUrl(imageUrl) || /^data:/i.test(imageUrl))) {
    reasons.push("invalid_product_image_url");
  }

  const evidenceUrl = compact(row.evidence_url || row.product_url || row.source_url || request?.source_url);
  if (!evidenceUrl) reasons.push("missing_product_or_evidence_url");
  if (evidenceUrl && !isHttpUrl(evidenceUrl)) reasons.push("invalid_product_or_evidence_url");

  const verifiedAt = compact(row.verified_at || row.last_verified_at);
  if (!verifiedAt) reasons.push("missing_verified_at");
  if (verifiedAt && !isValidVerificationDate(verifiedAt)) reasons.push("invalid_verified_at");

  const sourceQuality = compact(row.source_quality || request?.source_quality || "manufacturer").toLowerCase();
  if (!VERIFIED_SOURCE_QUALITIES.has(sourceQuality)) reasons.push("unverified_source_quality");

  const ingredientStatus = compact(row.ingredient_verification_status || defaultIngredientStatus(sourceQuality)).toLowerCase();
  if (!VERIFIED_INGREDIENT_STATUSES.has(ingredientStatus)) reasons.push("unsafe_ingredient_verification_status");

  const imageStatus = compact(row.image_verification_status || defaultImageStatus(sourceQuality)).toLowerCase();
  if (!VERIFIED_IMAGE_STATUSES.has(imageStatus)) reasons.push("unsafe_image_verification_status");

  const petType = compact(row.pet_type || request?.pet_type).toLowerCase();
  if (!["dog", "cat"].includes(petType)) reasons.push("unknown_pet_type");

  if (reasons.length > 0) {
    return {
      ok: false,
      source: source || compact(request?.source) || "unknown-source",
      cache_key: cacheKey,
      brand,
      product_name: compact(row.product_name || request?.product_name),
      reasons,
      file: filePath,
    };
  }

  return {
    ok: true,
    source,
    expected_brand: brand,
    row: {
      cache_key: cacheKey,
      gtin: compact(row.gtin || request.gtin),
      product_name: compact(row.product_name || request.product_name),
      brand,
      product_line: compact(row.product_line),
      flavor: compact(row.flavor),
      life_stage: compact(row.life_stage),
      food_form: compact(row.food_form),
      package_size: compact(row.package_size || request.package_size),
      pet_type: petType,
      ingredient_statement: ingredientText,
      product_image_url: imageUrl,
      product_url: evidenceUrl,
      source,
      source_quality: sourceQuality,
      ingredient_verification_status: ingredientStatus,
      image_verification_status: imageStatus,
      ingredient_source_url: compact(row.ingredient_source_url || row.evidence_url || evidenceUrl),
      image_source_url: compact(row.image_source_url || row.evidence_url || evidenceUrl),
      is_complete_food: "true",
      guaranteed_analysis: compact(row.guaranteed_analysis),
      verified_at: verifiedAt,
    },
  };
}

function parseCount(output, label) {
  const match = String(output || "").match(new RegExp(`\\b${label}:\\s*(\\d+)`, "i"));
  return match ? Number(match[1]) : null;
}

function parseSkippedRows(output) {
  const match = String(output || "").match(/\bSkipped rows:\s*(\{[^\n\r]*\})/i);
  if (!match) return {};
  try {
    return JSON.parse(match[1]);
  } catch {
    return { unparseable_skipped_summary: 1 };
  }
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumObjectValues(value = {}) {
  return Object.values(value).reduce((sum, count) => sum + numeric(count), 0);
}

function importerArgs(group, options) {
  const firstRow = group.rows[0] || {};
  const args = [
    OFFICIAL_IMPORT_SCRIPT,
    "--file", group.sanitizedFeedPath,
    "--source", group.source,
    "--source-quality", firstRow.source_quality || "manufacturer",
    "--ingredient-verification", firstRow.ingredient_verification_status || "manufacturer",
    "--image-verification", firstRow.image_verification_status || "manufacturer",
  ];

  if (options.dryRun) {
    args.push("--dry-run");
  } else {
    args.push(
      "--emit-sql-rpc",
      "--emit-sql-dir", group.sqlDir,
      "--sql-chunk-size", String(options.sqlChunkSize),
      "--sql-payload-format", options.sqlPayloadFormat
    );
  }

  for (const brand of group.expectedBrands) args.push("--expected-brand", brand);
  if (options.emitSkipDetails) args.push("--emit-skip-details");
  return args;
}

function runImporter(group, options) {
  fs.mkdirSync(group.outputDir, { recursive: true });
  writeCsv(group.rows, group.sanitizedFeedPath, REPAIR_FEED_HEADERS);

  const args = importerArgs(group, options);
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    maxBuffer: 200 * 1024 * 1024,
  });

  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const output = `${stdout}\n${stderr}`;
  const manifestPath = path.join(group.sqlDir, "manifest.json");
  const manifest = readJsonIfExists(manifestPath, null);
  const skippedRows = parseSkippedRows(output);
  const importerRejectedRows = sumObjectValues(skippedRows);
  const acceptedRows = options.dryRun
    ? parseCount(output, "Normalized rows")
    : (manifest?.total_sql_rows ?? parseCount(output, "SQL rows"));

  const failures = [];
  if (result.status !== 0) failures.push("importer_process_failed");
  if (!options.allowZeroAccepted && group.rows.length > 0 && numeric(acceptedRows) === 0) {
    failures.push("zero_verified_ready_repair_rows");
  }
  if (!options.allowImporterRejections && importerRejectedRows > 0) {
    failures.push("importer_rejected_repair_rows");
  }

  const report = {
    generated_at: new Date().toISOString(),
    status: failures.length === 0 ? "succeeded" : "failed",
    file: group.file,
    source: group.source,
    expected_brand_terms: group.expectedBrands,
    input_rows: group.inputRows,
    preflight_accepted_rows: group.rows.length,
    preflight_rejected_rows: group.preflightRejectedRows,
    importer_input_rows: parseCount(output, "Input rows"),
    importer_normalized_rows: parseCount(output, "Normalized rows"),
    sql_rows: options.dryRun ? null : numeric(acceptedRows),
    accepted_rows: numeric(acceptedRows),
    importer_rejected_rows: importerRejectedRows,
    skipped_rows: skippedRows,
    intake_failures: failures,
    sanitized_feed: group.sanitizedFeedPath,
    sql_manifest: fs.existsSync(manifestPath) ? manifestPath : null,
    import_args: args,
    import_output: compact(stdout),
    import_warnings: compact(stderr),
    error: result.error?.message || (failures.length > 0 ? failures.join(", ") : null),
  };

  fs.writeFileSync(group.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

function groupsForFile(filePath, options, requested) {
  const rawRows = parseFeed(filePath);
  const acceptedBySource = new Map();
  const rejectedRows = [];
  const sourceFilters = new Set(options.sourceFilters.map(normalizeKey).filter(Boolean));

  for (const rawRow of rawRows) {
    const repair = completedRepairForRow(rawRow, { filePath, options, requested });
    if (sourceFilters.size > 0 && !sourceFilters.has(normalizeKey(repair.source))) continue;
    if (!repair.ok) {
      rejectedRows.push(repair);
      continue;
    }
    if (!acceptedBySource.has(repair.source)) {
      acceptedBySource.set(repair.source, { rows: [], expectedBrands: [] });
    }
    const group = acceptedBySource.get(repair.source);
    group.rows.push(repair.row);
    group.expectedBrands.push(repair.expected_brand);
  }

  const fileSlug = outputSlugForFile(filePath, options.inputDir);
  const groups = [...acceptedBySource.entries()].map(([source, group]) => {
    const outputDir = path.join(options.outputDir, normalizeKey(source) || "unknown-source", fileSlug);
    return {
      file: filePath,
      source,
      rows: group.rows,
      expectedBrands: uniqueValues(group.expectedBrands),
      inputRows: rawRows.length,
      preflightRejectedRows: rejectedRows.filter((row) => normalizeKey(row.source) === normalizeKey(source)).length,
      outputDir,
      sanitizedFeedPath: path.join(outputDir, "feed.normalized.csv"),
      sqlDir: path.join(outputDir, "sql"),
      reportPath: path.join(outputDir, "report.json"),
    };
  });

  return { rawRows, groups, rejectedRows };
}

function writeSummaryReports(summary, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  writeCsv(summary.reports, path.join(outputDir, "summary.csv"), [
    "source",
    "status",
    "input_rows",
    "preflight_accepted_rows",
    "preflight_rejected_rows",
    "accepted_rows",
    "importer_rejected_rows",
    "sql_rows",
    "sanitized_feed",
    "sql_manifest",
    "error",
  ]);

  writeCsv(summary.rejected_rows, path.join(outputDir, "rejected-rows.csv"), [
    "file",
    "source",
    "cache_key",
    "brand",
    "product_name",
    "reasons",
  ]);

  const lines = [
    "# Catalog Rejected Evidence Drop Import",
    "",
    `Generated at: ${summary.generated_at}`,
    `Input dir: ${summary.input_dir}`,
    `Output dir: ${summary.output_dir}`,
    "",
    "## Summary",
    "",
    `- Files processed: ${summary.file_count}`,
    `- Input rows: ${summary.input_rows}`,
    `- Preflight accepted rows: ${summary.preflight_accepted_rows}`,
    `- Preflight rejected rows: ${summary.preflight_rejected_rows}`,
    `- SQL rows: ${summary.sql_rows}`,
    `- Failed reports: ${summary.failed_count}`,
    "",
    "## Reports",
    "",
    "| Source | Status | Accepted | Rejected | SQL Rows | Failure |",
    "|---|---|---:|---:|---:|---|",
    ...summary.reports.map((report) => `| ${report.source} | ${report.status} | ${report.accepted_rows ?? 0} | ${report.preflight_rejected_rows ?? 0} | ${report.sql_rows ?? 0} | ${compact(report.error).replace(/\|/g, "\\|")} |`),
    "",
  ];
  fs.writeFileSync(path.join(outputDir, "summary.md"), `${lines.join("\n")}\n`, "utf8");
}

function printTextSummary(summary) {
  console.log("Rejected evidence drop import summary");
  console.log(`Files processed: ${summary.file_count}`);
  console.log(`Input rows: ${summary.input_rows}`);
  console.log(`Preflight accepted rows: ${summary.preflight_accepted_rows}`);
  console.log(`Preflight rejected rows: ${summary.preflight_rejected_rows}`);
  console.log(`SQL rows: ${summary.sql_rows}`);
  if (summary.reports.length > 0) {
    console.table(summary.reports.map((report) => ({
      source: report.source,
      status: report.status,
      accepted: report.accepted_rows ?? "",
      rejected: report.preflight_rejected_rows ?? "",
      sql_rows: report.sql_rows ?? "",
      failures: report.intake_failures?.join(", ") || "",
      report: report.reportPath || report.sanitized_feed,
    })));
  }
  console.log(`Summary: ${path.join(summary.output_dir, "summary.json")}`);
}

function main() {
  if (hasArg("--help")) {
    console.log([
      "Usage: node scripts/catalog-rejected-evidence-drop-import.mjs",
      "",
      "Validates completed rejected-evidence repair feeds and emits guarded SQL only.",
      "Default input path: inputs/catalog-evidence-repairs/<source>/feed.csv",
      "",
      "Options:",
      "  --input-dir <dir>               Default: inputs/catalog-evidence-repairs",
      "  --output-dir <dir>              Default: outputs/catalog-evidence-repair-imports",
      "  --worklist <path>               Default: outputs/catalog-rejected-candidate-worklist/current/worklist.json",
      "  --source <source-slug>          Repeatable source filter or override for flat files.",
      "  --limit <n>",
      "  --dry-run                       Validate and dry-run importer; do not emit SQL chunks.",
      "  --continue-on-error",
      "  --allow-zero-accepted",
      "  --allow-importer-rejections",
      "  --emit-skip-details",
      "  --sql-chunk-size <n>",
      "  --sql-payload-format <base64|hex|json>",
      "  --json",
    ].join("\n"));
    return;
  }

  const requestedPayloadFormat = compact(getArg("--sql-payload-format", "base64"));
  const options = {
    inputDir: compact(getArg("--input-dir", DEFAULT_INPUT_DIR)),
    outputDir: compact(getArg("--output-dir", DEFAULT_OUTPUT_DIR)),
    worklistPath: compact(getArg("--worklist", DEFAULT_WORKLIST)),
    sourceOverride: getArgs("--source").length === 1 ? compact(getArgs("--source")[0]) : "",
    sourceFilters: getArgs("--source"),
    sqlChunkSize: positiveInteger(getArg("--sql-chunk-size"), DEFAULT_SQL_CHUNK_SIZE),
    sqlPayloadFormat: ["base64", "hex", "json"].includes(requestedPayloadFormat) ? requestedPayloadFormat : "base64",
    dryRun: hasArg("--dry-run"),
    continueOnError: hasArg("--continue-on-error"),
    allowZeroAccepted: hasArg("--allow-zero-accepted"),
    allowImporterRejections: hasArg("--allow-importer-rejections"),
    emitSkipDetails: hasArg("--emit-skip-details"),
  };
  const limit = positiveInteger(getArg("--limit"), 0);
  const requested = loadRequestedRows(options.worklistPath);
  const feedFiles = walkFeedFiles(options.inputDir);
  const selectedFeedFiles = limit > 0 ? feedFiles.slice(0, limit) : feedFiles;
  const reports = [];
  const rejectedRows = [];
  let inputRows = 0;
  let preflightAcceptedRows = 0;

  for (const filePath of selectedFeedFiles) {
    const { rawRows, groups, rejectedRows: fileRejectedRows } = groupsForFile(filePath, options, requested);
    inputRows += rawRows.length;
    rejectedRows.push(...fileRejectedRows.map((row) => ({ ...row, reasons: row.reasons.join("|") })));
    preflightAcceptedRows += groups.reduce((sum, group) => sum + group.rows.length, 0);

    for (const group of groups) {
      const report = runImporter(group, options);
      reports.push({ ...report, reportPath: group.reportPath });
      if (report.status !== "succeeded" && !options.continueOnError) break;
    }

    if (reports.some((report) => report.status !== "succeeded") && !options.continueOnError) break;
  }

  const preflightRejectedRows = rejectedRows.length;
  const failedReports = reports.filter((report) => report.status !== "succeeded").length;
  const failedCount = failedReports + (preflightRejectedRows > 0 ? 1 : 0);
  const summary = {
    generated_at: new Date().toISOString(),
    input_dir: options.inputDir,
    output_dir: options.outputDir,
    worklist_path: options.worklistPath,
    dry_run: options.dryRun,
    input_dir_exists: fs.existsSync(options.inputDir),
    requested_repair_count: requested.rows.length,
    file_count: selectedFeedFiles.length,
    input_rows: inputRows,
    preflight_accepted_rows: preflightAcceptedRows,
    preflight_rejected_rows: preflightRejectedRows,
    accepted_rows: reports.reduce((sum, report) => sum + numeric(report.accepted_rows), 0),
    importer_rejected_rows: reports.reduce((sum, report) => sum + numeric(report.importer_rejected_rows), 0),
    sql_rows: reports.reduce((sum, report) => sum + numeric(report.sql_rows), 0),
    failed_count: failedCount,
    reports,
    rejected_rows: rejectedRows,
  };

  writeSummaryReports(summary, options.outputDir);

  if (hasArg("--json")) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printTextSummary(summary);
  }

  if (summary.failed_count > 0) process.exit(1);
}

main();
