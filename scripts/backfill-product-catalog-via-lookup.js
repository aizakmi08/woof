#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const PRODUCT_LOOKUP_SERVICE_KEY =
  process.env.PRODUCT_LOOKUP_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";
const MAX_BACKFILL_CONCURRENCY = 8;
const BACKFILL_PRIORITY_DESCRIPTION = "source_quality,ingredient_source,species_specificity,brand_confidence,name_specificity,name";
const SOURCE_BACKFILL_PRIORITY = [
  ["scripts/seed-accurate.js", 0],
  ["scripts/save-verified.js", 0],
  ["scripts/prepopulate-products.js", 1],
  ["scripts/mega-scraper/openfarm-complete.js", 1],
  ["scripts/mega-scraper/save-openfarm.js", 1],
  ["scripts/build-database.js", 2],
  ["scripts/fill-gaps.js", 2],
  ["scripts/seed-universal.js", 3],
  ["scripts/mega-scraper", 4],
];
const FATAL_PRODUCT_LOOKUP_HTTP_STATUS = new Set([401, 403, 429, 503]);

const dryRun = process.argv.includes("--dry-run");
const allowRateLimited = process.argv.includes("--allow-rate-limited");
const verbose = process.argv.includes("--verbose");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const concurrencyArg = process.argv.find((arg) => arg.startsWith("--concurrency="));
const inputArg = process.argv.find((arg) => arg.startsWith("--input="));
const delayArg = process.argv.find((arg) => arg.startsWith("--delay-ms="));
const maxFailuresArg = process.argv.find((arg) => arg.startsWith("--max-failures="));
const reportArg = process.argv.find((arg) => arg.startsWith("--report="));
const exportMissingArg = process.argv.find((arg) => arg.startsWith("--export-missing="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const concurrency = concurrencyArg ? Number(concurrencyArg.split("=")[1]) : 1;
const delayMs = delayArg ? Number(delayArg.split("=")[1]) : 1500;
const maxFailures = maxFailuresArg ? Number(maxFailuresArg.split("=")[1]) : 25;
const reportPath = reportArg ? path.resolve(root, reportArg.split("=")[1]) : null;
const exportMissingPath = exportMissingArg ? path.resolve(root, exportMissingArg.split("=")[1]) : null;
const resumeReport = process.argv.includes("--resume-report");
const verifyWrites = !process.argv.includes("--no-verify-writes");
const inputOnly = process.argv.includes("--input-only");
let inputTargetStats = null;

const BRAND_HINTS = [
  "Blue Buffalo", "Purina Pro Plan", "Purina ONE", "Purina Dog Chow",
  "Purina Cat Chow", "Purina Beneful", "Purina Beggin", "Purina Busy",
  "Purina Beyond", "Purina", "Taste of the Wild", "Orijen", "Acana",
  "Hill's Science Diet", "Hills Science Diet", "Royal Canin", "Iams",
  "Kirkland Signature", "Diamond Naturals", "Diamond", "Victor",
  "Rachael Ray Nutrish", "Rachael Ray", "Merrick", "Nutro", "Canidae",
  "Wellness CORE", "Wellness", "Fromm", "Instinct", "The Honest Kitchen",
  "Open Farm", "Pedigree", "Ol Roy", "Kibbles n Bits", "Beneful",
  "Gravy Train", "Cesar", "Meow Mix", "Friskies", "9 Lives",
  "Kit and Kaboodle", "Kit & Kaboodle", "Fancy Feast", "Sheba",
  "Tiki Cat", "Greenies", "Milk Bone", "Milk-Bone", "Zuke's", "Zuke",
  "Temptations", "Crave", "Wag", "Natural Balance", "Whole Earth Farms",
  "American Journey", "Nulo", "Stella & Chewy's", "Stella and Chewy",
  "The Farmer's Dog", "Farmers Dog", "Ollie", "Just Food For Dogs",
  "Spot & Tango", "Spot and Tango", "Old Mother Hubbard", "Delectables",
  "Inaba", "Whiskas", "Authority", "Simply Nourish", "WholeHearted",
  "Earthborn Holistic", "Solid Gold", "Halo", "Castor & Pollux",
  "Nature's Recipe", "Farmina", "Weruva", "Ziwi Peak", "Eukanuba",
  "Bil-Jac", "SportMix", "4Health", "Pure Balance",
];

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  PRODUCT_LOOKUP_SERVICE_KEY=... npm run backfill:catalog -- --limit=200
  npm run backfill:catalog -- --dry-run

Options:
  --dry-run                 Print candidate counts without calling product-lookup
  --limit=N                 Process at most N missing candidates
  --concurrency=N           Parallel product-lookup workers, 1-${MAX_BACKFILL_CONCURRENCY} (default 1)
  --delay-ms=N              Delay between product-lookup launches (default 1500)
  --max-failures=N          Stop after N failed/unverified writes (default 25)
  --input=path/to/file.json Add extra targets: [{ "name": "...", "brand": "...", "petType": "dog" }]
  --input-only              Process only --input targets instead of merging them with built-in curated sources
  --report=path.jsonl       Append per-target JSONL results for audit/resume
  --resume-report           Skip targets with prior verified_saved report entries
  --export-missing=path.json Write the current missing target queue for audit/batch planning
  --no-verify-writes        Skip product_data readback verification after product-lookup returns
  --allow-rate-limited      Allow anon-key backfill for tiny tests; service key is required by default
  --verbose                 Print skipped existing keys
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  }
  if (!dryRun && !PRODUCT_LOOKUP_SERVICE_KEY && !allowRateLimited) {
    usage("Set PRODUCT_LOOKUP_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY for unthrottled catalog backfills.");
  }
  if (limitArg && (!Number.isFinite(limit) || limit < 0)) {
    usage("--limit must be a non-negative number.");
  }
  if (
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > MAX_BACKFILL_CONCURRENCY
  ) {
    usage(`--concurrency must be an integer between 1 and ${MAX_BACKFILL_CONCURRENCY}.`);
  }
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    usage("--delay-ms must be a non-negative number.");
  }
  if (!Number.isFinite(maxFailures) || maxFailures < 0) {
    usage("--max-failures must be a non-negative number.");
  }
  if (resumeReport && !reportPath) {
    usage("--resume-report requires --report=path.jsonl.");
  }
  if (inputOnly && !inputArg) {
    usage("--input-only requires --input=path.json.");
  }
}

function normalizeCacheKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/\b(dog food|cat food|formula|recipe)\b/gi, "")
    .replace(/[-/&]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBarcode(value) {
  const barcode = String(value || "").trim().replace(/[\s-]/g, "");
  return /^[a-z0-9]{6,40}$/i.test(barcode) ? barcode : "";
}

function productLookupRequestCacheKey(target) {
  return normalizeCacheKey(target.brand ? `${target.brand} ${target.name}` : target.name);
}

function collectVerificationCacheKeys(target, lookupData = null) {
  return [
    target.cacheKey,
    productLookupRequestCacheKey(target),
    lookupData?.cacheKey,
    lookupData?.cache_key,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
}

function inferBrand(name) {
  const lower = String(name || "").toLowerCase();
  return BRAND_HINTS.find((brand) => lower.startsWith(brand.toLowerCase())) ||
    String(name || "").split(/\s+/).slice(0, 2).join(" ");
}

function normalizeExplicitPetTypes(target) {
  const rawValues = Array.isArray(target.petTypes)
    ? target.petTypes
    : [target.petType, target.pet_type, target.pet, target.species];
  const normalized = [];
  for (const raw of rawValues) {
    const value = String(raw || "").trim().toLowerCase();
    if (value === "dog" || value === "cat") normalized.push(value);
  }
  return [...new Set(normalized)];
}

function cleanTarget(target, source) {
  const name = String(target.name || target.productName || "").trim();
  if (!name || name.length < 3 || name.length > 220) return null;
  const brand = String(target.brand || inferBrand(name)).trim();
  const fullName = brand && !name.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${name}` : name;
  const cacheKey = normalizeCacheKey(fullName);
  if (!cacheKey) return null;
  const explicitPetTypes = normalizeExplicitPetTypes(target);
  const petTypes = explicitPetTypes.length > 0 ? explicitPetTypes : inferPetTypes({
    product_name: name,
    brand,
    cache_key: cacheKey,
    source,
    petType: target.petType || target.pet,
    pet_type: target.pet_type || target.species,
  }, { includeAmbiguous: true });
  if (petTypes.length === 0) return null;
  const targetSource = String(target.source || source || "").trim() || source;
  return {
    name,
    brand,
    petType: petTypes[0],
    petTypes,
    explicitPetType: explicitPetTypes.length > 0,
    cacheKey,
    source: targetSource,
    barcode: normalizeBarcode(target.barcode || target.code || target.upc || target.ean),
    sourceUrl: String(target.sourceUrl || target.source_url || "").trim(),
    sourceQuality: String(target.sourceQuality || target.source_quality || "").trim(),
    searchTerms: [...new Set([name, fullName].filter(Boolean))],
  };
}

function parseObjectTargets(sourceText, source) {
  const targets = [];
  const objectPattern = /\{[^{}]*(?:name|productName):\s*["'][^"']+["'][^{}]*\}/g;
  for (const match of sourceText.matchAll(objectPattern)) {
    const block = match[0];
    const name = block.match(/\b(?:name|productName):\s*["']([^"']+)["']/)?.[1];
    const brand = block.match(/\bbrand:\s*["']([^"']+)["']/)?.[1];
    const petType = block.match(/\b(?:petType|pet_type|pet|species):\s*["']([^"']+)["']/)?.[1];
    if (!name || !brand) continue;
    const target = cleanTarget({ name, brand, petType }, source);
    if (target) targets.push(target);
  }
  return targets;
}

function parseStringTargets(sourceText, source) {
  const targets = [];
  const productsStart = sourceText.search(/const\s+(?:PRODUCTS|ALL_PRODUCTS|FIX)\s*=\s*\[/);
  if (productsStart === -1) return targets;
  const productsEnd = sourceText.indexOf("];", productsStart);
  if (productsEnd === -1) return targets;
  const block = sourceText.slice(productsStart, productsEnd);
  if (/\{\s*(?:name|productName|brand)\s*:/.test(block)) return targets;
  for (const match of block.matchAll(/["']([^"'\n]{8,220})["']/g)) {
    const target = cleanTarget({ name: match[1] }, source);
    if (target) targets.push(target);
  }
  return targets;
}

function loadExtraTargets() {
  if (!inputArg) {
    inputTargetStats = null;
    return [];
  }
  const file = path.resolve(root, inputArg.split("=")[1]);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const entries = Array.isArray(data) ? data : data?.targets;
  if (!Array.isArray(entries)) usage("--input JSON must be an array or an object with a targets array.");
  const byKey = new Map();
  let invalid = 0;
  let duplicate = 0;
  for (const entry of entries) {
    const target = cleanTarget(entry, path.relative(root, file));
    if (!target) {
      invalid++;
      continue;
    }
    if (byKey.has(target.cacheKey)) {
      duplicate++;
      continue;
    }
    byKey.set(target.cacheKey, target);
  }
  inputTargetStats = {
    path: file,
    entries: entries.length,
    valid: byKey.size,
    invalid,
    duplicate,
    inputOnly,
  };
  return [...byKey.values()];
}

function loadTargetSourceFiles() {
  const sourceSet = new Set([
    "scripts/prepopulate-products.js",
    "scripts/build-database.js",
    "scripts/fill-gaps.js",
    "scripts/save-verified.js",
    "scripts/seed-accurate.js",
    "scripts/seed-products.js",
    "scripts/seed-universal.js",
  ]);
  const megaDir = path.join(root, "scripts/mega-scraper");
  if (fs.existsSync(megaDir)) {
    for (const name of fs.readdirSync(megaDir)) {
      if (name.endsWith(".js")) sourceSet.add(path.join("scripts/mega-scraper", name));
    }
  }
  return [...sourceSet].sort();
}

function loadTargets() {
  if (inputOnly) return loadExtraTargets();
  const sources = loadTargetSourceFiles();
  const byKey = new Map();
  for (const relative of sources) {
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    const parsed = [
      ...parseObjectTargets(text, relative),
      ...parseStringTargets(text, relative),
    ];
    for (const target of parsed) {
      if (!byKey.has(target.cacheKey)) byKey.set(target.cacheKey, target);
    }
  }
  for (const target of loadExtraTargets()) {
    if (!byKey.has(target.cacheKey)) byKey.set(target.cacheKey, target);
  }
  return [...byKey.values()];
}

function loadVerifiedReportKeys() {
  const keys = new Set();
  if (!reportPath || !fs.existsSync(reportPath)) return keys;
  const lines = fs.readFileSync(reportPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry?.event === "catalog_backfill_result" && entry?.status === "verified_saved" && entry?.cache_key) {
        keys.add(entry.cache_key);
      }
      if (entry?.event === "catalog_backfill_result" && entry?.status === "verified_saved" && entry?.target_cache_key) {
        keys.add(entry.target_cache_key);
      }
      if (entry?.event === "catalog_backfill_result" && entry?.status === "verified_saved" && entry?.saved_cache_key) {
        keys.add(entry.saved_cache_key);
      }
    } catch {
      // Ignore partial/corrupt lines from interrupted appends.
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
  const bySource = new Map();
  const byPetType = new Map();
  const byTargetPetType = new Map();
  for (const target of targets) {
    bySource.set(target.source, (bySource.get(target.source) || 0) + 1);
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
    for (const petType of target.petTypes || [target.petType]) {
      byTargetPetType.set(petType, (byTargetPetType.get(petType) || 0) + 1);
    }
  }
  return {
    bySource: [...bySource.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source))
      .slice(0, 20),
    byPetType: [...byPetType.entries()]
      .map(([petType, count]) => ({ petType, count }))
      .sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
    byTargetPetType: [...byTargetPetType.entries()]
      .map(([petType, count]) => ({ petType, count }))
      .sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
  };
}

function backfillSourcePriority(source) {
  const value = String(source || "");
  const match = SOURCE_BACKFILL_PRIORITY.find(([prefix]) => value.startsWith(prefix));
  return match ? match[1] : 5;
}

function targetNameSpecificity(target) {
  const text = `${target.brand || ""} ${target.name || ""}`.toLowerCase();
  let score = 0;
  if (/\b(dry|wet|kibble|pate|paté|stew|broth|gravy|treat|chew|freeze[-\s]?dried|rawmix)\b/.test(text)) score += 2;
  if (/\b(chicken|beef|turkey|salmon|lamb|duck|tuna|whitefish|pork|venison|rabbit)\b/.test(text)) score += 2;
  if (/\b(puppy|adult|senior|kitten|indoor|small breed|large breed|weight|hairball|sensitive)\b/.test(text)) score += 1;
  const tokenCount = normalizeCacheKey(text).split(/\s+/).filter(Boolean).length;
  return score + Math.min(tokenCount, 12) / 12;
}

function knownBrandConfidence(target) {
  const brand = String(target.brand || "").trim().toLowerCase();
  if (!brand) return 0;
  return BRAND_HINTS.some((hint) => brand === hint.toLowerCase()) ? 1 : 0;
}

function sourceQualityRank(target) {
  const quality = String(target.sourceQuality || "").trim();
  if (quality === "ingredient_text") return 0;
  if (quality === "barcode_name") return 1;
  if (quality === "curated_name") return 2;
  if (quality === "retailer_sitemap_title") return 3;
  return 4;
}

function catalogBackfillPriority(target) {
  return {
    sourceRank: backfillSourcePriority(target.source),
    sourceQualityRank: sourceQualityRank(target),
    explicitPetType: target.explicitPetType === true,
    targetPetTypeCount: Array.isArray(target.petTypes) ? target.petTypes.length : 1,
    knownBrand: knownBrandConfidence(target) === 1,
    nameSpecificity: Number(targetNameSpecificity(target).toFixed(2)),
  };
}

function compareCatalogBackfillTargets(a, b) {
  const priorityA = catalogBackfillPriority(a);
  const priorityB = catalogBackfillPriority(b);
  return (
    priorityA.sourceRank - priorityB.sourceRank ||
    priorityA.sourceQualityRank - priorityB.sourceQualityRank ||
    Number(priorityB.explicitPetType) - Number(priorityA.explicitPetType) ||
    priorityA.targetPetTypeCount - priorityB.targetPetTypeCount ||
    Number(priorityB.knownBrand) - Number(priorityA.knownBrand) ||
    priorityB.nameSpecificity - priorityA.nameSpecificity ||
    String(a.brand || "").localeCompare(String(b.brand || "")) ||
    String(a.name || "").localeCompare(String(b.name || "")) ||
    String(a.cacheKey || "").localeCompare(String(b.cacheKey || ""))
  );
}

function prioritizeCatalogBackfillTargets(targets) {
  return [...targets].sort(compareCatalogBackfillTargets);
}

function exportMissingTargets(targets, metadata) {
  if (!exportMissingPath) return;
  fs.mkdirSync(path.dirname(exportMissingPath), { recursive: true });
  fs.writeFileSync(
    exportMissingPath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      ...metadata,
      summary: summarizeTargets(targets),
      targets: targets.map((target) => ({
        ...target,
        priority: catalogBackfillPriority(target),
      })),
    }, null, 2)}\n`,
    "utf8",
  );
}

async function getExistingCacheKeys() {
  const rows = [];
  const base = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/product_data`;
  for (let from = 0; ; from += 1000) {
    const response = await fetch(`${base}?select=cache_key&order=cache_key.asc`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Range: `${from}-${from + 999}`,
      },
    });
    if (!response.ok) {
      throw new Error(`product_data read failed ${response.status}: ${await response.text()}`);
    }
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return new Set(rows.map((row) => row.cache_key));
}

async function lookupTarget(target, petType = target.petType) {
  const lookupUrl = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/product-lookup`;
  const token = PRODUCT_LOOKUP_SERVICE_KEY || SUPABASE_ANON_KEY;
  const response = await fetch(lookupUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: token,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      productName: target.name,
      brand: target.brand,
      petType,
      barcode: target.barcode || undefined,
      searchTerms: target.searchTerms,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  return { status: response.status, data };
}

function fatalProductLookupFailureReason(result) {
  const message = String(
    result?.data?.error ||
    result?.data?.message ||
    result?.data?.reason ||
    "",
  ).toLowerCase();
  if (result?.status === 401) return "product_lookup_auth";
  if (result?.status === 403 && /service key|forbidden|unauthorized|permission|auth/.test(message)) {
    return "product_lookup_auth";
  }
  if (result?.status === 429 || /rate.?limit|too many requests/.test(message)) {
    return "product_lookup_rate_limited";
  }
  if (result?.status === 503 || /temporarily unavailable|not configured|service unavailable/.test(message)) {
    return "product_lookup_unavailable";
  }
  if (FATAL_PRODUCT_LOOKUP_HTTP_STATUS.has(result?.status)) return `product_lookup_http_${result.status}`;
  return "";
}

async function getProductDataRow(cacheKey) {
  const base = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/product_data`;
  const select = encodeURIComponent("cache_key,source,ingredient_count,product_name,brand");
  const response = await fetch(`${base}?select=${select}&cache_key=eq.${encodeURIComponent(cacheKey)}&limit=1`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`product_data verify ${response.status}: ${await response.text()}`);
  }
  const rows = await response.json();
  return rows[0] || null;
}

async function verifyProductDataWrite(target, lookupData = null) {
  if (!verifyWrites) return { verified: true, reason: "disabled" };
  const candidateKeys = collectVerificationCacheKeys(target, lookupData);
  for (let attempt = 1; attempt <= 5; attempt++) {
    for (const cacheKey of candidateKeys) {
      const row = await getProductDataRow(cacheKey);
      const ingredientCount = Number(row?.ingredient_count || 0);
      if (row?.cache_key === cacheKey && ingredientCount >= 5) {
        return {
          verified: true,
          reason: "product_data_ready",
          cacheKey,
          targetCacheKey: target.cacheKey,
          source: row.source || "product_data",
          ingredientCount,
        };
      }
    }
    if (attempt < 5) await delay(1000);
  }
  return { verified: false, reason: "missing_or_short_product_data", checkedCacheKeys: candidateKeys };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processSelectedTargets(selected) {
  let verifiedSaved = 0;
  let accepted = 0;
  let failed = 0;
  let notFound = 0;
  let unverified = 0;
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
    const petTypes = [...new Set(target.petTypes || [target.petType])].filter((value) => value === "dog" || value === "cat");
    const label = `[${index + 1}/${selected.length}] ${petTypes.join("/")} ${target.name.slice(0, 80)} ...`;
    const misses = [];
    try {
      for (const petType of petTypes) {
        const result = await lookupTarget(target, petType);
        if (result.status === 200 && result.data?.found) {
          const verification = await verifyProductDataWrite(target, result.data);
          if (verification.verified && verification.reason === "product_data_ready") {
            verifiedSaved++;
            console.log(`${label} verified saved as ${petType} ${verification.source || result.data.source || "unknown"} (${verification.ingredientCount || result.data.ingredientCount || 0} ingredients, key=${verification.cacheKey || target.cacheKey})`);
            appendReport({
              event: "catalog_backfill_result",
              status: "verified_saved",
              cache_key: verification.cacheKey || target.cacheKey,
              target_cache_key: target.cacheKey,
              saved_cache_key: verification.cacheKey || target.cacheKey,
              source: verification.source || result.data.source || "unknown",
              pet_type: petType,
              attempted_pet_types: petTypes,
              ingredient_count: verification.ingredientCount || result.data.ingredientCount || 0,
              http_status: result.status,
              verification_reason: verification.reason,
            });
          } else if (verification.verified) {
            accepted++;
            console.log(`${label} accepted as ${petType} ${result.data.source || "unknown"} (${result.data.ingredientCount || 0} ingredients, ${verification.reason})`);
            appendReport({
              event: "catalog_backfill_result",
              status: "accepted",
              cache_key: target.cacheKey,
              target_cache_key: target.cacheKey,
              source: result.data.source || "unknown",
              pet_type: petType,
              attempted_pet_types: petTypes,
              ingredient_count: result.data.ingredientCount || 0,
              http_status: result.status,
              verification_reason: verification.reason,
            });
          } else {
            unverified++;
            console.log(`${label} unverified as ${petType} ${verification.reason}`);
            appendReport({
              event: "catalog_backfill_result",
              status: "unverified",
              cache_key: target.cacheKey,
              target_cache_key: target.cacheKey,
              source: result.data.source || "unknown",
              pet_type: petType,
              attempted_pet_types: petTypes,
              ingredient_count: result.data.ingredientCount || 0,
              http_status: result.status,
              verification_reason: verification.reason,
              checked_cache_keys: verification.checkedCacheKeys || collectVerificationCacheKeys(target, result.data),
            });
          }
          return;
        }

        const fatalReason = fatalProductLookupFailureReason(result);
        misses.push({
          petType,
          httpStatus: result.status,
          notFound: result.status === 404 || result.data?.found === false,
          fatalReason: fatalReason || undefined,
          reason: result.data?.reason || result.data?.error || "unknown",
        });
        if (!(result.status === 404 || result.data?.found === false)) break;
      }

      const fatalReason = misses.map((entry) => entry.fatalReason).find(Boolean) || "";
      const hardFailure = fatalReason || misses.some((entry) => !entry.notFound);
      if (hardFailure) failed++;
      else notFound++;
      const lastMiss = misses[misses.length - 1] || {};
      console.log(`${label} ${fatalReason ? `fatal ${fatalReason}` : "miss"} status=${lastMiss.httpStatus || "unknown"} reason=${lastMiss.reason || "unknown"}`);
      appendReport({
        event: "catalog_backfill_result",
        status: fatalReason ? "fatal_failed" : hardFailure ? "failed" : "not_found",
        cache_key: target.cacheKey,
        source: target.source,
        pet_type: target.petType,
        attempted_pet_types: petTypes,
        misses,
        http_status: lastMiss.httpStatus || 0,
        fatal_reason: fatalReason || undefined,
        reason: lastMiss.reason || "unknown",
      });
      if (fatalReason) {
        stopRequested = true;
      }
    } catch (err) {
      failed++;
      console.log(`${label} error ${err.message}`);
      appendReport({
        event: "catalog_backfill_result",
        status: "error",
        cache_key: target.cacheKey,
        source: target.source,
        pet_type: target.petType,
        attempted_pet_types: petTypes,
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

  return { verifiedSaved, accepted, unverified, notFound, failed };
}

async function main() {
  assertConfig();

  const targets = loadTargets();
  const existing = await getExistingCacheKeys();
  const reportVerifiedKeys = resumeReport ? loadVerifiedReportKeys() : new Set();
  const missing = prioritizeCatalogBackfillTargets(targets.filter((target) => {
    const plannedCacheKeys = collectVerificationCacheKeys(target);
    const existingCacheKey = plannedCacheKeys.find((cacheKey) => existing.has(cacheKey));
    if (existingCacheKey && verbose) console.log("[skip]", target.cacheKey, "existing as", existingCacheKey);
    if (!existingCacheKey && plannedCacheKeys.some((cacheKey) => reportVerifiedKeys.has(cacheKey)) && verbose) {
      console.log("[skip report-verified]", target.cacheKey);
    }
    return !existingCacheKey;
  }).filter((target) => !collectVerificationCacheKeys(target).some((cacheKey) => reportVerifiedKeys.has(cacheKey))));
  const selected = limit > 0 ? missing.slice(0, limit) : missing;

  console.log(`Catalog backfill candidates: ${targets.length}`);
  console.log(`Existing cache keys: ${existing.size}`);
  console.log(`Report-verified resume skips: ${reportVerifiedKeys.size}`);
  console.log(`Missing curated targets: ${missing.length}`);
  console.log(`Selected this run: ${selected.length}`);
  console.log(`Input target filter: ${inputTargetStats ? `${inputTargetStats.valid} valid (${inputTargetStats.invalid} invalid, ${inputTargetStats.duplicate} duplicate)` : "disabled"}`);
  console.log(`Mode: ${dryRun ? "dry-run" : PRODUCT_LOOKUP_SERVICE_KEY ? "service-role product-lookup" : "rate-limited anon product-lookup"}`);
  console.log(`Concurrency: ${dryRun ? 0 : concurrency}`);
  console.log(`Write verification: ${verifyWrites ? "enabled" : "disabled"}`);
  console.log(`Report: ${reportPath ? reportPath : "disabled"}`);
  console.log(`Missing export: ${exportMissingPath ? exportMissingPath : "disabled"}`);
  console.log(`Selection priority: ${BACKFILL_PRIORITY_DESCRIPTION}`);
  const missingSummary = summarizeTargets(missing);
  console.log(`Missing by pet type: ${missingSummary.byPetType.map((entry) => `${entry.petType}=${entry.count}`).join(", ") || "none"}`);
  console.log(`Missing lookup target pet types: ${missingSummary.byTargetPetType.map((entry) => `${entry.petType}=${entry.count}`).join(", ") || "none"}`);
  console.log(`Top missing sources: ${missingSummary.bySource.slice(0, 5).map((entry) => `${entry.source}=${entry.count}`).join(", ") || "none"}`);

  exportMissingTargets(missing, {
    candidateCount: targets.length,
    existingCount: existing.size,
    reportVerifiedSkips: reportVerifiedKeys.size,
    missingCount: missing.length,
    selectedCount: selected.length,
    dryRun,
    inputTargetFilter: inputTargetStats,
    selectionPriority: BACKFILL_PRIORITY_DESCRIPTION,
  });

  if (!dryRun && inputOnly && inputTargetStats && inputTargetStats.valid === 0) {
    console.error("No valid --input-only catalog targets were found. Refresh or repair the catalog backfill manifest before running a write batch.");
    process.exit(1);
  }
  if (dryRun || selected.length === 0) return;

  appendReport({
    event: "catalog_backfill_start",
    selected: selected.length,
    missing: missing.length,
    existing: existing.size,
    resume_report: resumeReport,
    report_verified_skips: reportVerifiedKeys.size,
    input_target_filter: inputTargetStats,
    selection_priority: BACKFILL_PRIORITY_DESCRIPTION,
    concurrency,
    delay_ms: delayMs,
  });

  const { verifiedSaved, accepted, unverified, notFound, failed } = await processSelectedTargets(selected);

  console.log(`Verified saved: ${verifiedSaved}`);
  console.log(`Accepted: ${accepted}`);
  console.log(`Unverified: ${unverified}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Failed: ${failed}`);
  appendReport({
    event: "catalog_backfill_done",
    verified_saved: verifiedSaved,
    accepted,
    unverified,
    not_found: notFound,
    failed,
    concurrency,
  });
  if (failed > 0 || unverified > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Catalog backfill failed:", err.message);
  process.exit(1);
});
