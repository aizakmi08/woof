#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BRAND = "Instinct";
const DEFAULT_SITEMAP_URL = "https://instinctpetfood.com/product-sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/nutrient-panel-instinct-targets.json";
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
  "biscuit", "biscuits", "chew", "chews", "digestive health", "duos",
  "food topper", "healthy cravings", "healthy energy", "jerky", "mixer",
  "mixers", "mobility support", "multivitamin", "raw boost mixers",
  "raw boost shakers", "skin coat", "skin & coat", "snack", "snacks",
  "topper", "toppers", "tranquility", "treat", "treats",
];
const CORE_FOOD_TERMS = [
  "be natural", "dry cat food", "dry dog food", "flaked", "freeze dried",
  "frozen", "freshdried", "freshraw", "limited ingredient", "original",
  "pate", "raw boost", "raw longevity", "raw meals", "split cup",
  "ultimate protein", "wet cat food", "wet dog food",
];
const ANIMAL_PROTEIN_TOKENS = new Set([
  "beef", "chicken", "duck", "fish", "lamb", "pollock", "rabbit",
  "salmon", "tuna", "turkey", "venison",
]);
const DISTINCTIVE_STOP_TOKENS = new Set([
  "and", "cat", "cats", "com", "diet", "dog", "dogs", "dried", "dry",
  "food", "foods", "for", "free", "freeze", "grain", "high", "http",
  "https", "ingredient", "instinct", "instinctpetfood", "limited", "meal",
  "meals", "natural", "product", "products", "protein", "raw", "real",
  "recipe", "recipes", "with", "www",
]);
const LINE_CONFLICT_GROUPS = [
  ["raw_boost", "original", "limited_ingredient", "ultimate_protein", "be_natural", "raw_longevity"],
  ["raw_meals", "freshdried_bites", "freshdried_pates", "meal_blends"],
  ["patties", "medallions", "morsels"],
  ["puppy", "kitten"],
  ["healthy_weight", "indoor_health"],
  ["pate", "flaked", "cups"],
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
  npm run export:instinct-nutrient-panels -- --output=.tmp/nutrient-panel-instinct-targets.json

Options:
  --output=path.json      Write a nutrient-panel backfill manifest (default ${DEFAULT_OUTPUT})
  --sitemap=url           Explicit Instinct product sitemap URL (${DEFAULT_SITEMAP_URL})
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
  if (!/^https:\/\/instinctpetfood\.com\/product-sitemap\.xml$/i.test(sitemapUrl)) {
    usage("--sitemap must be https://instinctpetfood.com/product-sitemap.xml.");
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

function stripTags(value) {
  return decodeHtml(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " "));
}

function normalizeText(value) {
  return decodeHtml(value)
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
    .replace(/\binstinct\b/gi, "")
    .replace(/™|®|©/g, "")
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
    if (!/^https:\/\/instinctpetfood\.com\/products\/[a-z0-9-]+$/i.test(url)) return "";
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

function productNameFromUrl(url) {
  return cleanProductName(productIdFromUrl(url).replace(/-/g, " "));
}

async function fetchText(url, accept = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8") {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: accept,
      },
      signal: AbortSignal.timeout(90_000),
    });
    if (response.ok) return response.text();
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 3) throw new Error(`Instinct fetch failed ${response.status}: ${url}`);
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * (attempt + 1));
  }
  throw new Error(`Instinct fetch failed: ${url}`);
}

function parseSitemapRows(xml) {
  return [...String(xml || "").matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => cleanUrl(match[1]))
    .filter(Boolean)
    .map((sourceUrl) => ({
      sourceUrl,
      productName: productNameFromUrl(sourceUrl),
      productId: productIdFromUrl(sourceUrl),
    }))
    .filter((row) => row.productName);
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
  if (/\b(frozen|freshraw)\b/.test(text)) return "frozen";
  if (/\b(freeze dried|freezedried|freshdried)\b/.test(text)) return "freeze_dried";
  if (/\b(dry|kibble|raw boost)\b/.test(text)) return "dry";
  if (/\b(wet|can|pate|pat|flaked|cup|cups)\b/.test(text)) return "wet";
  return "";
}

