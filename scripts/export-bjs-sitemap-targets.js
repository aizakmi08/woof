#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_SITEMAP_URL = "https://www.bjs.com/bjs_product_sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/bjs-sitemap-catalog-targets.json";
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
  "dog food", "cat food", "puppy food", "kitten food",
  "dry dog food", "dry cat food", "wet dog food", "wet cat food",
  "canned dog food", "canned cat food", "dog formula", "cat formula",
  "puppy formula", "kitten formula", "dog recipe", "cat recipe",
  "dog kibble", "cat kibble", "dog chow", "cat chow",
  "pate", "paté", "entree", "entrée", "dinner", "kibble",
  "fresh dog food", "fresh cat food", "dog food variety pack",
  "cat food variety pack", "complete adult dry dog food",
];

const TREAT_TERMS = [
  "treat", "treats", "chew", "chews", "jerky", "biscuit", "biscuits",
  "cookie", "cookies", "bone", "bones", "bully", "rawhide", "hide",
  "dental", "training treat", "soft chewy", "party mix", "temptations",
  "lickable", "lickables", "pup peroni", "beggin", "milk bone", "nudges",
  "dog joy", "blue bits", "health bars",
];

const SUPPLEMENTAL_FOOD_TERMS = [
  "supplement", "supplemental", "topper", "toppers", "mixer", "mixers",
  "meal mixer", "meal mixers", "broth", "goat milk", "milk replacer",
  "vitamin", "probiotic", "skin and coat", "digestive support",
];

const NON_FOOD_TERMS = [
  "litter", "tidy cats", "toy", "lego", "book", "treasury", "read",
  "pendant", "necklace", "bracelet", "ring", "earrings", "watch",
  "collar", "leash", "harness", "bed", "crate", "carrier", "bowl",
  "feeder", "fountain", "pad", "pads", "diaper", "shampoo", "wipes",
  "cleaner", "flea", "tick", "kennel", "grooming", "costume", "pool",
  "rug", "chair", "mouse", "headphones", "tablet", "controller",
  "catfish", "hot dog", "hot dogs", "corn dog", "corn dogs", "dogfish",
  "dogwood", "baby food", "food storage", "blue cheese", "almond milk",
  "french fries", "ketchup", "dehydrator", "food fix",
];

const BRAND_HINTS = [
  "9Lives", "Berkley Jensen", "Beneful", "Blue Buffalo", "Cesar",
  "Fancy Feast", "Freshpet", "Friskies", "Iams", "Meow Mix", "Pedigree",
  "Purina Cat Chow", "Purina Dog Chow", "Purina Friskies", "Purina ONE",
  "Purina", "Rachael Ray Nutrish", "Sheba",
].sort((a, b) => b.length - a.length);

const BRAND_PREFIX_ALIASES = [
  ["9 lives", "9Lives"],
  ["berkley jensen", "Berkley Jensen"],
  ["blue buffalo", "Blue Buffalo"],
  ["blue", "Blue Buffalo"],
  ["freshpet", "Freshpet"],
  ["iams", "Iams"],
  ["meow mix", "Meow Mix"],
  ["nutrish", "Rachael Ray Nutrish"],
  ["rachael ray nutrish", "Rachael Ray Nutrish"],
  ["purina beneful", "Beneful"],
  ["purina cat chow", "Purina Cat Chow"],
  ["purina dog chow", "Purina Dog Chow"],
  ["purina friskies", "Purina Friskies"],
  ["purina one", "Purina ONE"],
].sort((a, b) => b[0].length - a[0].length);

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:bjs-sitemap-catalog -- --output=.tmp/bjs-sitemap-catalog-targets.json

Options:
  --output=path.json      Write a backfill-compatible target manifest (default ${DEFAULT_OUTPUT})
  --sitemap=url           BJ's product sitemap URL (${DEFAULT_SITEMAP_URL})
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
  if (!/^https:\/\/www\.bjs\.com\/bjs_product_sitemap\.xml$/i.test(sitemapUrl)) {
    usage("--sitemap must be https://www.bjs.com/bjs_product_sitemap.xml.");
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
    .replace(/\b\d+(\s+)?(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|can|cans|bag|bags|case|pack|pk|ct|count|tray|trays|pouch|pouches|box|boxes|roll|rolls)\b/g, " ")
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
    .replace(/\bIams\b/g, "Iams")
    .replace(/\bMeow Mix\b/g, "Meow Mix")
    .replace(/\bPurina One\b/g, "Purina ONE")
    .replace(/\b9lives\b/gi, "9Lives")
    .replace(/\b9 Lives\b/g, "9Lives")
    .replace(/\bPate\b/g, "Pate")
    .replace(/\bReceipe\b/g, "Recipe")
    .replace(/\bDogsbreeds\b/g, "Dogs/Breeds")
    .replace(/\bLbs\b/g, "lbs")
    .replace(/\bLb\b/g, "lb")
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
  const raw = decodeXml(value).split("#")[0];
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return "";
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "www.bjs.com") return "";
  if (!/^\/product\/[^/?#]+\/\d+\/?$/i.test(parsed.pathname)) return "";
  return parsed.toString();
}

function productNameFromUrl(url) {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const slug = parts[1] || "";
  return cleanProductName(decodeURIComponent(slug).replace(/[-_]+/g, " "));
}

function productIdFromUrl(url) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).pop() || "";
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
    if (!response.ok) throw new Error(`BJ's sitemap fetch failed ${response.status}: ${url}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function imageLocFromBlock(block) {
  const imageLoc = String(block || "").match(/<image:loc>([\s\S]*?)<\/image:loc>/i);
  return imageLoc ? decodeXml(imageLoc[1]) : "";
}

function parseProductRows(xml) {
  return [...String(xml || "").matchAll(/<url>([\s\S]*?)<\/url>/gi)]
    .map((match) => {
      const block = match[1];
      const loc = block.match(/<loc>([\s\S]*?)<\/loc>/i);
      const sourceUrl = loc ? cleanUrl(loc[1]) : "";
      if (!sourceUrl) return null;
      const productId = productIdFromUrl(sourceUrl);
      return {
        sourceUrl,
        name: productNameFromUrl(sourceUrl),
        productId,
        imageUrl: imageLocFromBlock(block),
      };
    })
    .filter(Boolean);
}

function isCandidateFoodRow(row) {
  const text = normalizeText(`${row.name} ${row.sourceUrl}`);
  const hasPetSignal = inferPetTypes({
    product_name: row.name,
    cache_key: normalizeCacheKey(row.name),
    source: "bjs_sitemap",
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
    source: "bjs_sitemap",
  }, { includeAmbiguous: false });
  if (petTypes.length === 0) return null;
  return {
    name,
    brand,
    petType: petTypes[0],
    petTypes,
    explicitPetType: true,
    cacheKey,
    source: "bjs_sitemap_export",
    sourceQuality: "retailer_sitemap_slug",
    sourceUrl: row.sourceUrl,
    imageUrl: row.imageUrl || "",
    barcode: "",
    retailerProductId: row.productId,
    sourceSitemap: sitemapUrl,
    searchTerms: [...new Set([name, row.sourceUrl, row.productId].filter(Boolean))],
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
  const imageCount = targets.filter((target) => target.imageUrl).length;
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
  }
  return {
    imageCount,
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
    source: "bjs_product_sitemap",
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

  console.log(`BJ's products scanned: ${scannedProducts}`);
  console.log(`Existing product_data keys: ${existing.size}`);
  console.log(`Missing BJ's sitemap targets exported: ${targets.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("BJ's sitemap catalog target export failed:", err.message);
  process.exit(1);
});
