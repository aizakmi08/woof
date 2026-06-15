#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_SITEMAP_INDEX_URL = "https://www.onlynaturalpet.com/sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/onlynaturalpet-sitemap-catalog-targets.json";
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
  "canned dog food", "canned cat food", "freeze-dried dog food", "freeze dried dog food",
  "freeze-dried cat food", "freeze dried cat food", "air-dried dog food", "air dried dog food",
  "air-dried cat food", "air dried cat food", "dehydrated dog food", "dehydrated cat food",
  "raw dog food", "raw cat food", "kibble", "pate", "paté", "stew", "entree", "entrée", "dinner",
];

const TREAT_TERMS = [
  "treat", "treats", "chew", "chews", "jerky", "biscuits", "cookies",
  "dental", "bone", "bones", "rawhide", "no-hide", "pill hiding",
];

const SUPPLEMENTAL_FOOD_TERMS = [
  "supplemental", "supplement", "meal enhancer", "food topper", "topper", "toppers",
  "booster", "boosters", "bone broth", "broth", "pour overs", "pour-over", "pre-mix", "premix",
];

const NON_FOOD_TERMS = [
  "toy", "litter", "leash", "collar", "harness", "bowl", "bed", "crate", "carrier",
  "shampoo", "conditioner", "spray", "wipes", "brush", "comb", "flea", "tick",
  "capsule", "capsules", "caps", "gelcaps", "tablet", "tablets", "powder",
  "vitamin", "probiotic", "glucosamine", "calming", "vision", "urinary tract",
  "skin & coat", "skin and coat", "joint", "mobility", "herbal",
];

const BRAND_HINTS = [
  "ACANA", "Almo Nature", "Applaws", "Best Feline Friend", "Bravo!",
  "Canidae", "Carna4", "Cat Person", "Dave's Pet Food", "Dr. Harvey's",
  "Dr. Marty", "Earth Animal", "Earthborn Holistic", "Essence", "Evanger's",
  "Feline Natural", "FirstMate", "Fromm", "Fussie Cat", "Grandma Lucy's", "Halo",
  "Hound & Gatos", "I and Love and You", "Identity", "Instinct", "Jinx",
  "K9 Natural", "Kasiks", "Lotus", "Merrick",
  "Natural Balance", "Nature's Logic", "Northwest Naturals", "Nulo",
  "NutriSource", "OC Raw", "Only Natural Pet", "Open Farm", "Orijen",
  "Petcurean GO!", "Petcurean NOW!", "PetKind", "Primal", "Raised Right",
  "Rawz", "Redbarn", "Smallbatch", "Snappy Tom", "Sojos", "Square Pet",
  "Stella & Chewy's", "Steve's Real Food", "Taste of the Wild",
  "The Honest Kitchen", "The New Zealand Natural", "Tiki Cat", "Tiki Dog",
  "Tripett", "Tucker's", "Ultimates", "Vital Essentials", "Wellness CORE",
  "Wellness", "Weruva", "Wholesomes", "Ziwi Peak", "Zignature",
].sort((a, b) => b.length - a.length);

const BRAND_PREFIX_ALIASES = [
  ["ZiwiPeak", "Ziwi Peak"],
  ["Nutrisource", "NutriSource"],
  ["KASIKS", "Kasiks"],
  ["Jiminy's", "Jiminy's"],
  ["Jiminy’s", "Jiminy's"],
].sort((a, b) => b[0].length - a[0].length);

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:onlynaturalpet-sitemap-catalog -- --output=.tmp/onlynaturalpet-sitemap-catalog-targets.json