function lineTokens(value) {
  const text = normalizeText(value);
  const tokens = [];
  if (/\braw longevity\b/.test(text)) tokens.push("raw_longevity");
  if (/\braw boost\b/.test(text)) tokens.push("raw_boost");
  if (/\boriginal\b/.test(text)) tokens.push("original");
  if (/\blimited ingredient\b|\blid\b/.test(text)) tokens.push("limited_ingredient");
  if (/\bbe natural\b/.test(text)) tokens.push("be_natural");
  if (/\bultimate protein\b/.test(text)) tokens.push("ultimate_protein");
  if (/\braw meals\b/.test(text)) tokens.push("raw_meals");
  if (/\bfreshdried bites\b|\bfresh dried bites\b/.test(text)) tokens.push("freshdried_bites");
  if (/\bfreshdried pates\b|\bfresh dried pates\b|\bpates\b/.test(text)) tokens.push("freshdried_pates");
  if (/\bmeal blends\b/.test(text)) tokens.push("meal_blends");
  if (/\bhealthy weight\b/.test(text)) tokens.push("healthy_weight");
  if (/\bindoor health\b/.test(text)) tokens.push("indoor_health");
  if (/\bsmall breed\b/.test(text)) tokens.push("small_breed");
  if (/\bpuppy\b|\bpuppies\b/.test(text)) tokens.push("puppy");
  if (/\bkitten\b|\bkittens\b/.test(text)) tokens.push("kitten");
  if (/\bpatties\b/.test(text)) tokens.push("patties");
  if (/\bmedallions\b/.test(text)) tokens.push("medallions");
  if (/\bmorsels\b/.test(text)) tokens.push("morsels");
  if (/\bpate\b|\bpat\b/.test(text)) tokens.push("pate");
  if (/\bflaked\b/.test(text)) tokens.push("flaked");
  if (/\bsplit cup\b|\bcups\b/.test(text)) tokens.push("cups");
  return [...new Set(tokens)].sort();
}

function animalProteinTokens(value) {
  const text = normalizeText(value);
  return [...new Set(text.split(/\s+/).filter((token) => ANIMAL_PROTEIN_TOKENS.has(token)))].sort();
}

function distinctiveTokens(value) {
  return [...new Set(normalizeText(value)
    .split(/\s+/)
    .filter((token) =>
      token.length > 2 &&
      !DISTINCTIVE_STOP_TOKENS.has(token) &&
      !ANIMAL_PROTEIN_TOKENS.has(token)
    ))].sort();
}

function isCandidateSitemapRow(row) {
  const text = normalizeText(`${row.productName} ${row.sourceUrl}`);
  if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  if (!CORE_FOOD_TERMS.some((term) => hasTerm(text, term))) return false;
  if (!inferPetTypeFromText(text)) return false;
  if (!inferProductFormFromText(text)) return false;
  return true;
}

function normalizeCandidate(row) {
  const text = `${row.productName} ${row.sourceUrl}`;
  return {
    sourceUrl: row.sourceUrl,
    productName: row.productName,
    productId: row.productId,
    petType: inferPetTypeFromText(text),
    form: inferProductFormFromText(text),
    lineTokens: lineTokens(text),
    proteinTokens: animalProteinTokens(text),
    distinctiveTokens: distinctiveTokens(text),
    normalizedText: normalizeText(text),
  };
}

function isInstinctCatalogRow(row) {
  const brand = normalizeText(row?.brand || "");
  const combined = normalizeText(`${row?.brand || ""} ${row?.product_name || ""} ${row?.cache_key || ""} ${row?.source_url || ""}`);
  if (!/^instinct\b/.test(brand)) return false;
  if (combined.includes("purina") || combined.includes("true instinct")) return false;
  if (REJECT_TERMS.some((term) => hasTerm(combined, term))) return false;
  return true;
}

