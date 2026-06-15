#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BRAND = "Nulo";
const DEFAULT_SITEMAP_URL = "https://nulo.com/sitemap-products.xml";
const DEFAULT_OUTPUT = ".tmp/nutrient-panel-nulo-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof nutrient panel export";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const sitemapArg = process.argv.find((arg) => arg.startsWith("--sitemap="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const delayArg = process.argv.find((arg) => arg.startsWith("--delay-ms="));
const includeUnmatched = process.argv.includes("--include-unmatched");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const sitemapUrl = sitemapArg ? sitemapArg.split("=").slice(1).join("=").trim() : DEFAULT_SITEMAP_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const delayMs = delayArg ? Number(delayArg.split("=")[1]) : 150;

const REJECT_TERMS = [
  "bars", "bone broth", "broth variety pack", "calming", "chew", "chews",
  "digestion gut health", "functional granola", "granola bars", "hemp",
  "hydration", "immune", "jerky", "meal topper", "megapack", "oil",
  "perfect puree", "puree", "soft chew", "supplement", "supplements",
  "topper", "toppers", "training", "treat", "treats",
];
const CORE_FOOD_TERMS = [
  "cat & kitten", "cat and kitten", "for puppies", "for seniors",
  "for small breed", "for small breeds", "freeze dried raw",
  "freeze-dried raw", "hairball management", "high protein kibble",
  "in broth recipe", "in gravy", "kibble", "limited+", "medalseries",
  "minced", "pate", "pâté", "recipe in broth", "recipe in gravy",
  "shredded", "signature stew", "silky mousse", "stew", "trim",
];
const ANIMAL_PROTEIN_TOKENS = new Set([
  "beef", "chicken", "cod", "crab", "duck", "fish", "fowl", "guinea",
  "haddock", "halibut", "herring", "lamb", "liver", "mackerel", "mussel",
  "pollock", "pork", "redfish", "salmon", "sardine", "shrimp", "trout",
  "tuna", "turkey", "whitefish", "yellowfin",
]);
const LINE_TOKENS = new Set([
  "challenger", "freestyle", "medalseries", "signature",
]);
const DISTINCTIVE_STOP_TOKENS = new Set([
  "adult", "all", "amount", "and", "breed", "breeds", "broth", "cat",
  "cats", "com", "dog", "dogs", "dry", "food", "for", "free", "from",
  "grain", "grains", "gravy", "high", "http", "https", "in", "ingredient",
  "ingredients", "kibble", "kitten", "limited", "meal", "medalseries",
  "min", "minced", "natural", "nulo", "of", "pate", "pet", "products",
  "protein", "puppies", "puppy", "recipe", "recipes", "senior", "shredded",
  "small", "stew", "the", "with", "www",
]);
const LIFE_STAGE_TOKENS = [
  "digestive", "hairball", "indoor", "kitten", "large", "puppy", "senior",
  "small", "trim", "weight",
];
const NUTRIENT_FIELD_ALIASES = [
  [/\bcrude\s+protein\b/i, "protein_pct"],
  [/\bcrude\s+fat\b/i, "fat_pct"],
  [/\bcrude\s+fib(?:er|re)\b/i, "fiber_pct"],
  [/\bmoisture\b/i, "moisture_pct"],
  [/\bash\b/i, "ash_pct"],
  [/\bcalcium\b/i, "calcium_pct"],
  [/\bphosphorus\b/i, "phosphorus_pct"],
  [/\bomega[-\s]*3\b/i, "omega_3_pct"],
  [/\bomega[-\s]*6\b/i, "omega_6_pct"],
];

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:nulo-nutrient-panels -- --output=.tmp/nutrient-panel-nulo-targets.json

Options:
  --output=path.json      Write a nutrient-panel backfill manifest (default ${DEFAULT_OUTPUT})
  --sitemap=url           Explicit Nulo product sitemap URL (${DEFAULT_SITEMAP_URL})
  --limit=N               Stop after N matched nutrient panels are collected (default 0, no limit)
  --delay-ms=N            Delay between product-page requests (default 150)
  --include-unmatched     Include parsed unmatched/ambiguous rows under unmatchedTargets
  --skip-existing-scan    Skip product_data alias reads for parser smoke/debug exports only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  if (!Number.isFinite(limit) || limit < 0) usage("--limit must be a non-negative number.");
  if (!Number.isFinite(delayMs) || delayMs < 0) usage("--delay-ms must be a non-negative number.");
  if (!/^https:\/\/nulo\.com\/sitemap-products\.xml$/i.test(sitemapUrl)) {
    usage("--sitemap must be https://nulo.com/sitemap-products.xml.");
  }
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

function asciiFold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, "\"");
}

