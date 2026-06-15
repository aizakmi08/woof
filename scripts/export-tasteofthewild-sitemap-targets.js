#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_OUTPUT = ".tmp/tasteofthewild-sitemap-catalog-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof catalog coverage export";
const BRAND = "Taste of the Wild";
const SOURCE_PAGES = [
  "https://www.tasteofthewildpetfood.com/dog/taste-of-the-wild/",
  "https://www.tasteofthewildpetfood.com/cat/taste-of-the-wild/",
  "https://www.tasteofthewildpetfood.com/dog/prey/",
  "https://www.tasteofthewildpetfood.com/cat/prey/",
  "https://www.tasteofthewildpetfood.com/recipe-finder/?_sfm_umbrella_brand=totw",
  "https://www.tasteofthewildpetfood.com/recipe-finder/?_sfm_umbrella_brand=prey",
];

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const includeExisting = process.argv.includes("--include-existing");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const LINE_LABELS = {
  "ancient-grains": "Ancient Grains",
  "grain-free": "Grain-Free",
  prey: "PREY",
};
const CORE_FOOD_TERMS = [
  "ancient grains", "grain-free", "prey", "limited ingredient", "puppy",
  "small breed", "high prairie", "pacific stream", "sierra mountain",
  "southwest canyon", "wetlands", "appalachian valley", "pine forest",
  "ancient mountain", "ancient prairie", "ancient stream", "ancient wetlands",
  "canyon river", "lowland creek", "rocky mountain", "roasted", "smoke flavored",
  "gravy", "bison", "venison", "salmon", "lamb", "fowl", "trout", "quail",
  "duck", "beef", "turkey", "boar", "garbanzo beans", "legumes",
];
const REJECT_TERMS = [
  "treat", "treats", "snack", "snacks", "chew", "chews", "topper",
  "toppers", "supplement", "supplements", "probiotic", "probiotics",
  "appetizer", "appetizers", "bisque", "broth", "catnip", "litter",
];
const NON_FOOD_TERMS = [
  "apps.bazaarvoice.com", "recipe finder", "questionnaire", "comparison",
  "ingredient finder", "article", "articles", "faq", "feed", "wp-json",
  "oembed", "xmlrpc", "facebook", "instagram", "pinterest", "where to buy",
  "toy", "toys", "accessory", "accessories", "collar", "leash", "harness",
  "bed", "crate", "carrier", "shampoo", "wipes", "cleaner", "flea", "tick",
  "grooming", "brush", "comb",
];

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:tasteofthewild-sitemap-catalog -- --output=.tmp/tasteofthewild-sitemap-catalog-targets.json

Options:
  --output=path.json      Write a backfill-compatible target manifest (default ${DEFAULT_OUTPUT})
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
}

function decodeHtml(value) {
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
    .replace(/[-_/]+/g, " ")
    .replace(/[^a-z0-9\s&+%.:-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasTerm(text, term) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  if (normalizedTerm.includes(" ") || normalizedTerm.includes(".")) return text.includes(normalizedTerm);
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
    .replace(/\bPrey\b/g, "PREY")
    .replace(/\bGrain Free\b/g, "Grain-Free")
    .replace(/\bSmoke Flavored\b/g, "Smoke-Flavored")
    .replace(/\s+([,])/g, "$1")
    .trim();
}

function cleanProductName(value) {
  return titleCaseProductName(decodeHtml(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220));
}

function cleanUrl(value, baseUrl) {
  try {
    const parsed = new URL(decodeHtml(value), baseUrl);
    parsed.hash = "";
    parsed.search = "";
    const url = parsed.href.replace(/\/$/, "");
    if (!/^https:\/\/www\.tasteofthewildpetfood\.com\/(dog|cat)\/(ancient-grains|grain-free|prey)\/[a-z0-9.-]+$/i.test(url)) return "";
    if (NON_FOOD_TERMS.some((term) => hasTerm(normalizeText(url), term))) return "";
    return url;
  } catch {
    return "";
  }
}

function parsedProductPath(url) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length !== 3) return null;
    const [petType, line, slug] = segments;
    if (!["dog", "cat"].includes(petType)) return null;
    if (!Object.prototype.hasOwnProperty.call(LINE_LABELS, line)) return null;
    if (!/^[a-z0-9-]+$/.test(slug)) return null;
    return {
      petType,
      line,
      slug,
      form: formFromSlug(slug),
    };
  } catch {
    return null;
  }
}

