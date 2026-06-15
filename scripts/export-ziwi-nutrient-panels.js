#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_SITEMAP_URL = "https://us.ziwipets.com/sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/nutrient-panel-ziwi-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof nutrient panel export";
const BRAND = "ZIWI";
const RETRY_HTTP_STATUS = new Set([429, 503]);
const MAX_FETCH_ATTEMPTS = 4;

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const sitemapArg = process.argv.find((arg) => arg.startsWith("--sitemap="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const delayArg = process.argv.find((arg) => arg.startsWith("--delay-ms="));
const includeUnmatched = process.argv.includes("--include-unmatched");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const sitemapUrl = sitemapArg ? sitemapArg.split("=").slice(1).join("=").trim() : DEFAULT_SITEMAP_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const delayMs = delayArg ? Number(delayArg.split("=")[1]) : 750;

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
const NUTRIENT_FIELD_ALIASES = [
  [/^crude protein\b/i, "protein_pct"],
  [/^crude fat\b/i, "fat_pct"],
  [/^crude fib(?:er|re)\b/i, "fiber_pct"],
  [/^moisture\b/i, "moisture_pct"],
  [/^ash\b/i, "ash_pct"],
  [/^calcium\b/i, "calcium_pct"],
  [/^phosphorus\b/i, "phosphorus_pct"],
  [/^omega[-\s]*3\b/i, "omega_3_pct"],
  [/^omega[-\s]*6\b/i, "omega_6_pct"],
];

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:ziwi-nutrient-panels -- --output=.tmp/nutrient-panel-ziwi-targets.json

Options:
  --output=path.json      Write a nutrient-panel backfill manifest (default ${DEFAULT_OUTPUT})
  --sitemap=url           Explicit ZIWI US sitemap URL (${DEFAULT_SITEMAP_URL})
  --limit=N               Stop after N matched nutrient panels are collected (default 0, no limit)
  --delay-ms=N            Delay between product-page requests (default 750)
  --include-unmatched     Include parsed nutrient rows without a matching product_data cache key under unmatchedTargets
  --skip-existing-scan    Skip product_data alias reads for parser smoke/debug exports only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  }
  if (!/^https:\/\/us\.ziwipets\.com\/sitemap\.xml$/i.test(sitemapUrl)) {
    usage("--sitemap must be https://us.ziwipets.com/sitemap.xml.");
  }
  if (!Number.isFinite(limit) || limit < 0) usage("--limit must be a non-negative number.");
  if (!Number.isFinite(delayMs) || delayMs < 0) usage("--delay-ms must be a non-negative number.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#38;|&amp;/g, "&")
    .replace(/&#39;|&apos;|’|‘/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;|&#8221;|&quot;|“|”/g, "\"")
    .replace(/&#x2F;/gi, "/")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, " "));
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
  return titleCaseProductName(decodeHtml(value)
    .replace(/-/g, " ")
    .replace(/\bml\b/gi, "Mackerel Lamb")
    .replace(/\btl\b/gi, "Tripe Lamb")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220));
}

function cleanUrl(value) {
  const url = decodeHtml(value).split("#")[0].replace(/\/$/, "");
  if (!/^https:\/\/us\.ziwipets\.com\/products\/[a-z0-9-]+$/i.test(url)) return "";
  return url;
}

function extractLocs(xml) {
  const urls = [];
  const pattern = /<loc>([\s\S]*?)<\/loc>/gi;
  let match;
  while ((match = pattern.exec(xml))) urls.push(decodeHtml(match[1]));
  return urls;
}

function extractSitemapUrls(xml) {
  return extractLocs(xml)
    .map((url) => url.replace(/&amp;/g, "&").trim())
    .filter((url) => /^https:\/\/us\.ziwipets\.com\/sitemap_products_\d+\.xml\?from=\d+&to=\d+$/i.test(url));
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
  return cleanProductName(String(slug || "").replace(/\boriginal\b/gi, "ZIWI Peak"));
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

function normalizeTarget(url) {
  const row = parseProductUrl(url);
  if (!row || !isCandidateFoodUrl(url)) return null;
  const petType = inferPetType(row.slug);
  const form = formFromSlug(row.slug);
  const name = addSpeciesQualifier(nameFromSlug(row.slug), petType);
  const cacheKey = normalizeCacheKey(`${BRAND} ${name}`);
  if (!cacheKey) return null;
  return {
    name,
    brand: BRAND,
    petType,
    cacheKey,
    sourceUrl: url,
    form,
    slug: row.slug,
  };
}

function titleAliases(target) {
  const aliases = new Set([
    target.name,
    target.name.replace(/\bZIWI Peak\b/i, ""),
    target.name.replace(/\bAir Dried\b/i, "Air-Dried"),
    target.name.replace(/\bSteam Dried\b/i, "Steam-Dried"),
    target.name.replace(/\bRecipe for Dogs\b/i, "Dog Food"),
    target.name.replace(/\bRecipe for Cats\b/i, "Cat Food"),
    target.name.replace(/\bfor Dogs\b/i, "Dog Food"),
    target.name.replace(/\bfor Cats\b/i, "Cat Food"),
    target.name.replace(/\bWet Canned\b/i, "Wet"),
    target.slug.replace(/-/g, " "),
  ]);
  return [...aliases].map((value) => cleanProductName(value)).filter(Boolean);
}

function addAlias(aliases, key, row) {
  if (key && !aliases.has(key)) aliases.set(key, row);
}

function isZiwiRow(row) {
  return /\b(ziwi|ziwipeak|ziwi peak)\b/i.test(`${row?.brand || ""} ${row?.product_name || ""} ${row?.cache_key || ""}`);
}

function addRowAliases(aliases, row) {
  if (!isZiwiRow(row)) return;
  const cacheKey = String(row?.cache_key || "").trim();
  const name = cleanProductName(row?.product_name || "");
  const brand = cleanProductName(row?.brand || "");
  const withoutBrand = name.replace(/^ziwi\s+peak\s+/i, "").replace(/^ziwi\s+/i, "");
  for (const key of [
    cacheKey,
    normalizeCacheKey(name),
    normalizeCacheKey(`${brand} ${name}`),
    normalizeCacheKey(`${BRAND} ${name}`),
    normalizeCacheKey(withoutBrand),
    normalizeCacheKey(`${BRAND} ${withoutBrand}`),
    normalizeCacheKey(`${BRAND} Peak ${withoutBrand}`),
  ]) addAlias(aliases, key, row);
}

function matchCatalogRow(target, aliases) {
  for (const alias of titleAliases(target)) {
    for (const key of [
      normalizeCacheKey(alias),
      normalizeCacheKey(`${BRAND} ${alias}`),
      normalizeCacheKey(`${BRAND} Peak ${alias}`),
    ]) {
      if (aliases.has(key)) return aliases.get(key);
    }
  }
  return null;
}

async function fetchText(url, accept = "text/html,*/*;q=0.8") {
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`timeout fetching ${url}`)), 90_000);
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: accept,
        },
        signal: controller.signal,
      });
      if (response.ok) return await response.text();
      if (!RETRY_HTTP_STATUS.has(response.status) || attempt === MAX_FETCH_ATTEMPTS) {
        throw new Error(`ZIWI fetch failed ${response.status}: ${url}`);
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 1000 * attempt * attempt;
      await sleep(waitMs);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`ZIWI fetch failed after retries: ${url}`);
}

