#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BRAND = "Taste of the Wild";
const DEFAULT_OUTPUT = ".tmp/nutrient-panel-tasteofthewild-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof nutrient panel export";
const MAX_FETCH_ATTEMPTS = 4;
const RETRY_HTTP_STATUS = new Set([429, 503]);
const SOURCE_PAGES = [
  "https://www.tasteofthewildpetfood.com/dog/taste-of-the-wild/",
  "https://www.tasteofthewildpetfood.com/cat/taste-of-the-wild/",
  "https://www.tasteofthewildpetfood.com/dog/prey/",
  "https://www.tasteofthewildpetfood.com/cat/prey/",
  "https://www.tasteofthewildpetfood.com/recipe-finder/?_sfm_umbrella_brand=totw",
  "https://www.tasteofthewildpetfood.com/recipe-finder/?_sfm_umbrella_brand=prey",
];

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const delayArg = process.argv.find((arg) => arg.startsWith("--delay-ms="));
const includeUnmatched = process.argv.includes("--include-unmatched");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const delayMs = delayArg ? Number(delayArg.split("=")[1]) : 250;

const LINE_LABELS = {
  "ancient-grains": "Ancient Grains",
  "grain-free": "Grain-Free",
  prey: "PREY",
};
const REJECT_TERMS = [
  "treat", "treats", "snack", "snacks", "chew", "chews", "topper",
  "toppers", "supplement", "supplements", "probiotic", "probiotics",
  "appetizer", "appetizers", "bisque", "broth", "catnip", "litter",
];
const PROTEIN_ALIASES = new Map([
  ["angus", "beef"],
  ["beef", "beef"],
  ["bison", "bison"],
  ["boar", "boar"],
  ["duck", "duck"],
  ["fowl", "duck"],
  ["lamb", "lamb"],
  ["quail", "quail"],
  ["salmon", "salmon"],
  ["trout", "trout"],
  ["turkey", "turkey"],
  ["venison", "venison"],
]);
const DISTINCTIVE_STOP_TOKENS = new Set([
  "adult", "and", "breed", "canine", "cat", "cats", "dog",
  "dogs", "dry", "feline", "flavored", "food", "foods", "for", "formula",
  "free", "grain", "grains", "gravy",
  "recipe", "roasted", "small", "smoke", "taste", "the", "wet", "wild",
  "with",
]);
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
  npm run export:tasteofthewild-nutrient-panels -- --output=.tmp/nutrient-panel-tasteofthewild-targets.json

Options:
  --output=path.json      Write a nutrient-panel backfill manifest (default ${DEFAULT_OUTPUT})
  --limit=N               Stop after N matched nutrient panels are collected (default 0, no limit)
  --delay-ms=N            Delay between product-page requests (default 250)
  --include-unmatched     Include parsed unmatched/ambiguous rows under unmatchedTargets
  --skip-existing-scan    Skip product_data alias reads for parser smoke/debug exports only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
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

