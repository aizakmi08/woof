#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { inferPetTypes } = require("./catalog-pet-type");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_SITEMAP_URL = "https://us.ziwipets.com/sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/ziwi-sitemap-catalog-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof catalog coverage export";
const BRAND = "ZIWI";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const sitemapArg = process.argv.find((arg) => arg.startsWith("--sitemap="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const includeExisting = process.argv.includes("--include-existing");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const sitemapUrl = sitemapArg ? sitemapArg.split("=").slice(1).join("=").trim() : DEFAULT_SITEMAP_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const KEEP_TERMS = [
  "air dried", "steam dried", "canned wet", "wet canned", "wet",
  "dog food", "cat food", "recipe for dogs", "recipe for cats",
  "for dogs", "for cats",
];

const REJECT_TERMS = [
  "bundle", "bundles", "variety pack", "test flight", "digital",
  "tripe for dogs", "green tripe", "weasand", "trachea", "ear",
  "ears", "lung", "kidney", "shank", "chew", "chews", "treat",
  "treats", "snack", "snacks", "topper", "toppers", "supplement",
  "supplements", "broth", "toy", "toys", "apparel", "litter",
  "gift", "gift card",
];

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:ziwi-sitemap-catalog -- --output=.tmp/ziwi-sitemap-catalog-targets.json

Options:
  --output=path.json      Write a backfill-compatible target manifest (default ${DEFAULT_OUTPUT})
  --sitemap=url           Explicit ZIWI US sitemap URL (${DEFAULT_SITEMAP_URL})
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
  if (!/^https:\/\/us\.ziwipets\.com\/sitemap\.xml$/i.test(sitemapUrl)) {
    usage("--sitemap must be https://us.ziwipets.com/sitemap.xml.");
  }
}

function decodeXml(value) {
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
    .replace(/[-_/,%]+/g, " ")
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
    .replace(/[-/&+,%]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b\d+(\s+)?(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|can|cans|bag|bags|case|pack|pk|ct|count|tray|trays|pouch|pouches|box|boxes)\b/g, " ")
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
    .replace(/\bZiwi\b/g, "ZIWI")
    .trim();
}

function cleanProductName(value) {
  return titleCaseProductName(decodeXml(value)
    .replace(/-/g, " ")
    .replace(/\bml\b/gi, "Mackerel Lamb")
    .replace(/\btl\b/gi, "Tripe Lamb")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220));
}

function cleanUrl(value) {
  const url = decodeXml(value).split("#")[0].replace(/\/$/, "");
  if (!/^https:\/\/us\.ziwipets\.com\/products\/[a-z0-9-]+$/i.test(url)) return "";
  return url;
}

function extractUrls(xml) {
  const urls = [];
  const pattern = /<loc>([\s\S]*?)<\/loc>/gi;
  let match;
  while ((match = pattern.exec(xml))) {
    const url = cleanUrl(match[1]);
    if (url) urls.push(url);
  }
  return urls;
}

function extractSitemapUrls(xml) {
  const urls = [];
  const pattern = /<loc>([\s\S]*?)<\/loc>/gi;
  let match;
  while ((match = pattern.exec(xml))) {
    const url = decodeXml(match[1]).replace(/&amp;/g, "&").trim();
    if (/^https:\/\/us\.ziwipets\.com\/sitemap_products_\d+\.xml\?from=\d+&to=\d+$/i.test(url)) {
      urls.push(url);
    }
  }
  return urls;
}

function parseProductUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length !== 2 || parts[0] !== "products") return null;
    const slug = parts[1];
    if (!slug) return null;
    return { slug };
  } catch {
    return null;
  }
}

function inferPetType(slug) {
  const text = normalizeText(slug);
  const cat = /\b(cat|cats|kitten|kittens|feline)\b/.test(text);
  const dog = /\b(dog|dogs|puppy|puppies|canine)\b/.test(text);
  if (cat && !dog) return "cat";
  if (dog && !cat) return "dog";
  return "";
}

function formFromSlug(slug) {
  const text = normalizeText(slug);
  if (hasTerm(text, "wet") || hasTerm(text, "canned")) return "wet";
  if (hasTerm(text, "air dried") || hasTerm(text, "steam dried")) return "dry";
  return "";
}

function nameFromSlug(slug) {
  return cleanProductName(String(slug || "")
    .replace(/\boriginal\b/gi, "ZIWI Peak")
    .replace(/\s+/g, " "));
}

function addSpeciesQualifier(name, petType) {
  const text = normalizeText(name);
  if (petType === "cat" && !/\b(cat|cats|kitten|kittens|feline)\b/.test(text)) return `${name} for Cats`;
  if (petType === "dog" && !/\b(dog|dogs|puppy|puppies|canine)\b/.test(text)) return `${name} for Dogs`;
  return name;
}

