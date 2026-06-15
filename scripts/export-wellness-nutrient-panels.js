#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BRAND = "Wellness";
const DEFAULT_SITEMAP_URL = "https://www.wellnesspetfood.com/salsify-products-sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/nutrient-panel-wellness-targets.json";
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
const delayMs = delayArg ? Number(delayArg.split("=")[1]) : 100;

const REJECT_TERMS = [
  "bare bowl", "bowl booster", "bundle", "calming", "chew", "chews",
  "dental", "hip joint", "kittles", "lickable", "mixer", "mixers",
  "mother's solutions", "mothers solutions", "old mother hubbard",
  "soft chew", "supplement", "supplements", "tiny trainers", "topper",
  "toppers", "treat", "treats", "trial bundle", "variety pack", "wellbars",
  "whimzees",
];
const PROTEIN_TOKENS = new Set([
  "beef", "bison", "boar", "chicken", "cod", "duck", "fish", "herring",
  "lamb", "liver", "mackerel", "pork", "quail", "rabbit", "salmon",
  "sardine", "shrimp", "trout", "tuna", "turkey", "venison", "whitefish",
]);
const DISTINCTIVE_STOP_TOKENS = new Set([
  "all", "and", "balanced", "can", "canned", "cat", "cats", "deboned",
  "dog", "dogs", "dry", "entree", "entrees", "food", "foods", "for",
  "free", "high", "kibble", "meal", "meals", "natural", "of", "pate",
  "pet", "pets", "plus", "recipe", "recipes", "sauce", "the", "wellness",
  "wet", "with",
]);
const CONFLICT_TOKENS = [
  "adult", "bowls", "complete", "core", "digestive", "grain", "grained",
  "grainfree", "grains", "healthy", "indoor", "kitten", "large", "mini",
  "petite", "protein", "puppy", "selects", "senior", "signature", "simple",
  "small", "tasters", "toy", "weight", "wholesome",
];
const NUTRIENT_FIELD_ALIASES = [
  [/\bcrude\s+protein\b/i, "protein_pct"],
  [/\bcrude\s+fat\b/i, "fat_pct"],
  [/\bcrude\s+fib(?:er|re)\b/i, "fiber_pct"],
  [/\bmoisture\b/i, "moisture_pct"],
  [/\bcalcium\b/i, "calcium_pct"],
  [/\bphosphorus\b/i, "phosphorus_pct"],
  [/\bomega[-\s]*3\b/i, "omega_3_pct"],
  [/\bomega[-\s]*6\b/i, "omega_6_pct"],
];

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:wellness-nutrient-panels -- --output=.tmp/nutrient-panel-wellness-targets.json

Options:
  --output=path.json      Write a nutrient-panel backfill manifest (default ${DEFAULT_OUTPUT})
  --sitemap-url=url       Explicit Wellness Salsify product sitemap URL (${DEFAULT_SITEMAP_URL})
  --limit=N               Stop after N matched nutrient panels are collected (default 0, no limit)
  --delay-ms=N            Delay between page requests (default 100)
  --include-unmatched     Include parsed unmatched/ambiguous rows under unmatchedTargets
  --skip-existing-scan    Skip product_data alias reads for parser smoke/debug exports only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  if (!/^https:\/\/www\.wellnesspetfood\.com\/salsify-products-sitemap\.xml$/i.test(sitemapUrl)) {
    usage("--sitemap-url must be https://www.wellnesspetfood.com/salsify-products-sitemap.xml.");
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
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return decodeHtml(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "));
}

function normalizeText(value) {
  return decodeHtml(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’™®+]/g, " ")
    .replace(/[-_/,%]+/g, " ")
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

function cleanUrl(value) {
  try {
    const parsed = new URL(decodeHtml(value));
    parsed.hash = "";
    parsed.search = "";
    const url = parsed.href.replace(/\/$/, "");
    if (!/^https:\/\/www\.wellnesspetfood\.com\/product-catalog\/[a-z0-9-]+$/i.test(url)) return "";
    return url;
  } catch {
    return "";
  }
}

function extractUrls(xml) {
  return [...String(xml || "").matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => cleanUrl(match[1]))
    .filter(Boolean)
    .filter((url) => !/\/product-catalog\/?$/i.test(url))
    .filter((url, index, list) => list.indexOf(url) === index)
    .sort();
}

async function fetchText(url, accept = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8") {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: accept,
    },
  });
  if (!response.ok) throw new Error(`Wellness fetch failed ${response.status}: ${url}`);
  return response.text();
}