async function fetchExistingRows() {
  if (skipExistingScan) return [];
  const rows = [];
  const base = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/product_data`;
  for (let from = 0; ; from += REST_PAGE_SIZE) {
    const response = await fetch(`${base}?select=cache_key,product_name,brand,source_url&or=(brand.ilike.*instinct*,product_name.ilike.*instinct*,cache_key.ilike.*instinct*)&order=cache_key.asc`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Range: `${from}-${from + REST_PAGE_SIZE - 1}`,
      },
    });
    if (!response.ok) throw new Error(`product_data read failed ${response.status}: ${await response.text()}`);
    const page = await response.json();
    for (const row of page) {
      if (!isInstinctCatalogRow(row)) continue;
      const text = `${row.brand || ""} ${row.product_name || ""} ${row.cache_key || ""} ${row.source_url || ""}`;
      rows.push({
        ...row,
        petType: inferPetTypeFromText(text),
        productForm: inferProductFormFromText(text),
        lineTokens: lineTokens(text),
        proteinTokens: animalProteinTokens(text),
        distinctiveTokens: distinctiveTokens(text),
        normalizedText: normalizeText(text),
      });
    }
    if (page.length < REST_PAGE_SIZE) break;
  }
  return rows;
}

function lineCompatible(target, row) {
  if (target.lineTokens.length === 0 || row.lineTokens.length === 0) return false;
  for (const group of LINE_CONFLICT_GROUPS) {
    const targetGroup = group.filter((token) => target.lineTokens.includes(token));
    const rowGroup = group.filter((token) => row.lineTokens.includes(token));
    if (targetGroup.length > 0 || rowGroup.length > 0) {
      if (targetGroup.length !== rowGroup.length) return false;
      if (!targetGroup.every((token) => rowGroup.includes(token))) return false;
    }
  }
  return target.lineTokens.every((token) => row.lineTokens.includes(token));
}

function proteinCompatible(target, row) {
  if (target.proteinTokens.length === 0 || row.proteinTokens.length === 0) return false;
  const rowProteins = new Set(row.proteinTokens);
  const targetProteins = new Set(target.proteinTokens);
  return target.proteinTokens.every((token) => rowProteins.has(token)) &&
    row.proteinTokens.every((token) => targetProteins.has(token));
}

function distinctiveCompatible(target, row) {
  const meaningful = target.distinctiveTokens.filter((token) =>
    !["breed", "puppy", "kitten"].includes(token)
  );
  if (meaningful.length === 0) return target.lineTokens.length >= 1;
  return meaningful.some((token) =>
    new RegExp(`(^| )${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(row.normalizedText)
  );
}

function matchCandidates(target, rows) {
  if (skipExistingScan) return [];
  return rows
    .filter((row) =>
      row.petType === target.petType &&
      row.productForm === target.form &&
      lineCompatible(target, row) &&
      proteinCompatible(target, row) &&
      distinctiveCompatible(target, row)
    )
    .sort((a, b) => a.product_name.localeCompare(b.product_name));
}