function formFromSlug(slug) {
  const text = normalizeText(slug);
  if (hasTerm(text, "gravy")) return "wet";
  return "dry";
}

function productNameFromSlug(slug) {
  return cleanProductName(String(slug || "")
    .replace(/--+/g, "-")
    .replace(/-/g, " "));
}

function productNameFromPath(parsed) {
  const lineLabel = LINE_LABELS[parsed.line];
  const slugName = productNameFromSlug(parsed.slug);
  if (!lineLabel || !slugName) return "";
  if (normalizeText(slugName).startsWith(normalizeText(lineLabel))) return slugName;
  return cleanProductName(`${lineLabel} ${slugName}`);
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout fetching ${url}`)), 90_000);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Taste of the Wild product index fetch failed ${response.status}: ${url}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function parseProductRows() {
  const urls = new Map();
  for (const pageUrl of SOURCE_PAGES) {
    const html = await fetchText(pageUrl);
    for (const match of String(html || "").matchAll(/href=["']([^"']+)["']/gi)) {
      const sourceUrl = cleanUrl(match[1], pageUrl);
      if (sourceUrl) urls.set(sourceUrl, pageUrl);
    }
  }

  return [...urls.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sourceUrl, sourcePage]) => {
      const parsed = parsedProductPath(sourceUrl);
      if (!parsed) return null;
      const name = productNameFromPath(parsed);
      if (!name) return null;
      return {
        sourceUrl,
        sourcePage,
        name,
        petType: parsed.petType,
        retailerProductId: `${parsed.line}/${parsed.slug}`,
        form: parsed.form,
      };
    })
    .filter(Boolean);
}

function inferTasteOfTheWildPetTypes(row) {
  const inferred = inferPetTypes({
    brand: BRAND,
    product_name: `${row.petType} ${row.name} ${row.sourceUrl}`,
    cache_key: normalizeCacheKey(`${row.petType} ${row.name} ${row.sourceUrl}`),
    source: "tasteofthewild_product_index",
  }, { includeAmbiguous: false });
  if (inferred.length === 1 && inferred[0] === row.petType) return inferred;
  return [row.petType];
}

function isCandidateFoodRow(row) {
  const text = normalizeText(`${row.name} ${row.sourceUrl} ${row.retailerProductId} ${row.form}`);
  const petTypes = inferTasteOfTheWildPetTypes(row);
  if (!/^https:\/\/www\.tasteofthewildpetfood\.com\/(dog|cat)\/(ancient-grains|grain-free|prey)\/[a-z0-9-]+$/i.test(row.sourceUrl)) return false;
  if (petTypes.length !== 1 || petTypes[0] !== row.petType) return false;
  if (!["dry", "wet"].includes(row.form)) return false;
  if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  if (NON_FOOD_TERMS.some((term) => hasTerm(text, term))) return false;
  return CORE_FOOD_TERMS.some((term) => hasTerm(text, term));
}

function addSpeciesQualifier(name, petType) {
  const text = normalizeText(name);
  if (petType === "cat" && !/\b(cat|cats|kitten|kittens|feline)\b/.test(text)) return `${name} for Cats`;
  if (petType === "dog" && !/\b(dog|dogs|puppy|puppies|canine)\b/.test(text)) return `${name} for Dogs`;
  return name;
}

function normalizeTarget(row) {
  const petTypes = inferTasteOfTheWildPetTypes(row);
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
    source: "tasteofthewild_product_index_export",
    sourceQuality: "official_brand_product_index_slug",
    sourceUrl: row.sourceUrl,
    imageUrl: "",
    barcode: "",
    retailerProductId: row.retailerProductId,
    form: row.form,
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
      const brand = decodeHtml(row?.brand);
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
  const skipped = { nonFood: 0, existing: 0, duplicate: 0, invalid: 0 };
  const byKey = new Map();
  let scannedProducts = 0;

  for (const row of await parseProductRows()) {
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
    source: "tasteofthewild_product_index",
    sourcePages: SOURCE_PAGES,
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

  console.log(`Taste of the Wild products scanned: ${scannedProducts}`);
  console.log(`Existing product_data keys: ${existing.size}`);
  console.log(`Missing Taste of the Wild product-index targets exported: ${targets.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("Taste of the Wild catalog target export failed:", err.message);
  process.exit(1);
});
