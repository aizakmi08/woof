#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const {
  inferPetTypes,
  inferPrimaryPetType,
  analysisCacheBaseKeys,
  analysisCacheKeyForPetType,
} = require("./catalog-pet-type");
const {
  CURRENT_ANALYSIS_SCHEMA_VERSION,
  schemaValidAnalysis,
} = require("./analysis-cache-schema");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ANALYZE_SERVICE_KEY =
  process.env.ANALYZE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

const REST_PAGE_SIZE = 1000;
const MAX_DEMAND_EVENT_ROWS = 50_000;
const MAX_PRECOMPUTE_CONCURRENCY = 8;
const PRECOMPUTE_PRIORITY_DESCRIPTION = "recent_demand,market_brand,source_trust,published_nutrients,image,ingredient_count,pet_type_specificity,name";
const SOURCE_PRECOMPUTE_PRIORITY = new Map([
  ["brand", 0],
  ["manufacturer", 0],
  ["manual", 1],
  ["web_verified", 1],
  ["store_brand", 2],
  ["amazon", 3],
  ["dfa", 4],
  ["opff", 5],
  ["openfoodfacts", 5],
  ["user_ocr", 6],
]);
const MARKET_BRAND_PRECOMPUTE_PRIORITY = new Map([
  ["purina pro plan", 0],
  ["hill's science diet", 0],
  ["hills science diet", 0],
  ["royal canin", 0],
  ["blue buffalo", 0],
  ["purina one", 1],
  ["fancy feast", 1],
  ["friskies", 1],
  ["iams", 1],
  ["pedigree", 1],
  ["cesar", 2],
  ["sheba", 2],
  ["meow mix", 2],
  ["whiskas", 2],
  ["temptations", 2],
  ["greenies", 2],
  ["nutro", 2],
  ["rachael ray nutrish", 2],
  ["wellness", 2],
  ["merrick", 2],
  ["taste of the wild", 3],
  ["natural balance", 3],
  ["diamond naturals", 3],
  ["freshpet", 3],
  ["acana", 3],
  ["orijen", 3],
  ["instinct", 3],
  ["tiki cat", 3],
  ["weruva", 3],
  ["nulo", 3],
  ["canidae", 3],
  ["stella & chewy", 3],
  ["open farm", 3],
  ["fromm", 3],
  ["victor", 3],
  ["solid gold", 3],
]);
const DEMAND_EVENT_WEIGHTS = new Map([
  ["analysis_completed", 6],
  ["search_result_tapped", 4],
  ["analysis_failed", 2],
]);
const FATAL_ANALYZE_HTTP_STATUS = new Set([401, 403, 429, 503]);

const dryRun = process.argv.includes("--dry-run");
const allowRateLimited = process.argv.includes("--allow-rate-limited");
const force = process.argv.includes("--force");
const verbose = process.argv.includes("--verbose");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const concurrencyArg = process.argv.find((arg) => arg.startsWith("--concurrency="));
const delayArg = process.argv.find((arg) => arg.startsWith("--delay-ms="));
const inputArgs = process.argv.filter((arg) => arg.startsWith("--input="));
const sourceArg = process.argv.find((arg) => arg.startsWith("--source="));
const petTypeArg = process.argv.find((arg) => arg.startsWith("--pet-type="));
const maxFailuresArg = process.argv.find((arg) => arg.startsWith("--max-failures="));
const verifyDelayArg = process.argv.find((arg) => arg.startsWith("--verify-delay-ms="));
const reportArg = process.argv.find((arg) => arg.startsWith("--report="));
const exportEligibleArg = process.argv.find((arg) => arg.startsWith("--export-eligible="));
const demandDaysArg = process.argv.find((arg) => arg.startsWith("--demand-days="));
const demandInputArgs = process.argv.filter((arg) => arg.startsWith("--demand-input="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const concurrency = concurrencyArg ? Number(concurrencyArg.split("=")[1]) : 1;
const delayMs = delayArg ? Number(delayArg.split("=")[1]) : 1000;
const maxFailures = maxFailuresArg ? Number(maxFailuresArg.split("=")[1]) : 25;
const verifyDelayMs = verifyDelayArg ? Number(verifyDelayArg.split("=")[1]) : 1000;
const demandDays = demandDaysArg ? Number(demandDaysArg.split("=")[1]) : 90;
const verifyWrites = !process.argv.includes("--no-verify-writes");
const resumeReport = process.argv.includes("--resume-report");
const demandPriorityEnabled = !process.argv.includes("--no-demand-priority");
const reportPath = reportArg ? path.resolve(process.cwd(), reportArg.split("=")[1]) : null;
const exportEligiblePath = exportEligibleArg ? path.resolve(process.cwd(), exportEligibleArg.split("=")[1]) : null;
const inputOnly = process.argv.includes("--input-only");
const sourceFilter = sourceArg
  ? new Set(sourceArg.split("=")[1].split(",").map((value) => value.trim()).filter(Boolean))
  : null;
const petTypeFilter = petTypeArg ? petTypeArg.split("=")[1].trim() : null;

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  ANALYZE_SERVICE_KEY=... npm run precompute:analysis -- --limit=500
  npm run precompute:analysis -- --dry-run --limit=25

Options:
  --dry-run                 Count/select rows without calling analyze
  --limit=N                 Process at most N uncached product rows
  --concurrency=N           Parallel analyze workers, 1-${MAX_PRECOMPUTE_CONCURRENCY} (default 1)
  --delay-ms=N              Delay between analyze launches (default 1000)
  --max-failures=N          Stop after N failed/unverified writes (default 25)
  --verify-delay-ms=N       Delay between cache-write verification retries (default 1000)
  --input=a,b               Restrict to exported eligible targets or catalog backfill reports. May be repeated.
  --input-only              Process only --input targets instead of the full eligible queue
  --report=path.jsonl       Append per-row JSONL results for audit/resume
  --resume-report           Skip cache keys with prior verified_cached report entries
  --export-eligible=path.json Write the current uncached precompute queue for audit/batch planning
  --demand-days=N           Rank targets by hashed product demand from the last N days (default 90)
  --demand-input=a,b        Also rank targets by sanitized manifests/reports with cache keys. May be repeated.
  --no-demand-priority      Disable product_events demand ranking
  --source=a,b              Optional product_data.source allow-list
  --pet-type=dog|cat        Optional inferred pet type filter
  --force                   Re-score rows even when a fresh schema-valid cache entry exists
  --no-verify-writes        Skip per-row analysis_cache verification after analyze returns
  --allow-rate-limited      Allow anon-key analyze calls for tiny tests; service key is required by default
  --verbose                 Print skipped cache keys
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  }
  if (!dryRun && !ANALYZE_SERVICE_KEY && !allowRateLimited) {
    usage("Set ANALYZE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY for analysis cache precompute runs.");
  }
  if (limitArg && (!Number.isFinite(limit) || limit < 0)) {
    usage("--limit must be a non-negative number.");
  }
  if (
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > MAX_PRECOMPUTE_CONCURRENCY
  ) {
    usage(`--concurrency must be an integer between 1 and ${MAX_PRECOMPUTE_CONCURRENCY}.`);
  }
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    usage("--delay-ms must be a non-negative number.");
  }
  if (!Number.isFinite(maxFailures) || maxFailures < 0) {
    usage("--max-failures must be a non-negative number.");
  }
  if (!Number.isFinite(verifyDelayMs) || verifyDelayMs < 0) {
    usage("--verify-delay-ms must be a non-negative number.");
  }
  if (!Number.isFinite(demandDays) || demandDays < 0) {
    usage("--demand-days must be a non-negative number.");
  }
  if (petTypeFilter && !["dog", "cat"].includes(petTypeFilter)) {
    usage("--pet-type must be dog or cat.");
  }
  if (resumeReport && !reportPath) {
    usage("--resume-report requires --report=path.jsonl.");
  }
  if (inputOnly && inputArgs.length === 0) {
    usage("--input-only requires --input=path.json.");
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

function stableKeyHash(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36);
}

