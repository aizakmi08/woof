#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_SITEMAP_INDEX_URL = "https://www.chewy.com/app/sitemap/behijkmoqrrtttvvy-pdp-sitemap_index.xml";
const DEFAULT_OUTPUT = ".tmp/chewy-sitemap-catalog-targets.json";
const REST_PAGE_SIZE = 1000;
const MAX_SITEMAPS = 7;
const USER_AGENT = "WoofApp/1.1 catalog coverage export (contact: support@woof.app)";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const sitemapIndexArg = process.argv.find((arg) => arg.startsWith("--sitemap-index="));
const maxSitemapsArg = process.argv.find((arg) => arg.startsWith("--max-sitemaps="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const includeExisting = process.argv.includes("--include-existing");
const includeTreats = process.argv.includes("--include-treats");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const sitemapIndexUrl = sitemapIndexArg ? sitemapIndexArg.split("=").slice(1).join("=").trim() : DEFAULT_SITEMAP_INDEX_URL;
const maxSitemaps = maxSitemapsArg ? Number(maxSitemapsArg.split("=")[1]) : MAX_SITEMAPS;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const CORE_FOOD_TERMS = [
  "dog food", "cat food", "puppy food", "kitten food",
  "dry food", "wet food", "canned food", "fresh food",
  "freeze-dried", "freeze dried", "air-dried", "air dried",
  "dehydrated", "kibble", "pate", "paté", "stew", "entree", "entrée",
  "meal topper", "food topper", "topper", "broth", "gravy", "morsels",
  "recipe", "dinner", "chunks in gravy", "minced", "shreds",
];

const TREAT_TERMS = [
  "treat", "treats", "chew", "chews", "dental bone", "dental sticks",
  "jerky", "bully stick", "rawhide", "biscuits", "cookies",
];

const NON_FOOD_TERMS = [
  "toy", "leash", "collar", "harness", "bed", "crate", "kennel", "playpen",
  "bowl", "feeder", "fountain", "filter", "pump", "litter", "wipes", "shampoo",
  "conditioner", "spray", "brush", "comb", "nail", "diaper", "bandage",
  "apparel", "sweater", "costume", "carrier", "ramp", "gate", "door", "mat",
  "storage container", "scoop", "lid", "replacement", "refill bag", "board",
  "knife", "stain", "odor", "remover", "wound", "skin care", "hot spot",
];

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:chewy-sitemap-catalog -- --output=.tmp/chewy-sitemap-catalog-targets.json --max-sitemaps=7

Options:
  --output=path.json           Write a backfill-compatible target manifest (default ${DEFAULT_OUTPUT})
  --sitemap-index=url          Chewy PDP sitemap index URL (default current public PDP index)
  --max-sitemaps=N             Number of PDP sitemap files to read, 1-${MAX_SITEMAPS} (default ${MAX_SITEMAPS})
  --limit=N                    Stop after N missing targets are collected (default 0, no limit)
  --include-existing           Include targets already present in product_data for audit only
  --include-treats             Include treat/chew titles in addition to core food titles
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  }
  if (!/^https:\/\/www\.chewy\.com\/app\/sitemap\/[^?#]+\.xml$/i.test(sitemapIndexUrl)) {
    usage("--sitemap-index must be a Chewy sitemap XML URL under /app/sitemap/.");
  }
  if (!Number.isInteger(maxSitemaps) || maxSitemaps < 1 || maxSitemaps > MAX_SITEMAPS) {
    usage(`--max-sitemaps must be an integer between 1 and ${MAX_SITEMAPS}.`);
  }
  if (!Number.isFinite(limit) || limit < 0) {
    usage("--limit must be a non-negative number.");
  }
}

function decodeXml(value) {
  return String(value || "")
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

function cleanProductName(value) {
  return decodeXml(value)
    .replace(/\s*,?\s*(?:case of|pack of)\s*\d+\b.*$/i, "")
    .replace(/\s*,?\s*\d+(\.\d+)?\s*-?\s*(?:oz|fl\s*-?\s*oz|lb|lbs|kg|g|pound|ounce)s?\s*(?:bag|can|tray|pouch|box|tub|bottle|carton|cup)?\b.*$/i, "")
    .replace(/\s*,?\s*\d+\s*(?:count|ct|pack|pk)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function cleanUrl(value) {
  const url = decodeXml(value);
  if (!/^https:\/\/www\.chewy\.com\//i.test(url)) return "";
  if (/^https:\/\/www\.chewy\.com\/ca\//i.test(url)) return "";
  if (!/\/dp\/\d+(?:$|[/?#])/i.test(url)) return "";
  return url;
}

function cleanImageUrl(value) {
  const url = decodeXml(value);
  if (!/^https:\/\/image\.chewy\.com\//i.test(url)) return "";
  return url.slice(0, 500);
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
    throw new Error(`Chewy sitemap fetch failed ${response.status}: ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const body = buffer[0] === 0x1f && buffer[1] === 0x8b ? zlib.gunzipSync(buffer) : buffer;
  return body.toString("utf8");
}

function extractLocs(xml) {
  return [...String(xml || "").matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => decodeXml(match[1]))
    .filter(Boolean);
}

function productIdFromUrl(url) {
  return String(url || "").match(/\/dp\/(\d+)/i)?.[1] || "";
}

function parseProductUrls(xml, sitemapUrl) {
  const rows = [];
  for (const match of String(xml || "").matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const block = match[1];
    const sourceUrl = cleanUrl(block.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1]);
    if (!sourceUrl) continue;
    const title = cleanProductName(block.match(/<image:title>([\s\S]*?)<\/image:title>/i)?.[1]);
    if (!title) continue;
    const imageUrl = cleanImageUrl(block.match(/<image:loc>([\s\S]*?)<\/image:loc>/i)?.[1]);
    rows.push({ sourceUrl, title, imageUrl, productId: productIdFromUrl(sourceUrl), sitemapUrl });
  }
  return rows;
}

function isCandidateFoodTitle(title) {
  const text = normalizeText(title);
  const hasPetSignal = inferPetTypes({
    product_name: title,
    cache_key: normalizeCacheKey(title),
    source: "chewy_sitemap",
  }, { includeAmbiguous: false }).length > 0;
  if (!hasPetSignal) return false;
  if (NON_FOOD_TERMS.some((term) => hasTerm(text, term))) return false;
  const coreFood = CORE_FOOD_TERMS.some((term) => hasTerm(text, term));
  const treat = includeTreats && TREAT_TERMS.some((term) => hasTerm(text, term));
  if (!coreFood && !treat) return false;
  return true;
}

function normalizeTarget(row) {
  const name = cleanProductName(row.title);
  const cacheKey = normalizeCacheKey(name);
  if (!cacheKey) return null;
  const petTypes = inferPetTypes({
    product_name: name,
    cache_key: cacheKey,
    source: "chewy_sitemap",
  }, { includeAmbiguous: false });
  if (petTypes.length === 0) return null;
  return {
    name,
    brand: "",
    petType: petTypes[0],
    petTypes,
    explicitPetType: true,
    cacheKey,
    source: "chewy_sitemap_export",
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
  return [
    target.cacheKey,
    normalizeCacheKey(target.name),
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
  const bySitemap = new Map();
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
    bySitemap.set(target.sourceSitemap, (bySitemap.get(target.sourceSitemap) || 0) + 1);
  }
  return {
    byPetType: [...byPetType.entries()]
      .map(([petType, count]) => ({ petType, count }))
      .sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
    bySitemap: [...bySitemap.entries()]
      .map(([sourceSitemap, count]) => ({ sourceSitemap, count }))
      .sort((a, b) => b.count - a.count || a.sourceSitemap.localeCompare(b.sourceSitemap)),
  };
}

async function main() {
  assertConfig();

  const existing = await fetchExistingCacheKeys();
  const indexXml = await fetchText(sitemapIndexUrl);
  const sitemapUrls = extractLocs(indexXml)
    .filter((url) => /^https:\/\/www\.chewy\.com\/app\/sitemap\/[^?#]+pdp_\d+\.xml\.gz$/i.test(url))
    .slice(0, maxSitemaps);
  if (sitemapUrls.length === 0) {
    throw new Error("No Chewy PDP sitemap URLs found in sitemap index.");
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
    const rows = parseProductUrls(xml, sitemapUrl);
    for (const row of rows) {
      scannedProducts++;
      if (!isCandidateFoodTitle(row.title)) {
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
    source: "chewy_pdp_sitemap",
    sitemapIndexUrl,
    includeExisting,
    includeTreats,
    requestedMaxSitemaps: maxSitemaps,
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

  console.log(`Chewy sitemaps fetched: ${sitemapsFetched}`);
  console.log(`Chewy products scanned: ${scannedProducts}`);
  console.log(`Existing product_data keys: ${existing.size}`);
  console.log(`Missing Chewy sitemap targets exported: ${targets.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("Chewy sitemap catalog target export failed:", err.message);
  process.exit(1);
});