function normalizeText(value) {
  return asciiFold(decodeHtml(value))
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/['’™®]/g, " ")
    .replace(/[-_/,%+]+/g, " ")
    .replace(/[^a-z0-9\s&]/g, " ")
    .replace(/\bamp\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCacheKey(text) {
  return normalizeText(text)
    .replace(/\b(dog food|cat food|formula|recipe|food for dogs|food for cats)\b/g, " ")
    .replace(/\b\d+(\s+)?(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|can|cans|bag|bags|case|pack|pk|ct|count|tray|trays|pouch|pouches|box|boxes)\b/g, " ")
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
  return decodeHtml(value)
    .replace(/™|®|©/g, "")
    .replace(/\bPâté\b/gi, "Pate")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function cleanUrl(value) {
  try {
    const parsed = new URL(decodeHtml(value));
    parsed.hash = "";
    parsed.search = "";
    const url = parsed.href.replace(/\/$/, "");
    if (!/^https:\/\/nulo\.com\/products\/[a-z0-9-]+$/i.test(url)) return "";
    return url;
  } catch {
    return "";
  }
}

function productIdFromUrl(url) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).pop() || "";
  } catch {
    return "";
  }
}

function imageTitleFromBlock(block) {
  const title = String(block || "").match(/<image:title>([\s\S]*?)<\/image:title>/i);
  return title ? cleanProductName(title[1]) : "";
}

function parseSitemapRows(xml) {
  return [...String(xml || "").matchAll(/<url>([\s\S]*?)<\/url>/gi)]
    .map((match) => {
      const block = match[1];
      const loc = block.match(/<loc>([\s\S]*?)<\/loc>/i);
      const sourceUrl = loc ? cleanUrl(loc[1]) : "";
      const name = imageTitleFromBlock(block);
      if (!sourceUrl || !name) return null;
      return {
        sourceUrl,
        name,
        retailerProductId: productIdFromUrl(sourceUrl),
        normalizedText: normalizeText(`${name} ${sourceUrl}`),
      };
    })
    .filter(Boolean);
}

function isCandidateSitemapRow(row) {
  const text = row.normalizedText;
  if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  return CORE_FOOD_TERMS.some((term) => hasTerm(text, term));
}

function inferPetTypeFromText(value) {
  const text = normalizeText(value);
  const cat = /\b(cat|cats|kitten|kittens|feline)\b/.test(text);
  const dog = /\b(dog|dogs|puppy|puppies|canine)\b/.test(text);
  if (cat && !dog) return "cat";
  if (dog && !cat) return "dog";
  return "";
}

function inferPetType(targetText, tagsText) {
  const tagPetType = inferPetTypeFromText(tagsText);
  if (tagPetType) return tagPetType;
  const textPetType = inferPetTypeFromText(targetText);
  if (textPetType) return textPetType;
  const text = normalizeText(targetText);
  if (hasTerm(text, "challenger high protein kibble")) return "dog";
  if (hasTerm(text, "medalseries high protein kibble")) return "dog";
  return "";
}

function inferProductFormFromText(value) {
  const text = normalizeText(value);
  if (/\b(freeze dried raw|freeze dried|morsels)\b/.test(text)) return "freeze_dried";
  if (/\b(kibble|dry)\b/.test(text)) return "dry";
  if (/\b(wet|can|canned|stew|pate|minced|shredded|mousse|gravy|broth)\b/.test(text)) return "wet";
  return "";
}

function animalProteinTokens(value) {
  return [...new Set(normalizeText(value)
    .split(/\s+/)
    .filter((token) => ANIMAL_PROTEIN_TOKENS.has(token)))]
    .sort();
}

function lineTokens(value) {
  return [...new Set(normalizeText(value)
    .split(/\s+/)
    .filter((token) => LINE_TOKENS.has(token)))]
    .sort();
}

function distinctiveTokens(value) {
  return [...new Set(normalizeText(value)
    .split(/\s+/)
    .filter((token) =>
      token.length > 2 &&
      !DISTINCTIVE_STOP_TOKENS.has(token) &&
      !ANIMAL_PROTEIN_TOKENS.has(token) &&
      !LINE_TOKENS.has(token)
    ))].sort();
}

async function fetchText(url, accept = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8") {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: accept,
    },
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`Nulo fetch failed ${response.status}: ${url}`);
  return response.text();
}