function loadVerifiedReportKeys() {
  const keys = new Set();
  if (!reportPath || !fs.existsSync(reportPath)) return keys;
  const lines = fs.readFileSync(reportPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry?.event === "precompute_result" && entry?.status === "verified_cached" && entry?.cache_key) {
        keys.add(entry.cache_key);
      }
    } catch {
      // Ignore partial/corrupt lines so interrupted appends do not break resume.
    }
  }
  return keys;
}

function parseJsonInputEntries(text, file) {
  const parsed = JSON.parse(text);
  const entries = Array.isArray(parsed) ? parsed : parsed?.targets;
  if (!Array.isArray(entries)) usage("--input JSON must be an array or an object with a targets array.");
  return entries;
}

function parseJsonlInputEntries(text, file) {
  const entries = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      usage(`--input JSONL has invalid JSON on line ${index + 1}: ${file}`);
    }
  }
  return entries;
}

function loadInputEntries(file) {
  const text = fs.readFileSync(file, "utf8");
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (/\.jsonl$/i.test(file)) return parseJsonlInputEntries(text, file);
  try {
    return parseJsonInputEntries(text, file);
  } catch (err) {
    if (trimmed.includes("\n")) return parseJsonlInputEntries(text, file);
    throw err;
  }
}

function inputEntryProductKey(entry) {
  return String(
    entry?.productCacheKey ||
    entry?.product_cache_key ||
    entry?.saved_cache_key ||
    entry?.target_cache_key ||
    entry?.cache_key ||
    entry?.cacheKey ||
    "",
  ).trim();
}

function inputEntryProductKeys(entry) {
  return [...new Set([
    entry?.productCacheKey,
    entry?.product_cache_key,
    entry?.saved_cache_key,
    entry?.cache_key,
    entry?.cacheKey,
    entry?.target_cache_key,
  ].map((value) => String(value || "").trim()).filter(Boolean))];
}

function inputEntryAnalysisKey(entry) {
  const event = String(entry?.event || "").trim();
  return String(
    entry?.analysisCacheKey ||
    entry?.analysis_cache_key ||
    (event !== "catalog_backfill_result" ? entry?.cache_key : "") ||
    "",
  ).trim();
}

function inputEntryIsTarget(entry) {
  const event = String(entry?.event || "").trim();
  if (!event) return true;
  if (event !== "catalog_backfill_result") return false;
  return entry?.status === "verified_saved" || entry?.status === "accepted";
}

