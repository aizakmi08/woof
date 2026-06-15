#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_SITEMAP_URL = "https://www.bluebuffalo.com/sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/bluebuffalo-sitemap-catalog-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof catalog coverage export";
const BRAND = "Blue Buffalo";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const sitemapArg = process.argv.find((arg) => arg.startsWith("--sitemap="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const includeExisting = process.argv.includes("--include-existing");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const sitemapUrl = sitemapArg ? sitemapArg.split("=").slice(1).join("=").trim() : DEFAULT_SITEMAP_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const CORE_FOOD_TERMS = [
  "wet cat food", "dry cat food", "wet dog food", "dry dog food",
  "life protection", "wilderness", "basics", "freedom", "tastefuls",
  "true solutions", "natural veterinary diet", "baby blue",
  "blue delights", "homestyle", "blue stew", "hunters stew",
  "wolf creek stew", "grain free", "wholesome grain", "large breed",
  "small breed", "toy breed", "small bite", "puppy", "kitten",
  "senior", "mature", "adult", "indoor", "hairball", "urinary",
  "weight control", "weight management", "healthy weight", "digestive",
  "skin coat", "mobility", "kidney", "hydrolyzed", "food intolerance",
  "novel protein", "gastrointestinal", "pate", "flaked", "morsels",
  "cuts in gravy", "savory singles", "spoonless singles",
  "gravy", "chicken", "turkey", "salmon", "tuna", "beef", "lamb",
  "venison", "duck", "bison", "whitefish", "ocean fish", "trout",
  "halibut", "alligator", "fish", "liver", "potato", "peas",
  "barley", "brown rice", "rice", "oatmeal", "sweet potato",
];
const REJECT_TERMS = [
  "treat", "treats", "lickable", "puree", "purees", "topper", "toppers",
  "complement", "complements", "supplement", "supplements", "broth",
  "bisque", "appetizer", "appetizers", "snack", "snacks", "catnip",
  "food topper", "delectables", "meal makers", "tender shreds",
  "health bars", "blue bits", "blue bones", "dental chews",
  "soft chews", "soft and chewy", "nudges", "true chews",
  "purrfect moments", "creamy puree", "creamy purees", "mini purees",
  "toy", "toys", "litter", "accessory", "accessories",
];
const NON_FOOD_TERMS = [
  "faq", "article", "bowl", "mat", "collar", "leash", "harness", "bed",
  "crate", "carrier", "shampoo", "wipes", "cleaner", "flea", "tick",
  "grooming", "brush", "comb",
];

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:bluebuffalo-sitemap-catalog -- --output=.tmp/bluebuffalo-sitemap-catalog-targets.json

Options:
  --output=path.json      Write a backfill-compatible target manifest (default ${DEFAULT_OUTPUT})
  --sitemap=url           Explicit Blue Buffalo sitemap index URL (${DEFAULT_SITEMAP_URL})
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
  if (!/^https:\/\/www\.bluebuffalo\.com\/sitemap\.xml$/i.test(sitemapUrl)) {
    usage("--sitemap must be https://www.bluebuffalo.com/sitemap.xml.");
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
    .replace(/\bBlue Buffalo\b/g, "Blue Buffalo")
    .replace(/\bBaby Blue\b/g, "Baby BLUE")
    .replace(/\bGi\b/g, "GI")
    .replace(/\bHf\b/g, "HF")
    .replace(/\bKs\b/g, "KS")
    .replace(/\bNp\b/g, "NP")
    .replace(/\bWm\b/g, "WM")
    .replace(/\bWu\b/g, "WU")
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
  if (!/^https:\/\/www\.bluebuffalo\.com\/(dry|wet)-(dog|cat)-food\/[a-z0-9-]+\/[a-z0-9-]+$/i.test(url)) return "";
  return url;
}

function formAndPetFromProductType(productType) {
  const match = String(productType || "").match(/^(dry|wet)-(dog|cat)-food$/);
  if (!match) return null;
  return { form: match[1], petType: match[2] };
}

function lineLabel(line, slug) {
  const normalizedSlug = normalizeText(slug);
  if (line === "blue" && normalizedSlug.includes("tastefuls")) return "";
  if (line === "blue-specialty") return "";
  const labels = {
    "baby-blue": "Baby BLUE",
    basics: "Basics",
    freedom: "Freedom",
    "life-protection-formula": "Life Protection Formula",
    "natural-veterinary-diet": "Natural Veterinary Diet",
    "blue-natural-veterinary-diet": "Natural Veterinary Diet",
    tastefuls: "Tastefuls",
    "true-solutions": "True Solutions",
    wilderness: "Wilderness",
  };
  return labels[line] || "";
}

function productNameFromLineAndSlug(line, slug) {
  const label = lineLabel(line, slug);
  let name = String(slug || "")
    .replace(/\b(\d+)-pack\b/g, "$1 Pack")
    .replace(/\b(\d+)-can\b/g, "$1 Can")
    .replace(/\b(\d+)-count\b/g, "$1 Count")
    .replace(/--+/g, "-")
    .replace(/-/g, " ");
  if (label && !normalizeText(name).startsWith(normalizeText(label))) {
    name = `${label} ${name}`;
  }
  return cleanProductName(name);
}

function isRejectedPath(url) {
  const text = normalizeText(url);
  return REJECT_TERMS.some((term) => hasTerm(text, term)) ||
    NON_FOOD_TERMS.some((term) => hasTerm(text, term));
}

function formFromSlug(slug, petType) {
  const parsed = parsedProductPath(`https://www.bluebuffalo.com/${slug || ""}`);
  if (parsed && parsed.petType === petType) return parsed.form;
  return "";
}

function parsedProductPath(url) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length !== 3) return null;
    const parsedType = formAndPetFromProductType(segments[0]);
    if (!parsedType) return null;
    const line = segments[1];
    const slug = segments[2];
    if (!/^[a-z0-9-]+$/.test(line) || !/^[a-z0-9-]+$/.test(slug)) return null;
    return { slug, line, petType: parsedType.petType, form: parsedType.form, productType: segments[0] };
  } catch {
    return null;
  }
}

