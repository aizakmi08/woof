#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_PRODUCTS_URL = "https://openfarmpet.com/products.json?limit=250";
const DEFAULT_OUTPUT = ".tmp/openfarm-shopify-catalog-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof catalog coverage export";
const BRAND = "Open Farm";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const productsArg = process.argv.find((arg) => arg.startsWith("--products-url="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const includeExisting = process.argv.includes("--include-existing");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const productsUrl = productsArg ? productsArg.split("=").slice(1).join("=").trim() : DEFAULT_PRODUCTS_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const KEEP_PRODUCT_TYPES = new Set(["Dog Food", "Cat Food", "Dog Food Frozen"]);
const KEEP_PRODUCT_TYPE_TAGS = new Set([
  "_productType::dry",
  "_productType::wet",
  "_productType::frozen",
  "_productType::freeze_dried",
  "_productType::rawmix",
]);
const REJECT_PRODUCT_TYPE_TAGS = new Set([
  "_productType::treat",
  "_productType::supplement",
  "_productType::bonebroth",
  "_productType::broth",
]);
const REJECT_TERMS = [
  "treat", "treats", "supplement", "supplements", "bone broth",
  "broth for dogs", "broth for cats", "oil for dogs", "oil for cats",
  "chew", "chews", "snack", "snacks", "bundle", "variety pack",
  "meal plan", "gift",
];

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:openfarm-shopify-catalog -- --output=.tmp/openfarm-shopify-catalog-targets.json

Options:
  --output=path.json      Write a backfill-compatible target manifest (default ${DEFAULT_OUTPUT})
  --products-url=url      Explicit Open Farm Shopify products JSON URL (${DEFAULT_PRODUCTS_URL})
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
  if (!/^https:\/\/openfarmpet\.com\/products\.json\?limit=250$/i.test(productsUrl)) {
    usage("--products-url must be https://openfarmpet.com/products.json?limit=250.");
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

function asciiFold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/\u202F/g, " ");
}

function normalizeText(value) {
  return asciiFold(value)
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
  return asciiFold(text)
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
  return asciiFold(decodeXml(value))
    .replace(/™|®|©/g, "")
    .replace(/\bPâté\b/gi, "Pate")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function tagSet(product) {
  return new Set((product?.tags || []).map((tag) => String(tag || "").trim()).filter(Boolean));
}

function hasAnyTag(tags, candidates) {
  for (const candidate of candidates) {
    if (tags.has(candidate)) return true;
  }
  return false;
}

function hasRegexTag(tags, pattern) {
  for (const tag of tags) {
    if (pattern.test(tag)) return true;
  }
  return false;
}

function inferPetType(product, tags) {
  const text = normalizeText(`${product.title} ${product.handle} ${product.product_type} ${[...tags].join(" ")}`);
  if (
    product.product_type === "Cat Food" ||
    hasRegexTag(tags, /YCRF_Cats|category::.*Cat|product_cat/i) ||
    /\b(cat|cats|kitten|kittens|feline)\b/.test(text)
  ) return "cat";
  if (
    product.product_type === "Dog Food" ||
    product.product_type === "Dog Food Frozen" ||
    hasRegexTag(tags, /YCRF_Dogs|category::.*Dog|product_dog/i) ||
    /\b(dog|dogs|puppy|puppies|canine)\b/.test(text)
  ) return "dog";
  return "";
}

function formFromTags(tags) {
  if (tags.has("_productType::frozen") || tags.has("_productType::freeze_dried")) return "fresh";
  if (tags.has("_productType::wet")) return "wet";
  if (tags.has("_productType::dry") || tags.has("_productType::rawmix")) return "dry";
  return "";
}

function isCandidateFoodProduct(product) {
  const tags = tagSet(product);
  const text = normalizeText(`${product.title} ${product.handle} ${product.product_type} ${[...tags].join(" ")}`);
  if (!KEEP_PRODUCT_TYPES.has(product.product_type || "")) return false;
  if (!tags.has("_complete::yes") || tags.has("_complete::no")) return false;
  if (!hasAnyTag(tags, KEEP_PRODUCT_TYPE_TAGS)) return false;
  if (hasAnyTag(tags, REJECT_PRODUCT_TYPE_TAGS)) return false;
  if (hasRegexTag(tags, /^(_hidden|_nonsalable|YBlocklist)$/i)) return false;
  if (hasRegexTag(tags, /^category::Bundle$/i)) return false;
  if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  const petType = inferPetType(product, tags);
  if (!petType) return false;
  const form = formFromTags(tags);
  return ["dry", "wet", "fresh"].includes(form);
}

function addSpeciesQualifier(name, petType) {
  const text = normalizeText(name);
  if (petType === "cat" && !/\b(cat|cats|kitten|kittens|feline)\b/.test(text)) return `${name} for Cats`;
  if (petType === "dog" && !/\b(dog|dogs|puppy|puppies|canine)\b/.test(text)) return `${name} for Dogs`;
  return name;
}

function inferOpenFarmPetTypes(target) {
  const inferred = inferPetTypes({
    brand: BRAND,
    product_name: `${target.petType} ${target.name} ${target.sourceUrl}`,
    cache_key: normalizeCacheKey(`${target.petType} ${target.name} ${target.sourceUrl}`),
    source: "openfarm_shopify_json",
  }, { includeAmbiguous: false });
  if (inferred.length === 1 && inferred[0] === target.petType) return inferred;
  return [target.petType];
}

function normalizeTarget(product) {
  const tags = tagSet(product);
  const petType = inferPetType(product, tags);
  const form = formFromTags(tags);
  const name = addSpeciesQualifier(cleanProductName(product.title), petType);
  const sourceUrl = `https://openfarmpet.com/products/${product.handle}`;
  const draft = { name, petType, sourceUrl };
  const petTypes = inferOpenFarmPetTypes(draft);
  if (petTypes.length !== 1) return null;
  const cacheKey = normalizeCacheKey(`${BRAND} ${name}`);
  if (!cacheKey) return null;
  return {
    name,
    brand: BRAND,
    petType,
    petTypes,
    explicitPetType: true,
    cacheKey,
    source: "openfarm_shopify_export",
    sourceQuality: "official_brand_shopify_json",
    sourceUrl,
    imageUrl: "",
    barcode: "",
    retailerProductId: String(product.id || product.handle || ""),
    form,
    productType: product.product_type || "",
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
    if (!response.ok) throw new Error(`Open Farm product JSON fetch failed ${response.status}: ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function pageUrl(baseUrl, page) {
  const parsed = new URL(baseUrl);
  parsed.searchParams.set("page", String(page));
  return parsed.toString();
}

async function fetchProducts() {
  const products = [];
  for (let page = 1; page <= 20; page++) {
    const json = await fetchJson(pageUrl(productsUrl, page));
    const pageProducts = Array.isArray(json.products) ? json.products : [];
    products.push(...pageProducts);
    if (pageProducts.length < 250) break;
  }
  return products;
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
  const byForm = new Map();
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
    byForm.set(target.form, (byForm.get(target.form) || 0) + 1);
  }
  return {
    byPetType: [...byPetType.entries()]
      .map(([petType, count]) => ({ petType, count }))
      .sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
    byForm: [...byForm.entries()]
      .map(([form, count]) => ({ form, count }))
      .sort((a, b) => b.count - a.count || a.form.localeCompare(b.form)),
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
    source: "openfarm_shopify_products",
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

  console.log(`Open Farm products scanned: ${products.length}`);
  console.log(`Existing product_data keys: ${existing.size}`);
  console.log(`Missing Open Farm Shopify targets exported: ${targets.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("Open Farm Shopify catalog target export failed:", err.message);
  process.exit(1);
});
