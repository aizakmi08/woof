#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_SITEMAP_URL = "https://tikipets.com/sitemap.xml";
const DEFAULT_PRODUCT_SITEMAP_URL = "https://tikipets.com/product-sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/tikipets-sitemap-catalog-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof catalog coverage export";
const SOURCE_BRAND = "Tiki Pets";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const sitemapArg = process.argv.find((arg) => arg.startsWith("--sitemap="));
const productSitemapArg = process.argv.find((arg) => arg.startsWith("--product-sitemap="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const includeExisting = process.argv.includes("--include-existing");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const sitemapUrl = sitemapArg ? sitemapArg.split("=").slice(1).join("=").trim() : DEFAULT_SITEMAP_URL;
const productSitemapUrl = productSitemapArg ? productSitemapArg.split("=").slice(1).join("=").trim() : DEFAULT_PRODUCT_SITEMAP_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const CORE_FOOD_TERMS = [
  "dog wet food", "dog dry food", "tiki dog", "tiki cat wet food", "tiki cat dry food",
  "wet food", "dry food", "mousse", "shredded cat", "senior cat", "senior dog",
  "kitten", "puppy", "pate", "luau", "grill", "after dark", "aloha", "variety pack",
  "multipack", "recipe", "chicken", "beef", "turkey", "duck", "lamb", "salmon",
  "tuna", "fish", "mackerel", "sardine", "tilapia", "seabass", "pumpkin",
];
const REJECT_PATH_TERMS = [
  "meal toppers", "tiki dog meal toppers", "tiki cat treats", "treats", "stix",
  "soft chewy", "duets", "functional toppers", "protein boosters", "flavor boosters",
  "complements", "filets", "supplements", "solutions digestion", "solutions skin coat",
  "solutions mobility",
];
const REJECT_NAME_TERMS = [
  "treat", "treats", "stix", "stick", "sticks", "soft chewy", "duets",
  "meal topper", "topper", "toppers", "protein booster", "flavor booster",
  "functional topper", "complement", "complements", "filet", "filets",
  "bisque", "supplement", "supplements", "solution digestion", "solution mobility",
  "solution skin coat", "mega jar", "toy", "litter",
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
  npm run export:tikipets-sitemap-catalog -- --output=.tmp/tikipets-sitemap-catalog-targets.json

Options:
  --output=path.json          Write a backfill-compatible target manifest (default ${DEFAULT_OUTPUT})
  --sitemap=url               Explicit Tiki Pets sitemap index URL (${DEFAULT_SITEMAP_URL})
  --product-sitemap=url       Explicit Tiki Pets product sitemap URL (${DEFAULT_PRODUCT_SITEMAP_URL})
  --limit=N                   Stop after N missing targets are collected (default 0, no limit)
  --include-existing          Include targets already present in product_data for audit only
  --skip-existing-scan        Skip product_data alias reads for smoke/debug exports only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  }
  if (!Number.isFinite(limit) || limit < 0) usage("--limit must be a non-negative number.");
  if (!/^https:\/\/tikipets\.com\/sitemap\.xml$/i.test(sitemapUrl)) {
    usage("--sitemap must be https://tikipets.com/sitemap.xml.");
  }
  if (!/^https:\/\/tikipets\.com\/product-sitemap\.xml$/i.test(productSitemapUrl)) {
    usage("--product-sitemap must be https://tikipets.com/product-sitemap.xml.");
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
    .replace(/[-_/]+/g, " ")
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
    .replace(/\bTiki\b/g, "Tiki")
    .replace(/\bOz\b/g, "oz")
    .replace(/\bCt\b/g, "ct")
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
  if (!/^https:\/\/tikipets\.com\/product\/tiki-(cat|dog)(\/[a-z0-9-]+)+$/i.test(url)) return "";
  return url;
}

function parsedProductPath(url) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 3) return null;
    const [product, brandSegment, ...rest] = segments;
    if (product !== "product" || !/^tiki-(cat|dog)$/.test(brandSegment) || rest.length < 1) return null;
    return { brandSegment, rest, slug: rest[rest.length - 1] };
  } catch {
    return null;
  }
}

function productNameFromPath(parsed) {
  const useful = parsed.rest
    .filter((segment) => !/^tiki-(cat|dog)$/.test(segment))
    .filter((segment) => !/^(tiki-cat-wet-food|tiki-cat-dry-food|dog-wet-food|dog-dry-food)$/.test(segment))
    .slice(-4);
  return cleanProductName(useful.join(" ")
    .replace(/--+/g, "-")
    .replace(/-/g, " ")
    .replace(/^tiki\s+(cat|dog)\s+/i, ""));
}

function brandFromPath(parsed) {
  return parsed.brandSegment === "tiki-dog" ? "Tiki Dog" : "Tiki Cat";
}

