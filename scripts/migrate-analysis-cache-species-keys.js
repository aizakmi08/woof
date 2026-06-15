#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const {
  analysisCacheBaseKeys,
  analysisCacheKeyForPetType,
} = require("./catalog-pet-type");
const {
  CURRENT_ANALYSIS_SCHEMA_VERSION,
  schemaValidAnalysis,
} = require("./analysis-cache-schema");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY =
  process.env.ANALYSIS_CACHE_MIGRATION_KEY ||
  process.env.ANALYZE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

const REST_PAGE_SIZE = 1000;
const MAX_BATCH_SIZE = 100;

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const verifyWrites = !process.argv.includes("--no-verify-writes");
const verbose = process.argv.includes("--verbose");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const batchSizeArg = process.argv.find((arg) => arg.startsWith("--batch-size="));
const reportArg = process.argv.find((arg) => arg.startsWith("--report="));
const resumeReport = process.argv.includes("--resume-report");
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const batchSize = batchSizeArg ? Number(batchSizeArg.split("=")[1]) : 50;
const reportPath = reportArg ? path.resolve(process.cwd(), reportArg.split("=")[1]) : null;

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run migrate:analysis-cache-species -- --dry-run
  ANALYSIS_CACHE_MIGRATION_KEY=... npm run migrate:analysis-cache-species -- --limit=500 --report=.tmp/analysis-cache-species-migration.jsonl --resume-report

