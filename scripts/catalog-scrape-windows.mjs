import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SCRAPE_ALL_SCRIPT = "scripts/catalog-scrape-all.mjs";
const OUTPUT_ROOT = "outputs/catalog-source-imports";
const DEFAULT_WINDOW_SIZE = 5;
const DEFAULT_WINDOW_COUNT = 1;

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function getArgs(name) {
  const values = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue;
    const value = process.argv[index + 1];
    if (value && !value.startsWith("--")) values.push(value);
  }
  return values;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function normalizeKey(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function appendSelectionArgs(args) {
  for (const name of ["--source", "--brand", "--tier", "--access-status"]) {
    for (const value of getArgs(name)) args.push(name, value);
  }
}

function appendOptionalValueArg(args, name) {
  const value = getArg(name);
  if (!value) return;
  args.push(name, value);
}

function appendPassthroughArgs(args) {
  for (const name of [
    "--source-timeout-ms",
    "--source-timeout-minutes",
    "--sql-chunk-size",
    "--batch-size",
    "--changed-max-age-hours",
  ]) {
    appendOptionalValueArg(args, name);
  }
  for (const name of [
    "--allow-partial-pages",
    "--continue-on-error",
    "--dry-run",
    "--generic-only",
    "--strict-import-validation",
  ]) {
    if (hasArg(name)) args.push(name);
  }
}

function selectedSourceSlugs() {
  return getArgs("--source").map(normalizeKey).filter(Boolean);
}

function windowReportPath(sourceSlug, offset, limit) {
  if (!sourceSlug) return "";
  return path.join(OUTPUT_ROOT, `${sourceSlug}-window-${offset}-${limit}`, "run-report.json");
}

function alreadySucceeded(sourceSlugs, offset, limit) {
  if (sourceSlugs.length !== 1 || hasArg("--force")) return false;
  const reportPath = windowReportPath(sourceSlugs[0], offset, limit);
  if (!reportPath || !fs.existsSync(reportPath)) return false;
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    return report.status === "succeeded";
  } catch {
    return false;
  }
}

function parseRunnerOutput(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw_stdout: text };
  }
}

function runWindow({ mode, offset, limit }) {
  const args = [
    SCRAPE_ALL_SCRIPT,
    "--mode", mode,
    "--url-offset", String(offset),
    "--url-limit", String(limit),
  ];
  appendSelectionArgs(args);
  appendPassthroughArgs(args);

  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    maxBuffer: 200 * 1024 * 1024,
    timeout: positiveInteger(getArg("--window-timeout-ms"), 0) || undefined,
  });
  return {
    args,
    status: result.status,
    signal: result.signal,
    error: result.error?.message || "",
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    parsed: parseRunnerOutput(result.stdout),
  };
}

function resultRows(parsed) {
  if (!parsed || !Array.isArray(parsed.results)) return [];
  return parsed.results;
}

function summarizeWindow(run) {
  const rows = resultRows(run.parsed);
  const validationSummaries = rows.map((row) => row.validation?.summary).filter(Boolean);
  return {
    attempted_targets: rows.length,
    succeeded_targets: rows.filter((row) => row.status === "succeeded").length,
    failed_targets: rows.filter((row) => row.status === "failed").length,
    skipped_targets: rows.filter((row) => row.status === "skipped").length,
    accepted_candidates: validationSummaries.reduce((sum, item) => sum + Number(item.accepted_candidates || 0), 0),
    rejected_candidates: validationSummaries.reduce((sum, item) => sum + Number(item.rejected_candidates || 0), 0),
  };
}

function main() {
  const mode = compact(getArg("--mode", "extract")) || "extract";
  const startOffset = nonNegativeInteger(getArg("--start-offset"), 0);
  const windowSize = positiveInteger(getArg("--window-size"), DEFAULT_WINDOW_SIZE);
  const windowCount = positiveInteger(getArg("--window-count"), DEFAULT_WINDOW_COUNT);
  const sourceSlugs = selectedSourceSlugs();
  if (sourceSlugs.length === 0 && getArgs("--brand").length === 0 && !getArg("--tier")) {
    throw new Error("Provide at least --source, --brand, or --tier for windowed scraping.");
  }

  const windows = [];
  for (let index = 0; index < windowCount; index += 1) {
    const offset = startOffset + index * windowSize;
    if (alreadySucceeded(sourceSlugs, offset, windowSize)) {
      windows.push({
        offset,
        limit: windowSize,
        status: "skipped",
        reason: "window_run_report_already_succeeded",
        report_path: windowReportPath(sourceSlugs[0], offset, windowSize),
      });
      continue;
    }

    const startedAt = Date.now();
    const run = runWindow({ mode, offset, limit: windowSize });
    const summary = summarizeWindow(run);
    const status = run.status === 0 ? "succeeded" : "failed";
    const windowResult = {
      offset,
      limit: windowSize,
      status,
      duration_ms: Date.now() - startedAt,
      summary,
      command: [process.execPath, ...run.args].join(" "),
      error: run.error,
      stderr: compact(run.stderr),
      parsed: run.parsed,
    };
    windows.push(windowResult);
    if (status !== "succeeded" && !hasArg("--continue-on-error")) break;
  }

  console.log(JSON.stringify({
    generated_at: new Date().toISOString(),
    mode,
    start_offset: startOffset,
    window_size: windowSize,
    window_count: windowCount,
    windows,
    totals: windows.reduce((totals, window) => {
      const summary = window.summary || {};
      totals.succeeded_windows += window.status === "succeeded" ? 1 : 0;
      totals.failed_windows += window.status === "failed" ? 1 : 0;
      totals.skipped_windows += window.status === "skipped" ? 1 : 0;
      totals.accepted_candidates += Number(summary.accepted_candidates || 0);
      totals.rejected_candidates += Number(summary.rejected_candidates || 0);
      return totals;
    }, {
      succeeded_windows: 0,
      failed_windows: 0,
      skipped_windows: 0,
      accepted_candidates: 0,
      rejected_candidates: 0,
    }),
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
