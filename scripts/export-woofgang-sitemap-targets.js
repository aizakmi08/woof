#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_SITEMAP_URL = "https://shop.woofgangbakery.com/sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/woofgang-sitemap-catalog-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof catalog coverage export";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const sitemapArg = process.argv.find((arg) => arg.startsWith("--sitemap="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const includeExisting = process.argv.includes("--include-existing");
const includeTreats = process.argv.includes("--include-treats");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const sitemapUrl = sitemapArg ? sitemapArg.split("=").slice(1).join("=").trim() : DEFAULT_SITEMAP_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const CORE_FOOD_TERMS = [
  "dog food", "cat food", "puppy food", "kitten food", "dry dog", "dry cat",
  "cat dry", "dog dry", "cat can", "dog can", "can pate", "can p t",
  "can stew", "can shredded", "can digestive", "canned", "pate", "paté",
  "p t", "entree", "entr e", "entrée", "formula", "recipe", "kibble",
  "frozen nuggets", "frozen pronto", "fd food", "freeze dried food",
  "raw frozen", "primal raw", "large breed", "small breed", "puppy",
  "kitten", "senior", "adult", "weight management",
];

const TREAT_TERMS = [
  "treat", "treats", "chew", "chews", "cookie", "cookies", "cake", "cakes",
  "ice cream", "ice", "scoops", "biscuit", "biscuits", "dental", "stick",
  "sticks", "bone", "bones", "bully", "jerky", "trainer", "trainers",
  "snack", "snacks", "trt", "purrsnackitty", "whimzees", "cake mix", "cuppy cake",
  "birthday cake", "bakery", "brushy sticks",
];

const SUPPLEMENTAL_FOOD_TERMS = [
  "topper", "toppers", "mixer", "mixers", "broth", "bone broth", "goat milk",
  "goat s milk", "instant goat", "daily booster", "daily boosters",
  "supplement", "supplements", "vitamin", "cbd", "oil for cats", "meal enhancer",
  "pumpkin patch up", "butcher s blend", "butchers blend",
];

const NON_FOOD_TERMS = [
  "gift card", "toy", "toys", "ball", "plush", "collar", "leash", "harness",
  "bed", "bowl", "feeder", "wipes", "shampoo", "litter", "flea", "tick",
  "slicker", "brush", "comb", "cookie cutter", "apparel", "spa", "diamond dog",
  "waterless", "repellent", "spot on", "odor lock", "cat litter",
];

const BRAND_HINTS = [
  "ACANA", "Annamaet", "BIXBI", "Blue Buffalo", "Bocce's Bakery", "Canidae",
  "Earth Animal", "Farmina", "Fromm", "Fussie Cat", "Grandma Lucy's",
  "Green Juju", "Honest Kitchen", "Instinct", "Lotus", "Merrick", "Nulo",
  "Open Farm", "Orijen", "Primal", "Rawz", "Stella & Chewy's", "Tiki Cat",
  "Tiki Dog", "Vital Essentials", "Weruva", "Wellness", "Ziwi Peak",
].sort((a, b) => b.length - a.length);

const BRAND_PREFIX_ALIASES = [
  ["acana", "ACANA"],
  ["bixbi", "BIXBI"],
  ["blue buffalo", "Blue Buffalo"],
  ["bocce s bakery", "Bocce's Bakery"],
  ["ea", "Earth Animal"],
  ["earth animal", "Earth Animal"],
  ["farmina", "Farmina"],
  ["fromm", "Fromm"],
  ["fussie cat", "Fussie Cat"],
  ["gl", "Grandma Lucy's"],
  ["grandma lucy s", "Grandma Lucy's"],
  ["green juju", "Green Juju"],
  ["honest kitchen", "Honest Kitchen"],
  ["nulo", "Nulo"],
  ["open farm", "Open Farm"],
  ["orijen", "Orijen"],
  ["primal", "Primal"],
  ["primal raw", "Primal"],
  ["rawz", "Rawz"],
  ["stella chewy s", "Stella & Chewy's"],
  ["stella chewys", "Stella & Chewy's"],
  ["tiki cat", "Tiki Cat"],
  ["tiki dog", "Tiki Dog"],
  ["ve", "Vital Essentials"],
  ["vital essentials", "Vital Essentials"],
  ["weruva", "Weruva"],
  ["wellness", "Wellness"],
  ["ziwi peak", "Ziwi Peak"],
].sort((a, b) => b[0].length - a[0].length);

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:woofgang-sitemap-catalog -- --output=.tmp/woofgang-sitemap-catalog-targets.json