function jsonLdBlocks(html) {
  return [...String(html || "").matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => decodeHtml(match[1]).trim())
    .filter(Boolean);
}

function flattenJsonLd(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (typeof value !== "object") return [];
  const graph = Array.isArray(value["@graph"]) ? value["@graph"].flatMap(flattenJsonLd) : [];
  return [value, ...graph];
}

function additionalProperties(product) {
  const properties = new Map();
  for (const property of product?.additionalProperty || []) {
    const name = normalizeText(property?.name || property?.key || "");
    if (!name || property?.value == null) continue;
    properties.set(name, String(property.value));
  }
  return properties;
}

function findProductJsonLd(html) {
  for (const block of jsonLdBlocks(html)) {
    let parsed;
    try {
      parsed = JSON.parse(block);
    } catch {
      continue;
    }
    for (const node of flattenJsonLd(parsed)) {
      const type = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
      const brandName = normalizeText(node?.brand?.name || node?.brand || "");
      if (!type.some((item) => String(item).toLowerCase() === "product")) continue;
      if (brandName && brandName !== "nulo") continue;
      if (!node.name || !Array.isArray(node.additionalProperty)) continue;
      return node;
    }
  }
  return null;
}

function nutrientField(label) {
  for (const [pattern, field] of NUTRIENT_FIELD_ALIASES) {
    if (pattern.test(label)) return field;
  }
  return "";
}

function parsePercent(value) {
  const number = Number(String(value || "").replace(/,/g, "").replace(/\*/g, ""));
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}

function parseNutrientPanelFromProduct(product, sourceUrl) {
  const properties = additionalProperties(product);
  const table = properties.get("ingredientsanalysistable") || "";
  const calories = properties.get("caloriecontent") || "";
  if (!table) return { panel: null, reason: "missing_guaranteed_analysis_table" };

  const panel = { basis: "as-fed", source_url: sourceUrl };
  let numericCount = 0;
  for (const rawLine of table.split(/##|\n/)) {
    const line = decodeHtml(rawLine).replace(/\|/g, " ").replace(/\s+/g, " ").trim();
    if (!line || /^ingredient\s+amount$/i.test(line)) continue;
    const [rawLabel, rawValue] = line.includes("@@") ? line.split("@@") : [line, line];
    const field = nutrientField(rawLabel);
    const value = parsePercent(String(rawValue || "").match(/([\d,.]+)\s*%/)?.[1]);
    if (!field || value == null || panel[field] != null) continue;
    panel[field] = value;
    numericCount++;
  }

  let match = calories.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*\/\s*kg/i);
  if (match) {
    panel.calories_per_kg = Number(match[1].replace(/,/g, ""));
    numericCount++;
  }
  match = calories.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*\/\s*cup/i);
  if (match) {
    panel.calories_per_cup = Number(match[1].replace(/,/g, ""));
    numericCount++;
  }
  match = calories.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*\/\s*can/i);
  if (match) {
    panel.calories_per_cup = Number(match[1].replace(/,/g, ""));
    numericCount++;
  }

  if (numericCount < 2 || panel.protein_pct == null || panel.fat_pct == null) {
    return { panel: null, reason: "nutrient_panel_too_sparse" };
  }
  return { panel, reason: null };
}

function parseProductPage(html, row) {
  const product = findProductJsonLd(html);
  if (!product) return { candidate: null, panel: null, reason: "missing_product_json_ld" };
  const properties = additionalProperties(product);
  const productName = cleanProductName(product.name || row.name);
  const tagsText = properties.get("producttags") || "";
  const contextText = [
    row.name,
    productName,
    row.sourceUrl,
    tagsText,
    properties.get("aboutheading") || "",
    properties.get("nutritionstatement") || "",
  ].join(" ");
  const petType = inferPetType(contextText, tagsText);
  const form = inferProductFormFromText(contextText);
  const candidate = {
    sourceUrl: row.sourceUrl,
    productName,
    petType,
    form,
    lineTokens: lineTokens(contextText),
    proteinTokens: animalProteinTokens(`${productName} ${row.name} ${row.sourceUrl}`),
    distinctiveTokens: distinctiveTokens(`${productName} ${row.name} ${row.sourceUrl}`),
    normalizedText: normalizeText(contextText),
  };
  const parsed = parseNutrientPanelFromProduct(product, row.sourceUrl);
  return { candidate, panel: parsed.panel, reason: parsed.reason };
}

