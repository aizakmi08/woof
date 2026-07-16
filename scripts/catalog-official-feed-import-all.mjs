import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  acquisitionQueueOptions,
  printAcquisitionQueueUpdate,
  updateCatalogAcquisitionQueue,
} from "./catalog-acquisition-queue-utils.mjs";

const DEFAULT_ROOT = "outputs/catalog-source-imports";
const OFFICIAL_IMPORT_SCRIPT = path.join("scripts", "catalog-official-feed-import.mjs");
const SOURCE_TARGETS_PATH = path.join("scripts", "catalog-source-targets.json");
const DEFAULT_BATCH_SIZE = 500;
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

function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}

function anonKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
}

function clientFromEnv({ useAnonKey = false } = {}) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
  const key = useAnonKey ? anonKey() : serviceRoleKey();
  if (!supabaseUrl || !key) return null;

  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function loadSourceTargets() {
  const targets = readJsonIfExists(SOURCE_TARGETS_PATH, []);
  const bySource = new Map();
  const byBrand = new Map();

  for (const target of targets) {
    if (target.sourceSlug) bySource.set(normalizeKey(target.sourceSlug), target);
    byBrand.set(normalizeKey(target.brand), target);
    for (const alias of target.aliases || []) {
      byBrand.set(normalizeKey(alias), target);
    }
  }

  return { bySource, byBrand };
}

