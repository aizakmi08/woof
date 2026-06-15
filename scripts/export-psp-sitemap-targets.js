#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_SITEMAP_INDEX_URL = "https://www.petsuppliesplus.com/sitemap.xml";
const DEFAULT_SITEMAP_URL = "https://edge.sitecorecloud.io/petsupplies9cf0-petsuppliesplus-prod-d6e8/media/Project/PetSuppliesPlus/psp/Sitemaps/psp-custom/sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/psp-sitemap-catalog-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "WoofApp/1.1 catalog coverage export (contact: support@woof.app)";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const sitemapIndexArg = process.argv.find((arg) => arg.startsWith("--sitemap-index="));
const sitemapArg = process.argv.find((arg) => arg.startsWith("--sitemap="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const includeExisting = process.argv.includes("--include-existing");
const includeTreats = process.argv.includes("--include-treats");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const sitemapIndexUrl = sitemapIndexArg ? sitemapIndexArg.split("=").slice(1).join("=").trim() : DEFAULT_SITEMAP_INDEX_URL;
const explicitSitemapUrl = sitemapArg ? sitemapArg.split("=").slice(1).join("=").trim() : "";
const configuredSitemapUrl = explicitSitemapUrl || DEFAULT_SITEMAP_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const CORE_FOOD_PATHS = [
  "/categories/dog/food/",
  "/categories/cat/food/",
];

const CORE_FOOD_TERMS = [
  "dog food", "cat food", "puppy food", "kitten food",
  "dry food", "wet food", "canned food", "fresh food",
  "freeze-dried", "freeze dried", "air-dried", "air dried",
  "dehydrated", "kibble", "pate", "paté", "stew", "entree", "entrée",
  "meal topper", "food topper", "topper", "broth", "gravy", "morsels",
  "recipe", "dinner", "chunks in gravy", "minced", "shreds", "loaf",
  "raw", "refrigerated", "frozen",
];

const TREAT_TERMS = [
  "treat", "treats", "chew", "chews", "jerky", "biscuits", "cookies",
  "dental", "bone", "bones", "bully stick", "rawhide",
];

const NON_FOOD_TERMS = [
  "toy", "leash", "collar", "harness", "bed", "crate", "kennel", "playpen",
  "bowl", "feeder", "fountain", "filter", "pump", "litter", "wipes", "shampoo",
  "conditioner", "spray", "brush", "comb", "nail", "diaper", "bandage",
  "apparel", "sweater", "costume", "carrier", "ramp", "gate", "door", "mat",
  "storage container", "scoop", "lid", "replacement", "refill", "stain", "odor",
  "remover", "wound", "hot spot", "supplement", "probiotic", "vitamin",
];

const BRAND_HINTS = [
  "ACANA", "Almo Nature", "A Pup Above", "Applaws", "Blue Buffalo", "Blue Wilderness",
  "Canidae", "Cesar", "Diamond Naturals", "Eukanuba", "Fancy Feast", "Farmina",
  "Friskies", "Freshpet", "Fromm", "Fussie Cat", "Hill's Prescription Diet",
  "Hill's Science Diet", "IAMS", "Instinct", "Merrick", "Meow Mix",
  "Natural Balance", "Nature's Recipe", "Nulo", "NutriSource", "Open Farm",
  "Orijen", "Pedigree", "Primal", "Purina Beneful", "Purina Cat Chow",
  "Purina Dog Chow", "Purina ONE", "Purina Pro Plan", "Purina", "Redford Naturals",
  "Royal Canin", "Sheba", "Solid Gold", "Stella & Chewy's", "Taste of the Wild",
  "The Honest Kitchen", "Tiki Cat", "Vital Essentials", "Wellness CORE",
  "Wellness", "Weruva", "Ziwi Peak",
].sort((a, b) => b.length - a.length);

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:psp-sitemap-catalog -- --output=.tmp/psp-sitemap-catalog-targets.json

Options:
  --output=path.json      Write a backfill-compatible target manifest (default ${DEFAULT_OUTPUT})
  --sitemap-index=url     Discover the Sitecore sitemap from PSP's public index (${DEFAULT_SITEMAP_INDEX_URL})
  --sitemap=url           Explicit PSP sitemap URL (default direct Sitecore sitemap). Overrides sitemap-index.
  --limit=N               Stop after N missing targets are collected (default 0, no limit)
  --include-existing      Include targets already present in product_data for audit only
  --include-treats        Include treat/chew URLs in addition to core food URLs
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
  if (sitemapIndexArg && !/^https:\/\/www\.petsuppliesplus\.com\/sitemap\.xml$/i.test(sitemapIndexUrl)) {
    usage("--sitemap-index must be https://www.petsuppliesplus.com/sitemap.xml.");
  }
  if (!/^https:\/\/edge\.sitecorecloud\.io\/[^?#]+\/sitemap\.xml$/i.test(configuredSitemapUrl)) {
    usage("--sitemap must be the PSP Sitecore sitemap XML URL.");
  }
}

function decodeXml(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&#\d+;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
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

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9\s&'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasTerm(text, term) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  if (normalizedTerm.includes(" ")) return text.includes(normalizedTerm);
  return new RegExp(`(^|[^a-z0-9])${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text);
}

function cleanUrl(value) {
  const url = decodeXml(value);
  if (!/^https:\/\/www\.petsuppliesplus\.com\//i.test(url)) return "";
  try {
    const parsed = new URL(url);
    const pathName = parsed.pathname.toLowerCase();
    if (!CORE_FOOD_PATHS.some((segment) => pathName.startsWith(segment))) return "";
    if (!/\/\d+$/i.test(parsed.pathname)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function cleanProductName(value) {
  return decodeXml(value)
    .replace(/\s*,?\s*(?:case of|pack of)\s*\d+\b.*$/i, "")
    .replace(/\s*,?\s*\d+(\.\d+)?\s*-?\s*(?:oz|fl\s*-?\s*oz|lb|lbs|kg|g|pound|ounce)s?\s*(?:bag|can|tray|pouch|box|tub|bottle|carton|cup)?\b.*$/i, "")
    .replace(/\s*,?\s*\d+\s*(?:count|ct|pack|pk)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function productNameFromUrl(url) {
  const parsed = new URL(url);
  const parts = parsed.pathname.split("/").filter(Boolean);
  const slug = parts[parts.length - 2] || "";
  return cleanProductName(
    decodeURIComponent(slug)
      .replace(/-/g, " ")
      .replace(/\bs\b/g, "s")
  );
}

function inferBrand(name) {
  const normalizedName = normalizeText(name);
  const match = BRAND_HINTS.find((brand) => {
    const normalizedBrand = normalizeText(brand);
    return normalizedName === normalizedBrand || normalizedName.startsWith(`${normalizedBrand} `);
  });
  return match || "";
}

function productIdFromUrl(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch {
    return "";
  }
}

function skuFromUrl(url) {
  try {
    return new URL(url).searchParams.get("sku") || "";
  } catch {
    return "";
  }
}

function extractSitemapLocs(xml) {
  return [...String(xml || "").matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => decodeXml(match[1]))
    .filter((url) => /^https:\/\/edge\.sitecorecloud\.io\/[^?#]+\/sitemap\.xml$/i.test(url))
    .filter((url, index, list) => list.indexOf(url) === index);
}

function parseProductUrls(xml, sitemapUrl) {
  const rows = [];
  for (const match of String(xml || "").matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const block = match[1];
    const sourceUrl = cleanUrl(block.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1]);
    if (!sourceUrl) continue;
    const name = productNameFromUrl(sourceUrl);
    if (!name) continue;
    rows.push({
      sourceUrl,
      name,
      productId: productIdFromUrl(sourceUrl),
      sku: skuFromUrl(sourceUrl),
      sitemapUrl,
    });
  }
  return rows;
}

function isCandidateFoodUrl(row) {
  const parsed = new URL(row.sourceUrl);
  const pathName = parsed.pathname.toLowerCase();
  if (!CORE_FOOD_PATHS.some((segment) => pathName.startsWith(segment))) return false;
  if (!includeTreats && pathName.includes("/treats/")) return false;
  const text = normalizeText(row.name);
  const hasPetSignal = inferPetTypes({
    product_name: row.name,
    cache_key: normalizeCacheKey(row.name),
    source: "psp_sitemap",
  }, { includeAmbiguous: false }).length > 0;
  if (!hasPetSignal) return false;
  if (NON_FOOD_TERMS.some((term) => hasTerm(text, term))) return false;
  const coreFood = CORE_FOOD_TERMS.some((term) => hasTerm(text, term));
  const treat = includeTreats && TREAT_TERMS.some((term) => hasTerm(text, term));
  return coreFood || treat;
}

function normalizeTarget(row) {
  const name = cleanProductName(row.name);
  const cacheKey = normalizeCacheKey(name);
  if (!cacheKey) return null;
  const brand = inferBrand(name);
  const petTypes = inferPetTypes({
    product_name: name,
    cache_key: cacheKey,
    source: "psp_sitemap",
  }, { includeAmbiguous: false });
  if (petTypes.length === 0) return null;
  return {
    name,
    brand,
    petType: petTypes[0],
    petTypes,
    explicitPetType: true,
    cacheKey,
    source: "psp_sitemap_export",
    sourceQuality: "retailer_sitemap_title",
    sourceUrl: row.sourceUrl,
    imageUrl: "",
    barcode: row.sku || "",
    retailerProductId: row.productId,
    sourceSitemap: row.sitemapUrl,
    searchTerms: [...new Set([name, row.sourceUrl, row.sku].filter(Boolean))],
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
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`PSP sitemap fetch failed ${response.status}: ${url}`);
  }
  return response.text();
}

async function resolveSitemapUrl() {
  if (explicitSitemapUrl) return explicitSitemapUrl;
  if (!sitemapIndexArg) return DEFAULT_SITEMAP_URL;
  const indexXml = await fetchText(sitemapIndexUrl);
  const discovered = extractSitemapLocs(indexXml);
  if (discovered.length === 0) {
    throw new Error("PSP sitemap index did not expose a Sitecore sitemap URL.");
  }
  return discovered[0];
}

async function fetchExistingCacheKeys() {
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
  const byCategory = new Map();
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
    const category = target.sourceUrl.split("/").slice(3, 7).join("/");
    byCategory.set(category, (byCategory.get(category) || 0) + 1);
  }
  return {
    byPetType: [...byPetType.entries()]
      .map(([petType, count]) => ({ petType, count }))
      .sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
    byCategory: [...byCategory.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
  };
}

async function main() {
  assertConfig();

  const existing = await fetchExistingCacheKeys();
  const skipped = {
    nonFood: 0,
    existing: 0,
    duplicate: 0,
    invalid: 0,
  };
  const byKey = new Map();
  let scannedProducts = 0;
  const sitemapUrl = await resolveSitemapUrl();
  const xml = await fetchText(sitemapUrl);
  const rows = parseProductUrls(xml, sitemapUrl);

  for (const row of rows) {
    scannedProducts++;
    if (!isCandidateFoodUrl(row)) {
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
    source: "psp_product_sitemap",
    sitemapIndexUrl,
    sitemapUrl,
    explicitSitemapUrl,
    includeExisting,
    includeTreats,
    scannedProducts,
    existingCount: existing.size,
    missingCount: targets.length,
    skipped,
    summary: summarizeTargets(targets),
    targets,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`PSP products scanned: ${scannedProducts}`);
  console.log(`Existing product_data keys: ${existing.size}`);
  console.log(`Missing PSP sitemap targets exported: ${targets.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("PSP sitemap catalog target export failed:", err.message);
  process.exit(1);
});