function isNuloCatalogRow(row) {
  const brand = normalizeText(row?.brand || "");
  const productName = normalizeText(row?.product_name || "");
  const cacheKey = normalizeText(row?.cache_key || "");
  const sourceUrl = normalizeText(row?.source_url || "");
  const combined = `${brand} ${productName} ${cacheKey} ${sourceUrl}`;
  if (REJECT_TERMS.some((term) => hasTerm(combined, term))) return false;
  return brand === "nulo" ||
    sourceUrl.includes("nulo com") ||
    productName.startsWith("nulo ") ||
    cacheKey.startsWith("nulo ");
}

async function fetchExistingRows() {
  if (skipExistingScan) return [];
  const rows = [];
  const base = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/product_data`;
  for (let from = 0; ; from += REST_PAGE_SIZE) {
    const response = await fetch(`${base}?select=cache_key,product_name,brand,source_url&order=cache_key.asc`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Range: `${from}-${from + REST_PAGE_SIZE - 1}`,
      },
    });
    if (!response.ok) throw new Error(`product_data read failed ${response.status}: ${await response.text()}`);
    const page = await response.json();
    for (const row of page) {
      if (!isNuloCatalogRow(row)) continue;
      const text = `${row.brand || ""} ${row.product_name || ""} ${row.cache_key || ""} ${row.source_url || ""}`;
      rows.push({
        ...row,
        petType: inferPetTypeFromText(text),
        productForm: inferProductFormFromText(text),
        lineTokens: lineTokens(text),
        proteinTokens: animalProteinTokens(text),
        distinctiveTokens: distinctiveTokens(text),
        normalizedText: normalizeText(text),
        normalizedKey: normalizeCacheKey(text),
      });
    }
    if (page.length < REST_PAGE_SIZE) break;
  }
  return rows;
}

function hasLifeStageConflict(target, row) {
  const targetAllLifeStages = /\ball life stages\b/.test(target.normalizedText);
  const targetTrim = /\btrim\b/.test(target.normalizedText);
  for (const token of LIFE_STAGE_TOKENS) {
    if (targetAllLifeStages && (token === "puppy" || token === "kitten")) continue;
    if (targetTrim && token === "weight") continue;
    const pattern = new RegExp(`\\b${token}\\b`);
    const inTarget = pattern.test(target.normalizedText);
    const inRow = pattern.test(row.normalizedText);
    if (inTarget !== inRow && (inTarget || inRow)) return true;
  }
  return false;
}

function strongUnknownCatalogAgreement(target, row) {
  if (row.petType || row.productForm) return false;
  if (target.proteinTokens.length < 2 || target.distinctiveTokens.length < 2) return false;
  if (!lineCompatible(target, row)) return false;
  const rowProteins = new Set(row.proteinTokens);
  if (!target.proteinTokens.every((token) => rowProteins.has(token))) return false;
  return target.distinctiveTokens.every((token) =>
    new RegExp(`(^| )${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(row.normalizedText)
  );
}

function petTypeCompatible(target, row) {
  return row.petType === target.petType || strongUnknownCatalogAgreement(target, row);
}

function formCompatible(target, row) {
  if (!target.form || !row.productForm) return false;
  if (target.form === "freeze_dried") return row.productForm === "freeze_dried";
  return target.form === row.productForm;
}

function productFormCompatible(target, row) {
  return formCompatible(target, row) || strongUnknownCatalogAgreement(target, row);
}

function lineCompatible(target, row) {
  if (target.lineTokens.length === 0 || row.lineTokens.length === 0) return true;
  return target.lineTokens.some((token) => row.lineTokens.includes(token));
}

function exactNameAgreement(target, row) {
  const targetKey = normalizeCacheKey(`${BRAND} ${target.productName}`);
  const targetName = normalizeCacheKey(target.productName);
  return Boolean(
    targetName.length > 12 &&
    (row.normalizedKey.includes(targetName) || row.normalizedKey.includes(targetKey))
  );
}

function proteinCompatible(target, row) {
  if (target.proteinTokens.length === 0) return false;
  if (row.proteinTokens.length === 0) return exactNameAgreement(target, row);
  const rowProteins = new Set(row.proteinTokens);
  if (!target.proteinTokens.every((token) => rowProteins.has(token))) return false;
  const targetProteins = new Set(target.proteinTokens);
  return row.proteinTokens.every((token) => targetProteins.has(token)) || exactNameAgreement(target, row);
}

