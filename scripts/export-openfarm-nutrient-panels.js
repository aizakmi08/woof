#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BRAND = "Open Farm";
const DEFAULT_PRODUCTS_URL = "https://openfarmpet.com/products.json?limit=250";
const DEFAULT_OUTPUT = ".tmp/nutrient-panel-openfarm-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof nutrient panel export";
const GUARANTEED_ANALYSIS_HEADING = "Guaranteed Analysis";
const RETRY_HTTP_STATUS = new Set([429, 503]);
const MAX_FETCH_ATTEMPTS = 4;

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const productsArg = process.argv.find((arg) => arg.startsWith("--products-url="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const delayArg = process.argv.find((arg) => arg.startsWith("--delay-ms="));
const skipExistingScan = process.argv.includes("--skip-existing-scan");
const includeUnmatched = process.argv.includes("--include-unmatched");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const productsUrl = productsArg ? productsArg.split("=").slice(1).join("=").trim() : DEFAULT_PRODUCTS_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const delayMs = delayArg ? Number(delayArg.split("=")[1]) : 750;

const KEEP_PRODUCT_TYPES = new Set(["Dog Food", "Cat Food", "Dog Food Frozen"]);
const KEEP_PRODUCT_TYPE_TAGS = new Set([
  "_productType::dry",
  "_productType::wet",
  "_productType::frozen",
  "_productType::freeze_dried",
  "_productType::rawmix",
]);
const REJECT_PRODUCT_TYPE_TAGS = new Set([
  "_productType::treat",
  "_productType::supplement",
  "_productType::bonebroth",
  "_productType::broth",
]);
const REJECT_TERMS = [
  "treat", "treats", "supplement", "supplements", "bone broth",
  "broth for dogs", "broth for cats", "oil for dogs", "oil for cats",
  "chew", "chews", "snack", "snacks", "bundle", "variety pack",
  "meal plan", "gift",
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
  npm run export:openfarm-nutrient-panels -- --output=.tmp/nutrient-panel-openfarm-targets.json

Options:
  --output=path.json      Write a nutrient-panel backfill manifest (default ${DEFAULT_OUTPUT})
  --products-url=url      Explicit Open Farm Shopify products JSON URL (${DEFAULT_PRODUCTS_URL})
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
  if (!/^https:\/\/openfarmpet\.com\/products\.json\?limit=250$/i.test(productsUrl)) {
    usage("--products-url must be https://openfarmpet.com/products.json?limit=250.");
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
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;|’|‘/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " "));
}

function asciiFold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/\u202F/g, " ");
}

