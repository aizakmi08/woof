import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_INPUT_DIR = "inputs/catalog-authorized-feeds";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-authorized-feed-imports";
const SOURCE_TARGETS_PATH = "scripts/catalog-source-targets.json";
const OFFICIAL_IMPORT_SCRIPT = "scripts/catalog-official-feed-import.mjs";
const DEFAULT_SQL_CHUNK_SIZE = 25;
const FEED_EXTENSIONS = new Set([".csv", ".tsv", ".tab", ".psv", ".txt", ".json", ".jsonl", ".ndjson", ".xml"]);
const RESTRICTED_ACCESS_STATUSES = new Set([
  "requires_authorized_feed",
  "requires_browser_snapshot",
  "blocked_by_source",
  "shared_catalog_source",
]);
const AUTHORIZED_SOURCE_QUALITIES = new Set(["gdsn", "manufacturer", "retailer_verified"]);

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

function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumObjectValues(value = {}) {
  return Object.values(value).reduce((sum, count) => sum + numeric(count), 0);
}

function targetSourceSlug(target = {}) {
  return compact(target.sourceSlug)
    || normalizeKey(target.sourceOwner || target.brand)
    || normalizeKey(target.brand);
}

function targetAccessStatus(target = {}) {
  return target.accessStatus || (target.discovery ? "runnable" : "requires_authorized_feed");
}

