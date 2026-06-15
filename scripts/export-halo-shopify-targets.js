#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_SITEMAP_INDEX_URL = "https://halopets.com/sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/halo-shopify-catalog-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof catalog coverage export";
const BRAND = "Halo";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const sitemapIndexArg = process.argv.find((arg) => arg.startsWith("--sitemap-index="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const includeExisting = process.argv.includes("--include-existing");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const sitemapIndexUrl = sitemapIndexArg ? sitemapIndexArg.split("=").slice(1).join("=").trim() : DEFAULT_SITEMAP_INDEX_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const CORE_FOOD_TERMS = [
  "dog food", "cat food", "puppy food", "kitten food",
  "dry dog food", "dry cat food", "wet dog food", "wet cat food",
  "dry food", "wet food", "canned food", "kibble", "pate", "paté",
  "stew", "recipe", "homestyle", "healthy grains", "grain free",
];

const REJECT_TERMS = [
  "treat", "treats", "chew", "chews", "snack", "snacks", "topper",
  "toppers", "supplement", "supplements", "bone broth",
  "dental", "jerky", "biscuit", "biscuits", "bundle", "variety pack",
  "meal plan", "gift", "trial", "sample",
];

const NON_FOOD_TERMS = [
  "toy", "toys", "leash", "collar", "harness", "bowl", "feeder",
  "fountain", "litter", "wipes", "shampoo", "spray", "apparel",
  "storage", "scoop", "replacement", "refill", "blog", "page",
  "collection", "subscribe", "store locator", "faq",
];

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:halo-shopify-catalog -- --output=.tmp/halo-shopify-catalog-targets.json

Options:
  --output=path.json           Write a backfill-compatible target manifest (default ${DEFAULT_OUTPUT})
  --sitemap-index=url          Explicit Halo Shopify sitemap index URL (${DEFAULT_SITEMAP_INDEX_URL})
  --limit=N                    Stop after N missing targets are collected (default 0, no limit)
  --include-existing           Include targets already present in product_data for audit only
  --skip-existing-scan         Skip product_data alias reads for smoke/debug exports only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  }
  if (!Number.isFinite(limit) || limit < 0) usage("--limit must be a non-negative number.");
  if (!/^https:\/\/halopets\.com\/sitemap\.xml$/i.test(sitemapIndexUrl)) {
    usage("--sitemap-index must be https://halopets.com/sitemap.xml.");
  }
}