Options:
  --output=path.json      Write a backfill-compatible target manifest (default ${DEFAULT_OUTPUT})
  --sitemap=url           Woof Gang Bakery sitemap URL (${DEFAULT_SITEMAP_URL})
  --limit=N               Stop after N missing targets are collected (default 0, no limit)
  --include-existing      Include targets already present in product_data for audit only
  --include-treats        Include treat/chew URLs in addition to core food URLs
  --skip-existing-scan    Skip product_data alias reads for smoke/debug exports only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  }
  if (!Number.isFinite(limit) || limit < 0) usage("--limit must be a non-negative number.");
  if (!/^https:\/\/shop\.woofgangbakery\.com\/sitemap\.xml$/i.test(sitemapUrl)) {
    usage("--sitemap must be https://shop.woofgangbakery.com/sitemap.xml.");
  }
}

function decodeXml(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/&#\d+;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
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
    .replace(/['’]/g, " ")
    .replace(/_/g, " ")
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
    .replace(/_/g, " ")
    .replace(/\b(dog food|cat food|formula|recipe|food for dogs|food for cats)\b/gi, "")
    .replace(/\bw\b/g, "with")
    .replace(/[-/&+]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b\d+(\s+)?(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|can|cans|bag|bags|case|pack|pk|ct|count|tray|trays|pouch|pouches|box|boxes)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseProductName(value) {
  const smallWords = new Set(["and", "or", "of", "for", "in", "with", "to", "the", "a", "la", "n"]);
  return String(value || "")
    .replace(/_/g, " ")
    .split(/(\s+)/)
    .map((part, index) => {
      if (/^\s+$/.test(part)) return part;
      if (/^[A-Z0-9&+%-]+$/.test(part) && /[A-Z]/.test(part)) return part;
      const lower = part.toLowerCase();
      if (index > 0 && smallWords.has(lower)) return lower;
      return lower.replace(/(^|[-'/])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
    })
    .join("")
    .replace(/\bAcana\b/g, "ACANA")
    .replace(/\bBixbi\b/g, "BIXBI")
    .replace(/\bFd\b/g, "FD")
    .replace(/\bGf\b/g, "GF")
    .replace(/\bGr\b/g, "GR")
    .replace(/\bCat Can\b/g, "Cat Can")
    .replace(/\bCan\b/g, "Can")
    .replace(/\bEntr E\b/g, "Entree")
    .replace(/\bP T\b/g, "Pate")
    .replace(/\bW\b/g, "with")
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
  const url = decodeXml(value).split("#")[0];
  if (!/^https:\/\/shop\.woofgangbakery\.com\/[^/]+\/product\/\d+\/\d+-[A-Za-z0-9_%'-]+_?$/i.test(url)) return "";
  return url;
}

function productPartsFromUrl(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const productIndex = parts.indexOf("product");
    const categoryId = productIndex >= 0 ? parts[productIndex + 1] || "" : "";
    const slug = productIndex >= 0 ? parts[productIndex + 2] || "" : "";
    const retailerProductId = slug.split("-")[0] || "";
    const slugName = slug.replace(/^\d+-/, "");
    return {
      categoryId,
      retailerProductId,
      name: cleanProductName(decodeURIComponent(slugName).replace(/_/g, " ")),
    };
  } catch {
    return { categoryId: "", retailerProductId: "", name: "" };
  }
}

function inferBrand(name) {
  const normalizedName = normalizeText(name);
  const alias = BRAND_PREFIX_ALIASES.find(([prefix]) => {
    const normalizedPrefix = normalizeText(prefix);
    return normalizedName === normalizedPrefix ||
      normalizedName.startsWith(`${normalizedPrefix} `) ||
      normalizedName.startsWith(`${normalizedPrefix}-`);
  });
  if (alias) return alias[1];
  return BRAND_HINTS.find((brand) => {
    const normalizedBrand = normalizeText(brand);
    return normalizedName === normalizedBrand ||
      normalizedName.startsWith(`${normalizedBrand} `) ||
      normalizedName.startsWith(`${normalizedBrand}-`);
  }) || "";
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
    if (!response.ok) throw new Error(`Woof Gang Bakery sitemap fetch failed ${response.status}: ${url}`);
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
      if (!sourceUrl) return null;
      const parts = productPartsFromUrl(sourceUrl);
      if (!parts.name || !parts.retailerProductId) return null;
      return {
        sourceUrl,
        name: parts.name,
        categoryId: parts.categoryId,
        retailerProductId: parts.retailerProductId,
      };
    })
    .filter(Boolean);
}

function packageSizeSignal(text) {
  return /\b\d+(\s+)?(lb|lbs|oz|ounce|ounces|kg|g)\b/.test(text);
}

function isCandidateFoodRow(row) {
  const text = normalizeText(`${row.name} ${row.sourceUrl}`);
  const brand = inferBrand(row.name);
  const petTypes = inferPetTypes({
    brand,
    product_name: row.name,
    cache_key: normalizeCacheKey(row.name),
    source: "woofgang_sitemap",
  }, { includeAmbiguous: false });
  if (petTypes.length === 0) return false;
  if (NON_FOOD_TERMS.some((term) => hasTerm(text, term))) return false;
  if (!includeTreats && SUPPLEMENTAL_FOOD_TERMS.some((term) => hasTerm(text, term))) return false;
  if (!includeTreats && TREAT_TERMS.some((term) => hasTerm(text, term))) return false;
  const coreFood = CORE_FOOD_TERMS.some((term) => hasTerm(text, term));
  const trustedFoodLine = Boolean(brand) && packageSizeSignal(text);
  const treat = includeTreats && TREAT_TERMS.some((term) => hasTerm(text, term));
  return coreFood || trustedFoodLine || treat;
}

function normalizeTarget(row) {
  const name = cleanProductName(row.name);
  const brand = inferBrand(name);
  if (!brand) return null;
  const cacheKey = normalizeCacheKey(name);
  if (!cacheKey) return null;
  const petTypes = inferPetTypes({
    brand,
    product_name: name,
    cache_key: cacheKey,
    source: "woofgang_sitemap",
  }, { includeAmbiguous: false });
  if (petTypes.length === 0) return null;
  return {
    name,
    brand,
    petType: petTypes[0],
    petTypes,
    explicitPetType: true,
    cacheKey,
    source: "woofgang_sitemap_export",
    sourceQuality: "retailer_sitemap_title",
    sourceUrl: row.sourceUrl,
    imageUrl: "",
    barcode: "",
    retailerProductId: row.retailerProductId,
    sourceSitemap: sitemapUrl,
    sourceCategoryId: row.categoryId,
    searchTerms: [...new Set([name, row.sourceUrl].filter(Boolean))],
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
  const bySourceCategoryId = new Map();
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
    bySourceCategoryId.set(target.sourceCategoryId, (bySourceCategoryId.get(target.sourceCategoryId) || 0) + 1);
  }
  return {
    byPetType: [...byPetType.entries()]
      .map(([petType, count]) => ({ petType, count }))
      .sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
    bySourceCategoryId: [...bySourceCategoryId.entries()]
      .map(([sourceCategoryId, count]) => ({ sourceCategoryId, count }))
      .sort((a, b) => b.count - a.count || a.sourceCategoryId.localeCompare(b.sourceCategoryId)),
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
    source: "woofgangbakery_sitemap",
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

  console.log(`Woof Gang Bakery products scanned: ${scannedProducts}`);
  console.log(`Existing product_data keys: ${existing.size}`);
  console.log(`Missing Woof Gang Bakery sitemap targets exported: ${targets.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("Woof Gang Bakery sitemap catalog target export failed:", err.message);
  process.exit(1);
});
