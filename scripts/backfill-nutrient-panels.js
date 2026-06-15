#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const NUTRIENT_PANEL_SERVICE_KEY =
  process.env.NUTRIENT_PANEL_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

const MAX_NUTRIENT_BACKFILL_CONCURRENCY = 8;
const FATAL_NUTRIENT_HTTP_STATUS = new Set([401, 403, 429, 503]);
const PERCENT_FIELDS = [
  "protein_pct",
  "fat_pct",
  "fiber_pct",
  "moisture_pct",
  "ash_pct",
  "calcium_pct",
  "phosphorus_pct",
  "omega_3_pct",
  "omega_6_pct",
];
const CALORIE_FIELDS = ["calories_per_cup", "calories_per_kg"];
const PANEL_FIELDS = new Set(["basis", "source_url", ...PERCENT_FIELDS, ...CALORIE_FIELDS]);
const EMPTY_NUTRIENT_TARGET_HINT =
  "No validated nutrient panels were selected. This input appears to be a missing-panel research queue; provide entries with cacheKey and nutrientPanel.";

const dryRun = process.argv.includes("--dry-run");
const allowRateLimited = process.argv.includes("--allow-rate-limited");
const verifyWrites = !process.argv.includes("--no-verify-writes");
const inputArg = process.argv.find((arg) => arg.startsWith("--input="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const concurrencyArg = process.argv.find((arg) => arg.startsWith("--concurrency="));
const delayArg = process.argv.find((arg) => arg.startsWith("--delay-ms="));
const reportArg = process.argv.find((arg) => arg.startsWith("--report="));
const exportTargetsArg = process.argv.find((arg) => arg.startsWith("--export-targets="));
const resumeReport = process.argv.includes("--resume-report");
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const concurrency = concurrencyArg ? Number(concurrencyArg.split("=")[1]) : 1;
const delayMs = delayArg ? Number(delayArg.split("=")[1]) : 1000;
const reportPath = reportArg ? path.resolve(process.cwd(), reportArg.split("=")[1]) : null;
const exportTargetsPath = exportTargetsArg ? path.resolve(process.cwd(), exportTargetsArg.split("=")[1]) : null;

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  NUTRIENT_PANEL_SERVICE_KEY=... npm run backfill:nutrients -- --input=nutrient-panels.json
  npm run backfill:nutrients -- --dry-run --input=nutrient-panels.json

Options:
  --input=path.json          Required. Array or { targets: [...] } with cacheKey + nutrientPanel
  --dry-run                  Validate and count entries without writing
  --limit=N                  Process at most N valid entries
  --concurrency=N            Parallel nutrient update workers, 1-${MAX_NUTRIENT_BACKFILL_CONCURRENCY} (default 1)
  --delay-ms=N               Delay between nutrient update launches (default 1000)
  --report=path.jsonl        Append per-row JSONL results for audit/resume
  --resume-report            Skip cache keys with prior verified_saved report entries
  --export-targets=path.json  Write normalized valid targets for audit/batch planning
  --no-verify-writes         Skip product_data readback verification after update
  --allow-rate-limited       Allow anon-key calls for tiny local tests; service key is required by default
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  }
  if (!inputArg) {
    usage("--input=path.json is required.");
  }
  if (!dryRun && !NUTRIENT_PANEL_SERVICE_KEY && !allowRateLimited) {
    usage("Set NUTRIENT_PANEL_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY for nutrient-panel backfills.");
  }
  if (limitArg && (!Number.isFinite(limit) || limit < 0)) {
    usage("--limit must be a non-negative number.");
  }
  if (
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > MAX_NUTRIENT_BACKFILL_CONCURRENCY
  ) {
    usage(`--concurrency must be an integer between 1 and ${MAX_NUTRIENT_BACKFILL_CONCURRENCY}.`);
  }
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    usage("--delay-ms must be a non-negative number.");
  }
  if (resumeReport && !reportPath) {
    usage("--resume-report requires --report=path.jsonl.");
  }
}

function supabaseBase() {
  return SUPABASE_URL.replace(/\/$/, "");
}

function restHeaders(token = SUPABASE_ANON_KEY) {
  return {
    apikey: token,
    Authorization: `Bearer ${token}`,
  };
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function cleanUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed.slice(0, 500);
}

