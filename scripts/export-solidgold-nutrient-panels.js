#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BRAND = "Solid Gold";
const DEFAULT_PRODUCTS_URL = "https://solidgoldpet.com/products.json?limit=250";
const DEFAULT_OUTPUT = ".tmp/nutrient-panel-solidgold-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof nutrient panel export";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const productsArg = process.argv.find((arg) => arg.startsWith("--products-url="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const delayArg = process.argv.find((arg) => arg.startsWith("--delay-ms="));
const includeUnmatched = process.argv.includes("--include-unmatched");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const productsUrl = productsArg ? productsArg.split("=").slice(1).join("=").trim() : DEFAULT_PRODUCTS_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const delayMs = delayArg ? Number(delayArg.split("=")[1]) : 300;

const KEEP_PRODUCT_TYPES = new Set(["dry food", "wet food", "dog food", "cat food"]);
const REJECT_TERMS = [
  "air dried topper", "bone broth", "broth", "bundle", "chew", "chews",
  "gift", "kit", "meal topper", "merch", "sample", "samples", "sampler",
  "seasoning", "supplement", "supplements", "topper", "toppers", "treat",
  "treats", "variety", "12 pack",
];
const ANIMAL_PROTEIN_TOKENS = new Set([
  "beef", "bison", "buffalo", "chicken", "cod", "duck", "fish", "lamb",
  "mackerel", "pollock", "quail", "rabbit", "salmon", "sardine", "shrimp",
  "tuna", "turkey", "venison", "whitefish",
]);
const STOP_TOKENS = new Set([
  "adult", "all", "and", "balanced", "breed", "can", "canned", "case",
  "cat", "cats", "complete", "dog", "dogs", "dry", "food", "foods", "for",
  "formula", "free", "gold", "grain", "health", "healthy", "high", "holistic",
  "in", "indoor", "kibble", "kitten", "large", "lb", "lbs", "made", "meal",
  "natural", "nutrient", "nutrientboost", "of", "ounce", "ounces", "oz",
  "pack", "pet", "pets", "pound", "pounds", "puppy", "real", "recipe",
  "recipes", "senior", "sensitive", "small", "solid", "stomach", "support",
  "the", "toy", "wet", "with", "weight",
]);
const LINE_TOKEN_GROUPS = [
  ["barking", "moon"],
  ["buck", "wild"],
  ["fit", "fabulous"],
  ["fit", "fiddle"],
  ["five", "oceans"],
  ["green", "cow"],
  ["holistique", "blendz"],
  ["hund", "flocken"],
  ["hundnflocken"],
  ["indigo", "moon"],
  ["katz", "flocken"],
  ["katzen", "flocken"],
  ["leaping", "waters"],
  ["love", "first", "bark"],
  ["mighty", "mini"],
  ["natures", "harmony"],
  ["stay"],
  ["tropical", "blendz"],
  ["wild", "heart"],
  ["wolf", "cub"],
  ["wolf", "king"],
];
const NUTRIENT_FIELD_ALIASES = [
  [/\b(?:crude\s+)?protein\b/i, "protein_pct"],
  [/\b(?:crude\s+)?fat\b/i, "fat_pct"],
  [/\b(?:crude\s+)?fib(?:er|re)\b/i, "fiber_pct"],
  [/\bmoisture\b/i, "moisture_pct"],
  [/\bash\b/i, "ash_pct"],
  [/\bcalcium\b/i, "calcium_pct"],
  [/\bphosphorus\b/i, "phosphorus_pct"],
  [/\bomega[-\s]*3(?:\s+fatty\s+acids?)?\b/i, "omega_3_pct"],
  [/\bomega[-\s]*6(?:\s+fatty\s+acids?)?\b/i, "omega_6_pct"],
];

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:solidgold-nutrient-panels -- --output=.tmp/nutrient-panel-solidgold-targets.json

Options:
  --output=path.json      Write a nutrient-panel backfill manifest (default ${DEFAULT_OUTPUT})
  --products-url=url      Explicit Solid Gold Shopify products JSON URL (${DEFAULT_PRODUCTS_URL})
  --limit=N               Stop after N matched nutrient panels are collected (default 0, no limit)
  --delay-ms=N            Delay between product-page requests (default 300)
  --include-unmatched     Include parsed unmatched/ambiguous rows under unmatchedTargets
  --skip-existing-scan    Skip product_data alias reads for parser smoke/debug exports only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  if (!/^https:\/\/solidgoldpet\.com\/products\.json\?limit=250$/i.test(productsUrl)) {
    usage("--products-url must be https://solidgoldpet.com/products.json?limit=250.");
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
    .replace(/[\u201C\u201D]/g, "\"");
}

function normalizeText(value) {
  return asciiFold(value)
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
    .replace(/\b\d+(\s+)?(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|can|cans|case|pack|pk|ct|count|tray|trays|pouch|pouches|box|boxes)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasTerm(text, term) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  if (normalizedTerm.includes(" ")) return text.includes(normalizedTerm);
  return new RegExp(`(^|[^a-z0-9])${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text);
}

function productText(product) {
  return normalizeText(`${product?.title || ""} ${product?.handle || ""} ${product?.product_type || ""} ${(product?.tags || []).join(" ")}`);
}

function inferPetTypeFromText(value) {
  const text = normalizeText(value);
  const cat = /\b(cat|cats|kitten|kittens|feline)\b/.test(text);
  const dog = /\b(dog|dogs|puppy|puppies|canine)\b/.test(text);
  if (cat && !dog) return "cat";
  if (dog && !cat) return "dog";
  return "";
}

function inferProductFormFromText(value) {
  const text = normalizeText(value);
  const wet = /\b(wet|canned|can|pate|shreds|gravy|homestyle)\b/.test(text);
  const dry = /\b(dry|kibble)\b/.test(text);
  if (wet && !dry) return "wet";
  if (dry && !wet) return "dry";
  return "";
}

function inferPetType(product) {
  return inferPetTypeFromText(productText(product));
}

function inferProductForm(product) {
  return inferProductFormFromText(productText(product));
}

function cleanProductName(value) {
  return decodeHtml(value)
    .replace(/™|®|©/g, "")
    .replace(/\bPâté\b/gi, "Pate")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function isCandidateFoodProduct(product) {
  const text = productText(product);
  if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  if (!KEEP_PRODUCT_TYPES.has(normalizeText(product?.product_type || ""))) return false;
  if (!inferPetType(product)) return false;
  if (!inferProductForm(product)) return false;
  return true;
}

function meaningfulTokens(value) {
  return [...new Set(normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_TOKENS.has(token)))];
}

function animalProteinTokens(value) {
  return new Set(meaningfulTokens(value).filter((token) => ANIMAL_PROTEIN_TOKENS.has(token)));
}

function lineTokensForText(value) {
  const tokens = new Set(meaningfulTokens(value));
  const groups = LINE_TOKEN_GROUPS.filter((group) => group.every((token) => tokens.has(token)));
  return [...new Set(groups.flat())];
}

function normalizeTarget(product) {
  const productName = cleanProductName(product.title);
  const sourceUrl = `https://solidgoldpet.com/products/${product.handle}`;
  const text = `${product.title} ${product.handle}`;
  return {
    product,
    productName,
    petType: inferPetType(product),
    productForm: inferProductForm(product),
    sourceUrl,
    matchTokens: meaningfulTokens(text),
    lineTokens: lineTokensForText(text),
    proteinTokens: [...animalProteinTokens(text)],
  };
}

function isSolidGoldRow(row) {
  const text = `${row?.brand || ""} ${row?.product_name || ""} ${row?.cache_key || ""}`;
  if (!/solid\s*gold/i.test(text)) return false;
  return !REJECT_TERMS.some((term) => hasTerm(normalizeText(text), term));
}

function rowText(row) {
  return `${row?.brand || ""} ${row?.product_name || ""} ${row?.cache_key || ""}`;
}

function rowTokenSet(row) {
  return new Set(meaningfulTokens(`${row?.product_name || ""} ${row?.cache_key || ""}`));
}

function rowProteinSet(row) {
  return animalProteinTokens(`${row?.product_name || ""} ${row?.cache_key || ""}`);
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
      if (isSolidGoldRow(row)) {
        rows.push({
          ...row,
          petType: inferPetTypeFromText(rowText(row)),
          productForm: inferProductFormFromText(rowText(row)),
          tokenSet: rowTokenSet(row),
          proteinSet: rowProteinSet(row),
        });
      }
    }
    if (page.length < REST_PAGE_SIZE) break;
  }
  return rows;
}

function rowHasSameProteins(target, row) {
  const targetProteins = new Set(target.proteinTokens);
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
  if (target.lineTokens.length === 0) return false;
  if (!target.lineTokens.every((token) => row.tokenSet.has(token))) return false;
  if (!rowHasSameProteins(target, row)) return false;
  const overlap = target.matchTokens.filter((token) => row.tokenSet.has(token));
  return overlap.length >= Math.max(2, target.lineTokens.length + target.proteinTokens.length);
}

function matchCandidates(target, rows) {
  if (skipExistingScan) return [];
  return rows
    .filter((row) => row.petType === target.petType && row.productForm === target.productForm)
    .map((row) => {
      const overlap = target.matchTokens.filter((token) => row.tokenSet.has(token));
      return { row, overlap };
    })
    .filter(({ row }) => hasStrongMatchTerms(target, row))
    .sort((a, b) => b.overlap.length - a.overlap.length || a.row.product_name.localeCompare(b.row.product_name));
}

function matchState(target, rows) {
  if (skipExistingScan) return { kind: "skipped_existing_scan", row: null };
  if (target.lineTokens.length === 0 || target.proteinTokens.length === 0) {
    return { kind: "weak_target_tokens", row: null };
  }
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
  if (!response.ok) throw new Error(`Solid Gold products fetch failed ${response.status}: ${url}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) throw new Error(`Solid Gold product page fetch failed ${response.status}: ${url}`);
  return response.text();
}

async function fetchProducts() {
  const data = await fetchJson(productsUrl);
  if (!Array.isArray(data?.products)) throw new Error("Solid Gold products feed did not return a products array.");
  return data.products;
}

function parsePercentField(label, value, panel) {
  const field = NUTRIENT_FIELD_ALIASES.find(([pattern]) => pattern.test(label))?.[1];
  if (!field) return false;
  const match = String(value || "").match(/([\d.]+)\s*%/);
  if (!match) return false;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return false;
  panel[field] = numeric;
  return true;
}

function parseGuaranteedAnalysis(html, sourceUrl) {
  const text = stripTags(html);
  const index = text.toLowerCase().indexOf("guaranteed analysis");
  if (index < 0) return { panel: null, reason: "missing_guaranteed_analysis" };
  const chunk = text.slice(index, index + 1400);
  const panel = { basis: "as-fed", source_url: sourceUrl };
  let numericCount = 0;

  const nutrientPattern = /\b((?:Crude\s+)?Protein|(?:Crude\s+)?Fat|(?:Crude\s+)?Fib(?:er|re)|Moisture|Ash|Calcium|Phosphorus|Omega[-\s]*3(?:\s+Fatty\s+Acids?)?|Omega[-\s]*6(?:\s+Fatty\s+Acids?)?)\b[^0-9%]{0,80}([\d.]+\s*%)/gi;
  let match;
  while ((match = nutrientPattern.exec(chunk))) {
    if (parsePercentField(match[1], match[2], panel)) numericCount++;
  }

  match = text.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*\/\s*(?:kg|kilogram)/i);
  if (match) {
    panel.calories_per_kg = Number(match[1].replace(/,/g, ""));
    numericCount++;
  }
  match = text.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*\/\s*(?:cup|cups)/i);
  if (match) {
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
  const [products, existingRows] = await Promise.all([fetchProducts(), fetchExistingRows()]);
  const candidates = products.filter(isCandidateFoodProduct).map(normalizeTarget);
  const targets = [];
  const unmatchedTargets = [];
  const seen = new Set();
  const skipped = { nonFood: products.length - candidates.length, weakTargetTokens: 0, missingCatalogAlias: 0, ambiguousCatalogAlias: 0, missingPanel: 0, duplicate: 0 };
  const panelRejectReasons = new Map();

  for (const candidate of candidates) {
    if (targets.length && delayMs) await sleep(delayMs);
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

    const state = matchState(candidate, existingRows);
    const row = state.row;
    const target = {
      cacheKey: row?.cache_key || normalizeCacheKey(`${BRAND} ${candidate.productName}`),
      productName: row?.product_name || candidate.productName,
      brand: row?.brand || BRAND,
      petType: candidate.petType,
      source: "solidgold_official_product_page",
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
    source: "solidgold_official_product_pages",
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
  console.log(`Wrote ${targets.length} Solid Gold nutrient panel targets to ${path.relative(root, outputPath)}`);
  console.log(`Scanned ${products.length} products; candidates ${candidates.length}; weak tokens ${skipped.weakTargetTokens}; unmatched aliases ${skipped.missingCatalogAlias}; ambiguous aliases ${skipped.ambiguousCatalogAlias}; missing panels ${skipped.missingPanel}; duplicates ${skipped.duplicate}`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
