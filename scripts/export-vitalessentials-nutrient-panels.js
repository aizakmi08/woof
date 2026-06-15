#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BRAND = "Vital Essentials";
const DEFAULT_SITEMAP_URL = "https://www.vitalessentials.com/sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/nutrient-panel-vitalessentials-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof nutrient panel export";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const sitemapArg = process.argv.find((arg) => arg.startsWith("--sitemap-url="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const delayArg = process.argv.find((arg) => arg.startsWith("--delay-ms="));
const includeUnmatched = process.argv.includes("--include-unmatched");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const sitemapUrl = sitemapArg ? sitemapArg.split("=").slice(1).join("=").trim() : DEFAULT_SITEMAP_URL;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const delayMs = delayArg ? Number(delayArg.split("=")[1]) : 250;

const REJECT_TERMS = [
  "treat", "treats", "chew", "chews", "snack", "snacks", "raw bar",
  "duck heads", "duck necks", "turkey necks", "pig snouts", "moo sticks",
  "bully sticks", "bites", "hearts", "giblets", "liver", "tripe",
  "minnows", "skins", "tendon", "topper", "toppers", "mix in",
  "mixins", "mixer", "mixers", "variety bundle", "variety pack",
];
const CATALOG_ROW_REJECT_TERMS = REJECT_TERMS.filter((term) =>
  !["topper", "toppers", "mix in", "mixins", "mixer", "mixers"].includes(term)
);

const PROTEIN_TOKENS = new Set([
  "beef", "chicken", "duck", "egg", "lamb", "pheasant", "pork", "quail",
  "rabbit", "salmon", "turkey", "whitefish",
]);

const NUTRIENT_FIELDS = {
  crude_protein_min: "protein_pct",
  crude_fat_min: "fat_pct",
  crude_fiber_max: "fiber_pct",
  moisture_max: "moisture_pct",
};

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:vitalessentials-nutrient-panels -- --output=.tmp/nutrient-panel-vitalessentials-targets.json

Options:
  --output=path.json      Write a nutrient-panel backfill manifest (default ${DEFAULT_OUTPUT})
  --sitemap-url=url       Explicit Vital Essentials sitemap URL (${DEFAULT_SITEMAP_URL})
  --limit=N               Stop after N matched nutrient panels are collected (default 0, no limit)
  --delay-ms=N            Delay between product-page requests (default 250)
  --include-unmatched     Include parsed unmatched/ambiguous rows under unmatchedTargets
  --skip-existing-scan    Skip product_data alias reads for parser smoke/debug exports only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  if (!/^https:\/\/www\.vitalessentials\.com\/sitemap\.xml$/i.test(sitemapUrl)) {
    usage("--sitemap-url must be https://www.vitalessentials.com/sitemap.xml.");
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
    .replace(/[-_/,%+]+/g, " ")
    .replace(/[^a-z0-9\s&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCacheKey(text) {
  return normalizeText(text)
    .replace(/\b(dog food|cat food|formula|recipe|food for dogs|food for cats)\b/g, " ")
    .replace(/\b(entree|entrée)\b/g, " ")
    .replace(/\bw\b/g, "with")
    .replace(/\b\d+(\s+)?(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|bag|bags|case|pack|pk|ct|count|box|boxes)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasTerm(text, term) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  if (normalizedTerm.includes(" ")) return text.includes(normalizedTerm);
  return new RegExp(`(^|[^a-z0-9])${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text);
}

function slugFromUrl(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    if (parts[0] !== "products" || parts.length !== 2) return "";
    return parts[1];
  } catch {
    return "";
  }
}

function extractUrls(xml) {
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => decodeHtml(match[1]));
}

function productTitleFromPageData(pageData, fallbackSlug) {
  const product = pageData?.product || {};
  const title = product.title || product.handle || fallbackSlug;
  return decodeHtml(title).replace(/\s+/g, " ").trim();
}

function titleFromSlug(slug) {
  return asciiFold(slug)
    .replace(/^vital-essentials-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

function inferPetTypeFromText(value) {
  const text = normalizeText(value);
  const cat = /\b(cat|cats|kitten|kittens|feline)\b/.test(text);
  const dog = /\b(dog|dogs|puppy|puppies|canine)\b/.test(text);
  if (cat && !dog) return "cat";
  if (dog && !cat) return "dog";
  return "";
}

function inferProductForm(value) {
  const text = normalizeText(value);
  if (/\braw fusion\b/.test(text)) return "raw_fusion_patties";
  const frozen = /\bfrozen\b/.test(text);
  const freezeDried = /\b(freeze dried|freeze-dried|freezedried)\b/.test(text);
  if (/\bsoft nibs\b/.test(text)) {
    if (freezeDried) return "freeze_dried_soft_nibs";
    return "soft_nibs";
  }
  if (/\bmicro nibs\b/.test(text)) {
    if (freezeDried) return "freeze_dried_micro_nibs";
    return "micro_nibs";
  }
  if (/\bcrunchy mini nibs\b|\bmini nibs\b/.test(text)) {
    if (freezeDried) return "freeze_dried_mini_nibs";
    return "mini_nibs";
  }
  if (/\bcrunchy nibs\b|\bnibs\b/.test(text)) {
    if (freezeDried) return "freeze_dried_nibs";
    return "nibs";
  }
  if (/\bmini patties\b/.test(text)) {
    if (frozen) return "frozen_mini_patties";
    if (freezeDried) return "freeze_dried_mini_patties";
    return "mini_patties";
  }
  if (/\bpatties\b/.test(text)) {
    if (frozen) return "frozen_patties";
    if (freezeDried) return "freeze_dried_patties";
    return "patties";
  }
  return "";
}

function proteinTokens(value) {
  return new Set(normalizeText(value)
    .split(/\s+/)
    .filter((token) => PROTEIN_TOKENS.has(token)));
}

function isCandidateUrl(url) {
  const slug = slugFromUrl(url);
  const text = normalizeText(slug);
  if (!slug || !/(?:^|-)dog-food(?:-|$)|(?:^|-)cat-food(?:-|$)/.test(slug)) return false;
  if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  return Boolean(inferPetTypeFromText(slug) && inferProductForm(slug) && proteinTokens(slug).size > 0);
}

function isVitalEssentialsRow(row) {
  const text = normalizeText(`${row?.brand || ""} ${row?.product_name || ""} ${row?.cache_key || ""}`);
  if (!/\bvital essentials\b/.test(text)) return false;
  if (CATALOG_ROW_REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  const mentionsTopperOrMixer =
    hasTerm(text, "topper") ||
    hasTerm(text, "toppers") ||
    hasTerm(text, "mix in") ||
    hasTerm(text, "mixins") ||
    hasTerm(text, "mixer") ||
    hasTerm(text, "mixers");
  const isCompleteMeal =
    /\bcomplete meal\b/.test(text) ||
    /\bcomplete balanced\b/.test(text) ||
    /\bcomplete and balanced\b/.test(text);
  if (mentionsTopperOrMixer && !isCompleteMeal) return false;
  return true;
}

async function fetchText(url, accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8") {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: accept,
    },
  });
  if (!response.ok) throw new Error(`Vital Essentials fetch failed ${response.status}: ${url}`);
  return response.text();
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
      if (!isVitalEssentialsRow(row)) continue;
      const rowText = `${row.brand || ""} ${row.product_name || ""} ${row.cache_key || ""}`;
      rows.push({
        ...row,
        petType: inferPetTypeFromText(rowText),
        productForm: inferProductForm(rowText),
        proteinSet: proteinTokens(rowText),
      });
    }
    if (page.length < REST_PAGE_SIZE) break;
  }
  return rows;
}

function fieldValue(field) {
  if (!field) return "";
  return String(field.parsedValue || field.value || "").trim();
}

function parsePercent(value) {
  const match = String(value || "").match(/([\d.]+)\s*%/);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}

function parseNextPageData(html) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("missing_next_data");
  return JSON.parse(match[1])?.props?.pageProps || {};
}

function parseNutrientPanel(html, sourceUrl) {
  const pageData = parseNextPageData(html);
  const metafields = pageData?.product?.metafields?.veraw || {};
  const panel = { basis: "as-fed", source_url: sourceUrl };
  let numericCount = 0;
  for (const [sourceField, targetField] of Object.entries(NUTRIENT_FIELDS)) {
    const numeric = parsePercent(fieldValue(metafields[sourceField]));
    if (numeric == null) continue;
    panel[targetField] = numeric;
    numericCount++;
  }
  const calories = fieldValue(metafields.calorie_content);
  let match = calories.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*\/?\s*kg/i);
  if (match) {
    panel.calories_per_kg = Number(match[1].replace(/,/g, ""));
    numericCount++;
  }
  match = calories.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*\/?\s*cup/i);
  if (match) {
    panel.calories_per_cup = Number(match[1].replace(/,/g, ""));
    numericCount++;
  }
  if (numericCount < 2 || panel.protein_pct == null || panel.fat_pct == null) {
    return { panel: null, pageData, reason: "nutrient_panel_too_sparse" };
  }
  return { panel, pageData, reason: null };
}

function normalizeTarget(url, pageData, panel) {
  const slug = slugFromUrl(url);
  const title = productTitleFromPageData(pageData, titleFromSlug(slug));
  const matchText = `${slug} ${title}`;
  return {
    productName: title,
    petType: inferPetTypeFromText(matchText),
    productForm: inferProductForm(matchText),
    sourceUrl: url,
    proteinTokens: [...proteinTokens(matchText)],
    nutrientPanel: panel,
  };
}

function sameProteinSet(target, row) {
  const targetProteins = new Set(target.proteinTokens);
  if (targetProteins.size === 0 || targetProteins.size !== row.proteinSet.size) return false;
  for (const protein of targetProteins) {
    if (!row.proteinSet.has(protein)) return false;
  }
  return true;
}

function matchCandidates(target, rows) {
  if (skipExistingScan) return [];
  return rows
    .filter((row) =>
      row.petType === target.petType &&
      row.productForm === target.productForm &&
      sameProteinSet(target, row)
    )
    .sort((a, b) => a.product_name.localeCompare(b.product_name));
}

function matchState(target, rows) {
  if (skipExistingScan) return { kind: "skipped_existing_scan", row: null };
  if (!target.petType || !target.productForm || target.proteinTokens.length === 0) return { kind: "weak_target_tokens", row: null };
  const matches = matchCandidates(target, rows);
  if (matches.length === 1) return { kind: "matched", row: matches[0] };
  if (matches.length > 1) return { kind: "ambiguous", row: null, matches: matches.length };
  return { kind: "missing", row: null };
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
  const [sitemapXml, existingRows] = await Promise.all([fetchText(sitemapUrl, "application/xml,text/xml,*/*;q=0.8"), fetchExistingRows()]);
  const urls = extractUrls(sitemapXml).filter(isCandidateUrl);
  const targets = [];
  const unmatchedTargets = [];
  const seen = new Set();
  const skipped = { nonFood: 0, weakTargetTokens: 0, missingCatalogAlias: 0, ambiguousCatalogAlias: 0, missingPanel: 0, duplicate: 0 };
  const panelRejectReasons = new Map();

  for (const url of urls) {
    if ((targets.length || unmatchedTargets.length) && delayMs) await sleep(delayMs);
    let parsed;
    try {
      parsed = parseNutrientPanel(await fetchText(url), url);
    } catch (err) {
      skipped.missingPanel++;
      panelRejectReasons.set(err.message, (panelRejectReasons.get(err.message) || 0) + 1);
      continue;
    }
    if (!parsed.panel) {
      skipped.missingPanel++;
      panelRejectReasons.set(parsed.reason, (panelRejectReasons.get(parsed.reason) || 0) + 1);
      continue;
    }

    const candidate = normalizeTarget(url, parsed.pageData, parsed.panel);
    const state = matchState(candidate, existingRows);
    const row = state.row;
    const target = {
      cacheKey: row?.cache_key || normalizeCacheKey(`${BRAND} ${candidate.productName}`),
      productName: row?.product_name || candidate.productName,
      brand: row?.brand || BRAND,
      petType: candidate.petType,
      source: "vitalessentials_official_product_page",
      sourceUrl: candidate.sourceUrl,
      nutrientPanel: candidate.nutrientPanel,
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
          proteinTokens: candidate.proteinTokens,
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
    source: "vitalessentials_official_product_pages",
    sitemapUrl,
    scannedProducts: urls.length,
    candidateProducts: urls.length,
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
  console.log(`Wrote ${targets.length} Vital Essentials nutrient panel targets to ${path.relative(root, outputPath)}`);
  console.log(`Scanned ${urls.length} product URLs; weak tokens ${skipped.weakTargetTokens}; unmatched aliases ${skipped.missingCatalogAlias}; ambiguous aliases ${skipped.ambiguousCatalogAlias}; missing panels ${skipped.missingPanel}; duplicates ${skipped.duplicate}`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
