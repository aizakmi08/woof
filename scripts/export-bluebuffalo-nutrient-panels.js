#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BRAND = "Blue Buffalo";
const DEFAULT_SITEMAP_URL = "https://www.bluebuffalo.com/sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/nutrient-panel-bluebuffalo-targets.json";
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
const delayMs = delayArg ? Number(delayArg.split("=")[1]) : 75;

const REJECT_TERMS = [
  "appetizer", "appetizers", "assortment", "bisque", "blue bits",
  "blue bones", "broth", "bundle", "catnip", "dental chews",
  "delectables", "health bars", "lickable", "meal makers", "nudges",
  "puree", "purees", "snack", "snacks", "soft chews", "supplement",
  "supplements", "tender shreds", "topper", "toppers", "treat",
  "treats", "true chews", "variety pack",
];
const LINE_TERMS = [
  "baby blue", "basics", "blue delights", "blue stew", "family favorites",
  "freedom", "homestyle", "hunters stew", "life protection",
  "natural veterinary diet", "tastefuls", "true solutions", "wilderness",
  "wolf creek",
];
const ANIMAL_PROTEIN_TERMS = [
  "alligator", "beef", "bison", "boar", "chicken", "duck", "fish",
  "halibut", "lamb", "ocean fish", "pork", "rabbit", "salmon", "trout",
  "tuna", "turkey", "venison", "whitefish",
];
const LIFE_STAGE_TERMS = ["puppy", "kitten", "senior", "adult", "mature"];
const SIZE_TERMS = ["large breed", "small breed", "small bite", "small bites", "toy breed"];
const GRAIN_TERMS = ["brown rice", "grain free", "oatmeal", "potato", "wholesome grain"];
const STYLE_TERMS = [
  "cuts", "dinner", "entree", "flaked", "gravy", "grill", "minced",
  "morsels", "pate", "stew",
];
const HEALTH_TERMS = [
  "digestive", "food sensitivity", "hairball", "healthy weight",
  "hydrolyzed", "indoor", "kidney", "mobility", "novel protein",
  "sensitive skin", "sensitive stomach", "skin stomach", "urinary",
  "weight control", "weight management",
];
const DISTINCTIVE_STOP_TOKENS = new Set([
  "adult", "blue", "bluebuffalo", "buffalo", "cat", "cats", "dog", "dogs",
  "dry", "food", "foods", "for", "formula", "ingredients", "made",
  "natural", "recipe", "with", "wet",
  ...ANIMAL_PROTEIN_TERMS.flatMap((term) => term.split(/\s+/)),
  ...LINE_TERMS.flatMap((term) => term.split(/\s+/)),
  ...LIFE_STAGE_TERMS.flatMap((term) => term.split(/\s+/)),
  ...SIZE_TERMS.flatMap((term) => term.split(/\s+/)),
  ...GRAIN_TERMS.flatMap((term) => term.split(/\s+/)),
  ...STYLE_TERMS.flatMap((term) => term.split(/\s+/)),
  ...HEALTH_TERMS.flatMap((term) => term.split(/\s+/)),
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
  npm run export:bluebuffalo-nutrient-panels -- --output=.tmp/nutrient-panel-bluebuffalo-targets.json

Options:
  --output=path.json      Write a nutrient-panel backfill manifest (default ${DEFAULT_OUTPUT})
  --sitemap-url=url       Explicit Blue Buffalo sitemap index URL (${DEFAULT_SITEMAP_URL})
  --limit=N               Stop after N matched nutrient panels are collected (default 0, no limit)
  --delay-ms=N            Delay between product-page requests (default 75)
  --include-unmatched     Include parsed unmatched/ambiguous rows under unmatchedTargets
  --skip-existing-scan    Skip product_data alias reads for parser smoke/debug exports only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  if (!/^https:\/\/www\.bluebuffalo\.com\/sitemap\.xml$/i.test(sitemapUrl)) {
    usage("--sitemap-url must be https://www.bluebuffalo.com/sitemap.xml.");
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
    .replace(/&#39;|&apos;|&#8217;|’|‘/g, "'")
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
    .replace(/chicken[-\s]*free/g, " ")
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
  const url = decodeHtml(value).split("#")[0].replace(/\/$/, "");
  if (!/^https:\/\/www\.bluebuffalo\.com\/(dry|wet)-(dog|cat)-food\/[a-z0-9-]+\/[a-z0-9-]+$/i.test(url)) return "";
  return url;
}

function parseLocs(xml) {
  return [...String(xml || "").matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => decodeHtml(match[1]))
    .filter(Boolean);
}

async function fetchText(url, accept = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", attempt = 1) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: accept,
    },
  });
  if (response.status === 429 || response.status >= 500) {
    if (attempt >= 3) throw new Error(`Blue Buffalo fetch failed ${response.status}: ${url}`);
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 500 * attempt);
    return fetchText(url, accept, attempt + 1);
  }
  if (!response.ok) throw new Error(`Blue Buffalo fetch failed ${response.status}: ${url}`);
  return response.text();
}

