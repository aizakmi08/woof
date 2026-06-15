#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_PRODUCTS_URL = "https://kohapet.com/products.json?limit=250";
const DEFAULT_OUTPUT = ".tmp/koha-shopify-catalog-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof catalog coverage export";
const BRAND = "KOHA";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const productsArg = process.argv.find((arg) => arg.startsWith("--products-url="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const includeExisting = process.argv.includes("--include-existing");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const productsUrl = productsArg ? productsArg.split("=").slice(1).join("=").trim() : DEFAULT_PRODUCTS_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const KEEP_TAG_TERMS = [
  "dog food", "cat food", "limited ingredient diet", "limited ingredient pate",
  "stew recipes", "slow cooked stews", "pure shreds", "poke bowl",
  "bland diet", "raw-bites",
];

const REJECT_TERMS = [
  "treat", "treats", "single ingredient", "hidden", "trial pack",
  "variety", "variety pack", "topper", "toppers", "raw topper",
  "gift", "teaser wand", "bundle", "supplement", "supplements",
  "chew", "chews", "snack", "snacks", "cod skins", "beef lung",
];

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:koha-shopify-catalog -- --output=.tmp/koha-shopify-catalog-targets.json

Options:
  --output=path.json      Write a backfill-compatible target manifest (default ${DEFAULT_OUTPUT})
  --products-url=url      Explicit KOHA Shopify products JSON URL (${DEFAULT_PRODUCTS_URL})
  --limit=N               Stop after N missing targets are collected (default 0, no limit)
  --include-existing      Include targets already present in product_data for audit only
  --skip-existing-scan    Skip product_data alias reads for smoke/debug exports only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  }
  if (!Number.isFinite(limit) || limit < 0) usage("--limit must be a non-negative number.");
  if (!/^https:\/\/kohapet\.com\/products\.json\?limit=250$/i.test(productsUrl)) {
    usage("--products-url must be https://kohapet.com/products.json?limit=250.");
  }
}

