#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_OUTPUT = ".tmp/curated-catalog-targets.json";
const REST_PAGE_SIZE = 1000;
const DEFAULT_SOURCE_FILES = [
  "scripts/mega-scraper/underrepresented.js",
  "scripts/mega-scraper/us-canada-complete.js",
  "scripts/mega-scraper/store-brands.js",
  "scripts/mega-scraper/openfarm-complete.js",
];

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const sourceFilesArg = process.argv.find((arg) => arg.startsWith("--source-files="));
const includeExisting = process.argv.includes("--include-existing");
const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const sourceFiles = sourceFilesArg
  ? sourceFilesArg.split("=")[1].split(",").map((value) => value.trim()).filter(Boolean)
  : DEFAULT_SOURCE_FILES;

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:curated-catalog -- --output=.tmp/curated-catalog-targets.json

Options:
  --output=path.json        Write a backfill-compatible target manifest (default ${DEFAULT_OUTPUT})
  --source-files=a,b        Comma-separated curated source files (default legacy curated lists)
  --limit=N                 Stop after N missing targets are collected (default 0, no limit)
  --include-existing        Include targets already present in product_data for audit only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  }
  if (!Number.isFinite(limit) || limit < 0) {
    usage("--limit must be a non-negative number.");
  }
  if (sourceFiles.length === 0) {
    usage("--source-files must include at least one file.");
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

function cleanProductName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 220);
}

function cleanBrand(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 100);
}

function productLookupRequestCacheKey(target) {
  return normalizeCacheKey(target.brand ? `${target.brand} ${target.name}` : target.name);
}

function collectPlannedCacheKeys(target) {
  return [
    target.cacheKey,
    productLookupRequestCacheKey(target),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
}

function parseCuratedProducts(file) {
  const absolute = path.resolve(root, file);
  const relative = path.relative(root, absolute);
  const sourceText = fs.readFileSync(absolute, "utf8");
  const products = [];
  const pattern = /\{\s*name:\s*(["'])(.*?)\1\s*,\s*brand:\s*(["'])(.*?)\3(?:\s*,\s*(?:petType|pet_type|species):\s*(["'])(.*?)\5)?\s*\}/gs;
  for (const match of sourceText.matchAll(pattern)) {
    const name = cleanProductName(match[2]);
    const brand = cleanBrand(match[4]);
    const petType = String(match[6] || "").trim().toLowerCase();
    if (!name || !brand) continue;
    products.push({ name, brand, petType, sourceFile: relative });
  }
  return products;
}

function normalizeTarget(entry) {
  const fullName = entry.brand && !entry.name.toLowerCase().startsWith(entry.brand.toLowerCase())
    ? `${entry.brand} ${entry.name}`
    : entry.name;
  const cacheKey = normalizeCacheKey(fullName);
  if (!cacheKey) return null;
  const inferredPetTypes = inferPetTypes({
    product_name: entry.name,
    brand: entry.brand,
    cache_key: cacheKey,
    petType: entry.petType,
    source: "curated_export",
  }, { includeAmbiguous: true });
  const explicitPetTypes = ["dog", "cat"].includes(entry.petType) ? [entry.petType] : [];
  const petTypes = explicitPetTypes.length > 0 ? explicitPetTypes : inferredPetTypes;
  if (petTypes.length === 0) return null;
  return {
    name: entry.name,
    brand: entry.brand,
    petType: petTypes[0],
    petTypes,
    explicitPetType: explicitPetTypes.length > 0,
    cacheKey,
    source: "curated_export",
    sourceFile: entry.sourceFile,
    sourceQuality: "curated_name",
    sourceUrl: "",
    barcode: "",
    searchTerms: [...new Set([entry.name, fullName].filter(Boolean))],
  };
}

async function fetchExistingCacheKeys() {
  const rows = [];
  const base = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/product_data`;
  for (let from = 0; ; from += REST_PAGE_SIZE) {
    const response = await fetch(`${base}?select=cache_key&order=cache_key.asc`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Range: `${from}-${from + REST_PAGE_SIZE - 1}`,
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`product_data read failed ${response.status}: ${await response.text()}`);
    }
    const page = await response.json();
    rows.push(...page);
    if (page.length < REST_PAGE_SIZE) break;
  }
  return new Set(rows.map((row) => row.cache_key).filter(Boolean));
}

function summarizeTargets(targets) {
  const byPetType = new Map();
  const bySourceFile = new Map();
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
    bySourceFile.set(target.sourceFile, (bySourceFile.get(target.sourceFile) || 0) + 1);
  }
  return {
    byPetType: [...byPetType.entries()]
      .map(([petType, count]) => ({ petType, count }))
      .sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
    bySourceFile: [...bySourceFile.entries()]
      .map(([sourceFile, count]) => ({ sourceFile, count }))
      .sort((a, b) => b.count - a.count || a.sourceFile.localeCompare(b.sourceFile)),
  };
}

async function main() {
  assertConfig();

  const existing = await fetchExistingCacheKeys();
  const skipped = { duplicate: 0, existing: 0, invalid: 0 };
  const byKey = new Map();
  let parsedCount = 0;

  for (const sourceFile of sourceFiles) {
    const entries = parseCuratedProducts(sourceFile);
    parsedCount += entries.length;
    for (const entry of entries) {
      const target = normalizeTarget(entry);
      if (!target) {
        skipped.invalid++;
        continue;
      }
      const dedupeKey = target.cacheKey;
      if (byKey.has(dedupeKey)) {
        skipped.duplicate++;
        continue;
      }
      if (!includeExisting && collectPlannedCacheKeys(target).some((key) => existing.has(key))) {
        skipped.existing++;
        continue;
      }
      byKey.set(dedupeKey, target);
      if (limit > 0 && byKey.size >= limit) break;
    }
    if (limit > 0 && byKey.size >= limit) break;
  }

  const targets = [...byKey.values()].sort((a, b) =>
    String(a.sourceFile).localeCompare(String(b.sourceFile)) ||
    String(a.brand).localeCompare(String(b.brand)) ||
    String(a.name).localeCompare(String(b.name)) ||
    String(a.cacheKey).localeCompare(String(b.cacheKey))
  );

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: "legacy_curated_product_lists",
      sourceFiles,
      parsedCount,
      existingCount: existing.size,
      includeExisting,
      missingCount: targets.length,
      skipped,
      summary: summarizeTargets(targets),
      targets,
    }, null, 2)}\n`,
    "utf8",
  );

  console.log(`Parsed curated products: ${parsedCount}`);
  console.log(`Existing cache keys: ${existing.size}`);
  console.log(`Missing curated targets: ${targets.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
  console.log(`Wrote: ${outputPath}`);
}

main().catch((err) => {
  console.error("Curated catalog export failed:", err.message);
  process.exit(1);
});
