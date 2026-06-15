#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BRAND = "Earthborn Holistic";
const DEFAULT_SITEMAP_URL = "https://www.earthbornholisticpetfood.com/product-sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/nutrient-panel-earthborn-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof nutrient panel export";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const sitemapArg = process.argv.find((arg) => arg.startsWith("--sitemap="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const includeUnmatched = process.argv.includes("--include-unmatched");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const sitemapUrl = sitemapArg ? sitemapArg.split("=").slice(1).join("=").trim() : DEFAULT_SITEMAP_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

const REJECT_TERMS = [
  "treat", "treats", "earthbites", "crunchy", "chewy", "biscuit",
  "biscuits", "snack", "snacks", "supplement", "supplements", "topper",
  "toppers", "broth", "chew", "chews", "intl", "international",
  "product category", "products", "toy", "toys", "apparel", "litter",
];
const PROTEIN_ALIASES = new Map([
  ["beef", "beef"],
  ["bison", "bison"],
  ["chicken", "chicken"],
  ["duck", "duck"],
  ["herring", "fish"],
  ["fish", "fish"],
  ["lamb", "lamb"],
  ["pollock", "fish"],
  ["rabbit", "rabbit"],
  ["salmon", "salmon"],
  ["turkey", "turkey"],
  ["tuna", "fish"],
  ["whitefish", "fish"],
  ["whiting", "fish"],
]);
const DISTINCTIVE_STOP_TOKENS = new Set([
  "ancient", "and", "canned", "cat", "cats", "diet", "dog", "dogs",
  "dry", "earthborn", "food", "foods", "free", "gluten", "grain",
  "grains", "holistic", "ingredient", "limited", "made", "meal", "meat",
  "moist", "natural", "percent", "protein", "recipe", "recipes", "usa",
  "vegetables", "wet", "with",
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
  npm run export:earthborn-nutrient-panels -- --output=.tmp/nutrient-panel-earthborn-targets.json

Options:
  --output=path.json      Write a nutrient-panel backfill manifest (default ${DEFAULT_OUTPUT})
  --sitemap=url           Explicit Earthborn product sitemap URL (${DEFAULT_SITEMAP_URL})
  --limit=N               Stop after N matched nutrient panels are collected (default 0, no limit)
  --include-unmatched     Include parsed unmatched/ambiguous rows under unmatchedTargets
  --skip-existing-scan    Skip product_data alias reads for parser smoke/debug exports only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  if (!Number.isFinite(limit) || limit < 0) usage("--limit must be a non-negative number.");
  if (!/^https:\/\/www\.earthbornholisticpetfood\.com\/product-sitemap\.xml$/i.test(sitemapUrl)) {
    usage("--sitemap must be https://www.earthbornholisticpetfood.com/product-sitemap.xml.");
  }
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
    .replace(/<\/(?:div|p|h[1-6]|td|th|li)>/gi, " ")
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
  const smallWords = new Set(["and", "or", "of", "for", "in", "with", "to", "the"]);
  return cleanProductName(String(value || "")
    .split(/(\s+)/)
    .map((part, index) => {
      if (/^\s+$/.test(part)) return part;
      const lower = part.toLowerCase();
      if (index > 0 && smallWords.has(lower)) return lower;
      return lower.replace(/(^|[-'/])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
    })
    .join("")
    .replace(/\bK95\b/gi, "K95"));
}

function cleanUrl(value) {
  try {
    const parsed = new URL(decodeHtml(value));
    parsed.hash = "";
    parsed.search = "";
    const url = parsed.href.replace(/\/$/, "");
    if (!/^https:\/\/www\.earthbornholisticpetfood\.com\/product\/(?:dog-food|cat-food)\/[a-z0-9-]+\/[a-z0-9-]+$/i.test(url)) return "";
    return url;
  } catch {
    return "";
  }
}

function extractUrls(xml) {
  const urls = [];
  const pattern = /<loc>([\s\S]*?)<\/loc>/gi;
  let match;
  while ((match = pattern.exec(xml))) {
    const url = cleanUrl(match[1]);
    if (url) urls.push(url);
  }
  return urls;
}

function parseProductUrl(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    if (parts.length !== 4 || parts[0] !== "product") return null;
    const petType = parts[1] === "dog-food" ? "dog" : parts[1] === "cat-food" ? "cat" : "";
    if (!petType) return null;
    return { petType, line: parts[2], slug: parts[3] };
  } catch {
    return null;
  }
}

function nameFromSlug(slug) {
  return titleCaseProductName(String(slug || "")
    .replace(/-/g, " ")
    .replace(/\bk95\b/gi, "K95")
    .replace(/\s+/g, " "));
}

function formFromPath(row) {
  const text = normalizeText(`${row.line} ${row.slug}`);
  if (hasTerm(text, "k95")) return "wet";
  if (row.petType === "cat" && !hasTerm(text, "primitive feline") && !hasTerm(text, "wild sea catch")) return "wet";
  return "dry";
}

function isCandidateFoodUrl(url) {
  const row = parseProductUrl(url);
  if (!row) return false;
  const text = normalizeText(`${url} ${row.line} ${row.slug}`);
  if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  return row.petType === "dog" || row.petType === "cat";
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
  if (/\b(dry|kibble)\b/.test(text)) return "dry";
  if (/\b(k95|wet|can|canned|stew|pate|pouch|tray|fricatssee|catcciatori|jumble|medley|harvest|ranchhouse)\b/.test(text)) return "wet";
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
  return [...new Set(normalizeText(value)
    .split(/\s+/)
    .filter((token) =>
      token.length > 2 &&
      !DISTINCTIVE_STOP_TOKENS.has(token) &&
      !PROTEIN_ALIASES.has(token)
    ))].sort();
}

function isSubsetOfText(tokens, text) {
  return tokens.length > 0 && tokens.every((token) =>
    new RegExp(`(^| )${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(text)
  );
}

function hasLifeStageConflict(target, row) {
  for (const token of ["puppy", "senior", "small", "large", "kitten", "weight"]) {
    const pattern = new RegExp(`\\b${token}\\b`);
    const inTarget = pattern.test(target.normalizedText);
    const inRow = pattern.test(row.normalizedText);
    if (inTarget !== inRow && (inTarget || inRow)) return true;
  }
  return false;
}

function formCompatible(target, row) {
  if (target.form === "wet") return row.productForm === "wet";
  return row.productForm !== "wet";
}

function proteinCompatible(target, row) {
  if (row.proteinTokens.length === 0) return true;
  return row.proteinTokens.every((token) => target.proteinTokens.includes(token));
}

function rowContainsSlugParts(target, row) {
  const ignored = new Set(["and", "with", "meal", "recipe"]);
  return target.slug.split("-").every((part) =>
    part.length < 3 || ignored.has(part) || row.normalizedText.includes(part)
  );
}

function preferMostSpecificMatches(target, matches) {
  if (matches.length <= 1) return matches;
  const slugSpecific = matches.filter((row) => rowContainsSlugParts(target, row));
  if (slugSpecific.length > 0) return slugSpecific;
  const proteinSpecific = matches.filter((row) =>
    row.proteinTokens.length > 0 &&
    row.proteinTokens.every((token) => target.proteinTokens.includes(token))
  );
  return proteinSpecific.length > 0 ? proteinSpecific : matches;
}

function isCandidateFoodRow(row) {
  const text = normalizeText(`${row.name} ${row.sourceUrl} ${row.line} ${row.form}`);
  if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  return Boolean(row.petType && row.form && row.distinctiveTokens.length > 0);
}

async function fetchText(url, accept = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8") {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: accept,
    },
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`Earthborn fetch failed ${response.status}: ${url}`);
  return response.text();
}

async function parseProductRows() {
  const xml = await fetchText(sitemapUrl, "application/xml,text/xml,*/*;q=0.8");
  return extractUrls(xml)
    .filter(isCandidateFoodUrl)
    .map((sourceUrl) => {
      const parsed = parseProductUrl(sourceUrl);
      if (!parsed) return null;
      const name = nameFromSlug(parsed.slug);
      const normalizedText = normalizeText(`${parsed.petType} ${parsed.line} ${parsed.slug} ${name}`);
      return {
        sourceUrl,
        name,
        petType: parsed.petType,
        line: parsed.line,
        slug: parsed.slug,
        form: formFromPath(parsed),
        proteinTokens: proteinTokens(`${parsed.line} ${parsed.slug} ${name}`),
        distinctiveTokens: distinctiveTokens(`${parsed.line} ${parsed.slug} ${name}`),
        normalizedText,
      };
    })
    .filter(Boolean)
    .filter(isCandidateFoodRow);
}

function isEarthbornRow(row) {
  const text = normalizeText(`${row?.brand || ""} ${row?.product_name || ""} ${row?.cache_key || ""}`);
  if (!text.includes("earthborn")) return false;
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
      if (!isEarthbornRow(row)) continue;
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
  if (skipExistingScan) return { kind: "skipped_existing_scan", rows: [] };
  if (!target.petType || !target.form || target.distinctiveTokens.length === 0) {
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

function extractGuaranteedAnalysisChunk(html) {
  const raw = String(html || "");
  const index = raw.toLowerCase().indexOf("guaranteed analysis");
  if (index < 0) return "";
  const end = raw.toLowerCase().indexOf("related products", index + 20);
  return raw.slice(index, end > index ? end : index + 5000);
}

function parseNutrientPanel(html, sourceUrl) {
  const rawChunk = extractGuaranteedAnalysisChunk(html);
  if (!rawChunk) return { panel: null, reason: "missing_guaranteed_analysis" };
  const panel = { basis: "as-fed", source_url: sourceUrl };
  let numericCount = 0;

  const rowPattern = /<div[^>]*class=["'][^"']*\btable-wrap\b[^"']*["'][^>]*>\s*<div[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  let row;
  while ((row = rowPattern.exec(rawChunk))) {
    const field = nutrientField(stripTags(row[1]));
    const value = parsePercent(stripTags(row[2]).match(/([\d,.]+)\s*%/)?.[1]);
    if (!field || value == null || panel[field] != null) continue;
    panel[field] = value;
    numericCount++;
  }

  const text = stripTags(html);
  let match = text.match(/Metabolizable Energy[\s\S]{0,140}?([\d,]+(?:\.\d+)?)\s*kcal\s*\/\s*kg/i);
  if (match) {
    panel.calories_per_kg = Number(match[1].replace(/,/g, ""));
    numericCount++;
  }
  match = text.match(/Metabolizable Energy[\s\S]{0,180}?([\d,]+(?:\.\d+)?)\s*kcal\s*\/\s*cup/i);
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
    byPetType: [...byPetType.entries()]
      .map(([petType, count]) => ({ petType, count }))
      .sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
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
          cacheKey: normalizeCacheKey(`${BRAND} ${candidate.name}`),
          productName: candidate.name,
          brand: BRAND,
          petType: candidate.petType,
          sourceUrl: candidate.sourceUrl,
          matchState: state.kind,
          productForm: candidate.form,
          proteinTokens: candidate.proteinTokens,
          distinctiveTokens: candidate.distinctiveTokens,
          matchedRows: rows.length,
        });
      }
      continue;
    }

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
        source: "earthborn_official_product_page",
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
    source: "earthborn_official_product_pages",
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
  console.log(`Wrote ${targets.length} Earthborn nutrient panel targets to ${path.relative(root, outputPath)}`);
  console.log(`Scanned ${candidates.length} product URLs; weak tokens ${skipped.weakTargetTokens}; unmatched aliases ${skipped.missingCatalogAlias}; missing panels ${skipped.missingPanel}; duplicates ${skipped.duplicate}`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
