#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BRAND = "Fromm";
const DEFAULT_SITEMAP_URL = "https://frommfamily.com/sitemap";
const DEFAULT_OUTPUT = ".tmp/nutrient-panel-fromm-targets.json";
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
const delayMs = delayArg ? Number(delayArg.split("=")[1]) : 250;

const LINE_LABELS = {
  "bonnihill-farms": "Bonnihill Farms",
  classic: "Classic",
  diner: "Diner",
  "four-star": "Four-Star",
  frommbalaya: "Frommbalaya",
  "frommbo-gumbo": "Frommbo Gumbo",
  gold: "Gold",
  pate: "Pate",
  "perfectly-pate": "Perfectly Pate",
  purrsnickitty: "Purrsnickitty",
};
const FORM_MAP = {
  can: "wet",
  dry: "dry",
  frozen: "fresh",
};
const REJECT_TERMS = [
  "treat", "treats", "crunchy os", "tenderollies", "popetts",
  "purrsnackitty", "snackitties", "nutritionals", "supplement",
  "supplements", "topper", "toppers", "probiotic", "probiotics",
  "accessory", "accessories", "litter", "toy", "toys",
];
const PROTEIN_TOKENS = new Set([
  "beef", "chicken", "duck", "fish", "game", "lamb", "pork", "rabbit",
  "salmon", "seafood", "shrimp", "trout", "tuna", "turkey", "venison",
  "whitefish",
]);
const DISTINCTIVE_STOP_TOKENS = new Set([
  "adult", "and", "can", "canned", "canine", "case", "cat", "cats", "chicken",
  "classic", "classics", "diner", "dog", "dogs", "dry", "duck", "entree",
  "entrees", "family", "favorite", "favorites", "fish", "food", "foods",
  "for", "four", "free", "fromm", "game", "gold", "grain", "kitten",
  "lamb", "large", "nutritionals", "oz", "pate", "premium",
  "recipe", "recipes", "salmon", "seafood", "senior", "shrimp", "small",
  "special", "specials", "star", "the", "trout", "tuna", "turkey", "venison",
  "wet", "whitefish", "with",
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
  npm run export:fromm-nutrient-panels -- --output=.tmp/nutrient-panel-fromm-targets.json

Options:
  --output=path.json      Write a nutrient-panel backfill manifest (default ${DEFAULT_OUTPUT})
  --sitemap=url           Explicit Fromm sitemap page URL (${DEFAULT_SITEMAP_URL})
  --limit=N               Stop after N matched nutrient panels are collected (default 0, no limit)
  --delay-ms=N            Delay between product-page requests (default 250)
  --include-unmatched     Include parsed unmatched/ambiguous rows under unmatchedTargets
  --skip-existing-scan    Skip product_data alias reads for parser smoke/debug exports only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  if (!/^https:\/\/frommfamily\.com\/sitemap$/i.test(sitemapUrl)) usage("--sitemap must be https://frommfamily.com/sitemap.");
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
    .replace(/\bPâté\b/gi, "Pate")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function productNameFromSlug(slug) {
  return cleanProductName(String(slug || "")
    .replace(/\bn\b/g, "n")
    .replace(/--+/g, "-")
    .replace(/-/g, " "));
}

function cleanUrl(value) {
  try {
    const parsed = new URL(decodeHtml(value), sitemapUrl);
    parsed.hash = "";
    parsed.search = "";
    parsed.hostname = "frommfamily.com";
    const url = parsed.href.replace(/\/$/, "");
    if (!/^https:\/\/frommfamily\.com\/products\/(dog|cat)\/[a-z0-9-]+\/(dry|can|frozen)\/[a-z0-9-]+$/i.test(url)) return "";
    return url;
  } catch {
    return "";
  }
}

function parsedProductPath(url) {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    if (segments.length !== 5) return null;
    const [products, petType, line, pathForm, slug] = segments;
    if (products !== "products" || !["dog", "cat"].includes(petType)) return null;
    if (!Object.prototype.hasOwnProperty.call(LINE_LABELS, line)) return null;
    if (!Object.prototype.hasOwnProperty.call(FORM_MAP, pathForm)) return null;
    if (!/^[a-z0-9-]+$/.test(slug)) return null;
    return { petType, line, pathForm, form: FORM_MAP[pathForm], slug };
  } catch {
    return null;
  }
}

function productNameFromPath(parsed) {
  const lineLabel = LINE_LABELS[parsed.line];
  const slugName = productNameFromSlug(parsed.slug);
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
  if (/\b(frozen|fresh)\b/.test(text)) return "fresh";
  const wet = /\b(can|canned|wet|pate|diner|frommbalaya|gumbo|gravy|stew)\b/.test(text);
  const dry = /\b(dry|kibble|gold|classic|four star)\b/.test(text);
  if (wet && !dry) return "wet";
  if (dry && !wet) return "dry";
  return "";
}

function proteinTokens(value) {
  const tokens = new Set();
  for (const token of normalizeText(value).split(/\s+/)) {
    if (!PROTEIN_TOKENS.has(token)) continue;
    tokens.add(token === "seafood" ? "fish" : token);
  }
  return [...tokens].sort();
}

function distinctiveTokens(value) {
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !DISTINCTIVE_STOP_TOKENS.has(token))
    .sort();
}

