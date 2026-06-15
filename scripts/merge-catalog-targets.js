#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT = ".tmp/catalog-backfill-unified-targets.json";
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
  ["curated_export", 4],
  ["opff_catalog_export", 4],
  ["opff_export", 4],
];
const BRAND_HINTS = [
  "Blue Buffalo", "Purina Pro Plan", "Purina ONE", "Purina Dog Chow",
  "Purina Cat Chow", "Purina Beneful", "Purina", "Taste of the Wild",
  "Orijen", "Acana", "Hill's Science Diet", "Hills Science Diet",
  "Royal Canin", "Iams", "Kirkland Signature", "Diamond Naturals",
  "Victor", "Rachael Ray Nutrish", "Merrick", "Nutro", "Canidae",
  "Wellness CORE", "Wellness", "Fromm", "Instinct", "The Honest Kitchen",
  "Open Farm", "Pedigree", "Cesar", "Meow Mix", "Friskies", "9 Lives",
  "Fancy Feast", "Sheba", "Tiki Cat", "Greenies", "Milk Bone",
  "Milk-Bone", "Temptations", "Crave", "Wag", "Natural Balance",
  "American Journey", "Nulo", "Stella & Chewy's", "Simply Nourish",
  "WholeHearted", "Earthborn Holistic", "Solid Gold", "Halo",
  "Nature's Recipe", "Farmina", "Weruva", "Ziwi Peak", "Eukanuba",
  "4Health", "Pure Balance", "Evolution",
];

const inputArgs = process.argv.filter((arg) => arg.startsWith("--input="));
const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run merge:catalog-targets -- --input=.tmp/catalog-missing-targets.json,.tmp/opff-catalog-targets-sparse.json --output=.tmp/catalog-backfill-unified-targets.json

Options:
  --input=a,b          Comma-separated target manifests. May be repeated.
  --output=path.json   Write merged backfill-compatible manifest (default ${DEFAULT_OUTPUT})
  --limit=N            Stop after N merged targets are written (default 0, no limit)