function jsonLdBlocks(html) {
  const blocks = [];
  for (const match of String(html || "").matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed?.["@graph"])) blocks.push(...parsed["@graph"]);
      else blocks.push(parsed);
    } catch {
      // Keep looking for another JSON-LD block.
    }
  }
  return blocks;
}

function productMetadataFromHtml(html, fallbackUrl) {
  const blocks = jsonLdBlocks(html);
  const product = blocks.find((block) => block?.["@type"] === "Product") || {};
  const page = blocks.find((block) => Array.isArray(block?.["@type"]) && block["@type"].includes("WebPage")) || {};
  return {
    productName: decodeHtml(product.name || page.name || ""),
    description: decodeHtml(product.description || page.description || ""),
    sourceUrl: cleanUrl(product["@id"] || page.url || fallbackUrl) || fallbackUrl,
  };
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
  const wet = /\b(wet|can|canned|pate|morsels|minced|sliced|shredded|flaked|stew|stews|mousse|gravy|gravies|pouch)\b/.test(text);
  const dry = /\b(dry|kibble)\b/.test(text);
  if (wet && !dry) return "wet";
  if (dry && !wet) return "dry";
  return "";
}

function proteinTokens(value) {
  const tokens = new Set();
  for (const token of normalizeText(value).split(/\s+/)) {
    if (PROTEIN_TOKENS.has(token)) tokens.add(token);
  }
  return [...tokens].sort();
}

function distinctiveTokens(value) {
  return [...new Set(normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !DISTINCTIVE_STOP_TOKENS.has(token) && !PROTEIN_TOKENS.has(token) && !/^\d+$/.test(token)))]
    .sort();
}