function formAndPetFromProductType(productType) {
  const match = String(productType || "").match(/^(dry|wet)-(dog|cat)-food$/);
  if (!match) return null;
  return { form: match[1], petType: match[2] };
}

function lineLabel(line, slug) {
  const normalizedSlug = normalizeText(slug);
  if (line === "blue" && normalizedSlug.includes("tastefuls")) return "";
  if (line === "blue-specialty") return "";
  const labels = {
    "baby-blue": "Baby BLUE",
    basics: "Basics",
    freedom: "Freedom",
    "life-protection-formula": "Life Protection Formula",
    "natural-veterinary-diet": "Natural Veterinary Diet",
    "blue-natural-veterinary-diet": "Natural Veterinary Diet",
    tastefuls: "Tastefuls",
    "true-solutions": "True Solutions",
    wilderness: "Wilderness",
  };
  return labels[line] || "";
}

function titleCaseProductName(value) {
  const smallWords = new Set(["and", "or", "of", "for", "in", "with", "to", "the", "at", "as"]);
  return String(value || "")
    .split(/(\s+)/)
    .map((part, index) => {
      if (/^\s+$/.test(part)) return part;
      const lower = part.toLowerCase();
      if (index > 0 && smallWords.has(lower)) return lower;
      return lower.replace(/(^|[-'/])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
    })
    .join("")
    .replace(/\bBaby Blue\b/g, "Baby BLUE")
    .replace(/\bGi\b/g, "GI")
    .replace(/\bHf\b/g, "HF")
    .replace(/\bNp\b/g, "NP")
    .replace(/\bWm\b/g, "WM")
    .replace(/\bWu\b/g, "WU")
    .replace(/\s+([,])/g, "$1")
    .trim();
}

function productNameFromLineAndSlug(line, slug) {
  const label = lineLabel(line, slug);
  let name = String(slug || "")
    .replace(/\b(\d+)-pack\b/g, "$1 Pack")
    .replace(/\b(\d+)-can\b/g, "$1 Can")
    .replace(/\b(\d+)-count\b/g, "$1 Count")
    .replace(/--+/g, "-")
    .replace(/-/g, " ");
  if (label && !normalizeText(name).startsWith(normalizeText(label))) {
    name = `${label} ${name}`;
  }
  return titleCaseProductName(name);
}

function parsedProductPath(url) {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    if (segments.length !== 3) return null;
    const parsedType = formAndPetFromProductType(segments[0]);
    if (!parsedType) return null;
    const line = segments[1];
    const slug = segments[2];
    if (!/^[a-z0-9-]+$/.test(line) || !/^[a-z0-9-]+$/.test(slug)) return null;
    return { slug, line, petType: parsedType.petType, form: parsedType.form, productType: segments[0] };
  } catch {
    return null;
  }
}

async function parseSitemapRows(indexXml) {
  const sitemapLocs = parseLocs(indexXml)
    .filter((url) => /^https:\/\/www\.bluebuffalo\.com\/sitemap\.en\.xml$/i.test(url));
  if (sitemapLocs.length !== 1) throw new Error("Blue Buffalo sitemap index did not expose exactly one English sitemap.");

  const rows = [];
  for (const childSitemap of sitemapLocs) {
    const childXml = await fetchText(childSitemap, "application/xml,text/xml,*/*;q=0.8");
    for (const rawUrl of parseLocs(childXml)) {
      const sourceUrl = cleanUrl(rawUrl);
      if (!sourceUrl) continue;
      const parsed = parsedProductPath(sourceUrl);
      if (!parsed) continue;
      const productName = productNameFromLineAndSlug(parsed.line, parsed.slug);
      rows.push({
        sourceUrl,
        productName,
        petType: parsed.petType,
        form: parsed.form,
        productLine: parsed.line,
        sourceSitemap: childSitemap,
      });
    }
  }
  return rows;
}

function tokenList(value, terms) {
  const text = normalizeText(value);
  return terms.filter((term) => hasTerm(text, term)).sort();
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
  const wet = /\b(wet|can|canned|pate|morsels|flaked|stew|gravy|tray|trays|cup|cups|entree|dinner|grill|minced)\b/.test(text);
  const dry = /\b(dry|kibble|bag)\b/.test(text);
  if (wet && !dry) return "wet";
  if (dry && !wet) return "dry";
  return "";
}

function profileTokens(value) {
  return {
    normalizedText: normalizeText(value),
    petType: inferPetTypeFromText(value),
    productForm: inferProductFormFromText(value),
    lineTokens: tokenList(value, LINE_TERMS),
    proteinTokens: tokenList(value, ANIMAL_PROTEIN_TERMS),
    lifeStageTokens: tokenList(value, LIFE_STAGE_TERMS),
    sizeTokens: tokenList(value, SIZE_TERMS),
    grainTokens: tokenList(value, GRAIN_TERMS),
    styleTokens: tokenList(value, STYLE_TERMS),
    healthTokens: tokenList(value, HEALTH_TERMS),
  };
}

function distinctiveTokens(value) {
  return [...new Set(normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length > 3 && !DISTINCTIVE_STOP_TOKENS.has(token)))]
    .sort();
}

function isRejected(value) {
  const text = normalizeText(value);
  return REJECT_TERMS.some((term) => hasTerm(text, term));
}

function isCandidateSitemapRow(row) {
  const text = `${row.productName} ${row.sourceUrl} ${row.petType} ${row.form}`;
  if (isRejected(text)) return false;
  const profile = profileTokens(text);
  return Boolean(profile.petType && profile.productForm && profile.lineTokens.length && profile.proteinTokens.length);
}

function normalizeCandidate(row) {
  const text = `${row.productName} ${row.sourceUrl} ${row.petType} ${row.form}`;
  return {
    ...row,
    ...profileTokens(text),
    distinctiveTokens: distinctiveTokens(row.productName),
    petType: row.petType,
    productForm: row.form,
  };
}

function isBlueBuffaloCatalogRow(row) {
  const combined = normalizeText(`${row?.brand || ""} ${row?.product_name || ""} ${row?.cache_key || ""} ${row?.source_url || ""}`);
  if (!combined.includes("blue buffalo") && !combined.includes("bluebuffalo")) return false;
  return !isRejected(combined);
}

async function fetchExistingRows() {
  if (skipExistingScan) return [];
  const rows = [];
  const base = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/product_data`;
  for (let from = 0; ; from += REST_PAGE_SIZE) {
    const response = await fetch(`${base}?select=cache_key,product_name,brand,source_url&or=(brand.ilike.*Blue%20Buffalo*,product_name.ilike.*Blue%20Buffalo*,cache_key.ilike.*blue%20buffalo*)&order=cache_key.asc`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Range: `${from}-${from + REST_PAGE_SIZE - 1}`,
      },
    });
    if (!response.ok) throw new Error(`product_data read failed ${response.status}: ${await response.text()}`);
    const page = await response.json();
    for (const row of page) {
      if (!isBlueBuffaloCatalogRow(row)) continue;
      const text = `${row.brand || ""} ${row.product_name || ""} ${row.cache_key || ""} ${row.source_url || ""}`;
      rows.push({
        ...row,
        ...profileTokens(text),
      });
    }
    if (page.length < REST_PAGE_SIZE) break;
  }
  return rows;
}

function sameSet(left, right) {
  return left.length === right.length && left.every((token) => right.includes(token));
}

function compatibleOptionalGroup(targetTokens, rowTokens, allowedWhenTargetMissing = []) {
  if (targetTokens.length > 0 || rowTokens.length > 0) {
    if (targetTokens.length === 0) {
      return rowTokens.every((token) => allowedWhenTargetMissing.includes(token));
    }
    return sameSet(targetTokens, rowTokens);
  }
  return true;
}

function distinctiveAgreement(target, row) {
  if (target.distinctiveTokens.length === 0) return true;
  return target.distinctiveTokens.every((token) => row.normalizedText.includes(token));
}

function matchCandidates(target, rows) {
  if (skipExistingScan) return [];
  return rows
    .filter((row) =>
      row.petType === target.petType &&
      row.productForm === target.productForm &&
      target.lineTokens.length > 0 &&
      target.lineTokens.every((token) => row.lineTokens.includes(token)) &&
      target.proteinTokens.length > 0 &&
      sameSet(target.proteinTokens, row.proteinTokens) &&
      compatibleOptionalGroup(target.lifeStageTokens, row.lifeStageTokens, ["adult"]) &&
      compatibleOptionalGroup(target.sizeTokens, row.sizeTokens) &&
      compatibleOptionalGroup(target.grainTokens, row.grainTokens) &&
      compatibleOptionalGroup(target.healthTokens, row.healthTokens) &&
      (target.productForm !== "wet" ||
        (target.styleTokens.length === 0 && row.styleTokens.length === 0) ||
        target.styleTokens.some((token) => row.styleTokens.includes(token))) &&
      distinctiveAgreement(target, row)
    )
    .sort((a, b) => a.product_name.localeCompare(b.product_name));
}

function matchState(target, rows) {
  if (skipExistingScan) return { kind: "skipped_existing_scan", rows: [] };
  if (!target.petType || !target.productForm || target.lineTokens.length === 0 || target.proteinTokens.length === 0) {
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
  const analysisHtml = raw.match(/window\.guaranteedAnalysisHtml\s*=\s*`([\s\S]*?)`/i)?.[1] || "";
  for (const row of analysisHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = row[1] || "";
    const label = stripTags(rowHtml.match(/<th[^>]*>([\s\S]*?)<\/th>/i)?.[1] || "");
    const value = stripTags(rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/i)?.[1] || "");
    const field = nutrientField(label);
    const percent = parsePercent(value.match(/([\d,.]+)\s*%/)?.[1]);
    if (field && percent != null && panel[field] == null) {
      panel[field] = percent;
      numericCount++;
    }
  }

  const feedingHtml = raw.match(/window\.feedingGuidelinesHtml\s*=\s*`([\s\S]*?)`/i)?.[1] || "";
  const text = stripTags(`${feedingHtml} ${analysisHtml}`);
  const kg = text.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*\/\s*kg/i);
  if (kg && panel.calories_per_kg == null) {
    panel.calories_per_kg = Number(kg[1].replace(/,/g, ""));
    numericCount++;
  }
  const cup = text.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*(?:\/|per)\s*(?:cup|8\s*oz\.?\s*cup|can|tray|pouch)/i);
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
  const [indexXml, existingRows] = await Promise.all([
    fetchText(sitemapUrl, "application/xml,text/xml,*/*;q=0.8"),
    fetchExistingRows(),
  ]);
  const candidates = (await parseSitemapRows(indexXml)).filter(isCandidateSitemapRow).map(normalizeCandidate);
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
          productForm: candidate.productForm,
          sourceUrl: candidate.sourceUrl,
          matchState: state.kind,
          lineTokens: candidate.lineTokens,
          proteinTokens: candidate.proteinTokens,
          lifeStageTokens: candidate.lifeStageTokens,
          sizeTokens: candidate.sizeTokens,
          grainTokens: candidate.grainTokens,
          healthTokens: candidate.healthTokens,
          styleTokens: candidate.styleTokens,
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
        source: "bluebuffalo_official_product_page",
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
    source: "bluebuffalo_official_product_pages",
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
  console.log(`Wrote ${targets.length} Blue Buffalo nutrient panel targets to ${path.relative(root, outputPath)}`);
  console.log(`Scanned ${candidates.length} product URLs; weak tokens ${skipped.weakTargetTokens}; unmatched aliases ${skipped.missingCatalogAlias}; missing panels ${skipped.missingPanel}; duplicates ${skipped.duplicate}`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
