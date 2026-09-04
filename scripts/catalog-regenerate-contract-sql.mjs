import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_ROOT = "outputs/catalog-source-imports";
const SOURCE_TARGETS_PATH = "scripts/catalog-source-targets.json";
const OFFICIAL_IMPORT_SCRIPT = "scripts/catalog-official-feed-import.mjs";
const DEFAULT_SQL_CHUNK_SIZE = 25;
const PROBE_OR_TEST_RE = /(?:^|[-_])(probe|test)(?:[-_]|$)/i;

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

function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sourceQualityFor(target = {}) {
  if (target.sourcePriority === "gdsn") return "gdsn";
  if (target.sourcePriority === "retailer") return "retailer_verified";
  if (target.sourcePriority === "manufacturer") return "manufacturer";
  return "official";
}

function ingredientVerificationFor(sourceQuality) {
  if (sourceQuality === "gdsn") return "gdsn";
  if (sourceQuality === "manufacturer") return "manufacturer";
  if (sourceQuality === "retailer_verified") return "retailer_verified";
  return "official";
}

function imageVerificationFor(sourceQuality) {
  if (sourceQuality === "manufacturer") return "manufacturer";
  if (sourceQuality === "retailer_verified") return "retailer_verified";
  return "official";
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

function loadSourceTargets() {
  const targets = readJsonIfExists(SOURCE_TARGETS_PATH, []);
  const bySource = new Map();
  const byBrand = new Map();

  for (const target of targets) {
    const source = normalizeKey(target.sourceSlug || target.sourceOwner || target.brand);
    if (source) bySource.set(source, target);
    const brand = normalizeKey(target.brand);
    if (brand) byBrand.set(brand, target);
    for (const alias of target.aliases || []) {
      const aliasKey = normalizeKey(alias);
      if (aliasKey) byBrand.set(aliasKey, target);
    }
  }

  return { bySource, byBrand };
}

function resolveTarget({ report, dirName }, targets) {
  return targets.bySource.get(normalizeKey(report.source || dirName))
    || targets.byBrand.get(normalizeKey(report.brand))
    || null;
}

function expectedBrandsFor({ report, target }) {
  return uniqueValues([
    ...(Array.isArray(report.expected_brand_terms) ? report.expected_brand_terms : []),
    report.brand,
    target?.brand,
    ...(target?.aliases || []),
  ]);
}

function parseCount(output, label) {
  const match = String(output || "").match(new RegExp(`\\b${label}:\\s*(\\d+)`, "i"));
  return match ? Number(match[1]) : null;
}

function discoverCandidates(rootDir) {
  if (!fs.existsSync(rootDir)) {
    throw new Error(`Missing catalog source import root: ${rootDir}`);
  }

  const targets = loadSourceTargets();
  const filters = new Set([...getArgs("--source"), ...getArgs("--dir")].map(normalizeKey).filter(Boolean));
  const excludes = new Set(getArgs("--exclude").map(normalizeKey).filter(Boolean));
  const includeProbes = hasArg("--include-probes");
  const includeTests = hasArg("--include-tests");
  const candidates = [];
  const skipped = [];

  for (const dirName of fs.readdirSync(rootDir).sort()) {
    const dir = path.join(rootDir, dirName);
    if (!fs.statSync(dir).isDirectory()) continue;
    const feedPath = path.join(dir, "feed.csv");
    if (!fs.existsSync(feedPath)) continue;

    const reportPath = path.join(dir, "report.json");
    const report = readJsonIfExists(reportPath, {});
    const target = resolveTarget({ report, dirName }, targets);
    const source = compact(report.source || target?.sourceSlug || dirName);
    const filterKeys = [dirName, source, report.brand, target?.brand].map(normalizeKey).filter(Boolean);

    if (filters.size > 0 && !filterKeys.some((key) => filters.has(key))) {
      skipped.push({ dir: dirName, source, reason: "filter" });
      continue;
    }
    if (excludes.size > 0 && filterKeys.some((key) => excludes.has(key))) {
      skipped.push({ dir: dirName, source, reason: "excluded" });
      continue;
    }
    if (!includeProbes && PROBE_OR_TEST_RE.test(dirName) && /(?:^|[-_])probe(?:[-_]|$)/i.test(dirName)) {
      skipped.push({ dir: dirName, source, reason: "probe" });
      continue;
    }
    if (!includeTests && PROBE_OR_TEST_RE.test(dirName) && /(?:^|[-_])test(?:[-_]|$)/i.test(dirName)) {
      skipped.push({ dir: dirName, source, reason: "test" });
      continue;
    }

    const sourceQuality = compact(report.source_quality) || sourceQualityFor(target || {});
    candidates.push({
      dirName,
      dir,
      report,
      reportPath,
      feedPath,
      sqlDir: path.join(dir, "sql"),
      source,
      sourceQuality,
      ingredientVerification: compact(report.ingredient_verification) || ingredientVerificationFor(sourceQuality),
      imageVerification: compact(report.image_verification) || imageVerificationFor(sourceQuality),
      requiredSourceUrlPattern: compact(target?.discovery?.requiredUrlPattern || report.required_url_pattern),
      expectedBrands: expectedBrandsFor({ report, target }),
    });
  }

  return { candidates, skipped };
}

function runImporter(candidate, { sqlChunkSize, sqlPayloadFormat }) {
  const args = [
    OFFICIAL_IMPORT_SCRIPT,
    "--file", candidate.feedPath,
    "--source", candidate.source,
    "--source-quality", candidate.sourceQuality,
    "--ingredient-verification", candidate.ingredientVerification,
    "--image-verification", candidate.imageVerification,
    "--emit-sql-rpc",
    "--emit-sql-dir", candidate.sqlDir,
    "--sql-chunk-size", String(sqlChunkSize),
    "--sql-payload-format", sqlPayloadFormat,
  ];
  for (const brand of candidate.expectedBrands) args.push("--expected-brand", brand);
  if (candidate.requiredSourceUrlPattern) {
    args.push("--required-source-url-pattern", candidate.requiredSourceUrlPattern);
  }

  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    maxBuffer: 200 * 1024 * 1024,
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const output = `${stdout}\n${stderr}`;

  return {
    status: result.status,
    error: result.error,
    stdout,
    stderr,
    args,
    inputRows: parseCount(output, "Input rows"),
    normalizedRows: parseCount(output, "Normalized rows"),
    sqlRows: parseCount(output, "SQL rows"),
  };
}

function updateReport(candidate, result) {
  const manifestPath = path.join(candidate.sqlDir, "manifest.json");
  const manifest = readJsonIfExists(manifestPath, null);
  const report = {
    ...candidate.report,
    source: candidate.report.source || candidate.source,
    source_quality: candidate.report.source_quality || candidate.sourceQuality,
    ingredient_verification: candidate.report.ingredient_verification || candidate.ingredientVerification,
    image_verification: candidate.report.image_verification || candidate.imageVerification,
    required_url_pattern: candidate.report.required_url_pattern || candidate.requiredSourceUrlPattern || null,
    expected_brand_terms: candidate.report.expected_brand_terms || candidate.expectedBrands,
    sql: {
      regenerated_at: new Date().toISOString(),
      input_rows: result.inputRows,
      normalized_rows: result.normalizedRows,
      rows: result.sqlRows,
      chunk_count: manifest?.chunks?.length ?? null,
      manifest: fs.existsSync(manifestPath) ? manifestPath : null,
    },
    import_output: compact(result.stdout),
    import_warnings: compact(result.stderr),
  };
  fs.writeFileSync(candidate.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function main() {
  if (hasArg("--help")) {
    console.log([
      "Usage: node scripts/catalog-regenerate-contract-sql.mjs",
      "",
      "Regenerates SQL chunks from prepared catalog source feeds using the current scraper contract.",
      "",
      "Options:",
      "  --root <dir>",
      "  --source <source-or-brand>       Repeatable filter.",
      "  --dir <directory>                Repeatable filter.",
      "  --exclude <source-or-dir>        Repeatable exclusion.",
      "  --include-probes",
      "  --include-tests",
      "  --max-sources <n>",
      "  --sql-chunk-size <n>",
      "  --sql-payload-format <base64|hex|json>",
      "  --continue-on-error",
    ].join("\n"));
    return;
  }

  const rootDir = compact(getArg("--root", DEFAULT_ROOT));
  const sqlChunkSize = positiveInteger(getArg("--sql-chunk-size"), DEFAULT_SQL_CHUNK_SIZE);
  const requestedSqlPayloadFormat = compact(getArg("--sql-payload-format", "base64"));
  const sqlPayloadFormat = ["base64", "hex", "json"].includes(requestedSqlPayloadFormat)
    ? requestedSqlPayloadFormat
    : "base64";
  const maxSources = positiveInteger(getArg("--max-sources"), 0);
  const continueOnError = hasArg("--continue-on-error");
  const { candidates: allCandidates, skipped } = discoverCandidates(rootDir);
  const candidates = maxSources > 0 ? allCandidates.slice(0, maxSources) : allCandidates;
  const results = [];

  for (const candidate of candidates) {
    const result = runImporter(candidate, { sqlChunkSize, sqlPayloadFormat });
    const row = {
      dir: candidate.dirName,
      source: candidate.source,
      status: result.status === 0 ? "succeeded" : "failed",
      input_rows: result.inputRows,
      normalized_rows: result.normalizedRows,
      sql_rows: result.sqlRows,
    };
    if (result.status === 0) {
      updateReport(candidate, result);
    } else {
      row.error = result.error?.message || compact(result.stderr) || compact(result.stdout) || "unknown failure";
      if (!continueOnError) {
        results.push(row);
        console.log(JSON.stringify({ generated_at: new Date().toISOString(), results, skipped }, null, 2));
        process.exit(1);
      }
    }
    results.push(row);
  }

  const failures = results.filter((row) => row.status === "failed").length;
  console.log(JSON.stringify({
    generated_at: new Date().toISOString(),
    source_count: candidates.length,
    skipped_count: skipped.length,
    failed_count: failures,
    input_rows: results.reduce((sum, row) => sum + (Number(row.input_rows) || 0), 0),
    normalized_rows: results.reduce((sum, row) => sum + (Number(row.normalized_rows) || 0), 0),
    sql_rows: results.reduce((sum, row) => sum + (Number(row.sql_rows) || 0), 0),
    results,
    skipped,
  }, null, 2));

  if (failures > 0) process.exit(1);
}

main();