`);
  process.exit(message ? 1 : 0);
}

function assertArgs() {
  if (inputArgs.length === 0) usage("At least one --input manifest is required.");
  if (!Number.isFinite(limit) || limit < 0) usage("--limit must be a non-negative number.");
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

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeBarcode(value) {
  const barcode = String(value || "").trim().replace(/[\s-]/g, "");
  return /^[a-z0-9]{6,40}$/i.test(barcode) ? barcode : "";
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

function inferBrand(name) {
  const lower = String(name || "").toLowerCase();
  return BRAND_HINTS.find((brand) => lower.startsWith(brand.toLowerCase())) ||
    String(name || "").split(/\s+/).slice(0, 2).join(" ");
}

function normalizeSource(value, fallback) {
  return cleanText(value || fallback, 240);
}

function sourcePriority(source) {
  const value = String(source || "");
  const match = SOURCE_BACKFILL_PRIORITY.find(([prefix]) => value.startsWith(prefix));
  return match ? match[1] : 5;
}

function sourceQualityRank(target) {
  const quality = String(target.sourceQuality || "").trim();
  if (quality === "ingredient_text") return 0;
  if (quality === "barcode_name") return 1;
  if (quality === "curated_name") return 2;
  if (quality.startsWith("official_brand_")) return 3;
  return 4;
}

function targetRank(target) {
  return {
    sourceRank: sourcePriority(target.source),
    sourceQualityRank: sourceQualityRank(target),
    explicitPetType: target.explicitPetType === true,
    targetPetTypeCount: Array.isArray(target.petTypes) ? target.petTypes.length : 1,
    hasBarcode: Boolean(target.barcode),
    hasSourceUrl: Boolean(target.sourceUrl),
  };
}

function compareTargets(a, b) {
  const rankA = targetRank(a);
  const rankB = targetRank(b);
  return (
    rankA.sourceRank - rankB.sourceRank ||
    rankA.sourceQualityRank - rankB.sourceQualityRank ||
    Number(rankB.explicitPetType) - Number(rankA.explicitPetType) ||
    rankA.targetPetTypeCount - rankB.targetPetTypeCount ||
    Number(rankB.hasBarcode) - Number(rankA.hasBarcode) ||
    Number(rankB.hasSourceUrl) - Number(rankA.hasSourceUrl) ||
    String(a.brand || "").localeCompare(String(b.brand || "")) ||
    String(a.name || "").localeCompare(String(b.name || "")) ||
    String(a.cacheKey || "").localeCompare(String(b.cacheKey || ""))
  );
}

function normalizeTarget(entry, inputPath) {
  const manifestPath = path.relative(root, inputPath);
  const name = cleanText(entry.name || entry.productName, 220);
  if (!name || name.length < 3) return null;
  const brand = cleanText(entry.brand || inferBrand(name), 100);
  if (!brand) return null;
  const fullName = brand && !name.toLowerCase().startsWith(brand.toLowerCase())
    ? `${brand} ${name}`
    : name;
  const cacheKey = normalizeCacheKey(entry.cacheKey || entry.cache_key || fullName);
  if (!cacheKey) return null;
  const explicitPetTypes = normalizeExplicitPetTypes(entry);
  const petTypes = explicitPetTypes.length > 0 ? explicitPetTypes : inferPetTypes({
    product_name: name,
    brand,
    cache_key: cacheKey,
    source: entry.source || entry.sourceFile || manifestPath,
  }, { includeAmbiguous: true });
  if (petTypes.length === 0) return null;
  const source = normalizeSource(entry.source, manifestPath);
  const sourceFile = normalizeSource(entry.sourceFile || entry.source_file, "");
  const searchTerms = Array.isArray(entry.searchTerms)
    ? entry.searchTerms
    : [name, fullName];
  return {
    name,
    brand,
    petType: petTypes[0],
    petTypes,
    explicitPetType: explicitPetTypes.length > 0 || entry.explicitPetType === true,
    cacheKey,
    source,
    sourceFile,
    sourceQuality: cleanText(entry.sourceQuality || entry.source_quality, 80),
    sourceUrl: cleanText(entry.sourceUrl || entry.source_url, 500),
    imageUrl: cleanText(entry.imageUrl || entry.image_url, 500),
    retailerProductId: cleanText(entry.retailerProductId || entry.retailer_product_id, 160),
    form: cleanText(entry.form, 40),
    productType: cleanText(entry.productType || entry.product_type, 120),
    sourceSitemap: cleanText(entry.sourceSitemap || entry.source_sitemap, 500),
    barcode: normalizeBarcode(entry.barcode || entry.code || entry.upc || entry.ean),
    searchTerms: [...new Set(searchTerms.map((value) => cleanText(value, 220)).filter(Boolean))],
    sourceManifests: [manifestPath],
  };
}

function readManifest(file) {
  const inputPath = path.resolve(root, file);
  const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const entries = Array.isArray(data) ? data : data?.targets;
  if (!Array.isArray(entries)) usage(`Input must be an array or object with targets: ${file}`);
  return { inputPath, entries };
}

function mergeTarget(existing, incoming) {
  const ordered = [existing, incoming].sort(compareTargets);
  const primary = ordered[0];
  const secondary = ordered[1];
  return {
    ...primary,
    petTypes: [...new Set([...(primary.petTypes || []), ...(secondary.petTypes || [])])]
      .filter((value) => value === "dog" || value === "cat"),
    explicitPetType: primary.explicitPetType === true || secondary.explicitPetType === true,
    barcode: primary.barcode || secondary.barcode || "",
    sourceUrl: primary.sourceUrl || secondary.sourceUrl || "",
    imageUrl: primary.imageUrl || secondary.imageUrl || "",
    retailerProductId: primary.retailerProductId || secondary.retailerProductId || "",
    form: primary.form || secondary.form || "",
    productType: primary.productType || secondary.productType || "",
    sourceSitemap: primary.sourceSitemap || secondary.sourceSitemap || "",
    sourceFile: primary.sourceFile || secondary.sourceFile || "",
    sourceQuality: primary.sourceQuality || secondary.sourceQuality || "",
    searchTerms: [...new Set([...(primary.searchTerms || []), ...(secondary.searchTerms || [])])],
    sourceManifests: [...new Set([...(primary.sourceManifests || []), ...(secondary.sourceManifests || [])])],
  };
}

function summarizeTargets(targets, inputStats) {
  const bySource = new Map();
  const bySourceQuality = new Map();
  const byPetType = new Map();
  const byTargetPetType = new Map();
  const byInput = new Map();
  for (const target of targets) {
    bySource.set(target.source, (bySource.get(target.source) || 0) + 1);
    bySourceQuality.set(target.sourceQuality || "unknown", (bySourceQuality.get(target.sourceQuality || "unknown") || 0) + 1);
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
    for (const petType of target.petTypes || [target.petType]) {
      byTargetPetType.set(petType, (byTargetPetType.get(petType) || 0) + 1);
    }
    for (const sourceManifest of target.sourceManifests || []) {
      byInput.set(sourceManifest, (byInput.get(sourceManifest) || 0) + 1);
    }
  }
  const summarizeMap = (map, keyName) => [...map.entries()]
    .map(([key, count]) => ({ [keyName]: key, count }))
    .sort((a, b) => b.count - a.count || String(a[keyName]).localeCompare(String(b[keyName])));
  return {
    inputs: inputStats,
    bySource: summarizeMap(bySource, "source").slice(0, 20),
    bySourceQuality: summarizeMap(bySourceQuality, "sourceQuality"),
    byPetType: summarizeMap(byPetType, "petType"),
    byTargetPetType: summarizeMap(byTargetPetType, "petType"),
    byInput: summarizeMap(byInput, "input"),
  };
}

function expandInputFiles() {
  return inputArgs.flatMap((arg) => arg.split("=")[1].split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function main() {
  assertArgs();
  const inputFiles = expandInputFiles();
  if (inputFiles.length === 0) usage("At least one --input manifest is required.");

  const byCanonicalKey = new Map();
  const aliasToCanonicalKey = new Map();
  const inputStats = [];
  let invalid = 0;
  let duplicates = 0;

  for (const file of inputFiles) {
    const { inputPath, entries } = readManifest(file);
    const stat = { path: path.relative(root, inputPath), entries: entries.length, valid: 0, invalid: 0, duplicate: 0 };
    for (const entry of entries) {
      const target = normalizeTarget(entry, inputPath);
      if (!target) {
        invalid++;
        stat.invalid++;
        continue;
      }
      stat.valid++;
      const aliases = collectPlannedCacheKeys(target);
      const existingCanonical = aliases.map((key) => aliasToCanonicalKey.get(key)).find(Boolean);
      const canonicalKey = existingCanonical || target.cacheKey;
      if (existingCanonical) {
        duplicates++;
        stat.duplicate++;
        byCanonicalKey.set(canonicalKey, mergeTarget(byCanonicalKey.get(canonicalKey), target));
      } else {
        byCanonicalKey.set(canonicalKey, target);
      }
      for (const alias of aliases) aliasToCanonicalKey.set(alias, canonicalKey);
    }
    inputStats.push(stat);
  }

  const targets = [...byCanonicalKey.values()]
    .sort(compareTargets)
    .slice(0, limit > 0 ? limit : undefined);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: "merged_catalog_backfill_targets",
      inputFiles,
      inputCount: inputFiles.length,
      mergedCount: targets.length,
      skipped: {
        invalid,
        duplicate: duplicates,
      },
      summary: summarizeTargets(targets, inputStats),
      targets,
    }, null, 2)}\n`,
    "utf8",
  );

  console.log(`Input manifests: ${inputFiles.length}`);
  console.log(`Merged targets: ${targets.length}`);
  console.log(`Skipped: ${JSON.stringify({ invalid, duplicate: duplicates })}`);
  console.log(`Wrote: ${outputPath}`);
}

main();