function loadSourceTargets() {
  const targets = readJsonIfExists(SOURCE_TARGETS_PATH, []);
  const byKey = new Map();

  for (const target of targets) {
    for (const value of [
      target.sourceSlug,
      target.sourceOwner,
      target.brand,
      ...(target.aliases || []),
      ...(target.outputAliases || []),
    ]) {
      const key = normalizeKey(value);
      if (key) byKey.set(key, target);
    }
  }

  return { targets, byKey };
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
  if (!fs.existsSync(rootDir)) {
    throw new Error(`Missing authorized feed input dir: ${rootDir}`);
  }

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

function sourceKeyCandidates({ filePath, inputDir, sourceOverride, brandOverride }) {
  const relativePath = path.relative(inputDir, filePath);
  const segments = relativePath.split(path.sep).filter(Boolean);
  const firstSegment = segments.length > 1 ? segments[0] : "";
  const stem = feedStem(filePath);

  return uniqueValues([
    sourceOverride,
    brandOverride,
    firstSegment,
    stem,
    stem.replace(/[-_ ]?(feed|products|catalog|export|gdsn|syndigo|content1)$/i, ""),
  ]);
}

function resolveTarget({ filePath, inputDir, sourceOverride, brandOverride }, sourceTargets) {
  for (const value of sourceKeyCandidates({ filePath, inputDir, sourceOverride, brandOverride })) {
    const target = sourceTargets.byKey.get(normalizeKey(value));
    if (target) return target;
  }
  return null;
}

function sourceQualityFor(target, override) {
  const explicit = compact(override);
  if (explicit) return explicit;
  if (target?.sourcePriority === "gdsn") return "gdsn";
  if (target?.sourcePriority === "retailer") return "retailer_verified";
  if (target?.sourcePriority === "manufacturer") return "manufacturer";
  return "official";
}

function ingredientVerificationFor(sourceQuality, override) {
  const explicit = compact(override);
  if (explicit) return explicit;
  if (sourceQuality === "gdsn") return "gdsn";
  if (sourceQuality === "manufacturer") return "manufacturer";
  if (sourceQuality === "retailer_verified") return "retailer_verified";
  return "official";
}

function imageVerificationFor(sourceQuality, override) {
  const explicit = compact(override);
  if (explicit) return explicit;
  if (sourceQuality === "manufacturer") return "manufacturer";
  if (sourceQuality === "retailer_verified") return "retailer_verified";
  return "official";
}

function inferSource({ filePath, inputDir, target, sourceOverride }) {
  const explicit = compact(sourceOverride);
  if (explicit) return explicit;
  if (target) return targetSourceSlug(target);

  const relativePath = path.relative(inputDir, filePath);
  const segments = relativePath.split(path.sep).filter(Boolean);
  const rawSource = segments.length > 1 ? segments[0] : feedStem(filePath);
  return normalizeKey(rawSource);
}

function expectedBrandsFor({ target, brandOverride, expectedBrandArgs }) {
  const targetBrandTerms = target?.sourcePriority === "retailer"
    && (
      /\bretail\s+catalog\b/i.test(target?.brand || "")
      || /-retail-catalog$/i.test(target?.sourceSlug || "")
    )
    ? []
    : [
      target?.brand,
      ...(target?.aliases || []),
    ];

  return uniqueValues([
    ...expectedBrandArgs,
    brandOverride,
    ...targetBrandTerms,
  ]);
}

function candidateForFile(filePath, options, sourceTargets) {
  const target = resolveTarget({
    filePath,
    inputDir: options.inputDir,
    sourceOverride: options.sourceOverride,
    brandOverride: options.brandOverride,
  }, sourceTargets);
  const source = inferSource({
    filePath,
    inputDir: options.inputDir,
    target,
    sourceOverride: options.sourceOverride,
  });
  const sourceQuality = sourceQualityFor(target, options.sourceQualityOverride);
  const sourceDir = path.join(options.outputDir, normalizeKey(source) || "unknown-source", outputSlugForFile(filePath, options.inputDir));

  return {
    filePath,
    target,
    source,
    sourceQuality,
    ingredientVerification: ingredientVerificationFor(sourceQuality, options.ingredientVerificationOverride),
    imageVerification: imageVerificationFor(sourceQuality, options.imageVerificationOverride),
    expectedBrands: expectedBrandsFor({
      target,
      brandOverride: options.brandOverride,
      expectedBrandArgs: options.expectedBrandArgs,
    }),
    requiredSourceUrlPattern: compact(options.requiredSourceUrlPatternOverride || target?.discovery?.requiredUrlPattern),
    sqlDir: path.join(sourceDir, "sql"),
    reportPath: path.join(sourceDir, "report.json"),
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

function isRestrictedTarget(target) {
  return Boolean(target && RESTRICTED_ACCESS_STATUSES.has(targetAccessStatus(target)));
}

function acceptedRowCount(report, options) {
  return options.dryRun ? numeric(report.normalized_rows) : numeric(report.sql_rows);
}

function intakeFailuresFor(candidate, report, options) {
  const failures = [];
  const inputRows = numeric(report.input_rows);
  const acceptedRows = acceptedRowCount(report, options);
  const rejectedRows = numeric(report.rejected_rows);

  if (!options.allowUnmappedSource && !candidate.target) {
    failures.push("unmapped_source_target");
  }
  if (!options.allowMissingExpectedBrand && candidate.expectedBrands.length === 0) {
    failures.push("missing_expected_brand_gate");
  }
  if (inputRows === 0) {
    failures.push("empty_feed");
  }
  if (!options.allowZeroAccepted && inputRows > 0 && acceptedRows === 0) {
    failures.push("zero_verified_ready_candidates");
  }
  if (
    !options.allowRestrictedOfficialQuality
    && isRestrictedTarget(candidate.target)
    && !AUTHORIZED_SOURCE_QUALITIES.has(candidate.sourceQuality)
  ) {
    failures.push("restricted_source_requires_authorized_quality");
  }
  if (options.failOnRejectedRows && rejectedRows > 0) {
    failures.push("rejected_rows_present");
  }

  return failures;
}

function importerArgs(candidate, options) {
  const args = [
    OFFICIAL_IMPORT_SCRIPT,
    "--file", candidate.filePath,
    "--source", candidate.source,
    "--source-quality", candidate.sourceQuality,
    "--ingredient-verification", candidate.ingredientVerification,
    "--image-verification", candidate.imageVerification,
  ];

  if (options.dryRun) {
    args.push("--dry-run");
  } else {
    args.push(
      "--emit-sql-rpc",
      "--emit-sql-dir", candidate.sqlDir,
      "--sql-chunk-size", String(options.sqlChunkSize),
      "--sql-payload-format", options.sqlPayloadFormat
    );
  }

  for (const brand of candidate.expectedBrands) args.push("--expected-brand", brand);
  if (candidate.requiredSourceUrlPattern) {
    args.push("--required-source-url-pattern", candidate.requiredSourceUrlPattern);
  }
  if (options.allowSourceBrandMismatch) {
    args.push("--allow-source-brand-mismatch");
  }
  if (options.emitSkipDetails) {
    args.push("--emit-skip-details");
  }

  return args;
}

function runImporter(candidate, options) {
  fs.mkdirSync(path.dirname(candidate.reportPath), { recursive: true });
  const args = importerArgs(candidate, options);
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    maxBuffer: 200 * 1024 * 1024,
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const output = `${stdout}\n${stderr}`;
  const manifestPath = path.join(candidate.sqlDir, "manifest.json");
  const manifest = readJsonIfExists(manifestPath, null);
  const skippedRows = parseSkippedRows(output);
  const report = {
    generated_at: new Date().toISOString(),
    status: result.status === 0 ? "succeeded" : "failed",
    file: candidate.filePath,
    source: candidate.source,
    source_quality: candidate.sourceQuality,
    ingredient_verification: candidate.ingredientVerification,
    image_verification: candidate.imageVerification,
    target_access_status: candidate.target ? targetAccessStatus(candidate.target) : null,
    target_brand: candidate.target?.brand || null,
    expected_brand_terms: candidate.expectedBrands,
    required_url_pattern: candidate.requiredSourceUrlPattern || null,
    input_rows: parseCount(output, "Input rows"),
    normalized_rows: parseCount(output, "Normalized rows"),
    sql_rows: options.dryRun ? null : (manifest?.total_sql_rows ?? parseCount(output, "SQL rows")),
    accepted_rows: null,
    rejected_rows: sumObjectValues(skippedRows),
    skipped_rows: skippedRows,
    verified_ready_candidate_count: null,
    coverage_delta_estimate: null,
    intake_failures: [],
    sql_manifest: fs.existsSync(manifestPath) ? manifestPath : null,
    import_args: args,
    import_output: compact(stdout),
    import_warnings: compact(stderr),
    error: result.error?.message || null,
  };
  report.accepted_rows = acceptedRowCount(report, options);
  report.verified_ready_candidate_count = report.accepted_rows;
  report.coverage_delta_estimate = {
    verified_ready_candidate_rows: report.accepted_rows,
    rejected_candidate_rows: report.rejected_rows,
  };
  report.intake_failures = result.status === 0 ? intakeFailuresFor(candidate, report, options) : ["importer_process_failed"];
  if (report.intake_failures.length > 0) {
    report.status = "failed";
    report.error = report.error || report.intake_failures.join(", ");
  }

  fs.writeFileSync(candidate.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

function printTextSummary({ reports, skipped }) {
  console.log("Authorized feed drop import summary");
  console.log(`Files processed: ${reports.length}`);
  console.log(`Files skipped: ${skipped.length}`);
  console.table(reports.map((report) => ({
    source: report.source,
    status: report.status,
    input: report.input_rows ?? "",
    normalized: report.normalized_rows ?? "",
    accepted: report.accepted_rows ?? "",
    rejected: report.rejected_rows ?? "",
    sql_rows: report.sql_rows ?? "",
    failures: report.intake_failures?.join(", ") || "",
    report: report.sql_manifest ? path.dirname(report.sql_manifest) : report.file,
  })));
  if (skipped.length > 0) {
    console.table(skipped.map((item) => ({ file: item.file, reason: item.reason })));
  }
}

function main() {
  if (hasArg("--help")) {
    console.log([
      "Usage: node scripts/catalog-authorized-feed-drop-import.mjs",
      "",
      "Processes licensed/authorized catalog feed drops into guarded SQL chunks.",
      "Default mode emits SQL files only; it does not write live Supabase rows.",
      "",
      "Options:",
      "  --input-dir <dir>               Default: inputs/catalog-authorized-feeds",
      "  --output-dir <dir>              Default: outputs/catalog-authorized-feed-imports",
      "  --source <source-slug>          Override source for all discovered files.",
      "  --brand <brand>                 Brand context for source inference and expected-brand checks.",
      "  --expected-brand <brand>        Repeatable expected brand term.",
      "  --source-quality <quality>      gdsn, manufacturer, retailer_verified, official.",
      "  --ingredient-verification <s>   gdsn, manufacturer, retailer_verified, official.",
      "  --image-verification <s>        manufacturer, retailer_verified, official.",
      "  --required-source-url-pattern <regex>",
      "  --limit <n>",
      "  --dry-run                       Validate only; do not emit SQL chunks.",
      "  --continue-on-error",
      "  --allow-unmapped-source",
      "  --allow-missing-expected-brand",
      "  --allow-zero-accepted",
      "  --allow-restricted-official-quality",
      "  --allow-source-brand-mismatch",
      "  --fail-on-rejected-rows",
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
    sourceOverride: compact(getArg("--source")),
    brandOverride: compact(getArg("--brand")),
    expectedBrandArgs: getArgs("--expected-brand"),
    sourceQualityOverride: compact(getArg("--source-quality")),
    ingredientVerificationOverride: compact(getArg("--ingredient-verification")),
    imageVerificationOverride: compact(getArg("--image-verification")),
    requiredSourceUrlPatternOverride: compact(getArg("--required-source-url-pattern")),
    sqlChunkSize: positiveInteger(getArg("--sql-chunk-size"), DEFAULT_SQL_CHUNK_SIZE),
    sqlPayloadFormat: ["base64", "hex", "json"].includes(requestedPayloadFormat) ? requestedPayloadFormat : "base64",
    dryRun: hasArg("--dry-run"),
    continueOnError: hasArg("--continue-on-error"),
    allowUnmappedSource: hasArg("--allow-unmapped-source"),
    allowMissingExpectedBrand: hasArg("--allow-missing-expected-brand"),
    allowZeroAccepted: hasArg("--allow-zero-accepted"),
    allowRestrictedOfficialQuality: hasArg("--allow-restricted-official-quality"),
    allowSourceBrandMismatch: hasArg("--allow-source-brand-mismatch"),
    failOnRejectedRows: hasArg("--fail-on-rejected-rows"),
    emitSkipDetails: hasArg("--emit-skip-details"),
  };
  const limit = positiveInteger(getArg("--limit"), 0);
  const sourceTargets = loadSourceTargets();
  const feedFiles = walkFeedFiles(options.inputDir);
  const selectedFeedFiles = limit > 0 ? feedFiles.slice(0, limit) : feedFiles;
  const reports = [];
  const skipped = feedFiles.slice(selectedFeedFiles.length).map((file) => ({ file, reason: "limit" }));

  for (const filePath of selectedFeedFiles) {
    const candidate = candidateForFile(filePath, options, sourceTargets);
    const report = runImporter(candidate, options);
    reports.push(report);
    if (report.status !== "succeeded" && !options.continueOnError) break;
  }

  const summary = {
    generated_at: new Date().toISOString(),
    input_dir: options.inputDir,
    output_dir: options.outputDir,
    dry_run: options.dryRun,
    file_count: selectedFeedFiles.length,
    failed_count: reports.filter((report) => report.status !== "succeeded").length,
    input_rows: reports.reduce((sum, report) => sum + (Number(report.input_rows) || 0), 0),
    normalized_rows: reports.reduce((sum, report) => sum + (Number(report.normalized_rows) || 0), 0),
    accepted_rows: reports.reduce((sum, report) => sum + (Number(report.accepted_rows) || 0), 0),
    rejected_rows: reports.reduce((sum, report) => sum + (Number(report.rejected_rows) || 0), 0),
    verified_ready_candidate_count: reports.reduce((sum, report) => sum + (Number(report.verified_ready_candidate_count) || 0), 0),
    sql_rows: reports.reduce((sum, report) => sum + (Number(report.sql_rows) || 0), 0),
    coverage_delta_estimate: {
      verified_ready_candidate_rows: reports.reduce((sum, report) => sum + (Number(report.accepted_rows) || 0), 0),
      rejected_candidate_rows: reports.reduce((sum, report) => sum + (Number(report.rejected_rows) || 0), 0),
    },
    reports,
    skipped,
  };

  fs.mkdirSync(options.outputDir, { recursive: true });
  fs.writeFileSync(path.join(options.outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  if (hasArg("--json")) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printTextSummary({ reports, skipped });
    console.log(`Summary: ${path.join(options.outputDir, "summary.json")}`);
  }

  if (summary.failed_count > 0) process.exit(1);
}

main();
