#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BRAND = "Stella & Chewy's";
const DEFAULT_SITEMAP_INDEX_URL = "https://www.stellaandchewys.com/sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/nutrient-panel-stellaandchewys-targets.json";
const REST_PAGE_SIZE = 1000;
const USER_AGENT = "Mozilla/5.0 Woof nutrient panel export";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const sitemapIndexArg = process.argv.find((arg) => arg.startsWith("--sitemap-index="));
const sitemapArg = process.argv.find((arg) => arg.startsWith("--sitemap="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const delayArg = process.argv.find((arg) => arg.startsWith("--delay-ms="));
const includeUnmatched = process.argv.includes("--include-unmatched");
const skipExistingScan = process.argv.includes("--skip-existing-scan");

const outputPath = path.resolve(root, outputArg ? outputArg.split("=")[1] : DEFAULT_OUTPUT);
const sitemapIndexUrl = sitemapIndexArg ? sitemapIndexArg.split("=").slice(1).join("=").trim() : DEFAULT_SITEMAP_INDEX_URL;
const explicitSitemapUrl = sitemapArg ? sitemapArg.split("=").slice(1).join("=").trim() : "";
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const delayMs = delayArg ? Number(delayArg.split("=")[1]) : 150;

const REJECT_TERMS = [
  "beef heart", "beef liver", "bone broth", "bountiful bone broth",
  "bundle", "chicken breast", "chicken heart", "crav'n bac'n bites",
  "cravn bacn bites", "digestive support", "dinner dust", "heart treats",
  "hip & joint", "hip and joint", "immune support", "lamb heart",
  "lamb liver", "meal mixer", "meal mixers", "sample", "samples",
  "skin & coat", "skin and coat", "solutions", "superblends",
  "supplement", "supplements", "topper", "toppers", "treat", "treats",
  "trial", "variety pack", "wild weenies",
];
const CORE_FOOD_TERMS = [
  "carnivore cravings", "dinner in broth", "freeze-dried raw dinner morsels",
  "freeze-dried raw dinner patties", "freeze dried raw dinner morsels",
  "freeze dried raw dinner patties", "frozen raw dinner morsels",
  "frozen raw dinner patties", "frozen raw patties", "kibble for cats",
  "kibble for dogs", "kibble for puppies", "morsels for cats",
  "morsels for dogs", "morsels for kittens", "patties for dogs",
  "patties for puppies", "raw blend baked kibble", "raw blend kibble",
  "raw coated kibble", "recipe in broth", "savory stews", "shredrs",
  "wet food", "wholesome grains",
];
const ANIMAL_PROTEIN_TOKENS = new Set([
  "beef", "chicken", "cod", "duck", "fish", "goose", "lamb", "liver",
  "pork", "rabbit", "salmon", "turkey", "tuna", "venison",
]);
const DISTINCTIVE_STOP_TOKENS = new Set([
  "and", "baked", "blend", "cat", "cats", "chewy", "chewys", "coated",
  "com", "dinner", "dog", "dogs", "dried", "dry", "food", "foods", "for",
  "free", "freeze", "freezedried", "frozen", "grain", "grains", "high",
  "http", "https", "kibble", "morsels", "patties", "products", "protein",
  "raw", "recipe", "recipes", "stella", "stellaandchewys",
  "stellaandchewyscom", "stellaandchewys", "with", "www",
]);
const LIFE_STAGE_TOKENS = ["kitten", "kittens", "puppy", "puppies", "small"];
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
  npm run export:stellaandchewys-nutrient-panels -- --output=.tmp/nutrient-panel-stellaandchewys-targets.json

Options:
  --output=path.json      Write a nutrient-panel backfill manifest (default ${DEFAULT_OUTPUT})
  --sitemap-index=url     Stella & Chewy's sitemap index URL (${DEFAULT_SITEMAP_INDEX_URL})
  --sitemap=url           Explicit Stella & Chewy's product sitemap URL
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
  if (!/^https:\/\/www\.stellaandchewys\.com\/sitemap\.xml$/i.test(sitemapIndexUrl)) {
    usage("--sitemap-index must be https://www.stellaandchewys.com/sitemap.xml.");
  }
  if (explicitSitemapUrl && !/^https:\/\/www\.stellaandchewys\.com\/sitemap_products_\d+\.xml\?from=\d+&to=\d+$/i.test(explicitSitemapUrl)) {
    usage("--sitemap must be a Stella & Chewy's products sitemap URL.");
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
    .replace(/\s+front\s*$/i, "")
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
    if (!/^https:\/\/www\.stellaandchewys\.com\/products\/[a-z0-9-]+$/i.test(url)) return "";
    return url;
  } catch {
    return "";
  }
}

function metaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const namedThenContent = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i");
  const contentThenNamed = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i");
  return decodeHtml(String(html || "").match(namedThenContent)?.[1] || String(html || "").match(contentThenNamed)?.[1] || "");
}

