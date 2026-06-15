#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_SITEMAP_URL = "https://www.nutro.com/sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/nutro-sitemap-catalog-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof catalog coverage export";
const BRAND = "Nutro";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const sitemapArg = process.argv.find((arg) => arg.startsWith("--sitemap="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const includeExisting = process.argv.includes("--include-existing");
const includeTreats = process.argv.includes("--include-treats");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const sitemapUrl = sitemapArg ? sitemapArg.split("=").slice(1).join("=").trim() : DEFAULT_SITEMAP_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const DOG_TERMS = [
  "dog", "dogs", "puppy", "puppies", "canine", "large breed", "small breed",
];

const CAT_TERMS = [
  "cat", "cats", "kitten", "kittens", "feline", "hairball", "perfect portions",
];

const CORE_FOOD_TERMS = [
  "natural choice", "nutro max", "nutro so simple", "perfect portions",
  "adult", "senior", "puppy", "kitten", "large breed", "small breed",
  "healthy weight", "weight management", "superfood plate", "farm raised",
  "brown rice", "dry", "wet", "pate", "cuts gravy", "bites gravy",
  "variety pack", "food", "recipe",
];

const TREAT_TERMS = [
  "treat", "treats", "snack", "snacks", "biscuit", "biscuits", "crunchy", "chew", "chews", "jerky",
];

const SUPPLEMENTAL_FOOD_TERMS = [
  "topper", "toppers", "supplement", "supplements", "probiotic", "probiotics",
  "vitamin", "vitamins", "meal booster",
];

const NON_FOOD_TERMS = [
  "toy", "toys", "bowl", "mat", "collar", "leash", "harness", "bed",
  "crate", "carrier", "litter", "shampoo", "wipes", "cleaner", "flea",
  "tick", "grooming", "brush", "comb",
];

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:nutro-sitemap-catalog -- --output=.tmp/nutro-sitemap-catalog-targets.json

Options:
  --output=path.json      Write a backfill-compatible target manifest (default ${DEFAULT_OUTPUT})
  --sitemap=url           Explicit Nutro sitemap URL (${DEFAULT_SITEMAP_URL})
  --limit=N               Stop after N missing targets are collected (default 0, no limit)
  --include-existing      Include targets already present in product_data for audit only
  --include-treats        Include treat URLs in addition to core food URLs
  --skip-existing-scan    Skip product_data alias reads for smoke/debug exports only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  }
  if (!Number.isFinite(limit) || limit < 0) usage("--limit must be a non-negative number.");
  if (!/^https:\/\/www\.nutro\.com\/sitemap\.xml$/i.test(sitemapUrl)) {
    usage("--sitemap must be https://www.nutro.com/sitemap.xml.");
  }
}