async function fetchProductUrls() {
  const rootSitemap = await fetchText(sitemapUrl, "application/xml,text/xml,*/*;q=0.8");
  const productSitemaps = extractSitemapUrls(rootSitemap);
  const urls = [];
  for (const productSitemap of productSitemaps) {
    const sitemap = await fetchText(productSitemap, "application/xml,text/xml,*/*;q=0.8");
    for (const loc of extractLocs(sitemap)) {
      const url = cleanUrl(loc);
      if (url) urls.push(url);
    }
  }
  return { productSitemaps, urls };
}

async function fetchExistingAliases() {
  const aliases = new Map();
  if (skipExistingScan) return aliases;
  const base = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/product_data`;
  for (let from = 0; ; from += REST_PAGE_SIZE) {
    const response = await fetch(`${base}?select=cache_key,product_name,brand&order=cache_key.asc`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Range: `${from}-${from + REST_PAGE_SIZE - 1}`,
      },
    });
    if (!response.ok) throw new Error(`product_data read failed ${response.status}: ${await response.text()}`);
    const page = await response.json();
    for (const row of page) addRowAliases(aliases, row);
    if (page.length < REST_PAGE_SIZE) break;
  }
  return aliases;
}

function parseCalories(text, panel) {
  const kgMatch = text.match(/([\d,.]+)\s*kcal\s*ME\s*\/\s*kg/i);
  const cupMatch = text.match(/([\d,.]+)\s*kcal\s*ME\s*\/\s*(?:level\s*)?cup/i);
  if (kgMatch) panel.calories_per_kg = Number(kgMatch[1].replace(/,/g, ""));
  if (cupMatch) panel.calories_per_cup = Number(cupMatch[1].replace(/,/g, ""));
}

function nutrientField(label) {
  const cleaned = stripTags(label).replace(/\*/g, "").trim();
  for (const [pattern, field] of NUTRIENT_FIELD_ALIASES) {
    if (pattern.test(cleaned)) return field;
  }
  return "";
}

function parseGuaranteedAnalysis(html, sourceUrl) {
  const text = stripTags(html);
  const index = text.toLowerCase().indexOf("crude protein");
  if (index < 0) return { panel: null, reason: "missing_guaranteed_analysis" };
  const chunk = text.slice(index, index + 2500);
  const panel = { basis: "as-fed" };
  let percentageCount = 0;

  const nutrientPattern = /(Crude Protein|Crude Fat|Crude Fiber|Crude Fibre|Moisture|Ash|Calcium|Phosphorus|Omega[-\s]*3(?:\s+Fatty Acids?)?|Omega[-\s]*6(?:\s+Fatty Acids?)?)\s*:?\s*(?:\((?:min|max)\)\s*)?([\d.]+)\s*%/gi;
  let match;
  while ((match = nutrientPattern.exec(chunk))) {
    if (!match) continue;
    const field = nutrientField(match[1]);
    if (!field) continue;
    const numeric = Number(match[2]);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) continue;
    panel[field] = numeric;
    percentageCount++;
  }

  parseCalories(chunk, panel);
  panel.source_url = sourceUrl;
  const numericCount = percentageCount +
    (panel.calories_per_kg != null ? 1 : 0) +
    (panel.calories_per_cup != null ? 1 : 0);
  if (numericCount < 2) return { panel: null, reason: "nutrient_panel_too_sparse" };
  return { panel, reason: null };
}

function summarizeTargets(targets) {
  const byPetType = new Map();
  let withCalories = 0;
  let withMinerals = 0;
  let withOmega = 0;
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
    const panel = target.nutrientPanel || {};
    if (panel.calories_per_cup != null || panel.calories_per_kg != null) withCalories++;
    if (panel.calcium_pct != null || panel.phosphorus_pct != null || panel.ash_pct != null) withMinerals++;
    if (panel.omega_3_pct != null || panel.omega_6_pct != null) withOmega++;
  }
  return {
    byPetType: [...byPetType.entries()].map(([petType, count]) => ({ petType, count })).sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
    withCalories,
    withMinerals,
    withOmega,
  };
}

async function main() {
  assertConfig();
  const [{ productSitemaps, urls }, existingAliases] = await Promise.all([
    fetchProductUrls(),
    fetchExistingAliases(),
  ]);
  const candidates = urls.filter(isCandidateFoodUrl).map(normalizeTarget).filter(Boolean);
  const targets = [];
  const unmatchedTargets = [];
  const skipped = { nonFood: urls.length - candidates.length, missingCatalogAlias: 0, missingPanel: 0, duplicate: 0 };
  const seen = new Set();
  const panelRejectReasons = new Map();

  for (const candidate of candidates) {
    if (targets.length && delayMs) await sleep(delayMs);
    const html = await fetchText(candidate.sourceUrl);
    const { panel, reason } = parseGuaranteedAnalysis(html, candidate.sourceUrl);
    if (!panel) {
      skipped.missingPanel++;
      panelRejectReasons.set(reason, (panelRejectReasons.get(reason) || 0) + 1);
      continue;
    }
    const row = matchCatalogRow(candidate, existingAliases);
    const target = {
      cacheKey: row?.cache_key || candidate.cacheKey,
      productName: row?.product_name || candidate.name,
      brand: row?.brand || BRAND,
      petType: candidate.petType,
      source: "ziwi_official_product_page",
      sourceUrl: candidate.sourceUrl,
      nutrientPanel: panel,
    };
    if (!row && !skipExistingScan) {
      skipped.missingCatalogAlias++;
      if (includeUnmatched) unmatchedTargets.push(target);
      continue;
    }
    if (seen.has(target.cacheKey)) {
      skipped.duplicate++;
      continue;
    }
    seen.add(target.cacheKey);
    targets.push(target);
    if (limit && targets.length >= limit) break;
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: "ziwi_official_product_pages",
    sitemapUrl,
    productSitemaps,
    scannedUrls: urls.length,
    candidateProducts: candidates.length,
    existingAliasCount: existingAliases.size,
    matchedCount: targets.length,
    unmatchedCount: unmatchedTargets.length,
    skipped,
    panelRejectReasons: [...panelRejectReasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    summary: summarizeTargets(targets),
    targets,
    unmatchedTargets: includeUnmatched ? unmatchedTargets : undefined,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`ZIWI nutrient export wrote ${targets.length} matched panel targets to ${path.relative(root, outputPath)}`);
  console.log(`Scanned ${urls.length} URLs; candidates ${candidates.length}; unmatched catalog aliases ${skipped.missingCatalogAlias}; missing panels ${skipped.missingPanel}`);
}

main().catch((err) => {
  console.error("ZIWI nutrient panel export failed:", err.message);
  process.exit(1);
});