function loadInputTargetKeys() {
  if (inputArgs.length === 0) return null;
  const inputFiles = inputArgs.flatMap((arg) => arg.split("=")[1].split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  if (inputFiles.length === 0) return null;
  const keys = new Set();
  const productKeys = new Set();
  let invalid = 0;
  let duplicate = 0;
  let skipped = 0;
  const inputs = [];
  for (const inputFile of inputFiles) {
    const file = path.resolve(process.cwd(), inputFile);
    const entries = loadInputEntries(file);
    const stat = { path: file, entries: entries.length, valid: 0, invalid: 0, duplicate: 0, skipped: 0 };
    for (const entry of entries) {
      if (!inputEntryIsTarget(entry)) {
        skipped++;
        stat.skipped++;
        continue;
      }
      const explicitKey = inputEntryAnalysisKey(entry);
      const productKey = inputEntryProductKey(entry);
      const petType = String(entry?.petType || entry?.pet_type || "").trim().toLowerCase();
      const petTypes = [
        petType,
        ...(Array.isArray(entry?.attempted_pet_types) ? entry.attempted_pet_types : []),
      ].map((value) => String(value || "").trim().toLowerCase())
        .filter((value) => value === "dog" || value === "cat");
      const derivedKey = productKey && (petType === "dog" || petType === "cat")
        ? analysisCacheKeyForPetType(productKey, petType)
        : "";
      const legacyKey = String(entry?.cache_key || "").trim();
      const candidateKeys = [...new Set([
        explicitKey,
        derivedKey,
        ...petTypes.map((type) => analysisCacheKeyForPetType(productKey, type)),
        /__(dog|cat)$/.test(legacyKey) ? legacyKey : "",
      ].filter(Boolean))];
      const expandableProductKeys = String(entry?.event || "").trim() === "catalog_backfill_result"
        ? inputEntryProductKeys(entry)
        : [];
      if (candidateKeys.length === 0 && expandableProductKeys.length === 0) {
        invalid++;
        stat.invalid++;
        continue;
      }
      let added = false;
      for (const key of candidateKeys) {
        if (keys.has(key)) continue;
        keys.add(key);
        added = true;
      }
      for (const key of expandableProductKeys) {
        if (productKeys.has(key)) continue;
        productKeys.add(key);
        added = true;
      }
      if (!added) {
        duplicate++;
        stat.duplicate++;
      }
      stat.valid++;
    }
    inputs.push(stat);
  }
  return { keys, productKeys, invalid, duplicate, skipped, inputs };
}

function demandInputEntryWeight(entry) {
  const explicitWeight = Number(entry?.demandWeight || entry?.demand_weight || entry?.weight);
  if (Number.isFinite(explicitWeight) && explicitWeight > 0) return Math.min(explicitWeight, 100);
  const event = String(entry?.event || "").trim();
  if (DEMAND_EVENT_WEIGHTS.has(event)) return DEMAND_EVENT_WEIGHTS.get(event);
  if (event === "precompute_result" && entry?.status === "verified_cached") return 6;
  if (event === "catalog_backfill_result" && (entry?.status === "verified_saved" || entry?.status === "accepted")) return 4;
  if (entry?.analysisPayload || entry?.overallScore || entry?.dateScanned || entry?.scanMode) return 5;
  return 1;
}

function demandInputEntryCacheKeys(entry) {
  const directKeys = [
    inputEntryAnalysisKey(entry),
    ...inputEntryProductKeys(entry),
    entry?.analysisCacheKey,
    entry?.analysis_cache_key,
    entry?.productCacheKey,
    entry?.product_cache_key,
    entry?.cacheKey,
    entry?.cache_key,
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const petTypes = [
    entry?.petType,
    entry?.pet_type,
    ...(Array.isArray(entry?.attempted_pet_types) ? entry.attempted_pet_types : []),
  ].map((value) => String(value || "").trim().toLowerCase())
    .filter((value) => value === "dog" || value === "cat");
  const productKeys = inputEntryProductKeys(entry);
  const speciesKeys = productKeys.flatMap((productKey) =>
    petTypes.map((petType) => analysisCacheKeyForPetType(productKey, petType))
  );
  const aliasKeys = [
    ...(Array.isArray(entry?.appVisibleAnalysisKeys) ? entry.appVisibleAnalysisKeys : []),
    ...(Array.isArray(entry?.app_visible_analysis_keys) ? entry.app_visible_analysis_keys : []),
    ...(Array.isArray(entry?.cacheAliases) ? entry.cacheAliases : []),
    ...(Array.isArray(entry?.cache_aliases) ? entry.cache_aliases : []),
  ].map((value) => String(value || "").trim()).filter(Boolean);
  return [...new Set([...directKeys, ...speciesKeys, ...aliasKeys].filter(Boolean))];
}

function loadDemandInputHashScores() {
  if (!demandPriorityEnabled || demandInputArgs.length === 0) {
    return { scores: new Map(), rows: 0, files: 0, invalid: 0 };
  }
  const inputFiles = demandInputArgs.flatMap((arg) => arg.split("=")[1].split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  const scores = new Map();
  let rows = 0;
  let invalid = 0;
  for (const inputFile of inputFiles) {
    const file = path.resolve(process.cwd(), inputFile);
    const entries = loadInputEntries(file);
    for (const entry of entries) {
      rows++;
      const keys = demandInputEntryCacheKeys(entry);
      if (keys.length === 0) {
        invalid++;
        continue;
      }
      const weight = demandInputEntryWeight(entry);
      for (const key of keys) {
        const hash = stableKeyHash(key);
        if (!hash) continue;
        scores.set(hash, (scores.get(hash) || 0) + weight);
      }
    }
  }
  return { scores, rows, files: inputFiles.length, invalid };
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

function summarizeRows(rows) {
  const bySource = new Map();
  const byPetType = new Map();
  for (const row of rows) {
    const source = row.source || "product_data";
    const petType = inferPrimaryPetType(row) || "ambiguous";
    bySource.set(source, (bySource.get(source) || 0) + 1);
    byPetType.set(petType, (byPetType.get(petType) || 0) + 1);
  }
  return {
    bySource: [...bySource.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source))
      .slice(0, 20),
    byPetType: [...byPetType.entries()]
      .map(([petType, count]) => ({ petType, count }))
      .sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
  };
}

function summarizeTargets(targets) {
  const byPetType = new Map();
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
  }
  return [...byPetType.entries()]
    .map(([petType, count]) => ({ petType, count }))
    .sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType));
}

function targetScope(target) {
  return inferPrimaryPetType(target.row) === target.petType
    ? "primary_pet_type"
    : "ambiguous_pet_type";
}

function summarizeTargetScopes(targets) {
  const byScope = new Map();
  for (const target of targets) {
    const scope = targetScope(target);
    byScope.set(scope, (byScope.get(scope) || 0) + 1);
  }
  return [...byScope.entries()]
    .map(([scope, count]) => ({ scope, count }))
    .sort((a, b) => b.count - a.count || a.scope.localeCompare(b.scope));
}

function appVisibleAnalysisKeys(target) {
  return [...new Set(
    analysisCacheBaseKeys(target.row)
      .map((baseKey) => analysisCacheKeyForPetType(baseKey, target.petType))
      .filter(Boolean)
  )];
}

function appVisibleCacheAliases(row, petType) {
  const primaryKey = analysisCacheKey(row, petType);
  return [...new Set(
    analysisCacheBaseKeys(row)
      .map((baseKey) => analysisCacheKeyForPetType(baseKey, petType))
      .filter((key) => key && key !== primaryKey)
  )].slice(0, 3);
}

function precomputeTarget(target) {
  const row = target.row;
  return {
    cacheKey: row.cache_key,
    analysisCacheKey: target.cacheKey,
    appVisibleAnalysisKeys: appVisibleAnalysisKeys(target),
    productName: row.product_name,
    brand: row.brand || "",
    petType: target.petType,
    targetScope: targetScope(target),
    source: row.source || "product_data",
    ingredientCount: cleanIngredients(row).length,
    hasPublishedNutrients: row.has_published_nutrients === true,
    imageUrl: row.image_url || "",
    recentDemandScore: demandScoreForTarget(target),
    priority: precomputePriority(target),
  };
}