function pageContextText(html) {
  const raw = String(html || "");
  const chunks = [];
  const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) chunks.push(stripTags(title));
  for (const key of ["og:title", "twitter:title"]) {
    const value = metaContent(raw, key);
    if (value) chunks.push(value);
  }
  const convTags = raw.match(/_conv_product_tags\s*=\s*(\[[\s\S]*?\])/i)?.[1];
  for (const tagBlock of [convTags]) {
    if (!tagBlock) continue;
    chunks.push(...[...tagBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]));
  }
  return chunks.map(stripTags).filter(Boolean).join(" ");
}

function productIdFromUrl(url) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).pop() || "";
  } catch {
    return "";
  }
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
    if (!retryable || attempt === 3) throw new Error(`Stella & Chewy's fetch failed ${response.status}: ${url}`);
    const retryAfter = Number(response.headers.get("retry-after"));
    const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * (attempt + 1);
    await sleep(backoffMs);
  }
  throw new Error(`Stella & Chewy's fetch failed: ${url}`);
}

function extractProductSitemapLocs(xml) {
  return [...String(xml || "").matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => decodeHtml(match[1]))
    .filter((url) => /^https:\/\/www\.stellaandchewys\.com\/sitemap_products_\d+\.xml\?from=\d+&to=\d+$/i.test(url))
    .filter((url, index, list) => list.indexOf(url) === index)
    .sort();
}

async function resolveSitemapUrls() {
  if (explicitSitemapUrl) return [explicitSitemapUrl];
  const xml = await fetchText(sitemapIndexUrl, "application/xml,text/xml,*/*;q=0.8");
  const urls = extractProductSitemapLocs(xml);
  if (urls.length === 0) throw new Error("No Stella & Chewy's product sitemaps found.");
  return urls;
}

function imageTitleFromBlock(block) {
  const title = String(block || "").match(/<image:title>([\s\S]*?)<\/image:title>/i);
  return title ? cleanProductName(title[1]) : "";
}

function parseProductRows(xml, sourceSitemap) {
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
        sourceSitemap,
        normalizedText: normalizeText(`${name} ${sourceUrl}`),
      };
    })
    .filter(Boolean);
}

async function parseSitemapRows() {
  const sitemapUrls = await resolveSitemapUrls();
  const rows = [];
  for (const sourceSitemap of sitemapUrls) {
    const xml = await fetchText(sourceSitemap, "application/xml,text/xml,*/*;q=0.8");
    rows.push(...parseProductRows(xml, sourceSitemap));
  }
  return rows;
}

