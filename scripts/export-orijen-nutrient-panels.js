#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BRAND = "ORIJEN";
const DEFAULT_SITEMAP_URL = "https://www.orijenpetfoods.com/en-US/sitemap_0.xml";
const DEFAULT_OUTPUT = ".tmp/nutrient-panel-orijen-targets.json";
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
  "bundle", "bundles",
  "biscuit", "biscuits", "fdt", "freeze dried treat", "freeze-dried treat",
  "jerky", "snack", "snacks", "treat", "treats", "topper", "toppers",
  "catnip", "litter", "accessory", "toy", "variety pack",
];
const ANIMAL_PROTEIN_TOKENS = new Set([
  "beef", "boar", "chicken", "cod", "duck", "fish", "goat", "herring",
  "lamb", "mackerel", "pork", "rabbit", "salmon", "sardine", "trout",
  "tuna", "turkey", "venison", "whitefish",
]);
const DISTINCTIVE_STOP_TOKENS = new Set([
  "adult", "and", "cat", "cats", "com", "dog", "dogs", "dried", "dry",
  "food", "foods", "for", "free", "fresh", "freeze", "grain", "grains",
  "high", "html", "http", "https", "in", "ingredient", "ingredients",
  "orijen", "orijenpetfoods", "ori", "premium", "protein", "recipe",
  "recipes", "raw", "the", "with", "www",
]);
const LINE_CONFLICT_GROUPS = [
  ["amazing_grains", "grain_free"],
  ["large_breed", "small_breed"],
  ["puppy", "senior"],
];
const NUTRIENT_FIELD_ALIASES = [
  [/\bcrude\s+protein\b|\bprotein\b/i, "protein_pct"],
  [/\bcrude\s+fat\b|\bfat\s+content\b|\bfat\b/i, "fat_pct"],
  [/\bcrude\s+fib(?:er|re)\b|\bfiber\b/i, "fiber_pct"],
  [/\bmoisture\b/i, "moisture_pct"],
  [/\bash\b|crude\s+ash/i, "ash_pct"],
  [/\bcalcium\b/i, "calcium_pct"],
  [/\bphosphorus\b/i, "phosphorus_pct"],
  [/\bmagnesium\b/i, "magnesium_pct"],
  [/\bomega[-\s]*3\b/i, "omega_3_pct"],
  [/\bomega[-\s]*6\b/i, "omega_6_pct"],
];

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:orijen-nutrient-panels -- --output=.tmp/nutrient-panel-orijen-targets.json

Options:
  --output=path.json      Write a nutrient-panel backfill manifest (default ${DEFAULT_OUTPUT})
  --sitemap=url           Explicit ORIJEN sitemap URL (${DEFAULT_SITEMAP_URL})
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
  if (!/^https:\/\/www\.orijenpetfoods\.com\/en-US\/sitemap_0\.xml$/i.test(sitemapUrl)) {
    usage("--sitemap must be https://www.orijenpetfoods.com/en-US/sitemap_0.xml.");
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
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/\u202F/g, " ");
}