function formFromPath(parsed) {
  const text = normalizeText(parsed.rest.join(" "));
  if (hasTerm(text, "dry food") || hasTerm(text, "dog dry food") || hasTerm(text, "tiki cat dry food")) return "dry";
  if (hasTerm(text, "wet food") || hasTerm(text, "dog wet food") || hasTerm(text, "tiki cat wet food")) return "wet";
  if (hasTerm(text, "mousse")) return "wet";
  return "";
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
    if (!response.ok) throw new Error(`Tiki Pets sitemap fetch failed ${response.status}: ${url}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseLocs(xml) {
  return [...String(xml || "").matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => decodeXml(match[1]))
    .filter(Boolean);
}

function parseProductRows(xml) {
  return parseLocs(xml)
    .map((loc) => {
      const sourceUrl = cleanUrl(loc);
      const parsed = sourceUrl ? parsedProductPath(sourceUrl) : null;
      if (!sourceUrl || !parsed) return null;
      const name = productNameFromPath(parsed);
      if (!name) return null;
      return {
        sourceUrl,
        name,
        brand: brandFromPath(parsed),
        retailerProductId: parsed.rest.join("/"),
        brandSegment: parsed.brandSegment,
        pathSegments: parsed.rest,
        form: formFromPath(parsed),
        sourceSitemap: productSitemapUrl,
      };
    })
    .filter(Boolean);
}

function inferTikiPetTypes(row) {
  if (row.brandSegment === "tiki-dog") return ["dog"];
  if (row.brandSegment === "tiki-cat") return ["cat"];
  const inferred = inferPetTypes({
    brand: row.brand,
    product_name: row.name,
    cache_key: normalizeCacheKey(`${row.brand} ${row.name} ${row.sourceUrl}`),
    source: "tikipets_sitemap",
  }, { includeAmbiguous: false });
  return inferred.filter((petType) => petType === "dog" || petType === "cat");
}

function isCandidateFoodRow(row) {
  const pathText = normalizeText(`${row.brandSegment} ${row.pathSegments.join(" ")}`);
  const nameText = normalizeText(`${row.name} ${row.sourceUrl} ${row.retailerProductId} ${row.form}`);
  const petTypes = inferTikiPetTypes(row);
  if (!/^https:\/\/tikipets\.com\/product\/tiki-(cat|dog)\//i.test(row.sourceUrl)) return false;
  if (petTypes.length !== 1) return false;
  if (REJECT_PATH_TERMS.some((term) => hasTerm(pathText, term))) return false;
  if (REJECT_NAME_TERMS.some((term) => hasTerm(nameText, term))) return false;
  if (NON_FOOD_TERMS.some((term) => hasTerm(nameText, term))) return false;
  return CORE_FOOD_TERMS.some((term) => hasTerm(pathText, term) || hasTerm(nameText, term));
}

function addSpeciesQualifier(name, petType) {
  const text = normalizeText(name);
  if (petType === "dog" && !/\b(dog|dogs|puppy|puppies|canine)\b/.test(text)) return `${name} for Dogs`;
  if (petType === "cat" && !/\b(cat|cats|kitten|kittens|feline)\b/.test(text)) return `${name} for Cats`;
  return name;
}

function normalizeTarget(row) {
  const petTypes = inferTikiPetTypes(row);
  if (petTypes.length !== 1) return null;
  const name = addSpeciesQualifier(cleanProductName(row.name), petTypes[0]);
  const brand = row.brand;
  const cacheKey = normalizeCacheKey(`${brand} ${name}`);
  if (!cacheKey) return null;
  return {
    name,
    brand,
    sourceBrand: SOURCE_BRAND,
    petType: petTypes[0],
    petTypes,
    explicitPetType: true,
    cacheKey,
    source: "tikipets_sitemap_export",
    sourceQuality: "official_brand_sitemap_slug",
    sourceUrl: row.sourceUrl,
    imageUrl: "",
    barcode: "",
    retailerProductId: row.retailerProductId,
    form: row.form,
    sourceSitemap: row.sourceSitemap,
    searchTerms: [...new Set([`${brand} ${name}`, `${SOURCE_BRAND} ${name}`, name, row.sourceUrl].filter(Boolean))],
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
  const indexXml = await fetchText(sitemapUrl);
  const productSitemaps = parseLocs(indexXml).filter((url) => url === productSitemapUrl);
  if (productSitemaps.length !== 1) throw new Error(`Tiki Pets product sitemap missing from index: ${productSitemapUrl}`);

  const xml = await fetchText(productSitemapUrl);
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
    String(a.brand).localeCompare(String(b.brand)) ||
    String(a.name).localeCompare(String(b.name)) ||
    String(a.cacheKey).localeCompare(String(b.cacheKey))
  );

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: "tikipets_product_sitemap",
    sitemapUrl,
    productSitemaps,
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

  console.log(`Tiki Pets products scanned: ${scannedProducts}`);
  console.log(`Product sitemaps scanned: ${productSitemaps.length}`);
  console.log(`Existing product_data keys: ${existing.size}`);
  console.log(`Missing Tiki Pets sitemap targets exported: ${targets.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("Tiki Pets sitemap catalog target export failed:", err.message);
  process.exit(1);
});
