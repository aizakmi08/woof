#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BRAND = "Grandma Lucy's";
const DEFAULT_PRODUCTS_URL = "https://www.grandmalucys.com/products.json?limit=250";
const DEFAULT_OUTPUT = ".tmp/nutrient-panel-grandmalucys-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof nutrient panel export";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const productsArg = process.argv.find((arg) => arg.startsWith("--products-url="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const includeUnmatched = process.argv.includes("--include-unmatched");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const productsUrl = productsArg ? productsArg.split("=").slice(1).join("=").trim() : DEFAULT_PRODUCTS_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const COMPLETE_FOOD_LINE_TERMS = [
  "artisan",
  "pureformance",
  "macanna",
  "3 bears",
];
const REJECT_TERMS = [
  "pre-mix", "premix", "simple replacement", "top it", "sample",
  "treat", "treats", "topper", "toppers", "supplement", "supplements",
  "pumpkin pouch", "pumpkin pouches", "singles", "bundle", "gift",
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
  npm run export:grandmalucys-nutrient-panels -- --output=.tmp/nutrient-panel-grandmalucys-targets.json

Options:
  --output=path.json      Write a nutrient-panel backfill manifest (default ${DEFAULT_OUTPUT})
  --products-url=url      Explicit Grandma Lucy's Shopify products JSON URL (${DEFAULT_PRODUCTS_URL})
  --limit=N               Stop after N matched nutrient panels are collected (default 0, no limit)
  --include-unmatched     Include parsed nutrient rows without a matching product_data cache key under unmatchedTargets
  --skip-existing-scan    Skip product_data alias reads for parser smoke/debug exports only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  }
  if (!/^https:\/\/www\.grandmalucys\.com\/products\.json\?limit=250$/i.test(productsUrl)) {
    usage("--products-url must be https://www.grandmalucys.com/products.json?limit=250.");
  }
  if (!Number.isFinite(limit) || limit < 0) usage("--limit must be a non-negative number.");
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#38;|&amp;/g, "&")
    .replace(/&#39;|&apos;|’|‘/g, "'")
    .replace(/&#8220;|&#8221;|&quot;|“|”/g, "\"")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "));
}

function asciiFold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, "\"");
}

function normalizeText(value) {
  return asciiFold(value)
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, " ")
    .replace(/['’™®]/g, " ")
    .replace(/039/g, " ")
    .replace(/[-_/,%+]+/g, " ")
    .replace(/[^a-z0-9\s&]/g, " ")
    .replace(/\bamp\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCacheKey(text) {
  return normalizeText(text)
    .replace(/\b(grandmalucy|grandma lucys|grandma lucy s|dog food|cat food|food|formula|recipe|grain free|freeze dried|freezedried)\b/g, " ")
    .replace(/\b\d+(\s+)?(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|bag|bags|pack|pk|ct|count)\b/g, " ")
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
  return asciiFold(decodeHtml(value))
    .replace(/™|®|©/g, "")
    .replace(/^1LB\s+-\s*/i, "")
    .replace(/\s+Sample$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function canonicalLineName(product) {
  return cleanProductName(product.title);
}

function sourceUrl(product) {
  return `https://www.grandmalucys.com/products/${product.handle}`;
}

function isCandidateFoodProduct(product) {
  const text = normalizeText(`${product.title} ${product.handle} ${product.product_type} ${(product.tags || []).join(" ")}`);
  if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  if (!COMPLETE_FOOD_LINE_TERMS.some((term) => hasTerm(text, term))) return false;
  if (!/guaranteed analysis|crude protein|calorie content/i.test(product.body_html || "")) return false;
  return true;
}

function addAlias(aliases, key, row) {
  const normalized = normalizeCacheKey(key);
  if (normalized && !aliases.has(normalized)) aliases.set(normalized, row);
}

function addRowAliases(aliases, row) {
  addAlias(aliases, row?.cache_key, row);
  addAlias(aliases, row?.product_name, row);
  addAlias(aliases, `${row?.brand || BRAND} ${row?.product_name || ""}`, row);
}

function isGrandmaLucysRow(row) {
  return /grandma lucy|grandmalucy|3 bears/i.test(`${row?.brand || ""} ${row?.product_name || ""} ${row?.cache_key || ""}`) &&
    !/grandma mae/i.test(`${row?.brand || ""} ${row?.product_name || ""} ${row?.cache_key || ""}`);
}

async function fetchExistingAliases() {
  if (skipExistingScan) return new Map();
  const aliases = new Map();
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
      if (isGrandmaLucysRow(row)) addRowAliases(aliases, row);
    }
    if (page.length < REST_PAGE_SIZE) break;
  }
  return aliases;
}

function matchCatalogRow(product, aliases) {
  if (skipExistingScan) return null;
  const title = canonicalLineName(product);
  const keys = [
    title,
    `${BRAND} ${title}`,
  ];
  for (const key of keys) {
    const row = aliases.get(normalizeCacheKey(key));
    if (row) return row;
  }
  return null;
}

function parsePercentField(label, value, panel) {
  const cleanedLabel = stripTags(label).replace(/[:.]+$/g, "").trim();
  const field = NUTRIENT_FIELD_ALIASES.find(([pattern]) => pattern.test(cleanedLabel))?.[1];
  if (!field) return false;
  const match = String(value || "").match(/([\d.]+)\s*%/);
  if (!match) return false;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return false;
  panel[field] = numeric;
  return true;
}

function parseGuaranteedAnalysis(bodyHtml, url) {
  const text = stripTags(bodyHtml).replace(/>/g, " ");
  const index = text.toLowerCase().indexOf("guaranteed analysis");
  if (index < 0) return { panel: null, reason: "missing_guaranteed_analysis" };
  const chunk = text.slice(index, index + 900);
  const panel = { basis: "as-fed", source_url: url };
  let numericCount = 0;

  const nutrientPattern = /(Crude Protein|Crude Fat|Crude Fib(?:er|re)|Moisture|Ash|Calcium|Phosphorus|Omega[-\s]*3|Omega[-\s]*6)\s*\((?:min|max)\.?\)\s*([\d.]+\s*%)/gi;
  let match;
  while ((match = nutrientPattern.exec(chunk))) {
    if (parsePercentField(match[1], match[2], panel)) numericCount++;
  }

  match = text.match(/([\d,]+)\s*kcal\/kg/i);
  if (match) {
    panel.calories_per_kg = Number(match[1].replace(/,/g, ""));
    numericCount++;
  }
  match = text.match(/([\d,]+)\s*kcal\/cup/i);
  if (match) {
    panel.calories_per_cup = Number(match[1].replace(/,/g, ""));
    numericCount++;
  }

  if (numericCount < 2) return { panel: null, reason: "nutrient_panel_too_sparse" };
  return { panel, reason: null };
}

function summarizeTargets(targets) {
  let withCalories = 0;
  let withMinerals = 0;
  for (const target of targets) {
    const panel = target.nutrientPanel || {};
    if (panel.calories_per_cup != null || panel.calories_per_kg != null) withCalories++;
    if (panel.calcium_pct != null || panel.phosphorus_pct != null || panel.ash_pct != null) withMinerals++;
  }
  return {
    byPetType: [{ petType: "dog", count: targets.length }],
    withCalories,
    withMinerals,
  };
}

async function fetchProducts() {
  const response = await fetch(productsUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) throw new Error(`Grandma Lucy's product feed fetch failed ${response.status}: ${productsUrl}`);
  const json = await response.json();
  return Array.isArray(json.products) ? json.products : [];
}

async function main() {
  assertConfig();
  const [products, aliases] = await Promise.all([
    fetchProducts(),
    fetchExistingAliases(),
  ]);
  const candidates = products.filter(isCandidateFoodProduct);
  const targets = [];
  const unmatchedTargets = [];
  const seen = new Set();
  const skipped = { nonFood: products.length - candidates.length, missingCatalogAlias: 0, missingPanel: 0, duplicate: 0 };
  const panelRejectReasons = new Map();

  for (const product of candidates) {
    const url = sourceUrl(product);
    const { panel, reason } = parseGuaranteedAnalysis(product.body_html, url);
    if (!panel) {
      skipped.missingPanel++;
      panelRejectReasons.set(reason, (panelRejectReasons.get(reason) || 0) + 1);
      continue;
    }

    const row = matchCatalogRow(product, aliases);
    const target = {
      cacheKey: row?.cache_key || normalizeCacheKey(`${BRAND} ${canonicalLineName(product)}`),
      productName: row?.product_name || canonicalLineName(product),
      brand: row?.brand || BRAND,
      petType: "dog",
      source: "grandmalucys_official_shopify_json",
      sourceUrl: url,
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
    source: "grandmalucys_official_shopify_json",
    productsUrl,
    scannedProducts: products.length,
    candidateProducts: candidates.length,
    existingAliasCount: aliases.size,
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
  console.log(`Wrote ${targets.length} Grandma Lucy's nutrient panel targets to ${path.relative(root, outputPath)}`);
  console.log(`Scanned ${products.length} products; candidates ${candidates.length}; unmatched aliases ${skipped.missingCatalogAlias}; missing panels ${skipped.missingPanel}; duplicates ${skipped.duplicate}`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