function normalizeText(value) {
  return asciiFold(decodeHtml(value))
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/['’™®]/g, " ")
    .replace(/[-_/,%]+/g, " ")
    .replace(/[^a-z0-9\s&+%-]/g, " ")
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
  return asciiFold(decodeHtml(value))
    .replace(/\bORIJEN\b/gi, "")
    .replace(/™|®|©/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function cleanUrl(value) {
  try {
    const raw = decodeHtml(value).replace(/&#x2F;/gi, "/");
    const parsed = new URL(raw);
    parsed.hash = "";
    parsed.search = "";
    const url = parsed.href.replace(/\/$/, "");
    if (!/^https:\/\/www\.orijenpetfoods\.com\/en-US\/(dogs|cats)\/(dog-food|cat-food)\/[^?#]+\/[a-z0-9-]+\.html$/i.test(url)) return "";
    return url;
  } catch {
    return "";
  }
}

function decodedPathPart(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function parsedProductPath(url) {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    if (segments.length !== 5) return null;
    const [, speciesPath, foodPath, rawNameSlug, fileName] = segments;
    const petType = speciesPath === "dogs" && foodPath === "dog-food"
      ? "dog"
      : speciesPath === "cats" && foodPath === "cat-food"
        ? "cat"
        : "";
    const productId = fileName.replace(/\.html$/i, "");
    const nameSlug = decodedPathPart(rawNameSlug);
    if (!petType || !nameSlug || !/^[a-z0-9-]+$/i.test(productId)) return null;
    const text = normalizeText(`${nameSlug} ${productId}`);
    if (REJECT_TERMS.some((term) => hasTerm(text, term))) return null;
    return {
      sourceUrl: url,
      productName: cleanProductName(nameSlug.replace(/%2c/gi, ",").replace(/,/g, " ").replace(/-/g, " ")),
      petType,
      productId,
      form: inferProductFormFromText(text),
    };
  } catch {
    return null;
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
    if (!retryable || attempt === 3) throw new Error(`ORIJEN fetch failed ${response.status}: ${url}`);
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * (attempt + 1));
  }
  throw new Error(`ORIJEN fetch failed: ${url}`);
}

function parseSitemapRows(xml) {
  return [...String(xml || "").matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => cleanUrl(match[1]))
    .filter(Boolean)
    .map(parsedProductPath)
    .filter(Boolean);
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
  if (/\b(pate|stew|chunks|shreds|wet|can|gravy)\b/.test(text)) return "wet";
  if (/\b(medallion|medallions|epic bites|freeze dried food)\b/.test(text)) return "fresh";
  if (/\b(dry|kibble|food)\b/.test(text)) return "dry";
  return "dry";
}

function lineTokens(value) {
  const text = normalizeText(value);
  const tokens = [];
  if (/\bamazing grains\b/.test(text)) tokens.push("amazing_grains");
  if (/\bgrain free\b|\bgrainfree\b/.test(text)) tokens.push("grain_free");
  if (/\bguardian 8\b/.test(text)) tokens.push("guardian_8");
  if (/\bsix fish\b|\bsixfish\b/.test(text)) tokens.push("six_fish");
  if (/\bregional red\b|\bregionalred\b/.test(text)) tokens.push("regional_red");
  if (/\btundra\b/.test(text)) tokens.push("tundra");
  if (/\bfit and trim\b|\bfittrim\b/.test(text)) tokens.push("fit_trim");
  if (/\boriginal\b/.test(text)) tokens.push("original");
  if (/\bpuppy\b|\bpuppies\b/.test(text)) tokens.push("puppy");
  if (/\bkitten\b|\bkittens\b/.test(text)) tokens.push("kitten");
  if (/\bsenior\b/.test(text)) tokens.push("senior");
  if (/\bsmall breed\b|\bsmall breeds\b/.test(text)) tokens.push("small_breed");
  if (/\blarge breed\b|\blarge breeds\b|\bpuppy large\b/.test(text)) tokens.push("large_breed");
  if (/\bpate\b|\bpat\b/.test(text)) tokens.push("pate");
  if (/\bstew\b/.test(text)) tokens.push("stew");
  if (/\bchunks\b|\bshreds\b/.test(text)) tokens.push("chunks_shreds");
  if (/\bmedallion\b|\bmedallions\b/.test(text)) tokens.push("medallions");
  if (/\bepic bites\b|\bepicbites\b/.test(text)) tokens.push("epic_bites");
  return [...new Set(tokens)].sort();
}

function animalProteinTokens(value) {
  const text = normalizeText(value);
  const tokens = new Set(text.split(/\s+/).filter((token) => ANIMAL_PROTEIN_TOKENS.has(token)));
  if (text.includes("six fish")) tokens.add("fish");
  if (text.includes("regional red")) {
    tokens.add("beef");
    tokens.add("boar");
    tokens.add("lamb");
  }
  if (text.includes("original")) tokens.add("chicken");
  if (text.includes("poultry")) {
    tokens.add("chicken");
    tokens.add("turkey");
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

function normalizeCandidate(row) {
  const text = `${row.productName} ${row.productId} ${row.sourceUrl}`;
  const tokens = lineTokens(text);
  if (row.form === "dry" && !tokens.includes("amazing_grains") && !tokens.some((token) => ["stew", "pate", "chunks_shreds"].includes(token))) {
    tokens.push("grain_free");
  }
  return {
    sourceUrl: row.sourceUrl,
    productName: row.productName,
    productId: row.productId,
    petType: row.petType,
    form: row.form,
    lineTokens: [...new Set(tokens)].sort(),
    proteinTokens: animalProteinTokens(text),
    distinctiveTokens: distinctiveTokens(text),
    normalizedText: normalizeText(text),
  };
}

function isOrijenCatalogRow(row) {
  const combined = normalizeText(`${row?.brand || ""} ${row?.product_name || ""} ${row?.cache_key || ""} ${row?.source_url || ""}`);
  if (!combined.includes("orijen")) return false;
  if (REJECT_TERMS.some((term) => hasTerm(combined, term))) return false;
  return true;
}

async function fetchExistingRows() {
  if (skipExistingScan) return [];
  const rows = [];
  const base = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/product_data`;
  for (let from = 0; ; from += REST_PAGE_SIZE) {
    const response = await fetch(`${base}?select=cache_key,product_name,brand,source_url&or=(brand.ilike.*orijen*,product_name.ilike.*orijen*,cache_key.ilike.*orijen*)&order=cache_key.asc`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Range: `${from}-${from + REST_PAGE_SIZE - 1}`,
      },
    });
    if (!response.ok) throw new Error(`product_data read failed ${response.status}: ${await response.text()}`);
    const page = await response.json();
    for (const row of page) {
      if (!isOrijenCatalogRow(row)) continue;
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
  for (const group of LINE_CONFLICT_GROUPS) {
    const targetGroup = group.filter((token) => target.lineTokens.includes(token));
    const rowGroup = group.filter((token) => row.lineTokens.includes(token));
    if (targetGroup.length > 0 || rowGroup.length > 0) {
      if (targetGroup.length !== rowGroup.length) return false;
      if (!targetGroup.every((token) => rowGroup.includes(token))) return false;
    }
  }
  const required = target.lineTokens.filter((token) =>
    !["grain_free"].includes(token)
  );
  return required.every((token) => row.lineTokens.includes(token));
}

function proteinCompatible(target, row) {
  if (target.proteinTokens.length === 0 || row.proteinTokens.length === 0) return true;
  const rowProteins = new Set(row.proteinTokens);
  const targetProteins = new Set(target.proteinTokens);
  return target.proteinTokens.every((token) => rowProteins.has(token)) &&
    row.proteinTokens.every((token) => targetProteins.has(token));
}

function distinctiveCompatible(target, row) {
  const meaningful = target.distinctiveTokens.filter((token) =>
    !["breed", "large", "small", "puppy", "kitten", "senior"].includes(token)
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
  if (!target.petType || !target.form || target.lineTokens.length === 0) {
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
  const analysisBlock = raw.match(/<div[^>]+class=["'][^"']*\banalysis\b[^"']*["'][^>]*>[\s\S]*?<h2[^>]*>\s*Guaranteed Analysis\s*<\/h2>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i)?.[1] || "";
  const panel = { basis: "as-fed", source_url: sourceUrl };
  let numericCount = 0;
  for (const row of analysisBlock.matchAll(/<li[^>]*>([\s\S]*?)<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/li>/gi)) {
    const label = stripTags(row[1]);
    const value = stripTags(row[2]);
    const field = nutrientField(label);
    const percent = parsePercent(value.match(/([\d,.]+)\s*%/)?.[1]);
    if (field && percent != null && panel[field] == null) {
      panel[field] = percent;
      numericCount++;
    }
  }
  const text = stripTags(raw);
  const kg = text.match(/(?:metabolizable energy|calorie content|ME)\D{0,80}([\d,]+(?:\.\d+)?)\s*kcal\s*\/\s*kg/i);
  if (kg && panel.calories_per_kg == null) {
    panel.calories_per_kg = Number(kg[1].replace(/,/g, ""));
    numericCount++;
  }
  const cup = text.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*(?:per|\/)\s*(?:standard\s*)?(?:8\s*oz\.?|8\s*fl\.?\s*oz\.?|250ml|cup)/i);
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
    if (panel.calcium_pct != null || panel.phosphorus_pct != null || panel.ash_pct != null || panel.magnesium_pct != null) withMinerals++;
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
  const candidates = parseSitemapRows(xml).map(normalizeCandidate);
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
        source: "orijen_official_product_page",
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
    source: "orijen_official_product_pages",
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
  console.log(`Wrote ${targets.length} ORIJEN nutrient panel targets to ${path.relative(root, outputPath)}`);
  console.log(`Scanned ${candidates.length} product URLs; weak tokens ${skipped.weakTargetTokens}; unmatched aliases ${skipped.missingCatalogAlias}; missing panels ${skipped.missingPanel}; duplicates ${skipped.duplicate}`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