function isSubsetOfText(tokens, text) {
  return tokens.length >= 3 && tokens.every((token) =>
    new RegExp(`(^| )${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(text)
  );
}

function sameProteinSet(target, row) {
  if (target.proteinTokens.length === 0 || target.proteinTokens.length !== row.proteinTokens.length) return false;
  return target.proteinTokens.every((protein, index) => protein === row.proteinTokens[index]);
}

function conflictTokensMatch(target, rowText) {
  return CONFLICT_TOKENS.every((token) =>
    target.distinctiveTokens.includes(token) ||
    !new RegExp(`(^| )${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(rowText)
  );
}

function candidateFromPage(sourceUrl, html) {
  const metadata = productMetadataFromHtml(html, sourceUrl);
  const combinedText = `${metadata.productName} ${metadata.description} ${metadata.sourceUrl} ${sourceUrl}`;
  const normalized = normalizeText(combinedText);
  if (!metadata.productName || REJECT_TERMS.some((term) => hasTerm(normalized, term))) return null;
  const petType = inferPetTypeFromText(combinedText);
  const form = inferProductFormFromText(combinedText);
  const proteins = proteinTokens(metadata.productName);
  const distinctive = distinctiveTokens(metadata.productName);
  if (!petType || !form || proteins.length === 0 || distinctive.length < 3) return null;
  return {
    sourceUrl: metadata.sourceUrl || sourceUrl,
    productName: metadata.productName,
    petType,
    form,
    proteinTokens: proteins,
    distinctiveTokens: distinctive,
  };
}

function isWellnessRow(row) {
  const brand = String(row?.brand || "");
  if (!/^wellness(\b| )|wellness pet food/i.test(brand)) return false;
  const text = normalizeText(`${row?.product_name || ""} ${row?.cache_key || ""}`);
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
      if (!isWellnessRow(row)) continue;
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
      isSubsetOfText(target.distinctiveTokens, row.normalizedText) &&
      conflictTokensMatch(target, row.normalizedText)
    )
    .sort((a, b) => a.product_name.localeCompare(b.product_name));
}

function matchState(target, rows) {
  if (skipExistingScan) return { kind: "skipped_existing_scan", row: null };
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
  const match = String(value || "").match(/([\d.]+)\s*%/);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}

function parseNutrientPanel(html, sourceUrl) {
  const block = (String(html || "").match(/<div class="modal fade" id="guaranteedAnalysisModal"[\s\S]*?<div class="feeding-guidelines">/i) ||
    String(html || "").match(/<div class="guaranteed-analysis">[\s\S]*?<div class="feeding-guidelines">/i) || [])[0] || "";
  const text = stripTags(block);
  const panel = { basis: "as-fed", source_url: sourceUrl };
  let numericCount = 0;
  for (const row of text.matchAll(/([A-Za-z0-9*+\-\s]+?)\s+(?:Min|Max|Not Less Than|Not More Than)\s+([\d.]+\s*%)/gi)) {
    const field = nutrientField(row[1]);
    const value = parsePercent(row[2]);
    if (!field || value == null) continue;
    panel[field] = value;
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
    if (panel.calories_per_cup != null || panel.calories_per_kg != null || panel.calories_per_oz != null) withCalories++;
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
  const [sitemapXml, existingRows] = await Promise.all([
    fetchText(sitemapUrl, "application/xml,text/xml,*/*;q=0.8"),
    fetchExistingRows(),
  ]);
  const urls = extractUrls(sitemapXml);
  const targets = [];
  const unmatchedTargets = [];
  const seen = new Set();
  const skipped = { nonFood: 0, missingCatalogAlias: 0, ambiguousCatalogAlias: 0, missingPanel: 0, duplicate: 0 };
  const panelRejectReasons = new Map();

  for (const url of urls) {
    if ((targets.length || unmatchedTargets.length) && delayMs) await sleep(delayMs);
    let html;
    let candidate;
    try {
      html = await fetchText(url);
      candidate = candidateFromPage(url, html);
    } catch {
      skipped.nonFood++;
      continue;
    }
    if (!candidate) {
      skipped.nonFood++;
      continue;
    }

    const state = matchState(candidate, existingRows);
    const row = state.row;
    if (!row && !skipExistingScan) {
      if (state.kind === "ambiguous") skipped.ambiguousCatalogAlias++;
      else skipped.missingCatalogAlias++;
      if (includeUnmatched) {
        unmatchedTargets.push({
          cacheKey: normalizeCacheKey(`${BRAND} ${candidate.productName}`),
          productName: candidate.productName,
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

    const parsed = parseNutrientPanel(html, candidate.sourceUrl);
    if (!parsed.panel) {
      skipped.missingPanel++;
      panelRejectReasons.set(parsed.reason, (panelRejectReasons.get(parsed.reason) || 0) + 1);
      continue;
    }
    const target = {
      cacheKey: row?.cache_key || normalizeCacheKey(`${BRAND} ${candidate.productName}`),
      productName: row?.product_name || candidate.productName,
      brand: row?.brand || BRAND,
      petType: candidate.petType,
      source: "wellness_official_product_page",
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
    source: "wellness_official_product_page",
    sitemapUrl,
    scannedProducts: urls.length,
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
  console.log(`Wrote ${targets.length} Wellness nutrient panel targets to ${path.relative(root, outputPath)}`);
  console.log(`Scanned ${urls.length} product URLs; non-food/weak ${skipped.nonFood}; unmatched aliases ${skipped.missingCatalogAlias}; ambiguous aliases ${skipped.ambiguousCatalogAlias}; missing panels ${skipped.missingPanel}; duplicates ${skipped.duplicate}`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