function isCandidateFoodUrl(url) {
  const row = parseProductUrl(url);
  if (!row) return false;
  const text = normalizeText(`${url} ${row.slug}`);
  if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  if (!KEEP_TERMS.some((term) => hasTerm(text, term))) return false;
  return Boolean(inferPetType(row.slug) && formFromSlug(row.slug));
}

function inferZiwiPetTypes(target) {
  const inferred = inferPetTypes({
    brand: BRAND,
    product_name: `${target.petType} ${target.name} ${target.sourceUrl}`,
    cache_key: normalizeCacheKey(`${target.petType} ${BRAND} ${target.name} ${target.sourceUrl}`),
    source: "ziwi_sitemap",
  }, { includeAmbiguous: false });
  if (inferred.length === 1 && inferred[0] === target.petType) return inferred;
  return [target.petType];
}

function normalizeTarget(url) {
  const row = parseProductUrl(url);
  if (!row || !isCandidateFoodUrl(url)) return null;
  const petType = inferPetType(row.slug);
  const form = formFromSlug(row.slug);
  if (!petType || !form) return null;
  const name = addSpeciesQualifier(nameFromSlug(row.slug), petType);
  const draft = { ...row, name, petType, sourceUrl: url };
  const petTypes = inferZiwiPetTypes(draft);
  if (petTypes.length !== 1 || petTypes[0] !== petType) return null;
  const cacheKey = normalizeCacheKey(`${BRAND} ${name}`);
  if (!cacheKey) return null;
  return {
    name,
    brand: BRAND,
    petType,
    petTypes,
    explicitPetType: true,
    cacheKey,
    source: "ziwi_sitemap_export",
    sourceQuality: "official_brand_sitemap_slug",
    sourceUrl: url,
    imageUrl: "",
    barcode: "",
    retailerProductId: row.slug,
    form,
    productType: `ziwi_${form}_food`,
    searchTerms: [...new Set([`${BRAND} ${name}`, name, url].filter(Boolean))],
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout fetching ${url}`)), 90_000);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/xml,text/xml,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`ZIWI sitemap fetch failed ${response.status}: ${url}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
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
      const name = cleanProductName(row?.product_name || "");
      const brand = cleanProductName(row?.brand || "");
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
  const byForm = new Map();
  const byLine = new Map();
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
    byForm.set(target.form, (byForm.get(target.form) || 0) + 1);
    byLine.set(target.productType, (byLine.get(target.productType) || 0) + 1);
  }
  return {
    byPetType: [...byPetType.entries()]
      .map(([petType, count]) => ({ petType, count }))
      .sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
    byForm: [...byForm.entries()]
      .map(([form, count]) => ({ form, count }))
      .sort((a, b) => b.count - a.count || a.form.localeCompare(b.form)),
    byLine: [...byLine.entries()]
      .map(([line, count]) => ({ line, count }))
      .sort((a, b) => b.count - a.count || a.line.localeCompare(b.line)),
  };
}

async function main() {
  assertConfig();

  const existing = await fetchExistingCacheKeys();
  const rootSitemap = await fetchText(sitemapUrl);
  const productSitemaps = extractSitemapUrls(rootSitemap);
  const rawUrls = [];
  for (const productSitemap of productSitemaps) {
    const sitemap = await fetchText(productSitemap);
    rawUrls.push(...[...String(sitemap || "").matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => decodeXml(match[1])));
  }
  const urls = extractUrls(rawUrls.map((url) => `<loc>${url}</loc>`).join("\n"));
  const skipped = { nonFood: 0, existing: 0, duplicate: 0, invalid: 0 };
  const byKey = new Map();

  for (const url of rawUrls) {
    if (!isCandidateFoodUrl(url)) {
      skipped.nonFood++;
      continue;
    }
    const target = normalizeTarget(url);
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
    source: "ziwi_sitemap",
    sitemapUrl,
    productSitemaps,
    includeExisting,
    skipExistingScan,
    scannedUrls: rawUrls.length,
    candidateUrls: urls.length,
    existingCount: existing.size,
    missingCount: targets.length,
    skipped,
    summary: summarizeTargets(targets),
    targets,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`ZIWI sitemap URLs scanned: ${rawUrls.length}`);
  console.log(`Candidate ZIWI product URLs: ${urls.length}`);
  console.log(`Existing product_data keys: ${existing.size}`);
  console.log(`Missing ZIWI sitemap targets exported: ${targets.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("ZIWI sitemap catalog target export failed:", err.message);
  process.exit(1);
});