function normalizePanelResult(rawPanel, sourceUrl) {
  if (!rawPanel) return { panel: null, reason: "missing_nutrient_panel" };
  if (typeof rawPanel !== "object" || Array.isArray(rawPanel)) {
    return { panel: null, reason: "nutrient_panel_not_object" };
  }
  const basis = String(rawPanel.basis || "").trim();
  if (!["as-fed", "dry-matter"].includes(basis)) {
    return { panel: null, reason: "invalid_or_missing_basis" };
  }

  const panel = { basis };
  let numericCount = 0;

  for (const field of PERCENT_FIELDS) {
    const numeric = toNumber(rawPanel[field]);
    if (numeric == null) continue;
    if (numeric < 0 || numeric > 100) {
      return { panel: null, reason: `invalid_percentage_${field}` };
    }
    panel[field] = numeric;
    numericCount++;
  }

  for (const field of CALORIE_FIELDS) {
    const numeric = toNumber(rawPanel[field]);
    if (numeric == null) continue;
    if (numeric < 0 || numeric > 10000) {
      return { panel: null, reason: `invalid_calorie_${field}` };
    }
    panel[field] = numeric;
    numericCount++;
  }

  const url = cleanUrl(sourceUrl || rawPanel.source_url);
  if (url) panel.source_url = url;

  if (numericCount < 2) return { panel: null, reason: "nutrient_panel_too_sparse" };
  return { panel, reason: null };
}

function loadVerifiedReportKeys() {
  const keys = new Set();
  if (!reportPath || !fs.existsSync(reportPath)) return keys;
  const lines = fs.readFileSync(reportPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry?.event === "nutrient_panel_result" && entry?.status === "verified_saved" && entry?.cache_key) {
        keys.add(entry.cache_key);
      }
    } catch {
      // Ignore partial/corrupt report lines from interrupted appends.
    }
  }
  return keys;
}

function appendReport(entry) {
  if (!reportPath || dryRun) return;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.appendFileSync(
    reportPath,
    `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n`,
    "utf8",
  );
}

function summarizeTargets(targets) {
  const byBasis = new Map();
  let withSourceUrl = 0;
  let withCalories = 0;
  let withMinerals = 0;
  for (const target of targets) {
    const panel = target.nutrientPanel || {};
    byBasis.set(panel.basis, (byBasis.get(panel.basis) || 0) + 1);
    if (panel.source_url) withSourceUrl += 1;
    if (panel.calories_per_cup != null || panel.calories_per_kg != null) withCalories += 1;
    if (panel.calcium_pct != null || panel.phosphorus_pct != null || panel.ash_pct != null) withMinerals += 1;
  }
  return {
    byBasis: [...byBasis.entries()]
      .map(([basis, count]) => ({ basis, count }))
      .sort((a, b) => b.count - a.count || a.basis.localeCompare(b.basis)),
    withSourceUrl,
    withCalories,
    withMinerals,
  };
}

