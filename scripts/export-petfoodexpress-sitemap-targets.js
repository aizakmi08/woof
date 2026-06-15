#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_SITEMAP_INDEX_URL = "https://www.petfood.express/xmlsitemap.php";
const DEFAULT_OUTPUT = ".tmp/petfoodexpress-sitemap-catalog-targets.json";
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
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const CORE_FOOD_TERMS = [
  "dog food", "cat food", "puppy food", "kitten food",
  "dry dog food", "dry cat food", "wet dog food", "wet cat food",
  "canned dog food", "canned cat food", "frozen dog food", "frozen cat food",
  "freeze-dried dog food", "freeze dried dog food", "freeze-dried cat food", "freeze dried cat food",
  "air-dried dog food", "air dried dog food", "air-dried cat food", "air dried cat food",
  "raw dog food", "raw cat food", "pate canned", "pate wet", "kibble", "entree", "dinner",
];

const TREAT_TERMS = [
  "treat", "treats", "chew", "chews", "jerky", "biscuit", "biscuits",
  "dental", "bone", "bones", "bully", "trachea", "hoof", "sausage",
];

const SUPPLEMENTAL_FOOD_TERMS = [
  "supplement", "supplemental", "topper", "toppers", "mixer", "mixers",
  "meal mixer", "meal mixers", "broth", "goat milk", "milk replacer",
];

const NON_FOOD_TERMS = [
  "toy", "bowl", "collar", "leash", "harness", "bed", "mat", "blanket",
  "brush", "comb", "shampoo", "spray", "odor", "urine", "fogger", "litter",
  "training line", "water bottle", "nursing kit", "flea", "tick", "probiotic",
  "powder", "calming", "hemp", "paw", "skin coat", "skin-coat", "hip joint",
];

const BRAND_HINTS = [
  "ACANA", "Almo Nature", "Applaws", "A Pup Above", "Bixbi", "Blue Buffalo",
  "Canidae", "Caru", "Diamond Naturals", "Dr. Bob Goldstein's", "Farmina N&D",
  "Farmina", "FirstMate", "Fromm", "Fussie Cat", "Grandma Lucy's",
  "Hill's Science Diet", "Instinct", "JustFoodForDogs", "KASIKS",
  "Kiwi Kitchens", "NutriSource", "Nulo", "Open Farm", "Orijen", "Primal",
  "Pure Cravings", "PureVita", "RAWZ", "Rawternative", "Redbarn",
  "Shepherd Boy Farms", "Smallbatch", "Smalls", "Stella & Chewy's",
  "Taste of the Wild", "The Honest Kitchen", "Tiki Cat", "Tiki Dog",
  "Truluxe", "Tucker's", "Under the Weather", "Vital Essentials", "Wellness",
  "Weruva", "Ziwi Peak", "Zignature",
].sort((a, b) => b.length - a.length);

const BRAND_PREFIX_ALIASES = [
  ["blue life protection", "Blue Buffalo"],
  ["blue tastefuls", "Blue Buffalo"],
  ["blue wilderness", "Blue Buffalo"],
  ["cats in the kitchen", "Weruva"],
  ["dr bob goldsteins", "Dr. Bob Goldstein's"],
  ["grandma lucy s", "Grandma Lucy's"],
  ["grandma lucys", "Grandma Lucy's"],
  ["hill s science diet", "Hill's Science Diet"],
  ["hills science diet", "Hill's Science Diet"],
  ["justfoodforcats", "JustFoodForDogs"],
  ["slide n serve", "Weruva"],
  ["tuckers", "Tucker's"],
  ["bff", "Weruva"],
  ["b-f-f", "Weruva"],
  ["weruva b f f", "Weruva"],
  ["weruva b-f-f", "Weruva"],
  ["natures variety", "Instinct"],
  ["ziwi peak", "Ziwi Peak"],
  ["stella chewys", "Stella & Chewy's"],
  ["stella chewy s", "Stella & Chewy's"],
  ["smallbatch", "Smallbatch"],
  ["rawz", "RAWZ"],
].sort((a, b) => b[0].length - a[0].length);

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:petfoodexpress-sitemap-catalog -- --output=.tmp/petfoodexpress-sitemap-catalog-targets.json

