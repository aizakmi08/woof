#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_SITEMAP_INDEX_URL = "https://www.kroger.com/product-details-sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/kroger-sitemap-catalog-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof catalog coverage export";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const sitemapIndexArg = process.argv.find((arg) => arg.startsWith("--sitemap-index="));
const sitemapArg = process.argv.find((arg) => arg.startsWith("--sitemap="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const maxSitemapsArg = process.argv.find((arg) => arg.startsWith("--max-sitemaps="));
const includeExisting = process.argv.includes("--include-existing");
const includeTreats = process.argv.includes("--include-treats");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const sitemapIndexUrl = sitemapIndexArg ? sitemapIndexArg.split("=").slice(1).join("=").trim() : DEFAULT_SITEMAP_INDEX_URL;
const explicitSitemapUrl = sitemapArg ? sitemapArg.split("=").slice(1).join("=").trim() : "";
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const maxSitemaps = maxSitemapsArg ? Number(maxSitemapsArg.split("=")[1]) : 0;

const CORE_FOOD_TERMS = [
  "dog food", "cat food", "puppy food", "kitten food",
  "dry dog food", "dry cat food", "wet dog food", "wet cat food",
  "canned dog food", "canned cat food", "dog formula", "cat formula",
  "puppy formula", "kitten formula", "dog recipe", "cat recipe",
  "puppy recipe", "kitten recipe", "dog kibble", "cat kibble",
  "pate", "paté", "entree", "entrée", "dinner", "kibble",
  "fresh dog food", "fresh cat food", "frozen dog food", "frozen cat food",
];

const TREAT_TERMS = [
  "treat", "treats", "chew", "chews", "jerky", "biscuit", "biscuits",
  "cookie", "cookies", "bone", "bones", "bully", "pizzle", "rawhide",
  "hide", "dental", "dentalife", "training treat", "soft chewy",
  "pill pocket", "trachea", "tendon", "sausage", "stick", "sticks",
  "temptations", "party mix", "tbonz",
];

const SUPPLEMENTAL_FOOD_TERMS = [
  "supplement", "supplemental", "topper", "toppers", "mixer", "mixers",
  "meal mixer", "meal mixers", "broth", "goat milk", "milk replacer",
  "vitamin", "probiotic", "skin and coat", "digestive support",
];

const NON_FOOD_TERMS = [
  "toy", "ball", "collar", "leash", "harness", "bed", "crate", "carrier",
  "mat", "bowl", "feeder", "fountain", "litter", "pads", "pad", "diaper",
  "shampoo", "spray", "wipes", "cleaner", "odor", "stain", "flea", "tick",
  "kennel", "gate", "door", "stairs", "ramp", "grooming", "brush", "comb",
  "scooper", "scoop", "boots", "parka", "coat", "sweater", "costume",
  "aquarium", "fish food", "catfish", "bird", "parakeet", "reptile",
  "small animal", "hamster", "rabbit", "hay", "bedding",
  "hot dog", "hot dogs", "corn dog", "corn dogs", "chili dog",
  "pretzel dog", "mini dog", "dogfish", "dogwood", "cat eye", "cat-eye",
  "cat6", "cat 6", "wellness shot", "wellness shots", "wellness tea",
  "epsom salt", "probiotic supplement", "food storage", "can saver",
];

const BRAND_HINTS = [
  "9Lives", "ACANA", "Alpo", "Beneful", "Bil-Jac", "Blue Buffalo",
  "Canidae", "Cesar", "Diamond Naturals", "Diamond", "Eukanuba",
  "Fancy Feast", "Freshpet", "Friskies", "Fromm", "Hill's Prescription Diet",
  "Hill's Science Diet", "Iams", "Instinct", "Kit & Kaboodle", "Kroger",
  "Meow Mix", "Merrick", "Natural Balance", "Nature's Recipe", "Nulo",
  "Nutro", "Open Farm", "Orijen", "Pedigree", "Purina Alpo",
  "Purina Cat Chow", "Purina Dog Chow", "Purina ONE", "Purina Pro Plan",
  "Purina", "Rachael Ray Nutrish", "Royal Canin", "Sheba", "Solid Gold",
  "Stella & Chewy's", "Taste of the Wild", "Tiki Cat", "Tiki Dog",
  "Wellness", "Weruva", "Whiskas", "Zignature",
].sort((a, b) => b.length - a.length);

const BRAND_PREFIX_ALIASES = [
  ["9 lives", "9Lives"],
  ["blue buffalo", "Blue Buffalo"],
  ["blue tastefuls", "Blue Buffalo"],
  ["blue wilderness", "Blue Buffalo"],
  ["hills prescription diet", "Hill's Prescription Diet"],
  ["hills science diet", "Hill's Science Diet"],
  ["hill s prescription diet", "Hill's Prescription Diet"],
  ["hill s science diet", "Hill's Science Diet"],
  ["kit kaboodle", "Kit & Kaboodle"],
  ["natures recipe", "Nature's Recipe"],
  ["natures variety instinct", "Instinct"],
  ["natural balance lid", "Natural Balance"],
  ["purina alpo", "Purina Alpo"],
  ["purina cat chow", "Purina Cat Chow"],
  ["purina dog chow", "Purina Dog Chow"],
  ["purina one", "Purina ONE"],
  ["purina pro plan", "Purina Pro Plan"],
  ["rachael ray nutrish", "Rachael Ray Nutrish"],
  ["stella chewy s", "Stella & Chewy's"],
  ["stella chewys", "Stella & Chewy's"],
  ["taste of the wild", "Taste of the Wild"],
].sort((a, b) => b[0].length - a[0].length);

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:kroger-sitemap-catalog -- --output=.tmp/kroger-sitemap-catalog-targets.json

Options:
  --output=path.json      Write a backfill-compatible target manifest (default ${DEFAULT_OUTPUT})
  --sitemap-index=url     Kroger PDP sitemap index URL (${DEFAULT_SITEMAP_INDEX_URL})
  --sitemap=url           Explicit Kroger PDP sitemap URL
  --limit=N               Stop after N missing targets are collected (default 0, no limit)
  --max-sitemaps=N        Stop after N PDP sitemaps for smoke tests (default 0, no limit)
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
  if (!Number.isFinite(maxSitemaps) || maxSitemaps < 0) usage("--max-sitemaps must be a non-negative number.");
  if (!/^https:\/\/www\.kroger\.com\/product-details-sitemap\.xml$/i.test(sitemapIndexUrl)) {
    usage("--sitemap-index must be https://www.kroger.com/product-details-sitemap.xml.");
  }
  if (explicitSitemapUrl && !/^https:\/\/www\.kroger\.com\/pdp-sitemap\/kroger-product-details-sitemap-\d+\.xml$/i.test(explicitSitemapUrl)) {
    usage("--sitemap must be a Kroger product-details sitemap URL.");
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
    .replace(/\b\d+(\s+)?(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|can|cans|bag|bags|case|pack|ct|count|tray|trays|pouch|pouches|box|boxes|tub|tubs)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseProductName(value) {
  const smallWords = new Set(["and", "or", "of", "for", "in", "with", "to", "the"]);
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
    .replace(/\bAcana\b/g, "ACANA")
    .replace(/\bIams\b/g, "Iams")
    .replace(/\bMeow Mix\b/g, "Meow Mix")
    .replace(/\bPurina One\b/g, "Purina ONE")
    .replace(/\bStella Chewy S\b/g, "Stella & Chewy's")
    .replace(/\bW\b/g, "with")
    .replace(/\bL I D\b/g, "L.I.D.")
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
  const raw = decodeXml(value).split("#")[0];
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return "";
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "www.kroger.com") return "";
  if (!/^\/p\/[^/?#]+\/\d{8,14}$/i.test(parsed.pathname)) return "";
  return parsed.toString();
}

function productNameFromUrl(url) {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const slug = parts[1] || "";
  return cleanProductName(decodeURIComponent(slug).replace(/[-_]/g, " "));
}

function productIdFromUrl(url) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).pop() || "";
  } catch {
    return "";
  }
}

function barcodeFromProductId(productId) {
  const value = String(productId || "").trim();
  return /^\d{8,14}$/.test(value) ? value : "";
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
    if (!response.ok) throw new Error(`Kroger sitemap fetch failed ${response.status}: ${url}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractProductSitemapLocs(xml) {
  return [...String(xml || "").matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => decodeXml(match[1]))
    .filter((url) => /^https:\/\/www\.kroger\.com\/pdp-sitemap\/kroger-product-details-sitemap-\d+\.xml$/i.test(url))
    .filter((url, index, list) => list.indexOf(url) === index);
}

async function resolveSitemapUrls() {
  if (explicitSitemapUrl) return [explicitSitemapUrl];
  const indexXml = await fetchText(sitemapIndexUrl);
  const urls = extractProductSitemapLocs(indexXml);
  if (urls.length === 0) throw new Error("Kroger PDP sitemap index did not expose product sitemap URLs.");
  return maxSitemaps > 0 ? urls.slice(0, maxSitemaps) : urls;
}

function parseProductRows(xml, sitemapUrl) {
  return [...String(xml || "").matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => cleanUrl(match[1]))
    .filter(Boolean)
    .map((sourceUrl) => {
      const productId = productIdFromUrl(sourceUrl);
      return {
        sourceUrl,
        name: productNameFromUrl(sourceUrl),
        productId,
        barcode: barcodeFromProductId(productId),
        sitemapUrl,
      };
    });
}

function isCandidateFoodRow(row) {
  const text = normalizeText(`${row.name} ${row.sourceUrl}`);
  const hasPetSignal = inferPetTypes({
    product_name: row.name,
    cache_key: normalizeCacheKey(row.name),
    source: "kroger_sitemap",
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
    brand,
    product_name: name,
    cache_key: cacheKey,
    source: "kroger_sitemap",
  }, { includeAmbiguous: false });
  if (petTypes.length === 0) return null;
  return {
    name,
    brand,
    petType: petTypes[0],
    petTypes,
    explicitPetType: true,
    cacheKey,
    source: "kroger_sitemap_export",
    sourceQuality: row.barcode ? "barcode_name" : "retailer_sitemap_slug",
    sourceUrl: row.sourceUrl,
    imageUrl: "",
    barcode: row.barcode || "",
    retailerProductId: row.productId,
    sourceSitemap: row.sitemapUrl,
    searchTerms: [...new Set([name, row.sourceUrl, row.barcode].filter(Boolean))],
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
  const barcodeCount = targets.filter((target) => target.barcode).length;
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
  }
  return {
    barcodeCount,
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
    source: "kroger_product_sitemap",
    sitemapIndexUrl,
    sitemapUrls,
    explicitSitemapUrl,
    maxSitemaps,
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

  console.log(`Kroger products scanned: ${scannedProducts}`);
  console.log(`Existing product_data keys: ${existing.size}`);
  console.log(`Missing Kroger sitemap targets exported: ${targets.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("Kroger sitemap catalog target export failed:", err.message);
  process.exit(1);
});