function exportEligibleRows(targets, metadata) {
  if (!exportEligiblePath) return;
  fs.mkdirSync(path.dirname(exportEligiblePath), { recursive: true });
  fs.writeFileSync(
    exportEligiblePath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      ...metadata,
      summary: {
        ...summarizeRows(targets.map((target) => target.row)),
        byTargetPetType: summarizeTargets(targets),
        byTargetScope: summarizeTargetScopes(targets),
      },
      targets: targets.map(precomputeTarget),
    }, null, 2)}\n`,
    "utf8",
  );
}

async function fetchPaged(path, token = SUPABASE_ANON_KEY) {
  const rows = [];
  for (let from = 0; ; from += REST_PAGE_SIZE) {
    const response = await fetch(`${supabaseBase()}/rest/v1/${path}`, {
      headers: {
        ...restHeaders(token),
        Range: `${from}-${from + REST_PAGE_SIZE - 1}`,
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Supabase REST ${path} ${response.status}: ${await response.text()}`);
    }
    const page = await response.json();
    rows.push(...page);
    if (page.length < REST_PAGE_SIZE) break;
  }
  return rows;
}

async function getFreshAnalysisKeys() {
  const token = ANALYZE_SERVICE_KEY || SUPABASE_ANON_KEY;
  const now = encodeURIComponent(new Date().toISOString());
  const select = encodeURIComponent("cache_key,analysis,expires_at");
  const rows = await fetchPaged(
    `analysis_cache?select=${select}&expires_at=gt.${now}&order=cache_key.asc`,
    token,
  );
  const keys = new Set();
  const legacyPetTypesByKey = new Map();
  for (const row of rows) {
    if (!row.cache_key || !schemaValidAnalysis(row.analysis)) continue;
    keys.add(row.cache_key);
    if (!/__(dog|cat)$/.test(row.cache_key) && (row.analysis.petType === "dog" || row.analysis.petType === "cat")) {
      const petTypes = legacyPetTypesByKey.get(row.cache_key) || new Set();
      petTypes.add(row.analysis.petType);
      legacyPetTypesByKey.set(row.cache_key, petTypes);
    }
  }
  return {
    keys,
    legacyPetTypesByKey,
    verified: true,
    mode: ANALYZE_SERVICE_KEY ? "service_role_rest" : "app_visible_rest",
  };
}