function stripTags(value) {
  return decodeHtml(String(value || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
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

function cleanProductName(value) {
  return decodeHtml(value)
    .replace(/™|®|©/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function titleCaseProductName(value) {
  const smallWords = new Set(["and", "or", "of", "for", "in", "with", "to", "the", "at", "as"]);
  return cleanProductName(String(value || "")
    .split(/(\s+)/)
    .map((part, index) => {
      if (/^\s+$/.test(part)) return part;
      const lower = part.toLowerCase();
      if (index > 0 && smallWords.has(lower)) return lower;
      return lower.replace(/(^|[-'/])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
    })
    .join("")
    .replace(/\bPrey\b/g, "PREY")
    .replace(/\bGrain Free\b/g, "Grain-Free")
    .replace(/\bSmoke Flavored\b/g, "Smoke-Flavored"));
}

function cleanUrl(value, baseUrl) {
  try {
    const parsed = new URL(decodeHtml(value), baseUrl);
    parsed.hash = "";
    parsed.search = "";
    const url = parsed.href.replace(/\/$/, "");
    if (!/^https:\/\/www\.tasteofthewildpetfood\.com\/(dog|cat)\/(ancient-grains|grain-free|prey)\/[a-z0-9.-]+$/i.test(url)) return "";
    return url;
  } catch {
    return "";
  }
}

function parsedProductPath(url) {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    if (segments.length !== 3) return null;
    const [petType, line, slug] = segments;
    if (!["dog", "cat"].includes(petType)) return null;
    if (!Object.prototype.hasOwnProperty.call(LINE_LABELS, line)) return null;
    if (!/^[a-z0-9-]+$/.test(slug)) return null;
    return {
      petType,
      line,
      slug,
      form: normalizeText(slug).includes("gravy") ? "wet" : "dry",
    };
  } catch {
    return null;
  }
}

function productNameFromPath(parsed) {
  const lineLabel = LINE_LABELS[parsed.line];
  const slugName = titleCaseProductName(String(parsed.slug || "").replace(/--+/g, "-").replace(/-/g, " "));
  if (!lineLabel || !slugName) return "";
  if (normalizeText(slugName).startsWith(normalizeText(lineLabel))) return slugName;
  return cleanProductName(`${lineLabel} ${slugName}`);
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
  const wet = /\b(wet|can|canned|gravy|stew|pate|ounce|ounces)\b/.test(text);
  const dry = /\b(dry|kibble)\b/.test(text);
  if (wet && !dry) return "wet";
  if (dry && !wet) return "dry";
  if (wet) return "wet";
  return "";
}

function proteinTokens(value) {
  const tokens = new Set();
  for (const token of normalizeText(value).split(/\s+/)) {
    const mapped = PROTEIN_ALIASES.get(token);
    if (mapped) tokens.add(mapped);
  }
  return [...tokens].sort();
}

function distinctiveTokens(value) {
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) =>
      token.length > 2 &&
      !DISTINCTIVE_STOP_TOKENS.has(token) &&
      !PROTEIN_ALIASES.has(token)
    )
    .sort();
}

function isSubsetOfText(tokens, text) {
  return tokens.length > 0 && tokens.every((token) =>
    new RegExp(`(^| )${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(text)
  );
}

function hasLifeStageConflict(target, row) {
  const targetPuppy = /\b(puppy|puppies)\b/.test(target.normalizedText);
  const rowPuppy = /\b(puppy|puppies)\b/.test(row.normalizedText);
  return targetPuppy !== rowPuppy;
}

function formCompatible(target, row) {
  if (target.form === "wet") return row.productForm === "wet";
  return row.productForm !== "wet";
}

function proteinCompatible(target, row) {
  if (row.proteinTokens.length === 0) return true;
  return row.proteinTokens.every((token) => target.proteinTokens.includes(token));
}

function preferMostSpecificMatches(target, matches) {
  if (matches.length <= 1) return matches;
  const formSpecific = matches.filter((row) => row.productForm === target.form);
  const formFiltered = formSpecific.length > 0 ? formSpecific : matches;
  const proteinSpecific = formFiltered.filter((row) =>
    row.proteinTokens.length > 0 &&
    row.proteinTokens.every((token) => target.proteinTokens.includes(token))
  );
  return proteinSpecific.length > 0 ? proteinSpecific : formFiltered;
}

function isCandidateFoodRow(row) {
  const text = normalizeText(`${row.name} ${row.sourceUrl} ${row.line} ${row.form}`);
  if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  return Boolean(row.petType && row.form && row.distinctiveTokens.length > 0);
}

async function fetchText(url) {
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(90_000),
    });
    if (response.ok) return response.text();
    if (!RETRY_HTTP_STATUS.has(response.status) || attempt === MAX_FETCH_ATTEMPTS) {
      throw new Error(`Taste of the Wild fetch failed ${response.status}: ${url}`);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 1000 * attempt * attempt;
    await sleep(waitMs);
  }
  throw new Error(`Taste of the Wild fetch failed after retries: ${url}`);
}

async function parseProductRows() {
  const urls = new Map();
  for (const pageUrl of SOURCE_PAGES) {
    const html = await fetchText(pageUrl);
    for (const match of String(html || "").matchAll(/href=["']([^"']+)["']/gi)) {
      const sourceUrl = cleanUrl(match[1], pageUrl);
      if (sourceUrl) urls.set(sourceUrl, pageUrl);
    }
  }

  return [...urls.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sourceUrl, sourcePage]) => {
      const parsed = parsedProductPath(sourceUrl);
      if (!parsed) return null;
      const name = productNameFromPath(parsed);
      const normalizedText = normalizeText(`${parsed.petType} ${parsed.line} ${parsed.slug} ${name}`);
      return {
        sourceUrl,
        sourcePage,
        name,
        petType: parsed.petType,
        line: parsed.line,
        form: parsed.form,
        proteinTokens: proteinTokens(`${parsed.line} ${parsed.slug}`),
        distinctiveTokens: distinctiveTokens(`${parsed.line} ${parsed.slug}`),
        normalizedText,
      };
    })
    .filter(Boolean)
    .filter(isCandidateFoodRow);
}

function isTasteOfTheWildRow(row) {
  const text = normalizeText(`${row?.brand || ""} ${row?.product_name || ""} ${row?.cache_key || ""}`);
  if (!text.includes("taste of the wild")) return false;
  return !REJECT_TERMS.some((term) => hasTerm(text, term));
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
      if (!isTasteOfTheWildRow(row)) continue;
      const rowText = `${row.brand || ""} ${row.product_name || ""} ${row.cache_key || ""}`;
      rows.push({
        ...row,
        petType: inferPetTypeFromText(rowText),
        productForm: inferProductFormFromText(rowText),
        proteinTokens: proteinTokens(rowText),
        normalizedText: normalizeText(rowText),
      });
    }
    if (page.length < REST_PAGE_SIZE) break;
  }
  return rows;
}

function matchCandidates(target, rows) {
  if (skipExistingScan) return [];
  const matches = rows
    .filter((row) =>
      row.petType === target.petType &&
      formCompatible(target, row) &&
      !hasLifeStageConflict(target, row) &&
      proteinCompatible(target, row) &&
      isSubsetOfText(target.distinctiveTokens, row.normalizedText)
    )
    .sort((a, b) => a.product_name.localeCompare(b.product_name));
  return preferMostSpecificMatches(target, matches);
}

function matchState(target, rows) {
  if (skipExistingScan) return { kind: "skipped_existing_scan", row: null };
  if (!target.petType || !target.form || target.distinctiveTokens.length === 0) {
    return { kind: "weak_target_tokens", row: null };
  }
  const matches = matchCandidates(target, rows);
  if (matches.length >= 1) return { kind: "matched", rows: matches, row: matches[0] };
  return { kind: "missing", row: null };
}

function nutrientField(label) {
  for (const [pattern, field] of NUTRIENT_FIELD_ALIASES) {
    if (pattern.test(label)) return field;
  }
  return "";
}

function parsePercent(value) {
  const number = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}

function parseNutrientPanel(html, sourceUrl) {
  const text = stripTags(html);
  const index = text.toLowerCase().indexOf("guaranteed analysis");
  if (index < 0) return { panel: null, reason: "missing_guaranteed_analysis" };
  const end = text.toLowerCase().indexOf("calorie content", index + 20);
  const chunk = text.slice(index, end > index ? end : index + 4000);
  const panel = { basis: "as-fed", source_url: sourceUrl };
  let numericCount = 0;
  const nutrientPattern = /\b(Crude\s+Protein|Crude\s+Fat|Crude\s+Fib(?:er|re)|Moisture|Ash|Calcium|Phosphorus|Omega[-\s]*3|Omega[-\s]*6)\b\s*([\d.]+)\s*%\s*(?:minimum|maximum|MIN|MAX)?/gi;
  let match;
  while ((match = nutrientPattern.exec(chunk))) {
    const field = nutrientField(match[1]);
    const value = parsePercent(match[2]);
    if (!field || value == null) continue;
    panel[field] = value;
    numericCount++;
  }
  match = text.match(/Calorie Content\s*([\d,]+(?:\.\d+)?)\s*kcal\s*\/?\s*kg/i);
  if (match) {
    panel.calories_per_kg = Number(match[1].replace(/,/g, ""));
    numericCount++;
  }
  match = text.match(/Calorie Content[\s\S]{0,140}?\(([\d,]+(?:\.\d+)?)\s*kcal\s*\/?\s*cup\)/i);
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
  const [candidates, existingRows] = await Promise.all([parseProductRows(), fetchExistingRows()]);
  const targets = [];
  const unmatchedTargets = [];
  const seen = new Set();
  const skipped = { weakTargetTokens: 0, missingCatalogAlias: 0, ambiguousCatalogAlias: 0, missingPanel: 0, duplicate: 0 };
  const panelRejectReasons = new Map();

  for (const candidate of candidates) {
    const state = matchState(candidate, existingRows);
    const rows = state.rows || (state.row ? [state.row] : []);
    if (rows.length === 0 && !skipExistingScan) {
      if (state.kind === "ambiguous") skipped.ambiguousCatalogAlias++;
      else if (state.kind === "weak_target_tokens") skipped.weakTargetTokens++;
      else skipped.missingCatalogAlias++;
      if (includeUnmatched) {
        unmatchedTargets.push({
          cacheKey: normalizeCacheKey(`${BRAND} ${candidate.name}`),
          productName: candidate.name,
          brand: BRAND,
          petType: candidate.petType,
          sourceUrl: candidate.sourceUrl,
          matchState: state.kind,
          productForm: candidate.form,
          proteinTokens: candidate.proteinTokens,
          distinctiveTokens: candidate.distinctiveTokens,
          matchedRows: state.matches || 0,
        });
      }
      continue;
    }

    if ((targets.length || unmatchedTargets.length) && delayMs) await sleep(delayMs);
    const parsed = parseNutrientPanel(await fetchText(candidate.sourceUrl), candidate.sourceUrl);
    if (!parsed.panel) {
      skipped.missingPanel++;
      panelRejectReasons.set(parsed.reason, (panelRejectReasons.get(parsed.reason) || 0) + 1);
      continue;
    }

    const matchedRows = rows.length > 0 ? rows : [null];
    for (const row of matchedRows) {
      const target = {
        cacheKey: row?.cache_key || normalizeCacheKey(`${BRAND} ${candidate.name}`),
        productName: row?.product_name || candidate.name,
        brand: row?.brand || BRAND,
        petType: candidate.petType,
        source: "tasteofthewild_official_product_page",
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
    source: "tasteofthewild_official_product_pages",
    sourcePages: SOURCE_PAGES,
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
  console.log(`Wrote ${targets.length} Taste of the Wild nutrient panel targets to ${path.relative(root, outputPath)}`);
  console.log(`Scanned ${candidates.length} product URLs; weak tokens ${skipped.weakTargetTokens}; unmatched aliases ${skipped.missingCatalogAlias}; ambiguous aliases ${skipped.ambiguousCatalogAlias}; missing panels ${skipped.missingPanel}; duplicates ${skipped.duplicate}`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