function distinctiveCompatible(target, row) {
  if (exactNameAgreement(target, row)) return true;
  if (target.distinctiveTokens.length < 2) return false;
  return target.distinctiveTokens.every((token) =>
    new RegExp(`(^| )${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(row.normalizedText)
  );
}

function matchCandidates(target, rows) {
  if (skipExistingScan) return [];
  return rows
    .filter((row) =>
      petTypeCompatible(target, row) &&
      productFormCompatible(target, row) &&
      lineCompatible(target, row) &&
      !hasLifeStageConflict(target, row) &&
      proteinCompatible(target, row) &&
      distinctiveCompatible(target, row)
    )
    .sort((a, b) => a.product_name.localeCompare(b.product_name));
}

function matchState(target, rows) {
  if (skipExistingScan) return { kind: "skipped_existing_scan", rows: [] };
  if (!target.petType || !target.form || target.proteinTokens.length === 0 || target.distinctiveTokens.length < 2) {
    return { kind: "weak_target_tokens", rows: [] };
  }
  const matches = matchCandidates(target, rows);
  if (matches.length >= 1) return { kind: "matched", rows: matches };
  return { kind: "missing", rows: [] };
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
    byPetType: [...byPetType.entries()]
      .map(([petType, count]) => ({ petType, count }))
      .sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
    withCalories,
    withMinerals,
  };
}

async function main() {
  assertConfig();
  const [sitemapXml, existingRows] = await Promise.all([
    fetchText(sitemapUrl, "application/xml,text/xml,*/*;q=0.8"),
    fetchExistingRows(),
  ]);
  const sitemapRows = parseSitemapRows(sitemapXml).filter(isCandidateSitemapRow);
  const targets = [];
  const unmatchedTargets = [];
  const seen = new Set();
  const skipped = { weakTargetTokens: 0, missingCatalogAlias: 0, missingPanel: 0, duplicate: 0 };
  const panelRejectReasons = new Map();

  for (const row of sitemapRows) {
    const parsed = parseProductPage(await fetchText(row.sourceUrl), row);
    if (delayMs) await sleep(delayMs);
    if (!parsed.candidate || !parsed.panel) {
      skipped.missingPanel++;
      const reason = parsed.reason || "missing_panel";
      panelRejectReasons.set(reason, (panelRejectReasons.get(reason) || 0) + 1);
      continue;
    }

    const state = matchState(parsed.candidate, existingRows);
    const rows = state.rows || [];
    if (rows.length === 0 && !skipExistingScan) {
      if (state.kind === "weak_target_tokens") skipped.weakTargetTokens++;
      else skipped.missingCatalogAlias++;
      if (includeUnmatched) {
        unmatchedTargets.push({
          cacheKey: normalizeCacheKey(`${BRAND} ${parsed.candidate.productName}`),
          productName: parsed.candidate.productName,
          brand: BRAND,
          petType: parsed.candidate.petType,
          productForm: parsed.candidate.form,
          sourceUrl: parsed.candidate.sourceUrl,
          matchState: state.kind,
          lineTokens: parsed.candidate.lineTokens,
          proteinTokens: parsed.candidate.proteinTokens,
          distinctiveTokens: parsed.candidate.distinctiveTokens,
          matchedRows: rows.length,
        });
      }
      continue;
    }

    const matchedRows = rows.length > 0 ? rows : [null];
    for (const catalogRow of matchedRows) {
      const target = {
        cacheKey: catalogRow?.cache_key || normalizeCacheKey(`${BRAND} ${parsed.candidate.productName}`),
        productName: catalogRow?.product_name || parsed.candidate.productName,
        brand: catalogRow?.brand || BRAND,
        petType: parsed.candidate.petType,
        source: "nulo_official_product_page",
        sourceUrl: parsed.candidate.sourceUrl,
        nutrientPanel: parsed.panel,
      };
      if (seen.has(target.cacheKey)) {
        skipped.duplicate++;
        continue;
      }
      seen.add(target.cacheKey);
      targets.push(target);
      if (limit && targets.length >= limit) break;
    }
    if (limit && targets.length >= limit) break;
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: "nulo_official_product_pages",
    sitemapUrl,
    scannedProducts: sitemapRows.length,
    existingRowCount: existingRows.length,
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
  console.log(`Wrote ${targets.length} Nulo nutrient panel targets to ${path.relative(root, outputPath)}`);
  console.log(`Scanned ${sitemapRows.length} product URLs; weak tokens ${skipped.weakTargetTokens}; unmatched aliases ${skipped.missingCatalogAlias}; missing panels ${skipped.missingPanel}; duplicates ${skipped.duplicate}`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