function decodeXml(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/&#38;|&amp;/g, "&")
    .replace(/&#39;|&apos;|’|‘/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;|&#8221;|&quot;|“|”/g, "\"")
    .replace(/&#\d+;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/['’™®]/g, " ")
    .replace(/[^a-z0-9\s&+%-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasTerm(text, term) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  if (normalizedTerm.includes(" ")) return text.includes(normalizedTerm);
  return new RegExp(`(^|[^a-z0-9])${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text);
}

function normalizeCacheKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/\b(dog food|cat food|formula|recipe|food for dogs|food for cats)\b/gi, "")
    .replace(/\bw\b/g, "with")
    .replace(/[-/&+]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b\d+(\s+)?(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|can|cans|bag|bags|case|pack|pk|ct|count|tray|trays|pouch|pouches|box|boxes)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseProductName(value) {
  const smallWords = new Set(["and", "or", "of", "for", "in", "with", "to", "the", "at", "as"]);
  return String(value || "")
    .split(/(\s+)/)
    .map((part, index) => {
      if (/^\s+$/.test(part)) return part;
      if (/^[A-Z0-9&+%-]+$/.test(part) && /[A-Z]/.test(part)) return part;
      const lower = part.toLowerCase();
      if (index > 0 && smallWords.has(lower)) return lower;
      return lower.replace(/(^|[-'/])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
    })
    .join("")
    .replace(/\bNutro\b/g, "NUTRO")
    .replace(/\bPate\b/g, "Pate")
    .replace(/\s+([,])/g, "$1")
    .trim();
}

function cleanProductName(value) {
  return titleCaseProductName(decodeXml(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220));
}

function cleanUrl(value) {
  const url = decodeXml(value).split("#")[0].replace(/\/$/, "");
  if (!/^https:\/\/www\.nutro\.com\/products\/(dry|wet|wet-grain-free)\/[a-z0-9-]+$/i.test(url)) return "";
  return url;
}

function productIdFromUrl(url) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).pop() || "";
  } catch {
    return "";
  }
}

function productNameFromSlug(slug) {
  const cleanedSlug = String(slug || "")
    .replace(/--+/g, "-")
    .replace(/-/g, " ");
  return cleanProductName(cleanedSlug);
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout fetching ${url}`)), 90_000);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Nutro sitemap fetch failed ${response.status}: ${url}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseProductRows(xml) {
  return [...String(xml || "").matchAll(/<url>([\s\S]*?)<\/url>/gi)]
    .map((match) => {
      const block = match[1];
      const loc = block.match(/<loc>([\s\S]*?)<\/loc>/i);
      const sourceUrl = loc ? cleanUrl(loc[1]) : "";
      const retailerProductId = productIdFromUrl(sourceUrl);
      if (!sourceUrl || !retailerProductId) return null;
      const name = productNameFromSlug(retailerProductId);
      if (!name) return null;
      return {
        sourceUrl,
        name,
        retailerProductId,
        sourceSitemap: sitemapUrl,
      };
    })
    .filter(Boolean);
}

function inferNutroPetTypes(row) {
  const text = normalizeText(`${row.name} ${row.sourceUrl} ${row.retailerProductId}`);
  const cat = CAT_TERMS.some((term) => hasTerm(text, term));
  const dog = DOG_TERMS.some((term) => hasTerm(text, term));
  if (cat && !dog) return ["cat"];
  if (dog && !cat) return ["dog"];
  return inferPetTypes({
    brand: BRAND,
    product_name: `${row.name} ${row.sourceUrl}`,
    cache_key: normalizeCacheKey(`${row.name} ${row.sourceUrl}`),
    source: "nutro_sitemap",
  }, { includeAmbiguous: false });
}

function isCandidateFoodRow(row) {
  const text = normalizeText(`${row.name} ${row.sourceUrl} ${row.retailerProductId}`);
  const petTypes = inferNutroPetTypes(row);
  if (!/^https:\/\/www\.nutro\.com\/products\/(dry|wet|wet-grain-free)\//i.test(row.sourceUrl)) return false;
  if (petTypes.length !== 1) return false;
  if (NON_FOOD_TERMS.some((term) => hasTerm(text, term))) return false;
  if (!includeTreats && SUPPLEMENTAL_FOOD_TERMS.some((term) => hasTerm(text, term))) return false;
  if (!includeTreats && TREAT_TERMS.some((term) => hasTerm(text, term))) return false;
  const coreFood = CORE_FOOD_TERMS.some((term) => hasTerm(text, term));
  const treat = includeTreats && TREAT_TERMS.some((term) => hasTerm(text, term));
  return coreFood || treat;
}

function addSpeciesQualifier(name, petType) {
  const text = normalizeText(name);
  if (petType === "dog" && !/\b(dog|dogs|puppy|puppies|canine)\b/.test(text)) return `${name} for Dogs`;
  if (petType === "cat" && !/\b(cat|cats|kitten|kittens|feline)\b/.test(text)) return `${name} for Cats`;
  return name;
}

function normalizeTarget(row) {
  const petTypes = inferNutroPetTypes(row);
  if (petTypes.length !== 1) return null;
  const name = addSpeciesQualifier(cleanProductName(row.name), petTypes[0]);
  const cacheKey = normalizeCacheKey(`${BRAND} ${name}`);
  if (!cacheKey) return null;
  return {
    name,
    brand: BRAND,
    petType: petTypes[0],
    petTypes,
    explicitPetType: true,
    cacheKey,
    source: "nutro_sitemap_export",
    sourceQuality: "official_brand_sitemap_slug",
    sourceUrl: row.sourceUrl,
    imageUrl: "",
    barcode: "",
    retailerProductId: row.retailerProductId,
    sourceSitemap: row.sourceSitemap,
    searchTerms: [...new Set([`${BRAND} ${name}`, name, row.sourceUrl].filter(Boolean))],
  };
}

function collectPlannedCacheKeys(target) {
  const lookupName = target.brand && target.name && !target.name.toLowerCase().startsWith(target.brand.toLowerCase())
    ? `${target.brand} ${target.name}`
    : target.name;
  return [
    target.cacheKey,
    normalizeCacheKey(target.name),
    normalizeCacheKey(lookupName),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
}

async function fetchExistingCacheKeys() {
  if (skipExistingScan) return new Set();
  const keys = new Set();
  const base = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/product_data`;
  for (let from = 0; ; from += REST_PAGE_SIZE) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`timeout reading product_data range ${from}-${from + REST_PAGE_SIZE - 1}`)), 45_000);
    let page;
    try {
      const response = await fetch(`${base}?select=cache_key,product_name,brand&order=cache_key.asc`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Range: `${from}-${from + REST_PAGE_SIZE - 1}`,
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`product_data read failed ${response.status}: ${await response.text()}`);
      page = await response.json();
    } finally {
      clearTimeout(timer);
    }
    for (const row of page) {
      const cacheKey = String(row?.cache_key || "").trim();
      const name = cleanProductName(row?.product_name);
      const brand = decodeXml(row?.brand);
      for (const key of [
        cacheKey,
        normalizeCacheKey(name),
        normalizeCacheKey(brand && name && !name.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${name}` : name),
      ]) {
        if (key) keys.add(key);
      }
    }
    if (page.length < REST_PAGE_SIZE) break;
  }
  return keys;
}