function isCandidateSitemapRow(row) {
  const text = row.normalizedText;
  if (REJECT_TERMS.some((term) => hasTerm(text, term))) return false;
  if (!inferPetTypeFromText(text)) return false;
  if (!inferProductFormFromText(text)) return false;
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

function inferProductFormFromText(value) {
  const text = normalizeText(value);
  if (/\bfrozen\b/.test(text)) return "frozen";
  if (/\b(freeze dried|freezedried)\b/.test(text)) return "freeze_dried";
  if (/\b(raw blend|raw coated|kibble|dry)\b/.test(text)) return "dry";
  if (/\b(wet|stew|stews|shredrs|shreds|pate|pat|gravy|carnivore cravings|dinner in broth|recipe in broth|pouch)\b/.test(text)) return "wet";
  return "";
}

function productStyleTokens(value) {
  const text = normalizeText(value);
  const styles = [];
  if (/\bpatties\b/.test(text)) styles.push("patties");
  if (/\bmorsels\b/.test(text)) styles.push("morsels");
  if (/\b(raw blend)\b/.test(text)) styles.push("raw_blend");
  if (/\b(raw coated)\b/.test(text)) styles.push("raw_coated");
  if (/\b(wholesome grains)\b/.test(text)) styles.push("wholesome_grains");
  if (/\b(wild red)\b/.test(text)) styles.push("wild_red");
  if (/\b(carnivore cravings)\b/.test(text)) styles.push("carnivore_cravings");
  if (/\b(shredrs|shreds)\b/.test(text)) styles.push("shreds");
  if (/\b(pate|pat)\b/.test(text)) styles.push("pate");
  if (/\bgravy\b/.test(text)) styles.push("gravy");
  if (/\bstew\b|\bstews\b/.test(text)) styles.push("stew");
  return [...new Set(styles)].sort();
}

function grainTokens(value) {
  const text = normalizeText(value);
  const tokens = new Set();
  if (/\b(wholesome grains|with grains)\b/.test(text)) tokens.add("wholesome_grains");
  if (/\bgrainfree\b|\bgrain free\b|\bgrain\s*(?:&|and)?\s*legume\s*free\b/.test(text)) tokens.add("grain_free");
  return [...tokens].sort();
}

function animalProteinTokens(value) {
  const text = normalizeText(value);
  const tokens = new Set(text.split(/\s+/).filter((token) => ANIMAL_PROTEIN_TOKENS.has(token)));
  if (text.includes("duck duck goose")) {
    tokens.add("duck");
    tokens.add("goose");
  }
  if (text.includes("surf n turf")) {
    tokens.add("beef");
    tokens.add("salmon");
  }
  if (text.includes("red meat")) {
    tokens.add("beef");
  }
  return [...tokens].sort();
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

function normalizeCandidate(row, html = "") {
  const text = `${row.name} ${row.sourceUrl}`;
  const grainText = `${text} ${pageContextText(html)}`;
  return {
    sourceUrl: row.sourceUrl,
    productName: row.name,
    petType: inferPetTypeFromText(text),
    form: inferProductFormFromText(text),
    styleTokens: productStyleTokens(text),
    grainTokens: grainTokens(grainText),
    proteinTokens: animalProteinTokens(text),
    distinctiveTokens: distinctiveTokens(text),
    normalizedText: normalizeText(text),
  };
}

function isStellaCatalogRow(row) {
  const brand = normalizeText(row?.brand || "");
  const combined = normalizeText(`${row?.brand || ""} ${row?.product_name || ""} ${row?.cache_key || ""} ${row?.source_url || ""}`);
  if (REJECT_TERMS.some((term) => hasTerm(combined, term))) return false;
  return brand.includes("stella") && brand.includes("chew");
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
      if (!isStellaCatalogRow(row)) continue;
      const text = `${row.brand || ""} ${row.product_name || ""} ${row.cache_key || ""} ${row.source_url || ""}`;
      rows.push({
        ...row,
        petType: inferPetTypeFromText(text),
        productForm: inferProductFormFromText(text),
        styleTokens: productStyleTokens(text),
        grainTokens: grainTokens(text),
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
  for (const token of LIFE_STAGE_TOKENS) {
    const pattern = new RegExp(`\\b${token}\\b`);
    const inTarget = pattern.test(target.normalizedText);
    const inRow = pattern.test(row.normalizedText);
    if (inTarget !== inRow && (inTarget || inRow)) return true;
  }
  return false;
}

function styleCompatible(target, row) {
  if (target.styleTokens.length === 0 || row.styleTokens.length === 0) return false;
  return target.styleTokens.every((token) => row.styleTokens.includes(token));
}

function grainCompatible(target, row) {
  const targetGrains = new Set(target.grainTokens || []);
  const rowGrains = new Set(row.grainTokens || []);
  if (rowGrains.has("wholesome_grains") && !targetGrains.has("wholesome_grains")) return false;
  if (rowGrains.has("grain_free") && !targetGrains.has("grain_free")) return false;
  if (targetGrains.size > 0 && rowGrains.size > 0) {
    return [...targetGrains].some((token) => rowGrains.has(token));
  }
  return true;
}

function proteinCompatible(target, row) {
  if (target.proteinTokens.length === 0 || row.proteinTokens.length === 0) return false;
  const rowProteins = new Set(row.proteinTokens);
  if (!target.proteinTokens.every((token) => rowProteins.has(token))) return false;
  const targetProteins = new Set(target.proteinTokens);
  return row.proteinTokens.every((token) => targetProteins.has(token));
}

function distinctiveCompatible(target, row) {
  const meaningful = target.distinctiveTokens.filter((token) =>
    !["breed", "breeds", "puppy", "puppies", "kitten", "kittens"].includes(token)
  );
  if (meaningful.length === 0) {
    return target.proteinTokens.length === 1 &&
      target.styleTokens.length >= 1 &&
      target.styleTokens.every((token) => row.styleTokens.includes(token));
  }
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
      styleCompatible(target, row) &&
      grainCompatible(target, row) &&
      !hasLifeStageConflict(target, row) &&
      proteinCompatible(target, row) &&
      distinctiveCompatible(target, row)
    )
    .sort((a, b) => a.product_name.localeCompare(b.product_name));
}

function matchState(target, rows) {
  if (skipExistingScan) return { kind: "skipped_existing_scan", rows: [] };
  if (!target.petType || !target.form || target.styleTokens.length === 0 || target.proteinTokens.length === 0) {
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
  const rowPattern = /<tr[^>]*>\s*<td[^>]*class=["'][^"']*guaranteed_analysis_data_title(?:_[^"']*)?[^"']*["'][^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class=["'][^"']*guaranteed_analysis_data_measurement(?:_[^"']*)?[^"']*["'][^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let row;
  while ((row = rowPattern.exec(raw))) {
    const label = stripTags(row[1]);
    const value = stripTags(row[2]);
    const field = nutrientField(label);
    if (field) {
      const percent = parsePercent(value.match(/([\d,.]+)\s*%/)?.[1]);
      if (percent != null && panel[field] == null) {
        panel[field] = percent;
        numericCount++;
      }
      continue;
    }
    if (/metabolizable energy|calorie content/i.test(label)) {
      const kg = value.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*\/\s*kg/i);
      if (kg && panel.calories_per_kg == null) {
        panel.calories_per_kg = Number(kg[1].replace(/,/g, ""));
        numericCount++;
      }
      const cup = value.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*\/\s*cup/i);
      if (cup && panel.calories_per_cup == null) {
        panel.calories_per_cup = Number(cup[1].replace(/,/g, ""));
        numericCount++;
      }
    }
  }
  const text = stripTags(raw);
  const kg = text.match(/(?:metabolizable energy|calorie content)[\s\S]{0,180}?([\d,]+(?:\.\d+)?)\s*kcal\s*\/\s*kg/i);
  if (kg && panel.calories_per_kg == null) {
    panel.calories_per_kg = Number(kg[1].replace(/,/g, ""));
    numericCount++;
  }
  const cup = text.match(/(?:metabolizable energy|calorie content)[\s\S]{0,180}?([\d,]+(?:\.\d+)?)\s*kcal\s*\/\s*cup/i);
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
  const [sitemapRows, existingRows] = await Promise.all([parseSitemapRows(), fetchExistingRows()]);
  const candidateRows = sitemapRows.filter(isCandidateSitemapRow);
  const targets = [];
  const unmatchedTargets = [];
  const seen = new Set();
  const skipped = { weakTargetTokens: 0, missingCatalogAlias: 0, missingPanel: 0, duplicate: 0 };
  const panelRejectReasons = new Map();

  for (const row of candidateRows) {
    const html = await fetchText(row.sourceUrl);
    if (delayMs) await sleep(delayMs);
    const candidate = normalizeCandidate(row, html);
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
          styleTokens: candidate.styleTokens,
          grainTokens: candidate.grainTokens,
          proteinTokens: candidate.proteinTokens,
          distinctiveTokens: candidate.distinctiveTokens,
          matchedRows: rows.length,
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

    const matchedRows = rows.length > 0 ? rows : [null];
    for (const row of matchedRows) {
      const target = {
        cacheKey: row?.cache_key || normalizeCacheKey(`${BRAND} ${candidate.productName}`),
        productName: row?.product_name || candidate.productName,
        brand: row?.brand || BRAND,
        petType: candidate.petType,
        source: "stellaandchewys_official_product_page",
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
    source: "stellaandchewys_official_product_pages",
    sitemapIndexUrl,
    sitemapUrl: explicitSitemapUrl || undefined,
    scannedProducts: candidateRows.length,
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
  console.log(`Wrote ${targets.length} Stella & Chewy's nutrient panel targets to ${path.relative(root, outputPath)}`);
  console.log(`Scanned ${candidateRows.length} product URLs; weak tokens ${skipped.weakTargetTokens}; unmatched aliases ${skipped.missingCatalogAlias}; missing panels ${skipped.missingPanel}; duplicates ${skipped.duplicate}`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
