#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BRAND = "NutriSource";
const DEFAULT_PRODUCTS_URL = "https://discovernutrisource.com/products.json?limit=250";
const DEFAULT_OUTPUT = ".tmp/nutrient-panel-nutrisource-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof nutrient panel export";
const GUARANTEED_ANALYSIS_HEADING = "Guaranteed Analysis";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const productsArg = process.argv.find((arg) => arg.startsWith("--products-url="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const delayArg = process.argv.find((arg) => arg.startsWith("--delay-ms="));
const includeUnmatched = process.argv.includes("--include-unmatched");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const productsUrl = productsArg ? productsArg.split("=").slice(1).join("=").trim() : DEFAULT_PRODUCTS_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const delayMs = delayArg ? Number(delayArg.split("=")[1]) : 250;

const KEEP_PRODUCT_TYPES = new Set([
  "Grain Free Canned Cat Food",
  "Grain Free Cat Food",
  "Grain Free Dog Food",
  "Grain Inclusive Dog Food",
  "Wet Dog Food",
  "Grain Free Canned Dog Food",
  "Grain Inclusive Canned Dog Food",
  "Grain Free Wet Dog Food",
  "Raw Freeze-Dried Dog Food",
  "Grain Inclusive Canned Cat Food",
  "Grain Inclusive Cat Food",
]);

const REJECT_TERMS = [
  "treat", "treats", "topper", "toppers", "supplement", "supplements",
  "bone broth", "broth", "chew", "chews", "soft chews", "snack", "snacks",
  "training", "jerky", "sticks", "crisps", "biscuit", "biscuits",
  "variety pack", "bundle", "gift",
];

const NUTRIENT_FIELD_ALIASES = [
  [/^crude protein\b/i, "protein_pct"],
  [/^protein\b/i, "protein_pct"],
  [/^crude fat\b/i, "fat_pct"],
  [/^fat\b/i, "fat_pct"],
  [/^crude fib(?:er|re)\b/i, "fiber_pct"],
  [/^fib(?:er|re)\b/i, "fiber_pct"],
  [/^moisture\b/i, "moisture_pct"],
  [/^ash\b/i, "ash_pct"],
  [/^calcium\b/i, "calcium_pct"],
  [/^phosphorus\b/i, "phosphorus_pct"],
  [/^omega[-\s]*3\b/i, "omega_3_pct"],
  [/^omega[-\s]*6\b/i, "omega_6_pct"],
];

const PROTEIN_TOKENS = new Set([
  "beef", "bison", "boar", "chicken", "duck", "fish", "lamb", "liver",
  "pea", "peas", "rabbit", "rice", "salmon", "seafood", "trout", "turkey",
  "venison", "whitefish",
]);

const STOP_TOKENS = new Set([
  "nutrisource", "nutri", "source", "pure", "vita", "element", "series",
  "choice", "dog", "dogs", "cat", "cats", "food", "foods", "formula",
  "recipe", "recipes", "for", "with", "and", "the", "of", "in", "made",
  "free", "grain", "grains", "inclusive", "select", "entree", "wet", "dry",
  "canned", "can", "raw", "freeze", "dried",
]);

const LINE_TOKEN_GROUPS = [
  ["adult"],
  ["puppy"],
  ["large", "breed"],
  ["small", "bites"],
  ["performance"],
  ["super", "performance"],
  ["ocean"],
  ["country"],
  ["woodlands"],
  ["plains"],
  ["seafood"],
  ["element"],
  ["choice"],
];

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:nutrisource-nutrient-panels -- --output=.tmp/nutrient-panel-nutrisource-targets.json

Options:
  --output=path.json      Write a nutrient-panel backfill manifest (default ${DEFAULT_OUTPUT})
  --products-url=url      Explicit NutriSource Shopify products JSON URL (${DEFAULT_PRODUCTS_URL})
  --limit=N               Stop after N matched nutrient panels are collected (default 0, no limit)
  --delay-ms=N            Delay between product-page requests (default 250)
  --include-unmatched     Include parsed unmatched/ambiguous rows under unmatchedTargets
  --skip-existing-scan    Skip product_data alias reads for parser smoke/debug exports only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  if (!/^https:\/\/discovernutrisource\.com\/products\.json\?limit=250$/i.test(productsUrl)) {
    usage("--products-url must be https://discovernutrisource.com/products.json?limit=250.");
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
    .replace(/&#8220;|&#8221;|&quot;|“|”/g, "\"")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return decodeHtml(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " "));
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
    .replace(/['’™®·]/g, " ")
    .replace(/[-_/,%+]+/g, " ")
    .replace(/[^a-z0-9\s&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCacheKey(text) {
  return normalizeText(text)
    .replace(/\b(dog food|cat food|formula|recipe|food for dogs|food for cats)\b/g, " ")
    .replace(/\bw\b/g, "with")
    .replace(/\b\d+(\s+)?(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|can|cans|bag|bags|case|pack|pk|ct|count|tray|trays|pouch|pouches|box|boxes|tetrapak|tetrapaks)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanProductName(value) {
  return asciiFold(decodeHtml(value))
    .replace(/™|®|©/g, "")
    .replace(/Entrée/gi, "Entree")
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

function brandFromVendor(product) {
  const vendor = normalizeText(product.vendor);
  if (vendor.includes("pure vita")) return "Pure Vita";
  if (vendor.includes("element series")) return "NutriSource Element Series";
  if (vendor.includes("choice")) return "NutriSource Choice";
  return BRAND;
}

function inferPetTypeFromText(value) {
  const text = normalizeText(value);
  const cat = /\b(cat|cats|kitten|kittens|feline)\b/.test(text);
  const dog = /\b(dog|dogs|puppy|puppies|canine)\b/.test(text);
  if (cat && !dog) return "cat";
  if (dog && !cat) return "dog";
  return "";
}

function inferPetType(product) {
  const tags = tagSet(product);
  const text = normalizeText(`${product.title} ${product.handle} ${product.product_type} ${[...tags].join(" ")}`);
  if (tags.has("cat") || tags.has("cat-food") || /\b(cat|kitten|feline)\b/.test(text)) return "cat";
  if (tags.has("dog") || tags.has("dog-foods") || /\b(dog|puppy|canine)\b/.test(text)) return "dog";
  return "";
}

function inferFormFromText(value) {
  const text = normalizeText(value);
  if (/\b(raw|freeze dried|freeze|frozen)\b/.test(text)) return "fresh";
  if (/\b(canned|can|wet|stew|tetrapak|pouch)\b/.test(text)) return "wet";
  if (/\b(dry|kibble|grain free|grain inclusive|large breed|small bites|adult|puppy|performance)\b/.test(text)) return "dry";
  if (/\b(dog food|cat food)\b/.test(text)) return "dry";
  return "";
}

function inferProductForm(product) {
  const tags = tagSet(product);
  const text = `${product.product_type} ${product.title} ${product.handle} ${[...tags].join(" ")}`;
  return inferFormFromText(text);
}

function isCandidateFoodProduct(product) {
  const text = normalizeText(`${product.title} ${product.handle} ${product.product_type} ${product.vendor} ${(product.tags || []).join(" ")}`);
  if (!KEEP_PRODUCT_TYPES.has(product.product_type || "")) return false;
  if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  if (!tagSet(product).has("Food")) return false;
  if (!inferPetType(product)) return false;
  return ["dry", "wet", "fresh"].includes(inferProductForm(product));
}

function meaningfulTokens(value) {
  return [...new Set(normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_TOKENS.has(token)))];
}

function proteinTokens(value) {
  return new Set(meaningfulTokens(value).filter((token) => PROTEIN_TOKENS.has(token)));
}

function lineTokensForText(value) {
  const tokens = new Set(meaningfulTokens(value));
  return [...new Set(LINE_TOKEN_GROUPS
    .filter((group) => group.every((token) => tokens.has(token)))
    .flat())];
}

function normalizeTarget(product) {
  const productName = cleanProductName(product.title);
  const sourceUrl = `https://discovernutrisource.com/products/${product.handle}`;
  const text = `${product.title} ${product.handle} ${product.product_type} ${product.vendor}`;
  return {
    product,
    productName,
    brand: brandFromVendor(product),
    petType: inferPetType(product),
    productForm: inferProductForm(product),
    sourceUrl,
    matchTokens: meaningfulTokens(text),
    lineTokens: lineTokensForText(text),
    proteinTokens: [...proteinTokens(text)],
  };
}

function isNutriSourceFamilyRow(row) {
  const text = normalizeText(`${row?.brand || ""} ${row?.product_name || ""} ${row?.cache_key || ""}`);
  if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  return /\b(nutrisource|nutri source|pure vita|element series)\b/.test(text);
}

function rowTokenSet(row) {
  return new Set(meaningfulTokens(`${row?.brand || ""} ${row?.product_name || ""} ${row?.cache_key || ""}`));
}

function rowProteinSet(row) {
  return proteinTokens(`${row?.product_name || ""} ${row?.cache_key || ""}`);
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
      if (isNutriSourceFamilyRow(row)) {
        const rowText = `${row.brand || ""} ${row.product_name || ""} ${row.cache_key || ""}`;
        rows.push({
          ...row,
          petType: inferPetTypeFromText(rowText),
          productForm: inferFormFromText(rowText),
          tokenSet: rowTokenSet(row),
          proteinSet: rowProteinSet(row),
        });
      }
    }
    if (page.length < REST_PAGE_SIZE) break;
  }
  return rows;
}

function targetProteinSet(target) {
  return new Set(target.proteinTokens);
}

function hasSameProteins(target, row) {
  const targetProteins = targetProteinSet(target);
  if (targetProteins.size === 0) return false;
  for (const protein of targetProteins) {
    if (!row.proteinSet.has(protein)) return false;
  }
  for (const protein of row.proteinSet) {
    if (!targetProteins.has(protein)) return false;
  }
  return true;
}

function hasStrongMatchTerms(target, row) {
  if (!target.petType || row.petType !== target.petType) return false;
  if (!target.productForm || row.productForm !== target.productForm) return false;
  if (!hasSameProteins(target, row)) return false;
  if (target.lineTokens.length > 0 && !target.lineTokens.every((token) => row.tokenSet.has(token))) return false;
  const overlap = target.matchTokens.filter((token) => row.tokenSet.has(token));
  const minimum = target.lineTokens.length > 0
    ? Math.max(2, target.lineTokens.length + target.proteinTokens.length)
    : Math.max(3, target.proteinTokens.length + 1);
  return overlap.length >= minimum;
}

function matchCandidates(target, rows) {
  if (skipExistingScan) return [];
  return rows
    .map((row) => ({
      row,
      overlap: target.matchTokens.filter((token) => row.tokenSet.has(token)),
    }))
    .filter(({ row }) => hasStrongMatchTerms(target, row))
    .sort((a, b) =>
      b.overlap.length - a.overlap.length ||
      a.row.product_name.localeCompare(b.row.product_name)
    );
}

function matchState(target, rows) {
  if (skipExistingScan) return { kind: "skipped_existing_scan", row: null };
  if (target.proteinTokens.length === 0) return { kind: "weak_target_tokens", row: null };
  const matches = matchCandidates(target, rows);
  if (matches.length === 1) return { kind: "matched", row: matches[0].row };
  if (matches.length > 1) {
    const [first, second] = matches;
    if (first.overlap.length >= second.overlap.length + 3) return { kind: "matched", row: first.row };
    return { kind: "ambiguous", row: null, matches: matches.length };
  }
  return { kind: "missing", row: null };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json,*/*;q=0.8",
    },
  });
  if (!response.ok) throw new Error(`NutriSource products fetch failed ${response.status}: ${url}`);
  return response.json();
}

async function fetchText(url) {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    });
    if (response.ok) return response.text();
    lastStatus = response.status;
    if (![429, 503].includes(response.status) || attempt === 4) break;
    await sleep(Math.max(500, delayMs) * attempt);
  }
  throw new Error(`NutriSource product page fetch failed ${lastStatus}: ${url}`);
}

function pageUrl(baseUrl, page) {
  const parsed = new URL(baseUrl);
  parsed.searchParams.set("page", String(page));
  return parsed.toString();
}

async function fetchProducts() {
  const products = [];
  for (let page = 1; page <= 20; page++) {
    const data = await fetchJson(pageUrl(productsUrl, page));
    const pageProducts = Array.isArray(data?.products) ? data.products : [];
    products.push(...pageProducts);
    if (pageProducts.length < 250) break;
  }
  return products;
}

function parsePercentField(label, value, panel) {
  const field = NUTRIENT_FIELD_ALIASES.find(([pattern]) => pattern.test(label))?.[1];
  if (!field || panel[field] != null) return false;
  const match = String(value || "").match(/([\d.]+)\s*%/);
  if (!match) return false;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return false;
  panel[field] = numeric;
  return true;
}

function parseGuaranteedAnalysis(html, sourceUrl) {
  const text = stripTags(html);
  const index = text.toLowerCase().indexOf(GUARANTEED_ANALYSIS_HEADING.toLowerCase());
  if (index < 0) return { panel: null, reason: "missing_guaranteed_analysis" };
  const chunk = text.slice(index, index + 1800);
  const panel = { basis: "as-fed", source_url: sourceUrl };
  let numericCount = 0;

  const nutrientPattern = /\b((?:Crude\s+)?Protein|(?:Crude\s+)?Fat|(?:Crude\s+)?Fib(?:er|re)|Moisture|Ash|Calcium|Phosphorus|Omega[-\s]*3(?:\s+Fatty\s+Acids?)?|Omega[-\s]*6(?:\s+Fatty\s+Acids?)?)\b[^0-9%]{0,80}([\d.]+\s*%)/gi;
  let match;
  while ((match = nutrientPattern.exec(chunk))) {
    if (parsePercentField(match[1], match[2], panel)) numericCount++;
  }

  match = text.match(/([\d,]+(?:\.\d+)?)\s*kcals?\s+per\s+kg/i);
  if (match) {
    panel.calories_per_kg = Number(match[1].replace(/,/g, ""));
    numericCount++;
  }
  match = text.match(/([\d,]+(?:\.\d+)?)\s*kcals?\s+per\s+cup/i);
  if (match) {
    panel.calories_per_cup = Number(match[1].replace(/,/g, ""));
    numericCount++;
  }
  match = text.match(/([\d,]+(?:\.\d+)?)\s*kcals?\s+per\s+(?:5\.5\s*)?oz\.?\s+can/i);
  if (match && panel.calories_per_cup == null) {
    panel.calories_per_cup = Number(match[1].replace(/,/g, ""));
    numericCount++;
  }

  if (numericCount < 2 || panel.protein_pct == null || panel.fat_pct == null) {
    return { panel: null, reason: "nutrient_panel_too_sparse" };
  }
  return { panel, reason: null };
}

function summarizeTargets(targets) {
  const byPetType = new Map();
  const byBrand = new Map();
  let withCalories = 0;
  let withMinerals = 0;
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
    byBrand.set(target.brand, (byBrand.get(target.brand) || 0) + 1);
    const panel = target.nutrientPanel || {};
    if (panel.calories_per_cup != null || panel.calories_per_kg != null) withCalories++;
    if (panel.calcium_pct != null || panel.phosphorus_pct != null || panel.ash_pct != null) withMinerals++;
  }
  return {
    byPetType: [...byPetType.entries()].map(([petType, count]) => ({ petType, count })).sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
    byBrand: [...byBrand.entries()].map(([brand, count]) => ({ brand, count })).sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand)),
    withCalories,
    withMinerals,
  };
}

async function main() {
  assertConfig();
  const [products, existingRows] = await Promise.all([fetchProducts(), fetchExistingRows()]);
  const candidates = products.filter(isCandidateFoodProduct).map(normalizeTarget);
  const targets = [];
  const unmatchedTargets = [];
  const seen = new Set();
  const skipped = { nonFood: products.length - candidates.length, weakTargetTokens: 0, missingCatalogAlias: 0, ambiguousCatalogAlias: 0, missingPanel: 0, duplicate: 0 };
  const panelRejectReasons = new Map();

  for (const candidate of candidates) {
    const state = matchState(candidate, existingRows);
    const row = state.row;

    if (!row && !skipExistingScan && !includeUnmatched) {
      if (state.kind === "ambiguous") skipped.ambiguousCatalogAlias++;
      else if (state.kind === "weak_target_tokens") skipped.weakTargetTokens++;
      else skipped.missingCatalogAlias++;
      continue;
    }

    if ((targets.length || unmatchedTargets.length) && delayMs) await sleep(delayMs);
    let html;
    try {
      html = await fetchText(candidate.sourceUrl);
    } catch (err) {
      skipped.missingPanel++;
      panelRejectReasons.set(err.message, (panelRejectReasons.get(err.message) || 0) + 1);
      continue;
    }
    const { panel, reason } = parseGuaranteedAnalysis(html, candidate.sourceUrl);
    if (!panel) {
      skipped.missingPanel++;
      panelRejectReasons.set(reason, (panelRejectReasons.get(reason) || 0) + 1);
      continue;
    }

    const target = {
      cacheKey: row?.cache_key || normalizeCacheKey(`${candidate.brand} ${candidate.productName}`),
      productName: row?.product_name || candidate.productName,
      brand: row?.brand || candidate.brand,
      petType: candidate.petType,
      source: "nutrisource_official_product_page",
      sourceUrl: candidate.sourceUrl,
      nutrientPanel: panel,
    };

    if (!row && !skipExistingScan) {
      if (state.kind === "ambiguous") skipped.ambiguousCatalogAlias++;
      else if (state.kind === "weak_target_tokens") skipped.weakTargetTokens++;
      else skipped.missingCatalogAlias++;
      if (includeUnmatched) {
        unmatchedTargets.push({
          ...target,
          matchState: state.kind,
          productForm: candidate.productForm,
          matchTokens: candidate.matchTokens,
          proteinTokens: candidate.proteinTokens,
          lineTokens: candidate.lineTokens,
        });
      }
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
    source: "nutrisource_official_product_pages",
    productsUrl,
    scannedProducts: products.length,
    candidateProducts: candidates.length,
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
  console.log(`Wrote ${targets.length} NutriSource nutrient panel targets to ${path.relative(root, outputPath)}`);
  console.log(`Scanned ${products.length} products; candidates ${candidates.length}; weak tokens ${skipped.weakTargetTokens}; unmatched aliases ${skipped.missingCatalogAlias}; ambiguous aliases ${skipped.ambiguousCatalogAlias}; missing panels ${skipped.missingPanel}; duplicates ${skipped.duplicate}`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