function decodeXml(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
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

function decodeUrl(value) {
  const decoded = decodeXml(value);
  try {
    return decodeURI(decoded);
  } catch {
    return decoded;
  }
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
    .replace(/\b\d+(\.\d+)?(\s+)?(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|can|cans|bag|bags|case|pack|pk|ct|count|tray|trays|pouch|pouches|box|boxes)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanProductName(value) {
  return asciiFold(decodeXml(value))
    .replace(/™|®|©/g, "")
    .replace(/\bHalo\b\s*/gi, "")
    .replace(/\s*,?\s*(?:case of|pack of)\s*\d+\b.*$/i, "")
    .replace(/\s*,?\s*\d+(\.\d+)?\s*-?\s*(?:oz|fl\s*-?\s*oz|lb|lbs|kg|g|pound|ounce)s?\s*(?:bag|can|tray|pouch|box|tub|bottle|carton|cup)?\b.*$/i, "")
    .replace(/\s*,?\s*\d+\s*(?:count|ct|pack|pk)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function cleanProductUrl(value) {
  const url = decodeUrl(value).split("#")[0].replace(/\/$/, "");
  if (!/^https:\/\/halopets\.com\/products\/[^/?#]+$/i.test(url)) return "";
  return url;
}

function cleanImageUrl(value) {
  const url = decodeXml(value);
  if (!/^https:\/\/cdn\.shopify\.com\//i.test(url)) return "";
  return url.slice(0, 500);
}

function productHandleFromUrl(url) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).pop() || "";
  } catch {
    return "";
  }
}

function inferHaloPetType(row) {
  const text = normalizeText(`${row.title} ${row.sourceUrl}`);
  if (/\b(cat|cats|kitten|kittens|feline)\b/.test(text)) return "cat";
  if (/\b(dog|dogs|puppy|puppies|canine)\b/.test(text)) return "dog";
  return "";
}

function formFromTitle(title) {
  const text = normalizeText(title);
  if (
    hasTerm(text, "wet food") ||
    hasTerm(text, "wet dog food") ||
    hasTerm(text, "wet cat food") ||
    hasTerm(text, "stew") ||
    hasTerm(text, "pate")
  ) return "wet";
  if (
    hasTerm(text, "dry food") ||
    hasTerm(text, "dry dog food") ||
    hasTerm(text, "dry cat food") ||
    hasTerm(text, "dry puppy food") ||
    hasTerm(text, "dry kitten food") ||
    hasTerm(text, "kibble")
  ) return "dry";
  return "";
}

function addSpeciesQualifier(name, petType) {
  const text = normalizeText(name);
  if (petType === "cat" && !/\b(cat|cats|kitten|kittens|feline)\b/.test(text)) return `${name} for Cats`;
  if (petType === "dog" && !/\b(dog|dogs|puppy|puppies|canine)\b/.test(text)) return `${name} for Dogs`;
  return name;
}

function isCandidateFoodRow(row) {
  const text = normalizeText(`${row.title} ${row.sourceUrl}`);
  if (!/^https:\/\/halopets\.com\/products\//i.test(row.sourceUrl)) return false;
  if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  if (NON_FOOD_TERMS.some((term) => hasTerm(text, term))) return false;
  if (!CORE_FOOD_TERMS.some((term) => hasTerm(text, term))) return false;
  const petType = inferHaloPetType(row);
  if (!petType) return false;
  return ["dry", "wet"].includes(formFromTitle(row.title));
}

function normalizeTarget(row) {
  const petType = inferHaloPetType(row);
  const name = addSpeciesQualifier(cleanProductName(row.title), petType);
  const form = formFromTitle(row.title);
  const petTypes = inferPetTypes({
    brand: BRAND,
    product_name: `${petType} ${name} ${row.sourceUrl}`,
    cache_key: normalizeCacheKey(`${BRAND} ${petType} ${name} ${row.sourceUrl}`),
    source: "halo_shopify_sitemap",
  }, { includeAmbiguous: false });
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
    source: "halo_shopify_sitemap_export",
    sourceQuality: "official_brand_shopify_sitemap",
    sourceUrl: row.sourceUrl,
    imageUrl: row.imageUrl,
    barcode: "",
    retailerProductId: productHandleFromUrl(row.sourceUrl),
    form,
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
    if (!response.ok) throw new Error(`Halo sitemap fetch failed ${response.status}: ${url}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractLocs(xml) {
  return [...String(xml || "").matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => decodeXml(match[1]))
    .filter(Boolean);
}

function parseProductRows(xml, sourceSitemap) {
  return [...String(xml || "").matchAll(/<url>([\s\S]*?)<\/url>/gi)]
    .map((match) => {
      const block = match[1];
      const sourceUrl = cleanProductUrl(block.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1]);
      if (!sourceUrl) return null;
      const title = cleanProductName(block.match(/<image:title>([\s\S]*?)<\/image:title>/i)?.[1]);
      if (!title) return null;
      return {
        sourceUrl,
        title,
        imageUrl: cleanImageUrl(block.match(/<image:loc>([\s\S]*?)<\/image:loc>/i)?.[1]),
        sourceSitemap,
      };
    })
    .filter(Boolean);
}

async function fetchExistingCacheKeys() {
  if (skipExistingScan) return new Set();
  const keys = new Set();
  const base = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/product_data`;
  for (let from = 0; ; from += REST_PAGE_SIZE) {
    const response = await fetch(`${base}?select=cache_key,product_name,brand&order=cache_key.asc`, {
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
  const bySitemap = new Map();
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
    byForm.set(target.form, (byForm.get(target.form) || 0) + 1);
    bySitemap.set(target.sourceSitemap, (bySitemap.get(target.sourceSitemap) || 0) + 1);
  }
  const summarize = (map, keyName) => [...map.entries()]
    .map(([key, count]) => ({ [keyName]: key, count }))
    .sort((a, b) => b.count - a.count || String(a[keyName]).localeCompare(String(b[keyName])));
  return {
    byPetType: summarize(byPetType, "petType"),
    byForm: summarize(byForm, "form"),
    bySitemap: summarize(bySitemap, "sourceSitemap"),
  };
}

async function main() {
  assertConfig();

  const existing = await fetchExistingCacheKeys();
  const indexXml = await fetchText(sitemapIndexUrl);
  const sitemapUrls = extractLocs(indexXml)
    .filter((url) => /^https:\/\/halopets\.com\/sitemap_products_\d+\.xml(?:\?[^#]+)?$/i.test(url));
  if (sitemapUrls.length === 0) {
    throw new Error("No Halo product sitemap URLs found in sitemap index.");
  }

  const skipped = {
    nonFood: 0,
    existing: 0,
    duplicate: 0,
    invalid: 0,
  };
  const byKey = new Map();
  let scannedProducts = 0;
  let sitemapsFetched = 0;

  for (const sitemapUrl of sitemapUrls) {
    const xml = await fetchText(sitemapUrl);
    sitemapsFetched++;
    const rows = parseProductRows(xml, sitemapUrl);
    for (const row of rows) {
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
    if (limit > 0 && byKey.size >= limit) break;
  }

  const targets = [...byKey.values()].sort((a, b) =>
    String(a.petType).localeCompare(String(b.petType)) ||
    String(a.form).localeCompare(String(b.form)) ||
    String(a.name).localeCompare(String(b.name)) ||
    String(a.cacheKey).localeCompare(String(b.cacheKey))
  );

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: "halo_shopify_sitemap",
    sitemapIndexUrl,
    includeExisting,
    sitemapsFetched,
    scannedProducts,
    existingCount: existing.size,
    missingCount: targets.length,
    skipped,
    summary: summarizeTargets(targets),
    targets,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`Halo sitemaps fetched: ${sitemapsFetched}`);
  console.log(`Halo products scanned: ${scannedProducts}`);
  console.log(`Existing product_data keys: ${existing.size}`);
  console.log(`Missing Halo sitemap targets exported: ${targets.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("Halo Shopify catalog target export failed:", err.message);
  process.exit(1);
});