function decodeXml(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/&#38;|&amp;/g, "&")
    .replace(/&#39;|&apos;|’|‘/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;|&#8221;|&quot;|“|”/g, "\"")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#\d+;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/['’™®]/g, " ")
    .replace(/[-_/,%]+/g, " ")
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
    .replace(/[-/&+,%]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b\d+(\s+)?(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|can|cans|bag|bags|case|pack|pk|ct|count|tray|trays|pouch|pouches|box|boxes)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanProductName(value) {
  return decodeXml(value)
    .replace(/™|®|©/g, "")
    .replace(/\bPâté\b/gi, "Pate")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function tagSet(product) {
  return new Set((product?.tags || []).map((tag) => String(tag || "").trim()).filter(Boolean));
}

function productText(product) {
  return normalizeText(`${product?.title || ""} ${product?.handle || ""} ${product?.product_type || ""} ${(product?.tags || []).join(" ")}`);
}

function inferPetType(product) {
  const tags = tagSet(product);
  const text = productText(product);
  const cat = tags.has("cat") || /\b(cat|cats|kitten|kittens|feline)\b/.test(text);
  const dog = tags.has("dog") || /\b(dog|dogs|puppy|puppies|canine)\b/.test(text);
  if (cat && !dog) return "cat";
  if (dog && !cat) return "dog";
  return "";
}

function formFromProduct(product) {
  const text = productText(product);
  if (hasTerm(text, "dry bland diet") || hasTerm(text, "limited ingredient dry bland")) return "dry";
  if (hasTerm(text, "freeze dried raw bites") || hasTerm(text, "raw-bites")) return "fresh";
  return "wet";
}

function isCandidateFoodProduct(product) {
  const text = productText(product);
  if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  const petType = inferPetType(product);
  if (!petType) return false;
  return KEEP_TAG_TERMS.some((term) => hasTerm(text, term));
}

function addSpeciesQualifier(name, petType) {
  const text = normalizeText(name);
  if (petType === "cat" && !/\b(cat|cats|kitten|kittens|feline)\b/.test(text)) return `${name} for Cats`;
  if (petType === "dog" && !/\b(dog|dogs|puppy|puppies|canine)\b/.test(text)) return `${name} for Dogs`;
  return name;
}

function inferKohaPetTypes(target) {
  const inferred = inferPetTypes({
    brand: BRAND,
    product_name: `${target.petType} ${target.name} ${target.sourceUrl}`,
    cache_key: normalizeCacheKey(`${target.petType} ${BRAND} ${target.name} ${target.sourceUrl}`),
    source: "koha_shopify_json",
  }, { includeAmbiguous: false });
  if (inferred.length === 1 && inferred[0] === target.petType) return inferred;
  return [target.petType];
}

function normalizeTarget(product) {
  if (!isCandidateFoodProduct(product)) return null;
  const petType = inferPetType(product);
  const form = formFromProduct(product);
  const name = addSpeciesQualifier(cleanProductName(product.title), petType);
  const sourceUrl = `https://kohapet.com/products/${product.handle}`;
  const draft = { name, petType, sourceUrl };
  const petTypes = inferKohaPetTypes(draft);
  if (petTypes.length !== 1 || petTypes[0] !== petType) return null;
  const cacheKey = normalizeCacheKey(`${BRAND} ${name}`);
  if (!cacheKey) return null;
  return {
    name,
    brand: BRAND,
    petType,
    petTypes,
    explicitPetType: true,
    cacheKey,
    source: "koha_shopify_export",
    sourceQuality: "official_brand_shopify_json",
    sourceUrl,
    imageUrl: "",
    barcode: "",
    retailerProductId: String(product.id || product.handle || ""),
    form,
    productType: `koha_${form}_food`,
    searchTerms: [...new Set([`${BRAND} ${name}`, name, sourceUrl].filter(Boolean))],
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

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout fetching ${url}`)), 90_000);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`KOHA products fetch failed ${response.status}: ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchProducts() {
  const data = await fetchJson(productsUrl);
  if (!Array.isArray(data?.products)) throw new Error("KOHA products feed did not return a products array.");
  return data.products;
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
      const name = cleanProductName(row?.product_name || "");
      const brand = cleanProductName(row?.brand || "");
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
  const byForm = new Map();
  const byLine = new Map();
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
    byForm.set(target.form, (byForm.get(target.form) || 0) + 1);
    byLine.set(target.productType, (byLine.get(target.productType) || 0) + 1);
  }
  return {
    byPetType: [...byPetType.entries()]
      .map(([petType, count]) => ({ petType, count }))
      .sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
    byForm: [...byForm.entries()]
      .map(([form, count]) => ({ form, count }))
      .sort((a, b) => b.count - a.count || a.form.localeCompare(b.form)),
    byLine: [...byLine.entries()]
      .map(([line, count]) => ({ line, count }))
      .sort((a, b) => b.count - a.count || a.line.localeCompare(b.line)),
  };
}

async function main() {
  assertConfig();

  const existing = await fetchExistingCacheKeys();
  const products = await fetchProducts();
  const skipped = { nonFood: 0, existing: 0, duplicate: 0, invalid: 0 };
  const byKey = new Map();

  for (const product of products) {
    if (!isCandidateFoodProduct(product)) {
      skipped.nonFood++;
      continue;
    }
    const target = normalizeTarget(product);
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
    source: "koha_shopify_products",
    productsUrl,
    includeExisting,
    skipExistingScan,
    scannedProducts: products.length,
    existingCount: existing.size,
    missingCount: targets.length,
    skipped,
    summary: summarizeTargets(targets),
    targets,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`KOHA products scanned: ${products.length}`);
  console.log(`Existing product_data keys: ${existing.size}`);
  console.log(`Missing KOHA Shopify targets exported: ${targets.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("KOHA Shopify catalog target export failed:", err.message);
  process.exit(1);
});