function productNameFromPath(parsed) {
  return productNameFromLineAndSlug(parsed.line, parsed.slug);
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
    if (!response.ok) throw new Error(`Blue Buffalo sitemap fetch failed ${response.status}: ${url}`);
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

async function parseProductRows(indexXml) {
  const sitemapLocs = parseLocs(indexXml)
    .filter((url) => /^https:\/\/www\.bluebuffalo\.com\/sitemap\.en\.xml$/i.test(url));
  if (sitemapLocs.length !== 1) throw new Error("Blue Buffalo sitemap index did not expose exactly one English sitemap.");

  const rows = [];
  for (const childSitemap of sitemapLocs) {
    const childXml = await fetchText(childSitemap);
    for (const rawUrl of parseLocs(childXml)) {
      const sourceUrl = cleanUrl(rawUrl);
      if (!sourceUrl) continue;
      if (isRejectedPath(sourceUrl)) continue;
      const parsed = parsedProductPath(sourceUrl);
      if (!parsed) continue;
      const name = productNameFromPath(parsed);
      if (!name) continue;
      rows.push({
        sourceUrl,
        name,
        petType: parsed.petType,
        retailerProductId: `${parsed.productType}/${parsed.line}/${parsed.slug}`,
        form: parsed.form,
        productLine: parsed.line,
        sourceSitemap: childSitemap,
      });
    }
  }
  return rows;
}

function inferBlueBuffaloPetTypes(row) {
  const inferred = inferPetTypes({
    brand: BRAND,
    product_name: `${row.petType} ${row.name} ${row.sourceUrl}`,
    cache_key: normalizeCacheKey(`${row.petType} ${BRAND} ${row.name} ${row.sourceUrl}`),
    source: "bluebuffalo_sitemap",
  }, { includeAmbiguous: false });
  if (inferred.includes(row.petType)) return [row.petType];
  return [row.petType];
}

function isCandidateFoodRow(row) {
  const text = normalizeText(`${row.name} ${row.sourceUrl} ${row.retailerProductId} ${row.form} ${row.petType}`);
  const petTypes = inferBlueBuffaloPetTypes(row);
  if (!/^https:\/\/www\.bluebuffalo\.com\/(dry|wet)-(dog|cat)-food\/[a-z0-9-]+\/[a-z0-9-]+$/i.test(row.sourceUrl)) return false;
  if (!["dry", "wet"].includes(row.form)) return false;
  if (petTypes.length !== 1 || petTypes[0] !== row.petType) return false;
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
  const petTypes = inferBlueBuffaloPetTypes(row);
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
    source: "bluebuffalo_sitemap_export",
    sourceQuality: "official_brand_sitemap_slug",
    sourceUrl: row.sourceUrl,
    imageUrl: "",
    barcode: "",
    retailerProductId: row.retailerProductId,
    form: row.form,
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

  for (const row of await parseProductRows(xml)) {
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
    source: "bluebuffalo_product_sitemap",
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

  console.log(`Blue Buffalo products scanned: ${scannedProducts}`);
  console.log(`Existing product_data keys: ${existing.size}`);
  console.log(`Missing Blue Buffalo sitemap targets exported: ${targets.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("Blue Buffalo sitemap catalog target export failed:", err.message);
  process.exit(1);
});