async function getProductDemandHashScores() {
  if (!demandPriorityEnabled) {
    return { scores: new Map(), mode: "disabled", rows: 0 };
  }
  const localDemand = loadDemandInputHashScores();
  if (!ANALYZE_SERVICE_KEY) {
    return {
      scores: localDemand.scores,
      mode: localDemand.rows > 0 ? "local_demand_input" : "missing_service_key",
      rows: localDemand.rows,
      localRows: localDemand.rows,
      localFiles: localDemand.files,
      invalidLocalRows: localDemand.invalid,
    };
  }
  if (demandDays === 0) {
    return {
      scores: localDemand.scores,
      mode: localDemand.rows > 0 ? "local_demand_input" : "disabled_zero_days",
      rows: localDemand.rows,
      localRows: localDemand.rows,
      localFiles: localDemand.files,
      invalidLocalRows: localDemand.invalid,
    };
  }

  const scores = new Map(localDemand.scores);
  const since = encodeURIComponent(new Date(Date.now() - demandDays * 24 * 60 * 60 * 1000).toISOString());
  const select = encodeURIComponent("event_name,metadata");
  const eventNames = encodeURIComponent(`(${[...DEMAND_EVENT_WEIGHTS.keys()].join(",")})`);
  let fetched = 0;

  try {
    for (let from = 0; from < MAX_DEMAND_EVENT_ROWS; from += REST_PAGE_SIZE) {
      const response = await fetch(
        `${supabaseBase()}/rest/v1/product_events?select=${select}&created_at=gte.${since}&event_name=in.${eventNames}&order=created_at.desc`,
        {
          headers: {
            ...restHeaders(ANALYZE_SERVICE_KEY),
            Range: `${from}-${from + REST_PAGE_SIZE - 1}`,
          },
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!response.ok) {
        console.log(`[precompute] Demand priority unavailable: product_events ${response.status}`);
        return {
          scores,
          mode: localDemand.rows > 0 ? `local_demand_input_plus_unavailable_${response.status}` : `unavailable_${response.status}`,
          rows: fetched + localDemand.rows,
          serviceRows: fetched,
          localRows: localDemand.rows,
          localFiles: localDemand.files,
          invalidLocalRows: localDemand.invalid,
        };
      }
      const page = await response.json();
      fetched += page.length;
      for (const row of page) {
        const weight = DEMAND_EVENT_WEIGHTS.get(row.event_name) || 1;
        const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
        for (const rawHash of [metadata.analysisCacheKeyHash, metadata.cacheKeyHash]) {
          const hash = String(rawHash || "").trim();
          if (!hash) continue;
          scores.set(hash, (scores.get(hash) || 0) + weight);
        }
      }
      if (page.length < REST_PAGE_SIZE) break;
    }
  } catch (err) {
    console.log(`[precompute] Demand priority unavailable: ${err.message}`);
    return {
      scores,
      mode: localDemand.rows > 0 ? "local_demand_input_plus_unavailable_error" : "unavailable_error",
      rows: fetched + localDemand.rows,
      serviceRows: fetched,
      localRows: localDemand.rows,
      localFiles: localDemand.files,
      invalidLocalRows: localDemand.invalid,
    };
  }

  return {
    scores,
    mode: localDemand.rows > 0 ? "local_demand_input_plus_service_role_product_events" : "service_role_product_events",
    rows: fetched + localDemand.rows,
    serviceRows: fetched,
    localRows: localDemand.rows,
    localFiles: localDemand.files,
    invalidLocalRows: localDemand.invalid,
  };
}

function demandPriorityRowLabel(demand) {
  if (String(demand?.mode || "").includes("local_demand_input")) return "rows/events";
  return "events";
}

async function getCachedAnalysis(cacheKey) {
  if (!ANALYZE_SERVICE_KEY || !cacheKey) return null;
  const select = encodeURIComponent("cache_key,analysis,expires_at");
  const response = await fetch(
    `${supabaseBase()}/rest/v1/analysis_cache?select=${select}&cache_key=eq.${encodeURIComponent(cacheKey)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`,
    {
      headers: restHeaders(ANALYZE_SERVICE_KEY),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) {
    throw new Error(`analysis_cache verify ${response.status}: ${await response.text()}`);
  }
  const rows = await response.json();
  return rows[0] || null;
}

function postgrestQuotedValue(value) {
  return `"${String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function getCachedAnalysesByKeys(cacheKeys) {
  if (!ANALYZE_SERVICE_KEY) return new Map();
  const keys = [...new Set((cacheKeys || []).map((key) => String(key || "").trim()).filter(Boolean))];
  if (keys.length === 0) return new Map();
  const select = encodeURIComponent("cache_key,analysis,expires_at");
  const keyFilter = encodeURIComponent(`(${keys.map(postgrestQuotedValue).join(",")})`);
  const response = await fetch(
    `${supabaseBase()}/rest/v1/analysis_cache?select=${select}&cache_key=in.${keyFilter}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
    {
      headers: restHeaders(ANALYZE_SERVICE_KEY),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) {
    throw new Error(`analysis_cache batch verify ${response.status}: ${await response.text()}`);
  }
  const rows = await response.json();
  return new Map(rows.map((row) => [row.cache_key, row]));
}

async function verifyCacheWrite(cacheKey, cacheAliases = []) {
  if (!verifyWrites) return { verified: true, reason: "disabled" };
  if (!ANALYZE_SERVICE_KEY) return { verified: false, reason: "missing_service_key" };
  const aliasKeys = [...new Set((cacheAliases || []).map((key) => String(key || "").trim()).filter(Boolean))];
  const expectedKeys = [...new Set([cacheKey, ...aliasKeys].filter(Boolean))];
  let rows = new Map();
  for (let attempt = 1; attempt <= 5; attempt++) {
    rows = await getCachedAnalysesByKeys(expectedKeys);
    const primaryValid = schemaValidAnalysis(rows.get(cacheKey)?.analysis);
    const verifiedAliases = aliasKeys.filter((key) => schemaValidAnalysis(rows.get(key)?.analysis));
    if (primaryValid && verifiedAliases.length === aliasKeys.length) {
      return {
        verified: true,
        reason: "schema_valid",
        verifiedAliases: verifiedAliases.length,
        expectedAliases: aliasKeys.length,
      };
    }
    if (attempt < 5 && verifyDelayMs > 0) await delay(verifyDelayMs);
  }
  const primaryValid = schemaValidAnalysis(rows.get(cacheKey)?.analysis);
  const verifiedAliases = aliasKeys.filter((key) => schemaValidAnalysis(rows.get(key)?.analysis));
  return {
    verified: false,
    reason: primaryValid ? "missing_or_invalid_cache_alias" : "missing_or_invalid_cache_row",
    verifiedAliases: verifiedAliases.length,
    expectedAliases: aliasKeys.length,
  };
}

async function getProductRows() {
  const select = encodeURIComponent([
    "cache_key",
    "product_name",
    "brand",
    "ingredients",
    "ingredient_text",
    "ingredient_count",
    "nutritional_info",
    "nutrient_panel",
    "has_published_nutrients",
    "source",
    "source_url",
    "image_url",
    "expires_at",
  ].join(","));
  const now = encodeURIComponent(new Date().toISOString());
  return fetchPaged(
    `product_data?select=${select}&ingredient_count=gte.5&expires_at=gt.${now}&order=cache_key.asc`,
    SUPABASE_ANON_KEY,
  );
}

function normalizeCompleteFoodCatalogName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&amp;|&/g, " amp ")
    .replace(/&#x?[0-9a-f]+;/gi, " ")
    .replace(/[^\w]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyNonCompleteFoodCatalogRow(row) {
  const name = normalizeCompleteFoodCatalogName(row?.product_name);
  if (!name) return false;
  return (
    /^ingredients? (?:amp |and )?nutritional value$/.test(name) ||
    /^ingredients? guide(?: ingredients? guide)?\b/.test(name) ||
    /\b(?:dog|cat|pet) (?:food|treat) trends?\b/.test(name) ||
    (/\btrends?\b/.test(name) && /\bthe rise of\b/.test(name)) ||
    /\b(?:treats?|jerky|biscuits?|cookies?|chews?|sticks?|snacks?|toppers?|mixers?|broths?|purees?|supplements?|catnip|litter|lickables?|delectables)\b/.test(name) ||
    (/\bsamples?\b/.test(name) && /\b(?:pack|variety|bundle)\b/.test(name))
  );
}

function completeFoodRows(rows) {
  return rows.filter((row) => !isLikelyNonCompleteFoodCatalogRow(row));
}

function analysisCacheKey(row, petType) {
  const cacheKey = typeof row?.cache_key === "string" ? row.cache_key.trim() : "";
  return analysisCacheKeyForPetType(cacheKey, petType);
}

function cleanIngredients(row) {
  if (Array.isArray(row.ingredients)) {
    return row.ingredients
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return String(row.ingredient_text || "")
    .split(/[,;](?![^()]*\))/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sourceTrustLevel(source) {
  if (source === "brand" || source === "manufacturer") return "authoritative";
  if (source === "opff" || source === "openfoodfacts") return "community";
  if (source === "user_ocr") return "user_supplied";
  return "retailer";
}

function sourceLabel(source) {
  if (source === "brand" || source === "manufacturer") return "Brand published ingredient data";
  if (source === "opff" || source === "openfoodfacts") return "Open Food Facts ingredient data";
  if (source === "user_ocr") return "User OCR ingredient data";
  if (source === "manual") return "Manually curated ingredient data";
  return "Retailer ingredient data";
}

function precomputeSourcePriority(source) {
  return SOURCE_PRECOMPUTE_PRIORITY.has(source)
    ? SOURCE_PRECOMPUTE_PRIORITY.get(source)
    : 7;
}

function normalizeMarketBrandText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function precomputeMarketBrandPriority(row) {
  const brandText = normalizeMarketBrandText(row?.brand);
  const nameText = normalizeMarketBrandText(row?.product_name);
  const combined = `${brandText} ${nameText}`.trim();
  if (!combined) return 99;
  for (const [brand, rank] of MARKET_BRAND_PRECOMPUTE_PRIORITY.entries()) {
    const normalizedBrand = normalizeMarketBrandText(brand);
    if (combined === normalizedBrand || combined.startsWith(`${normalizedBrand} `) || combined.includes(` ${normalizedBrand} `)) {
      return rank;
    }
  }
  return 99;
}

function precomputePriority(target) {
  const row = target.row;
  return {
    demandScore: demandScoreForTarget(target),
    marketBrandRank: precomputeMarketBrandPriority(row),
    sourceRank: precomputeSourcePriority(row.source || "product_data"),
    hasPublishedNutrients: row.has_published_nutrients === true,
    hasImage: Boolean(row.image_url),
    ingredientCount: cleanIngredients(row).length,
    primaryPetTypeMatch: inferPrimaryPetType(row) === target.petType,
  };
}

let productDemandHashScores = new Map();

function demandScoreForTarget(target) {
  if (!target) return 0;
  const analysisHash = stableKeyHash(target.cacheKey);
  const productHash = stableKeyHash(target.row?.cache_key);
  return (productDemandHashScores.get(analysisHash) || 0) + (productDemandHashScores.get(productHash) || 0);
}

function comparePrecomputeTargets(a, b) {
  const priorityA = precomputePriority(a);
  const priorityB = precomputePriority(b);
  return (
    priorityB.demandScore - priorityA.demandScore ||
    priorityA.marketBrandRank - priorityB.marketBrandRank ||
    priorityA.sourceRank - priorityB.sourceRank ||
    Number(priorityB.hasPublishedNutrients) - Number(priorityA.hasPublishedNutrients) ||
    Number(priorityB.hasImage) - Number(priorityA.hasImage) ||
    priorityB.ingredientCount - priorityA.ingredientCount ||
    Number(priorityB.primaryPetTypeMatch) - Number(priorityA.primaryPetTypeMatch) ||
    String(a.row.product_name || "").localeCompare(String(b.row.product_name || "")) ||
    String(a.petType || "").localeCompare(String(b.petType || "")) ||
    String(a.cacheKey || "").localeCompare(String(b.cacheKey || ""))
  );
}

function prioritizePrecomputeTargets(targets) {
  return [...targets].sort(comparePrecomputeTargets);
}

function toAnalyzePayload(row, petType) {
  const ingredients = cleanIngredients(row);
  const ingredientText = row.ingredient_text || ingredients.join(", ");
  const cacheAliases = appVisibleCacheAliases(row, petType);
  return {
    mode: "verified",
    stream: false,
    cacheKey: analysisCacheKey(row, petType),
    lookupType: "name",
    ...(cacheAliases.length > 0 ? { cacheAliases } : {}),
    serverQuotaAccounting: false,
    opffProduct: {
      productName: row.product_name,
      brand: row.brand || "",
      petType,
      ingredientsText: ingredientText,
      ingredients,
      nutriments: row.nutritional_info || {},
      nutrientPanel: row.nutrient_panel || null,
      hasPublishedNutrients: row.has_published_nutrients === true,
      source: row.source || "product_data",
      sourceTrustLevel: sourceTrustLevel(row.source),
      sourceLabel: sourceLabel(row.source),
      sourceUrl: row.source_url || "",
      imageUrl: row.image_url || "",
    },
  };
}

function targetHasFreshAnalysis(row, petType, cacheKey, freshCache) {
  if (freshCache.keys.has(cacheKey)) return true;
  return analysisCacheBaseKeys(row).some((baseKey) => (
    freshCache.keys.has(analysisCacheKeyForPetType(baseKey, petType)) ||
    freshCache.legacyPetTypesByKey?.get(baseKey)?.has(petType)
  ));
}

function selectableTargets(row, freshCache, options = {}) {
  const ingredients = cleanIngredients(row);
  if (!row.cache_key || !row.product_name || ingredients.length < 5) return [];
  if (sourceFilter && !sourceFilter.has(row.source || "")) return [];

  const targets = [];
  for (const petType of inferPetTypes(row, { includeAmbiguous: true })) {
    if (petTypeFilter && petType !== petTypeFilter) continue;
    const cacheKey = analysisCacheKey(row, petType);
    if (!cacheKey) continue;
    if (!options.includeCached && !force && targetHasFreshAnalysis(row, petType, cacheKey, freshCache)) {
      if (verbose) console.log("[skip cached]", cacheKey);
      continue;
    }
    targets.push({ row, petType, cacheKey });
  }
  return targets;
}

function inputTargetMatchSummary(rows, inputTargets) {
  if (!inputTargets) return null;
  const matchedKeys = new Set();
  const matchedProductKeys = new Set();
  for (const row of rows) {
    for (const target of selectableTargets(row, { keys: new Set(), legacyPetTypesByKey: new Map() }, { includeCached: true })) {
      if (inputTargets.keys.has(target.cacheKey)) matchedKeys.add(target.cacheKey);
      if (inputTargets.productKeys.has(target.row.cache_key)) {
        matchedKeys.add(target.cacheKey);
        matchedProductKeys.add(target.row.cache_key);
      }
    }
  }
  return {
    keys: inputTargets.keys.size,
    productKeys: inputTargets.productKeys.size,
    invalid: inputTargets.invalid,
    skipped: inputTargets.skipped,
    matched: matchedKeys.size,
    matchedProductKeys: matchedProductKeys.size,
    stale: Math.max(0, inputTargets.keys.size + inputTargets.productKeys.size - matchedKeys.size - matchedProductKeys.size),
    inputOnly,
  };
}

function inputTargetAllows(target, inputTargets) {
  if (!inputTargets) return true;
  return inputTargets.keys.has(target.cacheKey) || inputTargets.productKeys.has(target.row.cache_key);
}

async function analyzeRow(target) {
  const token = ANALYZE_SERVICE_KEY || SUPABASE_ANON_KEY;
  const response = await fetch(`${supabaseBase()}/functions/v1/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...restHeaders(token),
    },
    body: JSON.stringify(toAnalyzePayload(target.row, target.petType)),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  return { status: response.status, ok: response.ok, data };
}

function fatalAnalyzeFailureReason(result) {
  if (result?.ok) return "";
  const message = String(
    result?.data?.error ||
    result?.data?.message ||
    result?.data?.reason ||
    ""
  ).toLowerCase();
  if (result?.status === 401) return "analyze_auth";
  if (result?.status === 403 && /quota|free scan|service key|forbidden|unauthorized|entitlement/.test(message)) {
    return "analyze_quota_or_auth";
  }
  if (result?.status === 429 || /rate.?limit|too many requests/.test(message)) {
    return "analyze_rate_limited";
  }
  if (result?.status === 503 || /temporarily unavailable|not configured|service unavailable/.test(message)) {
    return "analyze_unavailable";
  }
  if (FATAL_ANALYZE_HTTP_STATUS.has(result?.status)) return `analyze_http_${result.status}`;
  return "";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processSelectedRows(selected) {
  let verifiedCached = 0;
  let accepted = 0;
  let unverified = 0;
  let failed = 0;
  let cursor = 0;
  let stopRequested = false;
  let nextLaunchAt = Date.now();

  async function waitForLaunchSlot() {
    if (delayMs <= 0) return;
    const now = Date.now();
    const launchAt = Math.max(nextLaunchAt, now);
    const waitMs = launchAt - now;
    nextLaunchAt = launchAt + delayMs;
    if (waitMs > 0) await delay(waitMs);
  }

  async function processOne(target, index) {
    const { row, petType, cacheKey } = target;
    const cacheAliases = appVisibleCacheAliases(row, petType);
    const label = `[${index + 1}/${selected.length}] ${petType} ${row.product_name.slice(0, 90)} ...`;
    try {
      const result = await analyzeRow(target);
      if (result.ok) {
        const verification = await verifyCacheWrite(cacheKey, cacheAliases);
        if (verification.verified && verification.reason === "schema_valid") {
          verifiedCached += 1;
          console.log(`${label} verified cached`);
          appendReport({
            event: "precompute_result",
            status: "verified_cached",
            cache_key: cacheKey,
            product_cache_key: row.cache_key,
            cache_aliases: cacheAliases,
            source: row.source || "product_data",
            pet_type: petType,
            ingredient_count: cleanIngredients(row).length,
            http_status: result.status,
            verification_reason: verification.reason,
            verified_aliases: verification.verifiedAliases || 0,
            expected_aliases: verification.expectedAliases || 0,
          });
        } else if (verification.verified) {
          accepted += 1;
          console.log(`${label} accepted (${verification.reason})`);
          appendReport({
            event: "precompute_result",
            status: "accepted",
            cache_key: cacheKey,
            product_cache_key: row.cache_key,
            cache_aliases: cacheAliases,
            source: row.source || "product_data",
            pet_type: petType,
            ingredient_count: cleanIngredients(row).length,
            http_status: result.status,
            verification_reason: verification.reason,
            verified_aliases: verification.verifiedAliases || 0,
            expected_aliases: verification.expectedAliases || 0,
          });
        } else {
          unverified += 1;
          console.log(`${label} unverified ${verification.reason}`);
          appendReport({
            event: "precompute_result",
            status: "unverified",
            cache_key: cacheKey,
            product_cache_key: row.cache_key,
            cache_aliases: cacheAliases,
            source: row.source || "product_data",
            pet_type: petType,
            ingredient_count: cleanIngredients(row).length,
            http_status: result.status,
            verification_reason: verification.reason,
            verified_aliases: verification.verifiedAliases || 0,
            expected_aliases: verification.expectedAliases || 0,
          });
        }
      } else {
        failed += 1;
        const fatalReason = fatalAnalyzeFailureReason(result);
        console.log(`${label} ${fatalReason ? `fatal ${fatalReason}` : "failed"} ${result.status}: ${JSON.stringify(result.data).slice(0, 220)}`);
        appendReport({
          event: "precompute_result",
          status: fatalReason ? "fatal_failed" : "failed",
          cache_key: cacheKey,
          product_cache_key: row.cache_key,
          cache_aliases: cacheAliases,
          source: row.source || "product_data",
          pet_type: petType,
          ingredient_count: cleanIngredients(row).length,
          http_status: result.status,
          fatal_reason: fatalReason || undefined,
          error: result.data?.error || result.data?.message || result.data?.reason || "unknown",
        });
        if (fatalReason) {
          stopRequested = true;
        }
      }
    } catch (err) {
      failed += 1;
      console.log(`${label} error: ${err.message}`);
      appendReport({
        event: "precompute_result",
        status: "error",
        cache_key: cacheKey,
        product_cache_key: row.cache_key,
        cache_aliases: cacheAliases,
        source: row.source || "product_data",
        pet_type: petType,
        ingredient_count: cleanIngredients(row).length,
        error: err.message,
      });
    }

    if (maxFailures > 0 && failed + unverified >= maxFailures) {
      stopRequested = true;
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

  if (stopRequested) {
    console.log(`Stopping early: failed/unverified count reached --max-failures=${maxFailures}`);
  }

  return { verifiedCached, accepted, unverified, failed };
}

async function main() {
  assertConfig();

  const rows = await getProductRows();
  const filteredRows = completeFoodRows(rows);
  const excludedNonCompleteFoodRows = rows.length - filteredRows.length;
  const freshCache = force
    ? { keys: new Set(), verified: Boolean(ANALYZE_SERVICE_KEY) }
    : await getFreshAnalysisKeys();
  const demand = await getProductDemandHashScores();
  productDemandHashScores = demand.scores;
  const freshCacheKeys = freshCache.keys;
  const reportVerifiedKeys = resumeReport ? loadVerifiedReportKeys() : new Set();
  const inputTargets = loadInputTargetKeys();
  const inputMatchSummary = inputTargetMatchSummary(filteredRows, inputTargets);
  const eligible = prioritizePrecomputeTargets(filteredRows.flatMap((row) =>
    selectableTargets(row, freshCache).filter((target) => {
      if (!inputTargetAllows(target, inputTargets)) {
        if (verbose && inputOnly) console.log("[skip not-input]", target.cacheKey);
        return false;
      }
      if (reportVerifiedKeys.has(target.cacheKey)) {
        if (verbose) console.log("[skip report-verified]", target.cacheKey);
        return false;
      }
      return true;
    })
  ));
  const selected = limit > 0 ? eligible.slice(0, limit) : eligible;

  console.log(`Analysis-ready product rows: ${rows.length}`);
  console.log(`Complete-food product rows: ${filteredRows.length}`);
  console.log(`Excluded non-complete-food rows: ${excludedNonCompleteFoodRows}`);
  console.log(`Fresh schema-valid analysis cache rows: ${freshCache.verified ? `${freshCacheKeys.size} (${freshCache.mode || "rest"})` : "unverified"}`);
  console.log(`Demand priority: ${demand.mode}${demand.rows ? ` (${demand.rows} ${demandPriorityRowLabel(demand)}, ${demand.scores.size} hashes)` : ""}`);
  console.log(`Report-verified resume skips: ${reportVerifiedKeys.size}`);
  console.log(`Input target filter: ${inputTargets ? `${inputTargets.keys.size} analysis keys, ${inputTargets.productKeys.size} product keys (${inputTargets.invalid} invalid, ${inputTargets.skipped} skipped, ${inputTargets.duplicate} duplicate, ${inputTargets.inputs.length} files)` : "disabled"}`);
  if (inputMatchSummary) {
    console.log(`Input target current-catalog matches: ${inputMatchSummary.matched} analysis targets, ${inputMatchSummary.matchedProductKeys} product keys, ${inputMatchSummary.stale} stale/missing`);
  }
  console.log(`Eligible species targets for precompute: ${eligible.length}`);
  console.log(`Selected species targets this run: ${selected.length}`);
  console.log(`Mode: ${dryRun ? "dry-run" : ANALYZE_SERVICE_KEY ? "service-role analyze" : "rate-limited anon analyze"}`);
  console.log(`Concurrency: ${dryRun ? 0 : concurrency}`);
  console.log(`Write verification: ${verifyWrites ? ANALYZE_SERVICE_KEY ? "enabled" : "unavailable without service key" : "disabled"}`);
  console.log(`Report: ${reportPath ? reportPath : "disabled"}`);
  console.log(`Eligible export: ${exportEligiblePath ? exportEligiblePath : "disabled"}`);
  console.log(`Selection priority: ${PRECOMPUTE_PRIORITY_DESCRIPTION}`);
  const eligibleSummary = summarizeRows(eligible.map((target) => target.row));
  console.log(`Eligible by pet type: ${eligibleSummary.byPetType.map((entry) => `${entry.petType}=${entry.count}`).join(", ") || "none"}`);
  console.log(`Eligible target pet types: ${summarizeTargets(eligible).map((entry) => `${entry.petType}=${entry.count}`).join(", ") || "none"}`);
  console.log(`Eligible target scope: ${summarizeTargetScopes(eligible).map((entry) => `${entry.scope}=${entry.count}`).join(", ") || "none"}`);
  console.log(`Top eligible sources: ${eligibleSummary.bySource.slice(0, 5).map((entry) => `${entry.source}=${entry.count}`).join(", ") || "none"}`);

  exportEligibleRows(eligible, {
    sourceAnalysisReadyRows: rows.length,
    analysisReadyRows: filteredRows.length,
    excludedNonCompleteFoodRows,
    freshCacheVerified: freshCache.verified,
    freshCacheMode: freshCache.mode || null,
    freshCacheRows: freshCacheKeys.size,
    demandPriority: {
      enabled: demandPriorityEnabled,
      mode: demand.mode,
      days: demandDays,
      eventRows: demand.rows,
      hashCount: demand.scores.size,
    },
    reportVerifiedSkips: reportVerifiedKeys.size,
    inputTargetFilter: inputTargets ? {
      keys: inputTargets.keys.size,
      productKeys: inputTargets.productKeys.size,
      invalid: inputTargets.invalid,
      skipped: inputTargets.skipped,
      duplicate: inputTargets.duplicate,
      inputs: inputTargets.inputs,
      matched: inputMatchSummary.matched,
      matchedProductKeys: inputMatchSummary.matchedProductKeys,
      stale: inputMatchSummary.stale,
      inputOnly,
    } : null,
    eligibleCount: eligible.length,
    selectedCount: selected.length,
    dryRun,
    force,
    sourceFilter: sourceFilter ? [...sourceFilter] : null,
    petTypeFilter: petTypeFilter || null,
    selectionPriority: PRECOMPUTE_PRIORITY_DESCRIPTION,
  });

  if (!dryRun && inputOnly && inputMatchSummary && inputMatchSummary.matched === 0) {
    console.error("No valid --input-only targets match the current product catalog. Refresh the precompute manifest before running a write batch.");
    process.exit(1);
  }
  if (dryRun || selected.length === 0) return;

  appendReport({
    event: "precompute_start",
    selected: selected.length,
    eligible: eligible.length,
    fresh_cache_verified: freshCache.verified,
    fresh_cache_mode: freshCache.mode || null,
    fresh_cache_rows: freshCacheKeys.size,
    demand_priority: {
      enabled: demandPriorityEnabled,
      mode: demand.mode,
      days: demandDays,
      event_rows: demand.rows,
      hash_count: demand.scores.size,
    },
    resume_report: resumeReport,
    report_verified_skips: reportVerifiedKeys.size,
    input_target_filter: inputTargets ? {
      keys: inputTargets.keys.size,
      product_keys: inputTargets.productKeys.size,
      invalid: inputTargets.invalid,
      skipped: inputTargets.skipped,
      duplicate: inputTargets.duplicate,
      inputs: inputTargets.inputs,
      matched: inputMatchSummary.matched,
      matched_product_keys: inputMatchSummary.matchedProductKeys,
      stale: inputMatchSummary.stale,
      input_only: inputOnly,
    } : null,
    selection_priority: PRECOMPUTE_PRIORITY_DESCRIPTION,
    concurrency,
    delay_ms: delayMs,
  });

  const { verifiedCached, accepted, unverified, failed } = await processSelectedRows(selected);

  console.log(`Done. Verified cached: ${verifiedCached}, accepted: ${accepted}, unverified: ${unverified}, failed: ${failed}`);
  appendReport({
    event: "precompute_done",
    verified_cached: verifiedCached,
    accepted,
    unverified,
    failed,
    concurrency,
  });
  if (failed > 0 || unverified > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Analysis precompute failed:", err.message);
  process.exit(1);
});