Options:
  --dry-run                 Select candidates without writing analysis_cache rows
  --limit=N                 Process at most N target rows
  --batch-size=N            Upsert batch size, 1-${MAX_BATCH_SIZE} (default 50)
  --report=path.jsonl       Append per-row JSONL results for audit/resume
  --resume-report           Skip target keys with prior verified_migrated report entries
  --force                   Overwrite existing fresh species-specific target rows
  --no-verify-writes        Skip per-target readback verification
  --verbose                 Print skipped target keys
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  }
  if (!dryRun && !SERVICE_KEY) {
    usage("Set ANALYSIS_CACHE_MIGRATION_KEY, ANALYZE_SERVICE_KEY, or SUPABASE_SERVICE_ROLE_KEY to write migrated cache rows.");
  }
  if (limitArg && (!Number.isFinite(limit) || limit < 0)) {
    usage("--limit must be a non-negative number.");
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    usage(`--batch-size must be an integer between 1 and ${MAX_BATCH_SIZE}.`);
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

async function fetchPaged(tablePath, token = SUPABASE_ANON_KEY) {
  const rows = [];
  for (let from = 0; ; from += REST_PAGE_SIZE) {
    const response = await fetch(`${supabaseBase()}/rest/v1/${tablePath}`, {
      headers: {
        ...restHeaders(token),
        Range: `${from}-${from + REST_PAGE_SIZE - 1}`,
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Supabase REST ${tablePath} ${response.status}: ${await response.text()}`);
    }
    const page = await response.json();
    rows.push(...page);
    if (page.length < REST_PAGE_SIZE) break;
  }
  return rows;
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

function loadVerifiedReportKeys() {
  const keys = new Set();
  if (!reportPath || !fs.existsSync(reportPath)) return keys;
  const lines = fs.readFileSync(reportPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (
        entry?.event === "analysis_cache_species_migration" &&
        entry?.status === "verified_migrated" &&
        entry?.target_cache_key
      ) {
        keys.add(entry.target_cache_key);
      }
    } catch {
      // Ignore partial/corrupt lines from interrupted appends.
    }
  }
  return keys;
}

async function getProductRows() {
  const select = encodeURIComponent("cache_key,product_name,brand,ingredient_count,expires_at");
  const now = encodeURIComponent(new Date().toISOString());
  return fetchPaged(
    `product_data?select=${select}&ingredient_count=gte.5&expires_at=gt.${now}&order=cache_key.asc`,
    SUPABASE_ANON_KEY,
  );
}

async function getFreshAnalysisRows() {
  const token = SERVICE_KEY || SUPABASE_ANON_KEY;
  const select = encodeURIComponent("cache_key,lookup_type,analysis,data_source,opff_data,expires_at");
  const now = encodeURIComponent(new Date().toISOString());
  return fetchPaged(
    `analysis_cache?select=${select}&expires_at=gt.${now}&order=cache_key.asc`,
    token,
  );
}

function selectCandidates(productRows, analysisRows, reportVerifiedKeys) {
  const productsByKey = new Map(productRows.map((row) => [row.cache_key, row]));
  const productByAliasKey = new Map();
  const ambiguousAliasKeys = new Set();
  for (const product of productRows) {
    for (const aliasKey of analysisCacheBaseKeys(product)) {
      if (!aliasKey) continue;
      const existing = productByAliasKey.get(aliasKey);
      if (existing && existing.cache_key !== product.cache_key) {
        ambiguousAliasKeys.add(aliasKey);
        productByAliasKey.delete(aliasKey);
      } else if (!ambiguousAliasKeys.has(aliasKey)) {
        productByAliasKey.set(aliasKey, product);
      }
    }
  }
  const analysisByKey = new Map();
  for (const row of analysisRows) {
    if (row.cache_key && schemaValidAnalysis(row.analysis)) {
      analysisByKey.set(row.cache_key, row);
    }
  }

  const candidates = [];
  for (const source of analysisRows) {
    const sourceKey = source.cache_key;
    if (!sourceKey || /__(dog|cat)$/.test(sourceKey)) continue;
    if (!schemaValidAnalysis(source.analysis)) continue;

    if (ambiguousAliasKeys.has(sourceKey)) {
      if (verbose) console.log("[skip ambiguous alias]", sourceKey);
      continue;
    }
    const product = productsByKey.get(sourceKey) || productByAliasKey.get(sourceKey);
    if (!product) {
      if (verbose) console.log("[skip unmatched alias]", sourceKey);
      continue;
    }
    const petType = source.analysis.petType;
    const targetKey = analysisCacheKeyForPetType(product.cache_key, petType);
    if (!targetKey || targetKey === sourceKey) continue;
    if (reportVerifiedKeys.has(targetKey)) {
      if (verbose) console.log("[skip report-verified]", targetKey);
      continue;
    }
    if (!force && analysisByKey.has(targetKey)) {
      if (verbose) console.log("[skip existing target]", targetKey);
      continue;
    }

    candidates.push({
      source,
      product,
      sourceKey,
      targetKey,
      petType,
      matchKey: sourceKey === product.cache_key ? "cache_key" : "app_visible_alias",
    });
  }

  return candidates;
}

function summarizeMatchKeys(candidates) {
  return candidates.reduce((summary, candidate) => {
    const matchKey = candidate.matchKey || "unknown";
    summary[matchKey] = (summary[matchKey] || 0) + 1;
    return summary;
  }, {});
}

function migrationRow(candidate) {
  const now = new Date().toISOString();
  return {
    cache_key: candidate.targetKey,
    lookup_type: "name",
    analysis: candidate.source.analysis,
    data_source: candidate.source.data_source || "verified",
    opff_data: candidate.source.opff_data || null,
    updated_at: now,
    expires_at: candidate.source.expires_at,
  };
}

async function upsertRows(rows) {
  const response = await fetch(`${supabaseBase()}/rest/v1/analysis_cache?on_conflict=cache_key`, {
    method: "POST",
    headers: {
      ...restHeaders(SERVICE_KEY),
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`analysis_cache upsert ${response.status}: ${await response.text()}`);
  }
}

async function getCachedAnalysis(cacheKey) {
  const select = encodeURIComponent("cache_key,analysis,expires_at");
  const response = await fetch(
    `${supabaseBase()}/rest/v1/analysis_cache?select=${select}&cache_key=eq.${encodeURIComponent(cacheKey)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`,
    {
      headers: restHeaders(SERVICE_KEY),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) {
    throw new Error(`analysis_cache verify ${response.status}: ${await response.text()}`);
  }
  const rows = await response.json();
  return rows[0] || null;
}

async function verifyCandidate(candidate) {
  if (!verifyWrites) return { verified: true, reason: "disabled" };
  const row = await getCachedAnalysis(candidate.targetKey);
  if (
    row?.cache_key === candidate.targetKey &&
    schemaValidAnalysis(row.analysis) &&
    row.analysis.petType === candidate.petType
  ) {
    return { verified: true, reason: "schema_valid_pet_match" };
  }
  return { verified: false, reason: "missing_or_invalid_target" };
}

async function migrateCandidates(selected) {
  let migrated = 0;
  let verified = 0;
  let unverified = 0;
  let failed = 0;

  for (let index = 0; index < selected.length; index += batchSize) {
    const batch = selected.slice(index, index + batchSize);
    try {
      await upsertRows(batch.map(migrationRow));
      migrated += batch.length;
    } catch (err) {
      failed += batch.length;
      for (const candidate of batch) {
        appendReport({
          event: "analysis_cache_species_migration",
          status: "failed",
          source_cache_key: candidate.sourceKey,
          target_cache_key: candidate.targetKey,
          pet_type: candidate.petType,
          match_key: candidate.matchKey,
          error: err.message,
        });
      }
      console.log(`[${index + 1}/${selected.length}] batch failed: ${err.message}`);
      continue;
    }

    for (const candidate of batch) {
      const verification = await verifyCandidate(candidate);
      if (verification.verified) {
        verified += 1;
        appendReport({
          event: "analysis_cache_species_migration",
          status: "verified_migrated",
          source_cache_key: candidate.sourceKey,
          target_cache_key: candidate.targetKey,
          pet_type: candidate.petType,
          match_key: candidate.matchKey,
          verification_reason: verification.reason,
        });
      } else {
        unverified += 1;
        appendReport({
          event: "analysis_cache_species_migration",
          status: "unverified",
          source_cache_key: candidate.sourceKey,
          target_cache_key: candidate.targetKey,
          pet_type: candidate.petType,
          match_key: candidate.matchKey,
          verification_reason: verification.reason,
        });
      }
    }
    console.log(`[${Math.min(index + batch.length, selected.length)}/${selected.length}] migrated batch`);
  }

  return { migrated, verified, unverified, failed };
}

async function main() {
  assertConfig();

  const [productRows, analysisRows] = await Promise.all([getProductRows(), getFreshAnalysisRows()]);
  const reportVerifiedKeys = resumeReport ? loadVerifiedReportKeys() : new Set();
  const candidates = selectCandidates(productRows, analysisRows, reportVerifiedKeys);
  const selected = limit > 0 ? candidates.slice(0, limit) : candidates;
  const eligibleMatchKeyCounts = summarizeMatchKeys(candidates);
  const selectedMatchKeyCounts = summarizeMatchKeys(selected);

  console.log(`Analysis-ready product rows: ${productRows.length}`);
  console.log(`Fresh analysis cache rows scanned: ${analysisRows.length}`);
  console.log(`Report-verified resume skips: ${reportVerifiedKeys.size}`);
  console.log(`Eligible legacy cache rows for species-key migration: ${candidates.length}`);
  console.log(`Eligible match keys: ${JSON.stringify(eligibleMatchKeyCounts)}`);
  console.log(`Selected this run: ${selected.length}`);
  console.log(`Selected match keys: ${JSON.stringify(selectedMatchKeyCounts)}`);
  console.log(`Mode: ${dryRun ? "dry-run" : "service-role upsert"}`);
  console.log(`Batch size: ${dryRun ? 0 : batchSize}`);
  console.log(`Write verification: ${verifyWrites ? SERVICE_KEY ? "enabled" : "unavailable without service key" : "disabled"}`);
  console.log(`Report: ${reportPath ? reportPath : "disabled"}`);
  if (selected.length > 0) {
    console.log(`Sample target: ${selected[0].sourceKey} -> ${selected[0].targetKey}`);
  }

  if (dryRun || selected.length === 0) return;

  appendReport({
    event: "analysis_cache_species_migration_start",
    selected: selected.length,
    eligible: candidates.length,
    selected_match_key_counts: selectedMatchKeyCounts,
    eligible_match_key_counts: eligibleMatchKeyCounts,
    resume_report: resumeReport,
    report_verified_skips: reportVerifiedKeys.size,
    batch_size: batchSize,
  });

  const result = await migrateCandidates(selected);
  console.log(`Done. Migrated: ${result.migrated}, verified: ${result.verified}, unverified: ${result.unverified}, failed: ${result.failed}`);
  appendReport({
    event: "analysis_cache_species_migration_done",
    selected_match_key_counts: selectedMatchKeyCounts,
    eligible_match_key_counts: eligibleMatchKeyCounts,
    ...result,
  });
  if (result.failed > 0 || result.unverified > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Analysis cache species-key migration failed:", err.message);
  process.exit(1);
});