Options:
  --output=path.json      Write a backfill-compatible target manifest (default ${DEFAULT_OUTPUT})
  --sitemap-index=url     Pet Food Express sitemap index URL (${DEFAULT_SITEMAP_INDEX_URL})
  --sitemap=url           Explicit Pet Food Express product sitemap URL
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
  if (!/^https:\/\/www\.petfood\.express\/xmlsitemap\.php$/i.test(sitemapIndexUrl)) {
    usage("--sitemap-index must be https://www.petfood.express/xmlsitemap.php.");
  }
  if (explicitSitemapUrl && !/^https:\/\/www\.petfood\.express\/xmlsitemap\.php\?type=products&page=\d+$/i.test(explicitSitemapUrl)) {
    usage("--sitemap must be a Pet Food Express products sitemap URL.");
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
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/['’]/g, " ")
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
    .replace(/\b(dog food|cat food|formula|recipe)\b/gi, "")
    .replace(/\bw\b/g, "with")
    .replace(/[-/&+]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseProductName(value) {
  const smallWords = new Set(["and", "or", "of", "for", "in", "with", "to"]);
  return String(value || "")
    .split(/(\s+)/)
    .map((part, index) => {
      if (/^\s+$/.test(part)) return part;
      if (part === "&" || part === "-") return part;
      if (/^[A-Z0-9&+%-]+$/.test(part) && /[A-Z]/.test(part)) return part;
      const lower = part.toLowerCase();
      if (index > 0 && smallWords.has(lower)) return lower;
      return lower.replace(/(^|[-'/])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
    })
    .join("")
    .replace(/\bAcana\b/g, "ACANA")
    .replace(/\bBixbi\b/g, "Bixbi")
    .replace(/\bFirstmate\b/g, "FirstMate")
    .replace(/\bJustfoodfordogs\b/g, "JustFoodForDogs")
    .replace(/\bRawz\b/g, "RAWZ")
    .replace(/\bSmallbatch\b/g, "Smallbatch")
    .replace(/\bStella Chewys\b/g, "Stella & Chewy's")
    .replace(/\bStella Chewy'?S\b/g, "Stella & Chewy's")
    .replace(/\bZiwi Peak\b/g, "Ziwi Peak")
    .replace(/\bW\b/g, "with")
    .replace(/\bN D\b/g, "N&D")
    .replace(/\s+([,])/g, "$1")
    .trim();
}

function cleanProductName(value) {
  return titleCaseProductName(decodeXml(value)
    .replace(/\bhtml$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220));
}

function cleanUrl(value) {
  const url = decodeXml(value).split("#")[0];
  if (!/^https:\/\/www\.petfood\.express\/products\/[a-z0-9-]+\.html$/i.test(url)) return "";
  return url;
}

function productNameFromUrl(url) {
  const slug = new URL(url).pathname.split("/").filter(Boolean).pop() || "";
  return cleanProductName(decodeURIComponent(slug).replace(/\.html$/i, "").replace(/-/g, " "));
}

function productIdFromUrl(url) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).pop()?.replace(/\.html$/i, "") || "";
  } catch {
    return "";
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
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Pet Food Express sitemap fetch failed ${response.status}: ${url}`);
  }
  return response.text();
}

function extractProductSitemapLocs(xml) {
  return [...String(xml || "").matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => decodeXml(match[1]))
    .filter((url) => /^https:\/\/www\.petfood\.express\/xmlsitemap\.php\?type=products&page=\d+$/i.test(url))
    .filter((url, index, list) => list.indexOf(url) === index);
}

async function resolveSitemapUrls() {
  if (explicitSitemapUrl) return [explicitSitemapUrl];
  const indexXml = await fetchText(sitemapIndexUrl);
  const urls = extractProductSitemapLocs(indexXml);
  if (urls.length === 0) {
    throw new Error("Pet Food Express sitemap index did not expose product sitemap URLs.");
  }
  return urls;
}

function parseProductRows(xml, sitemapUrl) {
  return [...String(xml || "").matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => cleanUrl(match[1]))
    .filter(Boolean)
    .map((sourceUrl) => ({
      sourceUrl,
      name: productNameFromUrl(sourceUrl),
      productId: productIdFromUrl(sourceUrl),
      sitemapUrl,
    }));
}

function isCandidateFoodRow(row) {
  const text = normalizeText(`${row.name} ${row.sourceUrl}`);
  const hasPetSignal = inferPetTypes({
    product_name: row.name,
    cache_key: normalizeCacheKey(row.name),
    source: "petfoodexpress_sitemap",
  }, { includeAmbiguous: false }).length > 0;
  if (!hasPetSignal) return false;
  if (NON_FOOD_TERMS.some((term) => hasTerm(text, term))) return false;
  if (!includeTreats && SUPPLEMENTAL_FOOD_TERMS.some((term) => hasTerm(text, term))) return false;
  if (!includeTreats && TREAT_TERMS.some((term) => hasTerm(text, term))) return false;
  const coreFood = CORE_FOOD_TERMS.some((term) => hasTerm(text, term));
  const treat = includeTreats && TREAT_TERMS.some((term) => hasTerm(text, term));
  return coreFood || treat;
}

function normalizeTarget(row) {
  const name = cleanProductName(row.name);
  const brand = inferBrand(name);
  if (!brand) return null;
  const cacheKey = normalizeCacheKey(name);
  if (!cacheKey) return null;
  const petTypes = inferPetTypes({
    product_name: name,
    cache_key: cacheKey,
    source: "petfoodexpress_sitemap",
  }, { includeAmbiguous: false });
  if (petTypes.length === 0) return null;
  return {
    name,
    brand,
    petType: petTypes[0],
    petTypes,
    explicitPetType: true,
    cacheKey,
    source: "petfoodexpress_sitemap_export",
    sourceQuality: "retailer_sitemap_slug",
    sourceUrl: row.sourceUrl,
    imageUrl: "",
    barcode: "",
    retailerProductId: row.productId,
    sourceSitemap: row.sitemapUrl,
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
  const sitemapUrls = await resolveSitemapUrls();
  const skipped = { nonFood: 0, existing: 0, duplicate: 0, invalid: 0 };
  const byKey = new Map();
  let scannedProducts = 0;

  for (const sitemapUrl of sitemapUrls) {
    const xml = await fetchText(sitemapUrl);
    for (const row of parseProductRows(xml, sitemapUrl)) {
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
    String(a.name).localeCompare(String(b.name)) ||
    String(a.cacheKey).localeCompare(String(b.cacheKey))
  );

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: "petfoodexpress_product_sitemap",
    sitemapIndexUrl,
    sitemapUrls,
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

  console.log(`Pet Food Express products scanned: ${scannedProducts}`);
  console.log(`Existing product_data keys: ${existing.size}`);
  console.log(`Missing Pet Food Express sitemap targets exported: ${targets.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("Pet Food Express sitemap catalog target export failed:", err.message);
  process.exit(1);
});