function matchState(target, rows) {
  if (skipExistingScan) return { kind: "skipped_existing_scan", rows: [] };
  if (!target.petType || !target.form || target.lineTokens.length === 0 || target.proteinTokens.length === 0) {
    return { kind: "weak_target_tokens", rows: [] };
  }
  const matches = matchCandidates(target, rows);
  if (matches.length >= 1) return { kind: "matched", rows: matches };
  return { kind: "missing", rows: [] };
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

function parseNutrientPanel(html, sourceUrl) {
  const raw = String(html || "");
  const panel = { basis: "as-fed", source_url: sourceUrl };
  let numericCount = 0;
  const analysisBlock = raw.match(/<strong>\s*Guaranteed Analysis\s*<\/strong>([\s\S]*?)(?:<div[^>]+class=["'][^"']*nutrition-column|<\/section>|<\/main>)/i)?.[1] || "";
  for (const cell of analysisBlock.matchAll(/<div[^>]+class=["'][^"']*nutrition-cell[^"']*["'][^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<div[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi)) {
    const label = stripTags(cell[1]);
    const value = stripTags(cell[2]);
    const field = nutrientField(label);
    const percent = parsePercent(value.match(/([\d,.]+)\s*%/)?.[1]);
    if (field && percent != null && panel[field] == null) {
      panel[field] = percent;
      numericCount++;
    }
  }
  const text = stripTags(raw);
  const kg = text.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*\/\s*kg/i);
  if (kg && panel.calories_per_kg == null) {
    panel.calories_per_kg = Number(kg[1].replace(/,/g, ""));
    numericCount++;
  }
  const cup = text.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*(?:\/|per)\s*(?:cup|8\s*oz\.?\s*cup)/i);
  if (cup && panel.calories_per_cup == null) {
    panel.calories_per_cup = Number(cup[1].replace(/,/g, ""));
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
    byPetType: [...byPetType.entries()]
      .map(([petType, count]) => ({ petType, count }))
      .sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
    withCalories,
    withMinerals,
  };
}

async function main() {
  assertConfig();
  const [xml, existingRows] = await Promise.all([
    fetchText(sitemapUrl, "application/xml,text/xml,*/*;q=0.8"),
    fetchExistingRows(),
  ]);
  const candidates = parseSitemapRows(xml).filter(isCandidateSitemapRow).map(normalizeCandidate);
  const targets = [];
  const unmatchedTargets = [];
  const seen = new Set();
  const skipped = { weakTargetTokens: 0, missingCatalogAlias: 0, missingPanel: 0, duplicate: 0 };
  const panelRejectReasons = new Map();

  for (const candidate of candidates) {
    const state = matchState(candidate, existingRows);
    const rows = state.rows || [];
    if (rows.length === 0 && !skipExistingScan) {
      if (state.kind === "weak_target_tokens") skipped.weakTargetTokens++;
      else skipped.missingCatalogAlias++;
      if (includeUnmatched) {
        unmatchedTargets.push({
          cacheKey: normalizeCacheKey(`${BRAND} ${candidate.productName}`),
          productName: candidate.productName,
          brand: BRAND,
          petType: candidate.petType,
          productForm: candidate.form,
          sourceUrl: candidate.sourceUrl,
          matchState: state.kind,
          lineTokens: candidate.lineTokens,
          proteinTokens: candidate.proteinTokens,
          distinctiveTokens: candidate.distinctiveTokens,
          matchedRows: rows.length,
        });
      }
      continue;
    }

    const parsed = parseNutrientPanel(await fetchText(candidate.sourceUrl), candidate.sourceUrl);
    if (delayMs) await sleep(delayMs);
    if (!parsed.panel) {
      skipped.missingPanel++;
      panelRejectReasons.set(parsed.reason, (panelRejectReasons.get(parsed.reason) || 0) + 1);
      continue;
    }

    const matchedRows = rows.length > 0 ? rows : [null];
    for (const row of matchedRows) {
      const target = {
        cacheKey: row?.cache_key || normalizeCacheKey(`${BRAND} ${candidate.productName}`),
        productName: row?.product_name || `${BRAND} ${candidate.productName}`,
        brand: row?.brand || BRAND,
        petType: candidate.petType,
        source: "instinct_official_product_page",
        sourceUrl: candidate.sourceUrl,
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
    source: "instinct_official_product_pages",
    sitemapUrl,
    scannedProducts: candidates.length,
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
  console.log(`Wrote ${targets.length} Instinct nutrient panel targets to ${path.relative(root, outputPath)}`);
  console.log(`Scanned ${candidates.length} product URLs; weak tokens ${skipped.weakTargetTokens}; unmatched aliases ${skipped.missingCatalogAlias}; missing panels ${skipped.missingPanel}; duplicates ${skipped.duplicate}`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