function normalizeText(value) {
  return asciiFold(value)
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/['’™®]/g, " ")
    .replace(/[-_/,%]+/g, " ")
    .replace(/[^a-z0-9\s&+%-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCacheKey(text) {
  return asciiFold(text)
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

function cleanProductName(value) {
  return asciiFold(decodeHtml(value))
    .replace(/™|®|©/g, "")
    .replace(/\bPâté\b/gi, "Pate")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function hasTerm(text, term) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  if (normalizedTerm.includes(" ")) return text.includes(normalizedTerm);
  return new RegExp(`(^|[^a-z0-9])${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text);
}

function tagSet(product) {
  return new Set((product?.tags || []).map((tag) => String(tag || "").trim()).filter(Boolean));
}

function hasAnyTag(tags, candidates) {
  for (const candidate of candidates) {
    if (tags.has(candidate)) return true;
  }
  return false;
}

function hasRegexTag(tags, pattern) {
  for (const tag of tags) {
    if (pattern.test(tag)) return true;
  }
  return false;
}

function inferPetType(product, tags) {
  const text = normalizeText(`${product.title} ${product.handle} ${product.product_type} ${[...tags].join(" ")}`);
  if (
    product.product_type === "Cat Food" ||
    hasRegexTag(tags, /YCRF_Cats|category::.*Cat|product_cat/i) ||
    /\b(cat|cats|kitten|kittens|feline)\b/.test(text)
  ) return "cat";
  if (
    product.product_type === "Dog Food" ||
    product.product_type === "Dog Food Frozen" ||
    hasRegexTag(tags, /YCRF_Dogs|category::.*Dog|product_dog/i) ||
    /\b(dog|dogs|puppy|puppies|canine)\b/.test(text)
  ) return "dog";
  return "";
}

function isCandidateFoodProduct(product) {
  const tags = tagSet(product);
  const text = normalizeText(`${product.title} ${product.handle} ${product.product_type} ${[...tags].join(" ")}`);
  if (!KEEP_PRODUCT_TYPES.has(product.product_type || "")) return false;
  if (!tags.has("_complete::yes") || tags.has("_complete::no")) return false;
  if (!hasAnyTag(tags, KEEP_PRODUCT_TYPE_TAGS)) return false;
  if (hasAnyTag(tags, REJECT_PRODUCT_TYPE_TAGS)) return false;
  if (hasRegexTag(tags, /^(_hidden|_nonsalable|YBlocklist)$/i)) return false;
  if (hasRegexTag(tags, /^category::Bundle$/i)) return false;
  if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  return !!inferPetType(product, tags);
}

function productUrl(product) {
  return `https://openfarmpet.com/products/${product.handle}`;
}

function titleAliases(title, petType) {
  const clean = cleanProductName(title);
  const aliases = new Set([clean]);
  const species = petType === "cat" ? "Cat" : "Dog";
  const otherSpecies = petType === "cat" ? "Dog" : "Cat";
  aliases.add(clean.replace(/\bDog Kibble\b/i, "Dry Dog Food"));
  aliases.add(clean.replace(/\bCat Kibble\b/i, "Dry Cat Food"));
  aliases.add(clean.replace(/\bKibble\b/i, `Dry ${species} Food`));
  aliases.add(clean.replace(/\bPate\b/i, `Pate for ${species}s`));
  aliases.add(clean.replace(/\bWet Food\b/i, `Wet ${species} Food`));
  aliases.add(clean.replace(new RegExp(`\\b${otherSpecies}\\b`, "i"), species));
  return [...aliases].filter(Boolean);
}

function addAlias(aliases, key, row) {
  if (key && !aliases.has(key)) aliases.set(key, row);
}

function addRowAliases(aliases, row) {
  const productName = cleanProductName(row?.product_name);
  const brand = cleanProductName(row?.brand || BRAND);
  const withoutBrand = productName.replace(/^open farm\s+/i, "");
  addAlias(aliases, String(row?.cache_key || "").trim(), row);
  addAlias(aliases, normalizeCacheKey(productName), row);
  addAlias(aliases, normalizeCacheKey(`${brand} ${productName}`), row);
  addAlias(aliases, normalizeCacheKey(withoutBrand), row);
  addAlias(aliases, normalizeCacheKey(`${brand} ${withoutBrand}`), row);
}

function collectProductAliases(product) {
  const petType = inferPetType(product, tagSet(product));
  const aliases = new Set();
  for (const alias of titleAliases(product.title, petType)) {
    aliases.add(normalizeCacheKey(alias));
    aliases.add(normalizeCacheKey(`${BRAND} ${alias}`));
  }
  aliases.add(normalizeCacheKey(`${BRAND} ${product.handle.replace(/-/g, " ")}`));
  return [...aliases].filter(Boolean);
}

function matchCatalogRow(product, aliases) {
  for (const key of collectProductAliases(product)) {
    if (aliases.has(key)) return aliases.get(key);
  }
  return null;
}

function pageUrl(baseUrl, page) {
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}page=${page}`;
}

async function fetchJson(url) {
  return fetchWithRetry(url, "json");
}

async function fetchWithRetry(url, mode) {
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`timeout fetching ${url}`)), 90_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: mode === "json" ? "application/json,*/*;q=0.8" : "text/html,*/*;q=0.8",
        },
      });
      if (response.ok) return mode === "json" ? response.json() : response.text();
      if (!RETRY_HTTP_STATUS.has(response.status) || attempt === MAX_FETCH_ATTEMPTS) {
        throw new Error(`fetch ${url} failed with ${response.status}`);
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
  throw new Error(`fetch ${url} failed after retries`);
}

async function fetchText(url) {
  return fetchWithRetry(url, "html");
}

async function fetchProducts() {
  const products = [];
  for (let page = 1; page <= 20; page++) {
    const json = await fetchJson(pageUrl(productsUrl, page));
    const pageProducts = Array.isArray(json?.products) ? json.products : [];
    products.push(...pageProducts);
    if (pageProducts.length === 0 || pageProducts.length < 250) break;
  }
  return products;
}

async function fetchExistingOpenFarmAliases() {
  const aliases = new Map();
  if (skipExistingScan) return aliases;
  let offset = 0;
  const base = SUPABASE_URL.replace(/\/$/, "");
  while (true) {
    const query = new URLSearchParams({
      select: "cache_key,product_name,brand",
      brand: "ilike.Open Farm",
      limit: String(REST_PAGE_SIZE),
      offset: String(offset),
    });
    const response = await fetch(`${base}/rest/v1/product_data?${query.toString()}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!response.ok) throw new Error(`product_data alias fetch failed with ${response.status}: ${await response.text()}`);
    const rows = await response.json();
    for (const row of rows) addRowAliases(aliases, row);
    if (rows.length < REST_PAGE_SIZE) break;
    offset += REST_PAGE_SIZE;
  }
  return aliases;
}

function parseCalories(text, panel) {
  const kgMatch = text.match(/([\d,.]+)\s*kcal\s*(?:me\s*)?\/\s*kg/i);
  const cupMatch = text.match(/([\d,.]+)\s*kcal\s*(?:me\s*)?\/\s*cup/i);
  if (kgMatch) panel.calories_per_kg = Number(kgMatch[1].replace(/,/g, ""));
  if (cupMatch) panel.calories_per_cup = Number(cupMatch[1].replace(/,/g, ""));
}

function parseNutrientField(label) {
  const normalized = stripTags(label).replace(/\*/g, "").trim();
  for (const [pattern, field] of NUTRIENT_FIELD_ALIASES) {
    if (pattern.test(normalized)) return field;
  }
  return "";
}

function parsePercent(value) {
  const match = stripTags(value).match(/([\d.]+)\s*%/);
  if (!match) return null;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return null;
  return numeric;
}

function parseGuaranteedAnalysis(html, sourceUrl) {
  const index = html.toLowerCase().indexOf(GUARANTEED_ANALYSIS_HEADING.toLowerCase());
  if (index < 0) return { panel: null, reason: "missing_guaranteed_analysis" };
  const chunk = html.slice(index, index + 35_000);
  const panel = { basis: "as-fed" };
  parseCalories(stripTags(chunk.slice(0, 3_000)), panel);

  let percentageCount = 0;
  const rows = [...chunk.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)];
  for (const row of rows) {
    const cells = [...row[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]);
    if (cells.length < 2) continue;
    const field = parseNutrientField(cells[0]);
    if (!field) continue;
    const numeric = parsePercent(cells[1]);
    if (numeric == null) continue;
    panel[field] = numeric;
    percentageCount++;
  }

  if (sourceUrl) panel.source_url = sourceUrl;
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
  const [products, existingAliases] = await Promise.all([
    fetchProducts(),
    fetchExistingOpenFarmAliases(),
  ]);
  const candidates = products.filter(isCandidateFoodProduct);
  const targets = [];
  const unmatchedTargets = [];
  const skipped = {
    nonFood: products.length - candidates.length,
    missingCatalogAlias: 0,
    missingPanel: 0,
  };
  const panelRejectReasons = new Map();

  for (const product of candidates) {
    if (targets.length && delayMs) await sleep(delayMs);
    const sourceUrl = productUrl(product);
    const html = await fetchText(sourceUrl);
    const { panel, reason } = parseGuaranteedAnalysis(html, sourceUrl);
    if (!panel) {
      skipped.missingPanel++;
      panelRejectReasons.set(reason, (panelRejectReasons.get(reason) || 0) + 1);
      continue;
    }

    const petType = inferPetType(product, tagSet(product));
    const row = matchCatalogRow(product, existingAliases);
    const target = {
      cacheKey: row?.cache_key || collectProductAliases(product)[0],
      productName: row?.product_name || cleanProductName(product.title),
      brand: row?.brand || BRAND,
      petType,
      source: "openfarm_official_product_page",
      sourceUrl,
      nutrientPanel: panel,
    };

    if (!row && !skipExistingScan) {
      skipped.missingCatalogAlias++;
      if (includeUnmatched) unmatchedTargets.push(target);
      continue;
    }
    targets.push(target);
    if (limit && targets.length >= limit) break;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: "openfarm_official_product_pages",
      productsUrl,
      scannedProducts: products.length,
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
    }, null, 2)}\n`,
    "utf8",
  );

  console.log(`Open Farm nutrient export wrote ${targets.length} matched panel targets to ${path.relative(root, outputPath)}`);
  console.log(`Scanned ${products.length} products; candidates ${candidates.length}; unmatched catalog aliases ${skipped.missingCatalogAlias}; missing panels ${skipped.missingPanel}`);
}

main().catch((err) => {
  console.error("Open Farm nutrient panel export failed:", err.message);
  process.exit(1);
});