function isSubsetOfText(tokens, text) {
  return tokens.length > 0 && tokens.every((token) =>
    new RegExp(`(^| )${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(text)
  );
}

function sameProteinSet(target, row) {
  if (target.proteinTokens.length === 0 || target.proteinTokens.length !== row.proteinTokens.length) return false;
  return target.proteinTokens.every((protein, index) => protein === row.proteinTokens[index]);
}

function isCandidateFoodRow(row) {
  const text = normalizeText(`${row.name} ${row.sourceUrl} ${row.line} ${row.form}`);
  if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  return Boolean(row.petType && row.form && row.proteinTokens.length > 0 && row.distinctiveTokens.length > 0);
}

function parseProductRows(html) {
  const urls = [...String(html || "").matchAll(/href=["']([^"']+)["']/gi)]
    .map((match) => cleanUrl(match[1]))
    .filter(Boolean)
    .filter((url, index, list) => list.indexOf(url) === index)
    .sort();

  return urls
    .map((sourceUrl) => {
      const parsed = parsedProductPath(sourceUrl);
      if (!parsed) return null;
      const name = productNameFromPath(parsed);
      const matchText = `${parsed.petType} ${name} ${sourceUrl}`;
      return {
        sourceUrl,
        name,
        petType: parsed.petType,
        line: parsed.line,
        form: parsed.form,
        proteinTokens: proteinTokens(matchText),
        distinctiveTokens: distinctiveTokens(name),
      };
    })
    .filter(Boolean)
    .filter(isCandidateFoodRow);
}

async function fetchText(url, accept = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8") {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: accept,
    },
  });
  if (!response.ok) throw new Error(`Fromm fetch failed ${response.status}: ${url}`);
  return response.text();
}

function isFrommRow(row) {
  const text = normalizeText(`${row?.brand || ""} ${row?.product_name || ""} ${row?.cache_key || ""}`);
  if (!/\bfromm\b/.test(text)) return false;
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
      if (!isFrommRow(row)) continue;
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
  return rows
    .filter((row) =>
      row.petType === target.petType &&
      row.productForm === target.form &&
      sameProteinSet(target, row) &&
      isSubsetOfText(target.distinctiveTokens, row.normalizedText)
    )
    .sort((a, b) => a.product_name.localeCompare(b.product_name));
}

function matchState(target, rows) {
  if (skipExistingScan) return { kind: "skipped_existing_scan", row: null };
  if (!target.petType || !target.form || target.proteinTokens.length === 0 || target.distinctiveTokens.length === 0) {
    return { kind: "weak_target_tokens", row: null };
  }
  const matches = matchCandidates(target, rows);
  if (matches.length === 1) return { kind: "matched", row: matches[0] };
  if (matches.length > 1) return { kind: "ambiguous", row: null, matches: matches.length };
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
  const end = text.toLowerCase().indexOf("daily feeding", index + 20);
  const chunk = text.slice(index, end > index ? end : index + 2500);
  const panel = { basis: "as-fed", source_url: sourceUrl };
  let numericCount = 0;
  const nutrientPattern = /\b(Crude\s+Protein|Crude\s+Fat|Crude\s+Fib(?:er|re)|Moisture|Ash|Calcium|Phosphorus|Omega[-\s]*3|Omega[-\s]*6)\b\s*([\d.]+)\s*%\s*(?:MIN|MAX)?/gi;
  let match;
  while ((match = nutrientPattern.exec(chunk))) {
    const field = nutrientField(match[1]);
    const value = parsePercent(match[2]);
    if (!field || value == null) continue;
    panel[field] = value;
    numericCount++;
  }
  match = text.match(/Caloric Content\s*([\d,]+(?:\.\d+)?)\s*kcal\s*\/?\s*kg/i);
  if (match) {
    panel.calories_per_kg = Number(match[1].replace(/,/g, ""));
    numericCount++;
  }
  match = text.match(/Caloric Content[\s\S]{0,120}?([\d,]+(?:\.\d+)?)\s*kcal\s*\/?\s*cup/i);
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
  const [sitemapHtml, existingRows] = await Promise.all([fetchText(sitemapUrl), fetchExistingRows()]);
  const candidates = parseProductRows(sitemapHtml);
  const targets = [];
  const unmatchedTargets = [];
  const seen = new Set();
  const skipped = { weakTargetTokens: 0, missingCatalogAlias: 0, ambiguousCatalogAlias: 0, missingPanel: 0, duplicate: 0 };
  const panelRejectReasons = new Map();

  for (const candidate of candidates) {
    const state = matchState(candidate, existingRows);
    const row = state.row;
    if (!row && !skipExistingScan) {
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

    const target = {
      cacheKey: row?.cache_key || normalizeCacheKey(`${BRAND} ${candidate.name}`),
      productName: row?.product_name || candidate.name,
      brand: row?.brand || BRAND,
      petType: candidate.petType,
      source: "fromm_official_product_page",
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

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: "fromm_official_product_pages",
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
  console.log(`Wrote ${targets.length} Fromm nutrient panel targets to ${path.relative(root, outputPath)}`);
  console.log(`Scanned ${candidates.length} candidate product URLs; weak tokens ${skipped.weakTargetTokens}; unmatched aliases ${skipped.missingCatalogAlias}; ambiguous aliases ${skipped.ambiguousCatalogAlias}; missing panels ${skipped.missingPanel}; duplicates ${skipped.duplicate}`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