Options:
  --output=path.json      Write a backfill-compatible target manifest (default ${DEFAULT_OUTPUT})
  --sitemap-index=url     Only Natural Pet sitemap index URL (${DEFAULT_SITEMAP_INDEX_URL})
  --sitemap=url           Explicit Only Natural Pet product sitemap URL
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
  if (!/^https:\/\/www\.onlynaturalpet\.com\/sitemap\.xml$/i.test(sitemapIndexUrl)) {
    usage("--sitemap-index must be https://www.onlynaturalpet.com/sitemap.xml.");
  }
  if (explicitSitemapUrl && !/^https:\/\/www\.onlynaturalpet\.com\/sitemap_products_\d+\.xml\?/i.test(explicitSitemapUrl)) {
    usage("--sitemap must be an Only Natural Pet sitemap_products_*.xml URL.");
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
    .replace(/\bK9\b/gi, "K9")
    .replace(/\bAcana\b/g, "ACANA")
    .replace(/\bCarna4\b/g, "Carna4")
    .replace(/\bRawz\b/g, "Rawz")
    .replace(/\bFirstmate\b/g, "FirstMate")
    .replace(/\bZiwipeak\b/g, "Ziwi Peak")
    .replace(/\bNutrisource\b/g, "NutriSource")
    .replace(/\bKasiks\b/g, "Kasiks")
    .replace(/\bGrandma Lucy'?S\b/g, "Grandma Lucy's")
    .replace(/\bStella & Chewy'?S\b/g, "Stella & Chewy's")
    .replace(/\bNature'?S Logic\b/g, "Nature's Logic")
    .replace(/\bSteve'?S Real Food\b/g, "Steve's Real Food")
    .replace(/\b([A-Za-z]+)'S\b/g, "$1's")
    .replace(/\bI and Love and You\b/g, "I and Love and You")
    .replace(/\s+([,])/g, "$1")
    .trim();
}

function cleanProductName(value) {
  const cleaned = decodeXml(value)
    .replace(/\s*,?\s*(?:case of|pack of)\s*\d+\b.*$/i, "")
    .replace(/\s*,?\s*\d+(\.\d+)?\s*-?\s*(?:oz|fl\s*-?\s*oz|lb|lbs|kg|g|pound|ounce)s?\s*(?:bag|can|tray|pouch|box|tub|bottle|carton|cup)?\b.*$/i, "")
    .replace(/\s*,?\s*\d+\s*(?:count|ct|pack|pk)\b.*$/i, "")
    .replace(/[\s,-]+$/g, "")
    .replace(/\s+-\s+/g, " - ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
  return titleCaseProductName(cleaned);
}

function cleanVariantCaption(value) {
  const caption = cleanProductName(value);
  if (!caption) return "";
  const text = normalizeText(caption);
  if (!text || /^(front|back|package|bag|can|box|small|medium|large|single|variety)$/i.test(caption)) return "";
  if (/^\d+(\.\d+)?\s*(oz|lb|lbs|kg|g|count|ct|pack|pk)\b/i.test(caption)) return "";
  if (/(package|front|back|label|bag front|can front|group|image|new packaging)/i.test(caption)) return "";
  return caption;
}

function cleanUrl(value) {
  const url = decodeXml(value).split("#")[0];
  if (!/^https:\/\/www\.onlynaturalpet\.com\/products\/[a-z0-9-]+(?:\?.*)?$/i.test(url)) return "";
  return url.split("?")[0];
}

function cleanImageUrl(value) {
  const url = decodeXml(value);
  if (!/^https:\/\/cdn\.shopify\.com\//i.test(url)) return "";
  return url.slice(0, 500);
}

function productNameFromUrl(url) {
  const slug = new URL(url).pathname.split("/").filter(Boolean).pop() || "";
  return cleanProductName(decodeURIComponent(slug).replace(/-/g, " "));
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
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Only Natural Pet sitemap fetch failed ${response.status}: ${url}`);
  }
  return response.text();
}

function extractProductSitemapLocs(xml) {
  return [...String(xml || "").matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => decodeXml(match[1]))
    .filter((url) => /^https:\/\/www\.onlynaturalpet\.com\/sitemap_products_\d+\.xml\?/i.test(url))
    .filter((url, index, list) => list.indexOf(url) === index);
}

async function resolveSitemapUrls() {
  if (explicitSitemapUrl) return [explicitSitemapUrl];
  const indexXml = await fetchText(sitemapIndexUrl);
  const urls = extractProductSitemapLocs(indexXml);
  if (urls.length === 0) {
    throw new Error("Only Natural Pet sitemap index did not expose product sitemap URLs.");
  }
  return urls;
}

function parseProductRows(xml, sitemapUrl) {
  const rows = [];
  for (const match of String(xml || "").matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const block = match[1];
    const sourceUrl = cleanUrl(block.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1]);
    if (!sourceUrl) continue;
    const imageBlocks = [...block.matchAll(/<image:image>([\s\S]*?)<\/image:image>/gi)].map((item) => item[1]);
    const blocks = imageBlocks.length > 0 ? imageBlocks : [block];
    for (const imageBlock of blocks) {
      const title = cleanProductName(imageBlock.match(/<image:title>([\s\S]*?)<\/image:title>/i)?.[1]) ||
        productNameFromUrl(sourceUrl);
      const caption = cleanVariantCaption(imageBlock.match(/<image:caption>([\s\S]*?)<\/image:caption>/i)?.[1]);
      const name = caption && !normalizeText(title).includes(normalizeText(caption))
        ? cleanProductName(`${title} - ${caption}`)
        : title;
      if (!name) continue;
      rows.push({
        sourceUrl,
        name,
        imageUrl: cleanImageUrl(imageBlock.match(/<image:loc>([\s\S]*?)<\/image:loc>/i)?.[1]),
        productId: productIdFromUrl(sourceUrl),
        sitemapUrl,
      });
    }
  }
  return rows;
}

function isCandidateFoodRow(row) {
  const text = normalizeText(`${row.name} ${row.sourceUrl}`);
  const hasPetSignal = inferPetTypes({
    product_name: row.name,
    cache_key: normalizeCacheKey(row.name),
    source: "onlynaturalpet_sitemap",
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
    source: "onlynaturalpet_sitemap",
  }, { includeAmbiguous: false });
  if (petTypes.length === 0) return null;
  return {
    name,
    brand,
    petType: petTypes[0],
    petTypes,
    explicitPetType: true,
    cacheKey,
    source: "onlynaturalpet_sitemap_export",
    sourceQuality: "retailer_sitemap_title",
    sourceUrl: row.sourceUrl,
    imageUrl: row.imageUrl,
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
    String(a.name).localeCompare(String(b.name)) ||
    String(a.cacheKey).localeCompare(String(b.cacheKey))
  );

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: "onlynaturalpet_product_sitemap",
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

  console.log(`Only Natural Pet products scanned: ${scannedProducts}`);
  console.log(`Existing product_data keys: ${existing.size}`);
  console.log(`Missing Only Natural Pet sitemap targets exported: ${targets.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("Only Natural Pet sitemap catalog target export failed:", err.message);
  process.exit(1);
});