function summarizeTargets(targets) {
  const byPetType = new Map();
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
  }
  return {
    byPetType: [...byPetType.entries()]
      .map(([petType, count]) => ({ petType, count }))
      .sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
  };
}

async function main() {
  assertConfig();

  const existing = await fetchExistingCacheKeys();
  const xml = await fetchText(sitemapUrl);
  const skipped = { nonFood: 0, existing: 0, duplicate: 0, invalid: 0 };
  const byKey = new Map();
  let scannedProducts = 0;

  for (const row of parseProductRows(xml)) {
    scannedProducts++;
    if (!isCandidateFoodRow(row)) {
      skipped.nonFood++;
      continue;
    }
    const target = normalizeTarget(row);
    if (!target) {
      skipped.invalid++;
      continue;
    }
    if (!includeExisting && collectPlannedCacheKeys(target).some((key) => existing.has(key))) {
      skipped.existing++;
      continue;
    }
    if (byKey.has(target.cacheKey)) {
      skipped.duplicate++;
      continue;
    }
    byKey.set(target.cacheKey, target);
    if (limit > 0 && byKey.size >= limit) break;
  }

  const targets = [...byKey.values()].sort((a, b) =>
    String(a.petType).localeCompare(String(b.petType)) ||
    String(a.name).localeCompare(String(b.name)) ||
    String(a.cacheKey).localeCompare(String(b.cacheKey))
  );

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: "nutro_product_sitemap",
    sitemapUrl,
    includeExisting,
    includeTreats,
    skipExistingScan,
    scannedProducts,
    existingCount: existing.size,
    missingCount: targets.length,
    skipped,
    summary: summarizeTargets(targets),
    targets,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`Nutro products scanned: ${scannedProducts}`);
  console.log(`Existing product_data keys: ${existing.size}`);
  console.log(`Missing Nutro sitemap targets exported: ${targets.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("Nutro sitemap catalog target export failed:", err.message);
  process.exit(1);
});
