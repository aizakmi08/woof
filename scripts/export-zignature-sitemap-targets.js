#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_SITEMAP_URL = "https://zignature.com/product-sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/zignature-sitemap-catalog-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof catalog coverage export";
const SOURCE_BRAND = "Zignature";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const sitemapArg = process.argv.find((arg) => arg.startsWith("--sitemap="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const includeExisting = process.argv.includes("--include-existing");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const sitemapUrl = sitemapArg ? sitemapArg.split("=").slice(1).join("=").trim() : DEFAULT_SITEMAP_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const CORE_FOOD_TERMS = [
  "formula", "recipe", "entree", "dry food", "wet food", "dog food",
  "food dry", "food can", "select cuts", "small bites", "super grains",
  "puppy", "zssential", "kangaroo", "duck", "turkey", "lamb", "trout",
  "salmon", "goat", "pork", "venison", "whitefish", "catfish", "fish",
  "chicken", "ranch", "ocean", "landfowl", "freeze dried",
];
const REJECT_TERMS = [
  "treat", "treats", "biscuit", "biscuits", "soft moist", "jerky",
  "chew", "chews", "snack", "snacks", "topper", "toppers",
  "supplement", "supplements", "broth", "catnip", "litter",
  "toy", "toys", "accessory", "accessories",
];
const NON_FOOD_TERMS = [
  "shop", "category", "brand", "page", "post", "blog", "article",
  "articles", "press", "where to buy", "store", "finder", "faq",
  "about", "contact", "privacy", "terms", "wp content",
];

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:zignature-sitemap-catalog -- --output=.tmp/zignature-sitemap-catalog-targets.json

Options:
  --output=path.json      Write a backfill-compatible target manifest (default ${DEFAULT_OUTPUT})
  --sitemap=url           Explicit Zignature product sitemap URL (${DEFAULT_SITEMAP_URL})
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
  if (!/^https:\/\/zignature\.com\/product-sitemap\.xml$/i.test(sitemapUrl)) {
    usage("--sitemap must be https://zignature.com/product-sitemap.xml.");
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

function decodePathPart(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
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
    .replace(/\b(dog food|formula|recipe|food for dogs)\b/gi, "")
    .replace(/\bw\b/g, "with")
    .replace(/[-/&+,%]/g, " ")
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
    .replace(/\bZssential\b/g, "Zssential")
    .replace(/\bLir\b/g, "LIR")
    .trim();
}

function cleanProductName(value) {
  return titleCaseProductName(decodeXml(value)
    .replace(/\bZignature\b\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220));
}

function cleanUrl(value) {
  const url = decodeXml(value).split("#")[0].replace(/\/$/, "");
  if (!/^https:\/\/zignature\.com\/products\/[a-z0-9-]+$/i.test(url)) return "";
  return url;
}

function brandFromSlug(slug) {
  const text = normalizeText(slug);
  if (hasTerm(text, "inception")) return "Inception";
  if (hasTerm(text, "essence")) return "Essence";
  return SOURCE_BRAND;
}

function formFromSlug(slug) {
  const text = normalizeText(slug);
  if (hasTerm(text, "wet food") || hasTerm(text, "food can")) return "wet";
  if (hasTerm(text, "freeze dried")) return "fresh";
  return "dry";
}

function productNameFromSlug(slug, brand) {
  const name = decodePathPart(slug)
    .replace(/--+/g, "-")
    .replace(/-/g, " ")
    .replace(/\bforumla\b/gi, "formula")
    .replace(/\bwet food can\b/gi, "wet food")
    .replace(/\bdog food dry\b/gi, "dry food")
    .replace(/\bfood dry\b/gi, "dry food")
    .replace(/\bzignature\b/gi, "")
    .replace(/\binception\b/gi, brand === "Inception" ? "Inception" : "")
    .replace(/\bessence\b/gi, brand === "Essence" ? "Essence" : "")
    .replace(/\s+/g, " ")
    .trim();
  return cleanProductName(name);
}

function parsedProductPath(url) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length !== 2 || segments[0] !== "products") return null;
    const slug = decodePathPart(segments[1]);
    if (!slug || !/^[a-z0-9-]+$/i.test(slug)) return null;
    const brand = brandFromSlug(slug);
    return {
      petType: "dog",
      slug,
      brand,
      name: productNameFromSlug(slug, brand),
      retailerProductId: slug,
      form: formFromSlug(slug),
    };
  } catch {
    return null;
  }
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
    if (!response.ok) throw new Error(`Zignature sitemap fetch failed ${response.status}: ${url}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseProductRows(xml) {
  return [...String(xml || "").matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => {
      const sourceUrl = cleanUrl(match[1]);
      const parsed = sourceUrl ? parsedProductPath(sourceUrl) : null;
      if (!sourceUrl || !parsed || !parsed.name) return null;
      return {
        sourceUrl,
        name: parsed.name,
        brand: parsed.brand,
        petType: parsed.petType,
        retailerProductId: parsed.retailerProductId,
        form: parsed.form,
        sourceSitemap: sitemapUrl,
      };
    })
    .filter(Boolean);
}

function inferZignaturePetTypes(row) {
  const inferred = inferPetTypes({
    brand: row.brand,
    product_name: `dog ${row.brand} ${row.name} ${row.sourceUrl}`,
    cache_key: normalizeCacheKey(`dog ${row.brand} ${row.name} ${row.sourceUrl}`),
    source: "zignature_sitemap",
  }, { includeAmbiguous: false });
  if (inferred.length === 1 && inferred[0] === "dog") return inferred;
  return ["dog"];
}

function isCandidateFoodRow(row) {
  const text = normalizeText(`${row.brand} ${row.name} ${row.sourceUrl} ${row.retailerProductId} ${row.form}`);
  const petTypes = inferZignaturePetTypes(row);
  if (!/^https:\/\/zignature\.com\/products\//i.test(row.sourceUrl)) return false;
  if (petTypes.length !== 1 || petTypes[0] !== "dog") return false;
  if (!["dry", "wet", "fresh"].includes(row.form)) return false;
  if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  if (NON_FOOD_TERMS.some((term) => hasTerm(text, term))) return false;
  return CORE_FOOD_TERMS.some((term) => hasTerm(text, term));
}

function addSpeciesQualifier(name) {
  const text = normalizeText(name);
  if (!/\b(dog|dogs|puppy|puppies|canine)\b/.test(text)) return `${name} for Dogs`;
  return name;
}

function normalizeTarget(row) {
  const petTypes = inferZignaturePetTypes(row);
  if (petTypes.length !== 1) return null;
  const name = addSpeciesQualifier(cleanProductName(row.name));
  const cacheKey = normalizeCacheKey(`${row.brand} ${name}`);
  if (!cacheKey) return null;
  return {
    name,
    brand: row.brand,
    petType: "dog",
    petTypes,
    explicitPetType: true,
    cacheKey,
    source: "zignature_sitemap_export",
    sourceQuality: "official_brand_sitemap_slug",
    sourceUrl: row.sourceUrl,
    imageUrl: "",
    barcode: "",
    retailerProductId: row.retailerProductId,
    form: row.form,
    sourceSitemap: row.sourceSitemap,
    sourceBrand: SOURCE_BRAND,
    searchTerms: [...new Set([`${row.brand} ${name}`, name, row.sourceUrl].filter(Boolean))],
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
  const byBrand = new Map();
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
    byBrand.set(target.brand, (byBrand.get(target.brand) || 0) + 1);
  }
  return {
    byPetType: [...byPetType.entries()]
      .map(([petType, count]) => ({ petType, count }))
      .sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
    byBrand: [...byBrand.entries()]
      .map(([brand, count]) => ({ brand, count }))
      .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand)),
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
    String(a.brand).localeCompare(String(b.brand)) ||
    String(a.name).localeCompare(String(b.name)) ||
    String(a.cacheKey).localeCompare(String(b.cacheKey))
  );

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: "zignature_product_sitemap",
    sitemapUrl,
    includeExisting,
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

  console.log(`Zignature products scanned: ${scannedProducts}`);
  console.log(`Existing product_data keys: ${existing.size}`);
  console.log(`Missing Zignature sitemap targets exported: ${targets.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("Zignature sitemap catalog target export failed:", err.message);
  process.exit(1);
});