function parseRowsFromImportWarnings(report = {}) {
  const text = compact(report.import_warnings);
  const match = text.match(/\bSQL rows:\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function expectedRowsFromReport(report = {}) {
  const value = report.sql?.rows
    ?? report.sql_rows
    ?? parseRowsFromImportWarnings(report);
  return numericOrNull(value);
}

function projectPath(value) {
  if (!value) return "";
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

function parseManifestPathFromImportOutput(report = {}) {
  const match = String(report.import_stdout || "").match(/\bManifest:\s*(.+?manifest\.json)\b/i);
  return match ? projectPath(match[1].trim()) : "";
}

function expectedRowsFromSqlManifest({ dir, report }) {
  const manifestPaths = [
    path.join(dir, "sql", "manifest.json"),
    report.sql_dir ? path.join(projectPath(report.sql_dir), "manifest.json") : "",
    report.sql_manifest ? projectPath(report.sql_manifest) : "",
    parseManifestPathFromImportOutput(report),
  ].filter(Boolean);

  const seen = new Set();
  for (const manifestPath of manifestPaths) {
    if (seen.has(manifestPath)) continue;
    seen.add(manifestPath);

    const manifest = readJsonIfExists(manifestPath, null);
    if (!manifest) continue;

    const explicitRows = numericOrNull(manifest.total_sql_rows ?? manifest.sql_rows ?? manifest.rows);
    if (explicitRows !== null) return explicitRows;

    if (Array.isArray(manifest.chunks)) {
      const chunkRows = manifest.chunks.reduce((sum, chunk) => sum + (Number(chunk.rows) || 0), 0);
      if (chunkRows > 0) return chunkRows;
    }
  }

  return null;
}

function targetForCandidate({ report, dirName }, targets) {
  const sourceKey = normalizeKey(report.source || dirName);
  return targets.bySource.get(sourceKey)
    || targets.byBrand.get(normalizeKey(report.brand))
    || null;
}

function isBroadRetailCatalogTarget(target = {}) {
  return target?.sourcePriority === "retailer"
    && (
      /\bretail\s+catalog\b/i.test(target.brand || "")
      || /-retail-catalog$/i.test(target.sourceSlug || "")
    );
}

function expectedBrandTerms({ report, target }) {
  if (isBroadRetailCatalogTarget(target)) return [];
  return uniqueValues([
    ...(Array.isArray(report.expected_brand_terms) ? report.expected_brand_terms : []),
    report.brand,
    target?.brand,
    ...(target?.aliases || []),
  ]);
}

function candidateSource({ report, dirName, target }) {
  return compact(report.source || target?.sourceSlug || dirName);
}

function discoverCandidates({ rootDir, includeProbes, includeTests, includeZero }) {
  if (!fs.existsSync(rootDir)) {
    throw new Error(`Missing source import root: ${rootDir}`);
  }

  const targets = loadSourceTargets();
  const filters = new Set([
    ...getArgs("--source"),
    ...getArgs("--dir"),
  ].map(normalizeKey).filter(Boolean));
  const excludes = new Set(getArgs("--exclude").map(normalizeKey).filter(Boolean));

  const candidates = [];
  const skipped = [];

  for (const dirName of fs.readdirSync(rootDir).sort()) {
    const dir = path.join(rootDir, dirName);
    if (!fs.statSync(dir).isDirectory()) continue;

    const feedPath = path.join(dir, "feed.csv");
    if (!fs.existsSync(feedPath)) continue;

    const report = readJsonIfExists(path.join(dir, "report.json"), {});
    const source = candidateSource({ report, dirName, target: null });
    const filterKeys = [
      dirName,
      source,
      report.brand,
    ].map(normalizeKey).filter(Boolean);

    if (filters.size > 0 && !filterKeys.some((key) => filters.has(key))) {
      skipped.push({ dirName, source, reason: "filter" });
      continue;
    }
    if (excludes.size > 0 && filterKeys.some((key) => excludes.has(key))) {
      skipped.push({ dirName, source, reason: "excluded" });
      continue;
    }
    if (!includeProbes && PROBE_OR_TEST_RE.test(dirName) && /(?:^|[-_])probe(?:[-_]|$)/i.test(dirName)) {
      skipped.push({ dirName, source, reason: "probe" });
      continue;
    }
    if (!includeTests && PROBE_OR_TEST_RE.test(dirName) && /(?:^|[-_])test(?:[-_]|$)/i.test(dirName)) {
      skipped.push({ dirName, source, reason: "test" });
      continue;
    }

    const target = targetForCandidate({ report, dirName }, targets);
    const resolvedSource = candidateSource({ report, dirName, target });
    const expectedRows = expectedRowsFromReport(report)
      ?? expectedRowsFromSqlManifest({ dir, report });
    if (!includeZero && expectedRows === 0) {
      skipped.push({ dirName, source: resolvedSource, reason: "zero_sql_rows" });
      continue;
    }

    candidates.push({
      dirName,
      dir,
      feedPath,
      report,
      target,
      source: resolvedSource,
      sourceQuality: compact(report.source_quality) || "manufacturer",
      ingredientVerification: compact(report.ingredient_verification) || null,
      imageVerification: compact(report.image_verification) || null,
      requiredSourceUrlPattern: compact(target?.discovery?.requiredUrlPattern || report.required_url_pattern || ""),
      expectedBrands: expectedBrandTerms({ report, target }),
      expectedRows,
    });
  }

  return { candidates, skipped };
}

function importerArgs(candidate, {
  dryRun,
  batchSize,
  skipAcquisition,
  rpcName,
  importKey,
  useAnonKey,
}) {
  const args = [
    OFFICIAL_IMPORT_SCRIPT,
    "--file",
    candidate.feedPath,
    "--source",
    candidate.source,
    "--source-quality",
    candidate.sourceQuality,
    "--batch-size",
    String(batchSize),
  ];

  if (candidate.ingredientVerification) {
    args.push("--ingredient-verification", candidate.ingredientVerification);
  }
  if (candidate.imageVerification) {
    args.push("--image-verification", candidate.imageVerification);
  }
  for (const brand of candidate.expectedBrands) {
    args.push("--expected-brand", brand);
  }
  if (candidate.requiredSourceUrlPattern) {
    args.push("--required-source-url-pattern", candidate.requiredSourceUrlPattern);
  }
  if (dryRun) {
    args.push("--dry-run");
  }
  if (rpcName) {
    args.push("--rpc-name", rpcName);
  }
  if (importKey) {
    args.push("--import-key", importKey);
  }
  if (useAnonKey) {
    args.push("--use-anon-key");
  }
  if (skipAcquisition) {
    args.push("--skip-acquisition-refresh", "--skip-acquisition-reconcile");
  }
  return args;
}

function parseImporterCount(output, label) {
  const match = output.match(new RegExp(`${label}:\\s*(\\d+)`, "i"));
  return match ? Number(match[1]) : null;
}

function runImporter(candidate, options) {
  const args = importerArgs(candidate, options);
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
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
    inputRows: parseImporterCount(output, "Input rows"),
    normalizedRows: parseImporterCount(output, "Normalized rows"),
    upsertedRows: parseImporterCount(output, "Upserted rows"),
    sqlRows: parseImporterCount(output, "SQL rows"),
  };
}

function printCandidatePlan(candidates, skipped) {
  console.log(`Catalog official feed import plan`);
  console.log(`Candidates: ${candidates.length}`);
  console.log(`Skipped: ${skipped.length}`);
  if (skipped.length > 0) {
    console.table(skipped.map((item) => ({
      dir: item.dirName,
      source: item.source,
      reason: item.reason,
    })));
  }
  console.table(candidates.map((candidate) => ({
    dir: candidate.dirName,
    source: candidate.source,
    brand: candidate.report.brand || candidate.target?.brand || "",
    expected_rows: candidate.expectedRows ?? "",
    url_pattern: candidate.requiredSourceUrlPattern || "",
    expected_brands: candidate.expectedBrands.join(", "),
  })));
}

function printSummary(rows) {
  console.table(rows.map((row) => ({
    dir: row.dir,
    source: row.source,
    input: row.inputRows ?? "",
    normalized: row.normalizedRows ?? "",
    upserted: row.upsertedRows ?? "",
    status: row.status,
  })));
}

function failFastMessage(candidate, result) {
  return [
    `Importer failed for ${candidate.dirName} (${candidate.source}) with status ${result.status}.`,
    result.error ? `Error: ${result.error.message}` : "",
    result.stderr ? `stderr:\n${result.stderr}` : "",
    result.stdout ? `stdout:\n${result.stdout}` : "",
  ].filter(Boolean).join("\n");
}

async function main() {
  if (hasArg("--help")) {
    console.log([
      "Usage: node scripts/catalog-official-feed-import-all.mjs [--execute]",
      "",
      "Default mode is dry-run only. Add --execute to write live rows with SUPABASE_SERVICE_ROLE_KEY.",
      "",
      "Options:",
      "  --root <dir>",
      "  --source <source-or-brand>       Repeatable filter.",
      "  --dir <directory>                Repeatable filter.",
      "  --exclude <source-or-dir>        Repeatable exclusion.",
      "  --include-probes",
      "  --include-tests",
      "  --include-zero",
      "  --max-sources <n>",
      "  --batch-size <n>",
      "  --rpc-name <name>               Use an explicit import RPC for execute mode.",
      "  --import-key <key>              Pass a one-time import key to the explicit RPC.",
      "  --use-anon-key                  Use SUPABASE_ANON_KEY instead of service role.",
      "  --continue-on-error",
      "  --skip-preflight                 Execute without the dry-run preflight.",
      "  --skip-acquisition-refresh",
      "  --skip-acquisition-reconcile",
      "  --acquisition-days <days>",
      "  --acquisition-limit <rows>",
    ].join("\n"));
    return;
  }

  const execute = hasArg("--execute");
  const preflight = execute && !hasArg("--skip-preflight");
  const continueOnError = hasArg("--continue-on-error");
  const rootDir = compact(getArg("--root", DEFAULT_ROOT));
  const batchSize = Math.min(Number(getArg("--batch-size", DEFAULT_BATCH_SIZE)) || DEFAULT_BATCH_SIZE, 1000);
  const maxSources = Number(getArg("--max-sources", 0)) || 0;
  const rpcName = compact(getArg("--rpc-name"));
  const importKey = compact(getArg("--import-key"));
  const useAnonKey = hasArg("--use-anon-key");
  const acquisitionOptions = acquisitionQueueOptions({ getArg, hasArg });
  const { candidates: discoveredCandidates, skipped } = discoverCandidates({
    rootDir,
    includeProbes: hasArg("--include-probes"),
    includeTests: hasArg("--include-tests"),
    includeZero: hasArg("--include-zero"),
  });
  const candidates = maxSources > 0 ? discoveredCandidates.slice(0, maxSources) : discoveredCandidates;

  printCandidatePlan(candidates, skipped);

  if (execute && !clientFromEnv({ useAnonKey })) {
    throw new Error(useAnonKey
      ? "Set SUPABASE_URL and SUPABASE_ANON_KEY before running with --execute --use-anon-key."
      : "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY before running with --execute.");
  }

  const summaries = [];
  let failures = 0;

  for (const candidate of candidates) {
    if (!execute || preflight) {
      const dryRunResult = runImporter(candidate, {
        dryRun: true,
        batchSize,
        skipAcquisition: true,
        rpcName,
        importKey,
        useAnonKey,
      });
      summaries.push({
        dir: candidate.dirName,
        source: candidate.source,
        phase: "dry-run",
        ...dryRunResult,
      });
      if (dryRunResult.status !== 0) {
        failures += 1;
        console.error(failFastMessage(candidate, dryRunResult));
        if (!continueOnError) break;
        continue;
      }
    }

    if (!execute) continue;

    const executeResult = runImporter(candidate, {
      dryRun: false,
      batchSize,
      skipAcquisition: true,
      rpcName,
      importKey,
      useAnonKey,
    });
    summaries.push({
      dir: candidate.dirName,
      source: candidate.source,
      phase: "execute",
      ...executeResult,
    });
    if (executeResult.status !== 0) {
      failures += 1;
      console.error(failFastMessage(candidate, executeResult));
      if (!continueOnError) break;
    }
  }

  console.log(execute ? "Bulk official feed import summary" : "Bulk official feed dry-run summary");
  printSummary(summaries.filter((row) => execute ? row.phase === "execute" : row.phase === "dry-run"));

  if (failures > 0) {
    throw new Error(`Bulk official feed import finished with ${failures} failure(s).`);
  }

  if (execute && (acquisitionOptions.refresh || acquisitionOptions.reconcile)) {
    if (useAnonKey) {
      console.log("Skipping final acquisition refresh for anon-key RPC import; run the privileged refresh/reconcile SQL after execute.");
    } else {
      const client = clientFromEnv();
      printAcquisitionQueueUpdate(await updateCatalogAcquisitionQueue(client, {
        ...acquisitionOptions,
        label: "bulk official feed import",
      }));
    }
  }

  const normalizedTotal = summaries
    .filter((row) => execute ? row.phase === "execute" : row.phase === "dry-run")
    .reduce((sum, row) => sum + (Number(row.normalizedRows) || 0), 0);
  const upsertedTotal = summaries
    .filter((row) => row.phase === "execute")
    .reduce((sum, row) => sum + (Number(row.upsertedRows) || 0), 0);

  console.log(`Normalized rows ${execute ? "prepared" : "available"}: ${normalizedTotal}`);
  if (execute) console.log(`Upserted rows: ${upsertedTotal}`);
  if (!execute) console.log("Dry run only. Add --execute with SUPABASE_SERVICE_ROLE_KEY to write live rows.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
