#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEFAULT_SITEMAP_INDEX_URL = "https://www.thehonestkitchen.com/sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/nutrient-panel-honestkitchen-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof nutrient panel export";
const BRAND = "The Honest Kitchen";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const sitemapIndexArg = process.argv.find((arg) => arg.startsWith("--sitemap-index="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const delayArg = process.argv.find((arg) => arg.startsWith("--delay-ms="));
const includeUnmatched = process.argv.includes("--include-unmatched");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const sitemapIndexUrl = sitemapIndexArg ? sitemapIndexArg.split("=").slice(1).join("=").trim() : DEFAULT_SITEMAP_INDEX_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const delayMs = delayArg ? Number(delayArg.split("=")[1]) : 350;

const CORE_FOOD_TERMS = [
  "dry dog food", "dry cat food", "wet dog food", "wet cat food",
  "dehydrated dog food", "dehydrated cat food", "puppy dog food",
  "whole food clusters", "essential clusters", "protein plus clusters",
  "one pot stew", "butcher block pate", "butcher block pâté",
  "cate wet cat food", "câté wet cat food", "minced wet cat food",
  "mousse in goats milk wet cat food", "mousse in goat s milk wet cat food",
  "pate wet dog food", "pâté wet dog food", "pate wet cat food",
  "pâté wet cat food", "dehydrated puppy dog food",
  "dehydrated senior dog food", "clusters for puppies",
  "clusters for small breeds",
];
const REJECT_TERMS = [
  "treat", "treats", "chew", "chews", "jerky", "cookie", "cookies",
  "chips", "bars", "crunch", "crisps", "pecks", "meaty littles",
  "supplement", "supplements", "topper", "toppers", "pour overs",
  "pour over", "meal booster", "booster", "base mix", "bone broth",
  "goat milk", "goat s milk plus", "goats milk plus", "instant goat",
  "perfect form", "digestive supplement", "bundle", "variety pack",
  "toy", "toys", "bowl", "scoop", "mat", "collar", "leash",
  "harness", "bed", "crate", "carrier", "litter", "shampoo",
];
const TOKEN_STOP_WORDS = new Set([
  "the", "honest", "kitchen", "human", "grade", "dog", "cat", "food",
  "dry", "wet", "wholemade", "recipe", "recipes", "grain", "free",
  "whole", "dehydrated", "clusters", "cluster", "essential", "protein",
  "plus", "butcher", "block", "pate", "pt", "cate", "ct", "gourmet",
  "complete", "balanced", "meal", "topper", "and", "with", "for",
  "of", "a", "an", "pack", "case", "food",
]);

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:honestkitchen-nutrient-panels -- --output=.tmp/nutrient-panel-honestkitchen-targets.json

Options:
  --output=path.json      Write a nutrient-panel backfill manifest (default ${DEFAULT_OUTPUT})
  --sitemap-index=url     The Honest Kitchen sitemap index URL (${DEFAULT_SITEMAP_INDEX_URL})
  --limit=N               Stop after N matched nutrient panels are collected (default 0, no limit)
  --delay-ms=N            Delay between product-page requests (default 350)
  --include-unmatched     Include parsed unmatched/ambiguous rows under unmatchedTargets
  --skip-existing-scan    Skip product_data alias reads for parser smoke/debug exports only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  }
  if (!/^https:\/\/www\.thehonestkitchen\.com\/sitemap\.xml$/i.test(sitemapIndexUrl)) {
    usage("--sitemap-index must be https://www.thehonestkitchen.com/sitemap.xml.");
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
    .replace(/&nbsp;/g, " ")
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
    .replace(/[-/&+]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b\d+(\s+)?(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|can|cans|bag|bags|case|pack|pk|ct|count|tray|trays|pouch|pouches|box|boxes)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulTokens(value) {
  return normalizeCacheKey(value)
    .split(" ")
    .filter((token) => token.length > 1 && !TOKEN_STOP_WORDS.has(token));
}

function cleanUrl(value) {
  const url = decodeHtml(value).split("#")[0].replace(/\/$/, "");
  if (!/^https:\/\/www\.thehonestkitchen\.com\/products\/[a-z0-9-]+$/i.test(url)) return "";
  return url;
}

function productSlug(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts.length === 2 && parts[0] === "products" ? parts[1] : "";
  } catch {
    return "";
  }
}

function productNameFromSlug(slug) {
  return decodeHtml(String(slug || "").replace(/-/g, " "))
    .replace(/\b(wet dog food|dry dog food|dehydrated dog food|dehydrated cat food|cat food|dog food)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function inferPetType(slug) {
  const text = normalizeText(slug);
  const cat = /\b(cat|cats|kitten|kittens|feline|cate)\b/.test(text);
  const dog = /\b(dog|dogs|puppy|puppies|canine)\b/.test(text);
  if (cat && !dog) return "cat";
  if (dog && !cat) return "dog";
  return "";
}

function isCandidateFoodUrl(url) {
  const text = normalizeText(url);
  if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  if (!CORE_FOOD_TERMS.some((term) => hasTerm(text, term))) return false;
  return !!inferPetType(productSlug(url));
}

function extractLocs(xml) {
  const urls = [];
  const pattern = /<loc>([\s\S]*?)<\/loc>/gi;
  let match;
  while ((match = pattern.exec(xml))) urls.push(decodeHtml(match[1]).replace(/&amp;/g, "&").trim());
  return urls;
}

function extractProductSitemaps(xml) {
  return extractLocs(xml).filter((url) =>
    /^https:\/\/www\.thehonestkitchen\.com\/sitemap_products_\d+\.xml\?from=\d+&to=\d+$/i.test(url)
  );
}

function normalizeTarget(url) {
  const slug = productSlug(url);
  if (!slug || !isCandidateFoodUrl(url)) return null;
  const petType = inferPetType(slug);
  const productName = productNameFromSlug(slug);
  if (!productName || !petType) return null;
  const cacheKey = normalizeCacheKey(`${BRAND} ${productName}`);
  const tokens = meaningfulTokens(productName);
  if (!cacheKey || tokens.length < 2) return null;
  return {
    productName,
    brand: BRAND,
    petType,
    cacheKey,
    sourceUrl: url,
    slug,
    matchTokens: tokens,
  };
}

async function fetchText(url, accept = "text/html,*/*;q=0.8") {
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
    if (!response.ok) throw new Error(`The Honest Kitchen fetch failed ${response.status}: ${url}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchProductUrls() {
  const rootSitemap = await fetchText(sitemapIndexUrl, "application/xml,text/xml,*/*;q=0.8");
  const productSitemaps = extractProductSitemaps(rootSitemap);
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

function isHonestKitchenRow(row) {
  return /honest kitchen/i.test(`${row?.brand || ""} ${row?.product_name || ""} ${row?.cache_key || ""}`);
}

function rowTokenSet(row) {
  return new Set(meaningfulTokens(`${row?.product_name || ""} ${row?.cache_key || ""}`));
}

async function fetchExistingRows() {
  if (skipExistingScan) return [];
  const rows = [];
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
    for (const row of page) {
      if (isHonestKitchenRow(row)) rows.push({ ...row, tokenSet: rowTokenSet(row) });
    }
    if (page.length < REST_PAGE_SIZE) break;
  }
  return rows;
}

function matchCatalogRow(target, rows) {
  if (skipExistingScan) return null;
  const matches = rows.filter((row) => target.matchTokens.every((token) => row.tokenSet.has(token)));
  return matches.length === 1 ? matches[0] : null;
}

function matchState(target, rows) {
  if (skipExistingScan) return { kind: "skipped_existing_scan", row: null };
  const matches = rows.filter((row) => target.matchTokens.every((token) => row.tokenSet.has(token)));
  if (matches.length === 1) return { kind: "matched", row: matches[0] };
  if (matches.length > 1) return { kind: "ambiguous", row: null, matches: matches.length };
  return { kind: "missing", row: null };
}

function stripPageText(html) {
  return decodeHtml(String(html || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " "));
}

function parseNutritionPanel(html, sourceUrl) {
  const text = stripPageText(html);
  const index = text.toLowerCase().indexOf("nutrition calories:");
  if (index < 0) return { panel: null, reason: "missing_nutrition_block" };
  const chunk = text.slice(index, index + 800);
  const panel = { basis: "as-fed" };
  let numericCount = 0;

  let match = chunk.match(/Calories:\s*([\d,.]+)\s*\(?kCal\)?\s*per\s*cup/i);
  if (match) {
    panel.calories_per_cup = Number(match[1].replace(/,/g, ""));
    numericCount++;
  }

  for (const [label, field] of [
    ["Protein", "protein_pct"],
    ["Fat", "fat_pct"],
    ["Fiber", "fiber_pct"],
    ["Moisture", "moisture_pct"],
  ]) {
    match = chunk.match(new RegExp(`${label}:\\s*([\\d.]+)\\s*%`, "i"));
    if (!match) continue;
    const numeric = Number(match[1]);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) continue;
    panel[field] = numeric;
    numericCount++;
  }

  panel.source_url = sourceUrl;
  if (numericCount < 2) return { panel: null, reason: "nutrient_panel_too_sparse" };
  return { panel, reason: null };
}

function summarizeTargets(targets) {
  const byPetType = new Map();
  let withCalories = 0;
  let withMinerals = 0;
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
    const panel = target.nutrientPanel || {};
    if (panel.calories_per_cup != null || panel.calories_per_kg != null) withCalories++;
    if (panel.calcium_pct != null || panel.phosphorus_pct != null || panel.ash_pct != null) withMinerals++;
  }
  return {
    byPetType: [...byPetType.entries()].map(([petType, count]) => ({ petType, count })).sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
    withCalories,
    withMinerals,
  };
}

async function main() {
  assertConfig();
  const [{ productSitemaps, urls }, existingRows] = await Promise.all([
    fetchProductUrls(),
    fetchExistingRows(),
  ]);
  const candidates = urls.filter(isCandidateFoodUrl).map(normalizeTarget).filter(Boolean);
  const targets = [];
  const unmatchedTargets = [];
  const seen = new Set();
  const skipped = { nonFood: urls.length - candidates.length, missingCatalogAlias: 0, ambiguousCatalogAlias: 0, missingPanel: 0, duplicate: 0 };
  const panelRejectReasons = new Map();

  for (const candidate of candidates) {
    if (targets.length && delayMs) await sleep(delayMs);
    const html = await fetchText(candidate.sourceUrl);
    const { panel, reason } = parseNutritionPanel(html, candidate.sourceUrl);
    if (!panel) {
      skipped.missingPanel++;
      panelRejectReasons.set(reason, (panelRejectReasons.get(reason) || 0) + 1);
      continue;
    }

    const state = matchState(candidate, existingRows);
    const row = state.row;
    const target = {
      cacheKey: row?.cache_key || candidate.cacheKey,
      productName: row?.product_name || candidate.productName,
      brand: row?.brand || BRAND,
      petType: candidate.petType,
      source: "honestkitchen_official_product_page",
      sourceUrl: candidate.sourceUrl,
      nutrientPanel: panel,
    };

    if (!row && !skipExistingScan) {
      if (state.kind === "ambiguous") skipped.ambiguousCatalogAlias++;
      else skipped.missingCatalogAlias++;
      if (includeUnmatched) unmatchedTargets.push({ ...target, matchState: state.kind, matchTokens: candidate.matchTokens });
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
    source: "honestkitchen_official_product_pages",
    sitemapIndexUrl,
    productSitemaps,
    scannedUrls: urls.length,
    candidateProducts: candidates.length,
    existingAliasCount: existingRows.length,
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

  console.log(`The Honest Kitchen nutrient export wrote ${targets.length} matched panel targets to ${path.relative(root, outputPath)}`);
  console.log(`Scanned ${urls.length} URLs; candidates ${candidates.length}; unmatched aliases ${skipped.missingCatalogAlias}; ambiguous aliases ${skipped.ambiguousCatalogAlias}; missing panels ${skipped.missingPanel}`);
}

main().catch((err) => {
  console.error("The Honest Kitchen nutrient panel export failed:", err.message);
  process.exit(1);
});