function exportTargets(targets, metadata) {
  if (!exportTargetsPath) return;
  fs.mkdirSync(path.dirname(exportTargetsPath), { recursive: true });
  fs.writeFileSync(
    exportTargetsPath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      ...metadata,
      summary: summarizeTargets(targets),
      targets: targets.map((target) => ({
        cacheKey: target.cacheKey,
        productName: target.productName || "",
        brand: target.brand || "",
        nutrientPanel: target.nutrientPanel,
      })),
    }, null, 2)}\n`,
    "utf8",
  );
}

function loadInputEntries() {
  const file = path.resolve(process.cwd(), inputArg.split("=")[1]);
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const entries = Array.isArray(parsed) ? parsed : parsed?.targets;
  if (!Array.isArray(entries)) usage("--input JSON must be an array or an object with a targets array.");
  return entries;
}

function normalizeEntryResult(entry) {
  const cacheKey = String(entry?.cacheKey || entry?.cache_key || "").trim();
  if (!cacheKey) return { target: null, reason: "missing_cache_key" };
  const rawPanel = entry?.nutrientPanel || entry?.nutrient_panel || entry?.panel;
  const { panel, reason } = normalizePanelResult(rawPanel, entry?.sourceUrl || entry?.source_url);
  if (!panel) return { target: null, reason };
  return {
    target: {
      cacheKey,
      productName: String(entry?.productName || entry?.product_name || "").trim(),
      brand: String(entry?.brand || "").trim(),
      nutrientPanel: panel,
    },
    reason: null,
  };
}

function loadTargets() {
  const entries = loadInputEntries();
  const byKey = new Map();
  let invalid = 0;
  const invalidReasons = new Map();
  let duplicateEntries = 0;
  for (const entry of entries) {
    const { target, reason } = normalizeEntryResult(entry);
    if (!target) {
      invalid++;
      invalidReasons.set(reason || "invalid_entry", (invalidReasons.get(reason || "invalid_entry") || 0) + 1);
      continue;
    }
    if (!byKey.has(target.cacheKey)) {
      byKey.set(target.cacheKey, target);
    } else {
      duplicateEntries++;
    }
  }
  return {
    targets: [...byKey.values()],
    invalid,
    duplicateEntries,
    invalidReasons: [...invalidReasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
  };
}

async function updateNutrientPanel(target) {
  const token = NUTRIENT_PANEL_SERVICE_KEY || SUPABASE_ANON_KEY;
  const response = await fetch(`${supabaseBase()}/rest/v1/rpc/update_product_nutrient_panel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...restHeaders(token),
    },
    body: JSON.stringify({
      p_cache_key: target.cacheKey,
      p_nutrient_panel: target.nutrientPanel,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  return { ok: response.ok, status: response.status, data };
}

function fatalNutrientFailureReason(result) {
  if (result?.ok) return "";
  const message = String(
    result?.data?.error ||
      result?.data?.message ||
      result?.data?.reason ||
      result?.data?.raw ||
      "",
  ).toLowerCase();
  if (result?.status === 401) return "nutrient_auth";
  if (
    result?.status === 403 &&
    /service|forbidden|unauthorized|permission|rls|role/.test(message)
  ) {
    return "nutrient_auth";
  }
  if (result?.status === 429 || /rate.?limit|too many requests/.test(message)) {
    return "nutrient_rate_limited";
  }
  if (result?.status === 503 || /temporarily unavailable|service unavailable|not configured/.test(message)) {
    return "nutrient_unavailable";
  }
  if (FATAL_NUTRIENT_HTTP_STATUS.has(result?.status)) return `nutrient_http_${result.status}`;
  return "";
}

async function getProductNutrientRow(cacheKey) {
  const select = encodeURIComponent("cache_key,has_published_nutrients,nutrient_panel");
  const response = await fetch(
    `${supabaseBase()}/rest/v1/product_data?select=${select}&cache_key=eq.${encodeURIComponent(cacheKey)}&limit=1`,
    {
      headers: restHeaders(SUPABASE_ANON_KEY),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) {
    throw new Error(`product_data nutrient verify ${response.status}: ${await response.text()}`);
  }
  const rows = await response.json();
  return rows[0] || null;
}

function panelMatches(expected, actual) {
  if (!actual || actual.basis !== expected.basis) return false;
  for (const field of PANEL_FIELDS) {
    if (!(field in expected)) continue;
    if (String(actual[field]) !== String(expected[field])) return false;
  }
  return true;
}

async function verifyNutrientWrite(target) {
  if (!verifyWrites) return { verified: true, reason: "disabled" };
  for (let attempt = 1; attempt <= 5; attempt++) {
    const row = await getProductNutrientRow(target.cacheKey);
    if (
      row?.cache_key === target.cacheKey &&
      row.has_published_nutrients === true &&
      panelMatches(target.nutrientPanel, row.nutrient_panel)
    ) {
      return { verified: true, reason: "published_nutrients_ready" };
    }
    if (attempt < 5) await delay(1000);
  }
  return { verified: false, reason: "missing_or_mismatched_nutrient_panel" };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processSelectedTargets(selected) {
  let verifiedSaved = 0;
  let accepted = 0;
  let failed = 0;
  let unverified = 0;
  let cursor = 0;
  let nextLaunchAt = Date.now();
  let stopRequested = false;

  async function waitForLaunchSlot() {
    if (delayMs <= 0) return;
    const now = Date.now();
    const launchAt = Math.max(nextLaunchAt, now);
    const waitMs = launchAt - now;
    nextLaunchAt = launchAt + delayMs;
    if (waitMs > 0) await delay(waitMs);
  }

  async function processOne(target, index) {
    const label = `[${index + 1}/${selected.length}] ${target.productName || target.cacheKey}`;
    try {
      const result = await updateNutrientPanel(target);
      if (!result.ok || result.data !== true) {
        const fatalReason = fatalNutrientFailureReason(result);
        failed++;
        console.log(`${label} ${fatalReason ? `fatal ${fatalReason}` : "failed"} ${result.status}: ${JSON.stringify(result.data).slice(0, 220)}`);
        appendReport({
          event: "nutrient_panel_result",
          status: fatalReason ? "fatal_failed" : "failed",
          cache_key: target.cacheKey,
          http_status: result.status,
          fatal_reason: fatalReason || undefined,
          error: result.data?.message || result.data?.error || result.data?.raw || "not_updated",
        });
        if (fatalReason) stopRequested = true;
        return;
      }

      const verification = await verifyNutrientWrite(target);
      if (verification.verified && verification.reason === "published_nutrients_ready") {
        verifiedSaved++;
        console.log(`${label} verified saved`);
        appendReport({
          event: "nutrient_panel_result",
          status: "verified_saved",
          cache_key: target.cacheKey,
          verification_reason: verification.reason,
        });
      } else if (verification.verified) {
        accepted++;
        console.log(`${label} accepted (${verification.reason})`);
        appendReport({
          event: "nutrient_panel_result",
          status: "accepted",
          cache_key: target.cacheKey,
          verification_reason: verification.reason,
        });
      } else {
        unverified++;
        console.log(`${label} unverified ${verification.reason}`);
        appendReport({
          event: "nutrient_panel_result",
          status: "unverified",
          cache_key: target.cacheKey,
          verification_reason: verification.reason,
        });
      }
    } catch (err) {
      failed++;
      console.log(`${label} error: ${err.message}`);
      appendReport({
        event: "nutrient_panel_result",
        status: "error",
        cache_key: target.cacheKey,
        error: err.message,
      });
    }
  }

  async function worker() {
    while (!stopRequested) {
      const index = cursor++;
      if (index >= selected.length) break;
      await waitForLaunchSlot();
      if (stopRequested) break;
      await processOne(selected[index], index);
    }
  }

  const workerCount = Math.min(concurrency, selected.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return { verifiedSaved, accepted, unverified, failed };
}

async function main() {
  assertConfig();
  const { targets, invalid, invalidReasons, duplicateEntries } = loadTargets();
  const reportVerifiedKeys = resumeReport ? loadVerifiedReportKeys() : new Set();
  const eligible = targets.filter((target) => !reportVerifiedKeys.has(target.cacheKey));
  const selected = limit > 0 ? eligible.slice(0, limit) : eligible;

  console.log(`Nutrient panel entries: ${targets.length}`);
  console.log(`Invalid/skipped entries: ${invalid}`);
  console.log(`Duplicate valid entries: ${duplicateEntries}`);
  console.log(`Invalid reason summary: ${invalidReasons.map((entry) => `${entry.reason}=${entry.count}`).join(", ") || "none"}`);
  console.log(`Report-verified resume skips: ${reportVerifiedKeys.size}`);
  console.log(`Selected this run: ${selected.length}`);
  console.log(`Mode: ${dryRun ? "dry-run" : NUTRIENT_PANEL_SERVICE_KEY ? "service-role nutrient update" : "rate-limited anon nutrient update"}`);
  console.log(`Concurrency: ${dryRun ? 0 : concurrency}`);
  console.log(`Write verification: ${verifyWrites ? "enabled" : "disabled"}`);
  console.log(`Report: ${reportPath ? reportPath : "disabled"}`);
  console.log(`Target export: ${exportTargetsPath ? exportTargetsPath : "disabled"}`);
  const eligibleSummary = summarizeTargets(eligible);
  console.log(`Eligible by nutrient basis: ${eligibleSummary.byBasis.map((entry) => `${entry.basis}=${entry.count}`).join(", ") || "none"}`);
  console.log(`Eligible with source URLs: ${eligibleSummary.withSourceUrl}; calories: ${eligibleSummary.withCalories}; minerals: ${eligibleSummary.withMinerals}`);

  exportTargets(eligible, {
    inputEntries: targets.length + invalid,
    validEntries: targets.length,
    invalidEntries: invalid,
    duplicateValidEntries: duplicateEntries,
    invalidReasons,
    reportVerifiedSkips: reportVerifiedKeys.size,
    eligibleCount: eligible.length,
    selectedCount: selected.length,
    dryRun,
  });

  if (dryRun) return;
  if (selected.length === 0) {
    console.error(EMPTY_NUTRIENT_TARGET_HINT);
    process.exit(1);
  }

  appendReport({
    event: "nutrient_panel_start",
    selected: selected.length,
    eligible: eligible.length,
    resume_report: resumeReport,
    report_verified_skips: reportVerifiedKeys.size,
    concurrency,
    delay_ms: delayMs,
  });

  const { verifiedSaved, accepted, unverified, failed } = await processSelectedTargets(selected);
  console.log(`Verified saved: ${verifiedSaved}`);
  console.log(`Accepted: ${accepted}`);
  console.log(`Unverified: ${unverified}`);
  console.log(`Failed: ${failed}`);
  appendReport({
    event: "nutrient_panel_done",
    verified_saved: verifiedSaved,
    accepted,
    unverified,
    failed,
    concurrency,
  });
  if (failed > 0 || unverified > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Nutrient panel backfill failed:", err.message);
  process.exit(1);
});
