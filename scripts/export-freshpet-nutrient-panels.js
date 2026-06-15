#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BRAND = "Freshpet";
const DEFAULT_SITEMAP_URL = "https://www.freshpet.com/sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/nutrient-panel-freshpet-targets.json";
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
  "bites", "biscuit", "catnip", "chew", "dognation", "dog joy", "grilled chicken bites",
  "snack", "supplement", "topper", "treat",
];
const STOP_TOKENS = new Set([
  "adult", "and", "bag", "cat", "cats", "dog", "dogs", "food", "for", "freshpet", "fresh",
  "meal", "meals", "natural", "recipe", "refrigerated", "roll", "the", "with",
]);
const OPTIONAL_ROW_TOKENS = new Set(["certified", "freshly", "humanely", "raised"]);
const PROTEIN_TERMS = [
  ["chicken", "chicken"],
  ["turkey", "turkey"],
  ["beef", "beef"],
  ["bison", "bison"],
  ["lamb", "lamb"],
  ["salmon", "salmon"],
  ["pollock", "pollock"],
  ["egg", "egg"],
];
const LINE_MARKERS = [
  "balancednutrition", "chunky", "cleannutrition", "deli", "freshfromthekitchen",
  "homestyle", "natures", "roastedmeals", "select", "sliceserve", "vital",
];
const FORM_MARKERS = ["bag", "roll", "patties", "pate", "stew"];
const CONFLICT_MARKER_GROUPS = [
  LINE_MARKERS,
  FORM_MARKERS,
  ["grainfree", "wholesomegrains"],
  ["puppy", "senior"],
  ["smallbreed", "largebreed"],
  ["healthyaging", "digestivehealth", "jointmobility", "sensitivestomach"],
];

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:freshpet-nutrient-panels -- --output=.tmp/nutrient-panel-freshpet-targets.json

Options:
  --output=path.json      Write a nutrient-panel backfill manifest (default ${DEFAULT_OUTPUT})
  --sitemap-url=url       Explicit Freshpet sitemap URL (${DEFAULT_SITEMAP_URL})
  --limit=N               Stop after N matched nutrient panels are collected (default 0, no limit)
  --delay-ms=N            Delay between product-page requests (default 75)
  --include-unmatched     Include parsed unmatched/ambiguous rows under unmatchedTargets
  --skip-existing-scan    Skip product_data alias reads for parser smoke/debug exports only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  if (!/^https:\/\/www\.freshpet\.com\/sitemap\.xml$/i.test(sitemapUrl)) {
    usage("--sitemap-url must be https://www.freshpet.com/sitemap.xml.");
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
    .replace(/\\u0026/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#38;|&amp;/g, "&")
    .replace(/&#39;|&apos;|&#8217;|’|‘/g, "'")
    .replace(/&#8220;|&#8221;|&quot;|“|”/g, "\"")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return decodeHtml(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/fresh\s+from\s+the\s+kitchen/g, "freshfromthekitchen")
    .replace(/homestyle\s+creations/g, "homestyle")
    .replace(/nature['’]?s/g, "natures")
    .replace(/balanced\s+nutrition/g, "balancednutrition")
    .replace(/clean\s+nutrition/g, "cleannutrition")
    .replace(/complete\s+meal/g, "completemeal")
    .replace(/digestive\s+health/g, "digestivehealth")
    .replace(/grain[-\s]*free/g, "grainfree")
    .replace(/healthy\s+aging/g, "healthyaging")
    .replace(/joint\s*(?:&|and)?\s*mobility(?:\s+health)?/g, "jointmobility")
    .replace(/large\s+(?:breed|dog)/g, "largebreed")
    .replace(/multi[-\s]*protein/g, "multiprotein")
    .replace(/roasted\s+meals/g, "roastedmeals")
    .replace(/sensitive\s+stomach(?:\s*(?:&|and)\s*skin)?/g, "sensitivestomach")
    .replace(/slice\s*(?:&|and)\s*serve/g, "sliceserve")
    .replace(/small\s+(?:breed|dog|dogs|dogsbreeds)/g, "smallbreed")
    .replace(/wholesome\s+grains/g, "wholesomegrains")
    .replace(/[&+/'’™®]/g, " ")
    .replace(/[-_,:%]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\bamp\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasTerm(text, term) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  return new RegExp(`(^|[^a-z0-9])${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text);
}

function normalizeCacheKey(text) {
  return normalizeText(text)
    .replace(/\b(dog food|cat food|formula|food for dogs|food for cats)\b/g, " ")
    .replace(/\b\d+(\s+)?(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|bag|bags|roll|rolls|pack|pk|ct|count|case|box|boxes)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRejected(value) {
  const text = normalizeText(value);
  return REJECT_TERMS.some((term) => hasTerm(text, term));
}

function cleanUrl(value) {
  const url = decodeHtml(value).split("#")[0].replace(/\/$/, "");
  if (!/^https:\/\/www\.freshpet\.com\/products\/[a-z0-9-]+$/i.test(url)) return "";
  return url;
}

function parseLocs(xml) {
  return [...String(xml || "").matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => cleanUrl(match[1]))
    .filter(Boolean)
    .filter((sourceUrl) => !isRejected(sourceUrl));
}

async function fetchText(url, accept = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", attempt = 1) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: accept } });
  if (response.status === 429 || response.status >= 500) {
    if (attempt >= 3) throw new Error(`Freshpet fetch failed ${response.status}: ${url}`);
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 500 * attempt);
    return fetchText(url, accept, attempt + 1);
  }
  if (!response.ok) throw new Error(`Freshpet fetch failed ${response.status}: ${url}`);
  return response.text();
}

function inferPetType(value) {
  const text = normalizeText(value);
  if (hasTerm(text, "cat") || hasTerm(text, "kitten")) return "cat";
  if (hasTerm(text, "dog") || hasTerm(text, "puppy") || hasTerm(text, "smallbreed") || hasTerm(text, "largebreed")) {
    return "dog";
  }
  return "";
}

function markerSet(value) {
  const text = normalizeText(value);
  const markers = new Set();
  for (const marker of LINE_MARKERS) {
    if (hasTerm(text, marker)) markers.add(marker);
  }
  for (const marker of [
    "bag", "roll", "patties", "pate", "stew", "grainfree", "wholesomegrains", "puppy",
    "senior", "smallbreed", "largebreed", "healthyaging", "digestivehealth", "jointmobility",
    "sensitivestomach",
  ]) {
    if (hasTerm(text, marker)) markers.add(marker);
  }
  return markers;
}

function tokenSet(value) {
  return new Set(normalizeCacheKey(value).split(/\s+/).filter((token) => token.length > 1 && !STOP_TOKENS.has(token)));
}

function proteinSet(value) {
  const text = normalizeText(value);
  const proteins = new Set();
  for (const [term, marker] of PROTEIN_TERMS) {
    if (hasTerm(text, term)) proteins.add(marker);
  }
  return proteins;
}

function catalogRowInfo(row) {
  const matchText = `${row.brand || ""} ${row.product_name || ""} ${row.cache_key || ""} ${row.source_url || ""}`;
  return {
    ...row,
    matchText,
    petType: inferPetType(matchText),
    markers: markerSet(matchText),
    tokens: tokenSet(matchText),
    proteins: proteinSet(matchText),
  };
}

function targetInfo(product, sourceUrl) {
  const brandName = product?.brand?.value?.data?.name || BRAND;
  const matchText = [
    brandName,
    product?.name,
    product?.shortName,
    product?.slug,
    Array.isArray(product?.sizes) ? product.sizes.map((size) => size?.size || size).join(" ") : "",
    sourceUrl,
  ].join(" ");
  return {
    sourceUrl,
    productName: decodeHtml(product?.name || product?.shortName || product?.slug || ""),
    brandName: decodeHtml(brandName),
    petType: product?.petType || inferPetType(matchText),
    matchText,
    markers: markerSet(matchText),
    tokens: tokenSet(matchText),
    proteins: proteinSet(matchText),
  };
}

function hasAnyMarker(markers, group) {
  return group.some((marker) => markers.has(marker));
}

function markersCompatible(target, row) {
  for (const group of CONFLICT_MARKER_GROUPS) {
    if (!hasAnyMarker(target.markers, group) && !hasAnyMarker(row.markers, group)) continue;
    if (group === FORM_MARKERS && (!hasAnyMarker(target.markers, group) || !hasAnyMarker(row.markers, group))) {
      continue;
    }
    for (const marker of group) {
      if (target.markers.has(marker) !== row.markers.has(marker)) return false;
    }
  }
  return true;
}

function proteinsCompatible(target, row) {
  if (!target.proteins.size || !row.proteins.size) return false;
  if (target.proteins.size !== row.proteins.size) return false;
  for (const protein of target.proteins) {
    if (!row.proteins.has(protein)) return false;
  }
  return true;
}

function distinctiveCompatible(target, row) {
  const targetTokens = target.tokens;
  const rowTokens = [...row.tokens].filter((token) => !OPTIONAL_ROW_TOKENS.has(token));
  if (rowTokens.length < 2) return false;
  if (!rowTokens.every((token) => targetTokens.has(token))) return false;
  const targetOnly = [...targetTokens].filter((token) => !row.tokens.has(token));
  return targetOnly.length <= 5 || rowTokens.length >= 4;
}

function matchCandidates(target, rows) {
  if (skipExistingScan) return [];
  return rows
    .filter((row) =>
      (!row.petType || row.petType === target.petType) &&
      markersCompatible(target, row) &&
      proteinsCompatible(target, row) &&
      distinctiveCompatible(target, row)
    )
    .sort((a, b) => a.product_name.localeCompare(b.product_name));
}

function matchState(target, rows) {
  if (skipExistingScan) return { kind: "skipped_existing_scan", rows: [] };
  if (!target.petType || !target.proteins.size || target.tokens.size < 2) {
    return { kind: "weak_target_tokens", rows: [] };
  }
  const matches = matchCandidates(target, rows);
  if (matches.length === 1) return { kind: "matched", rows: matches };
  if (matches.length > 1) return { kind: "ambiguous", rows: matches };
  return { kind: "missing", rows: [] };
}

function asPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  const percent = numeric <= 1 ? numeric * 100 : numeric;
  return percent >= 0 && percent <= 100 ? Math.round(percent * 1000) / 1000 : null;
}

function asCalories(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 10000 ? Math.round(numeric) : null;
}

function pickPercent(object, key) {
  if (object?.[key]?.unit && object[key].unit !== "%") return null;
  return asPercent(object?.[key]?.asFed);
}

function pickCalories(object, key) {
  return asCalories(object?.[key]?.asFed);
}

function parseCaloriesFromEnergy(energy, unitPattern) {
  for (const entry of Object.values(energy || {})) {
    const value = String(entry?.value || "");
    const match = value.match(new RegExp(`([\\d,]+(?:\\.\\d+)?)\\s*kcal\\s*\\/\\s*${unitPattern}`, "i"));
    if (match) return asCalories(match[1].replace(/,/g, ""));
  }
  return null;
}

function parseNutrientPanel(product, sourceUrl) {
  const guaranteed = product?.fullGuaranteedAnalysis || {};
  const analysis = product?.nutrientAnalysis || {};
  const minerals = product?.mineralAnalysis || {};
  const panel = { basis: "as-fed", source_url: sourceUrl };

  const fields = [
    ["protein_pct", pickPercent(guaranteed, "crudeProteinMin") ?? pickPercent(analysis, "crudeProtein")],
    ["fat_pct", pickPercent(guaranteed, "crudeFatMin") ?? pickPercent(analysis, "crudeFat")],
    ["fiber_pct", pickPercent(guaranteed, "crudeFiberMax") ?? pickPercent(analysis, "crudeFiber")],
    ["moisture_pct", pickPercent(guaranteed, "moistureMax") ?? pickPercent(analysis, "moisture")],
    ["ash_pct", pickPercent(analysis, "ash")],
    ["calcium_pct", pickPercent(minerals, "calcium")],
    ["phosphorus_pct", pickPercent(minerals, "phosphorus")],
    ["calories_per_kg", pickCalories(guaranteed, "calories") ?? pickCalories(analysis, "metabolizableEnergyKg") ?? parseCaloriesFromEnergy(product?.metabolizableEnergy, "kg")],
    ["calories_per_cup", pickCalories(analysis, "metabolizableEnergyCup") ?? parseCaloriesFromEnergy(product?.metabolizableEnergy, "cup")],
  ];

  let numericCount = 0;
  for (const [field, value] of fields) {
    if (value == null) continue;
    panel[field] = value;
    numericCount += 1;
  }
  if (numericCount < 2 || panel.protein_pct == null || panel.fat_pct == null) {
    return { panel: null, reason: "nutrient_panel_too_sparse" };
  }
  return { panel, reason: null };
}

function parseProductFromHtml(html) {
  const match = String(html || "").match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  const json = JSON.parse(decodeHtml(match[1]));
  return json?.props?.pageProps?.product?.data || null;
}

async function fetchExistingRows() {
  if (skipExistingScan) return [];
  const rows = [];
  const base = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/product_data`;
  for (let from = 0; ; from += REST_PAGE_SIZE) {
    const response = await fetch(`${base}?select=cache_key,product_name,brand,source_url&or=(brand.ilike.*Freshpet*,product_name.ilike.*Freshpet*,cache_key.ilike.*freshpet*)&order=cache_key.asc`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Range: `${from}-${from + REST_PAGE_SIZE - 1}`,
      },
    });
    if (!response.ok) throw new Error(`product_data read failed ${response.status}: ${await response.text()}`);
    const page = await response.json();
    for (const row of page) {
      const matchText = `${row.brand || ""} ${row.product_name || ""} ${row.cache_key || ""}`;
      if (!normalizeText(matchText).includes("freshpet") || isRejected(matchText)) continue;
      rows.push(catalogRowInfo(row));
    }
    if (page.length < REST_PAGE_SIZE) break;
  }
  return rows;
}

function summarizeTargets(targets) {
  const byPetType = new Map();
  let withCalories = 0;
  let withMinerals = 0;
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
    const panel = target.nutrientPanel || {};
    if (panel.calories_per_cup != null || panel.calories_per_kg != null) withCalories += 1;
    if (panel.calcium_pct != null || panel.phosphorus_pct != null || panel.ash_pct != null) withMinerals += 1;
  }
  return {
    byPetType: [...byPetType.entries()].map(([petType, count]) => ({ petType, count })).sort((a, b) => b.count - a.count),
    withCalories,
    withMinerals,
  };
}

async function main() {
  assertConfig();
  const existingRows = await fetchExistingRows();
  const sitemapXml = await fetchText(sitemapUrl, "application/xml,text/xml;q=0.9,*/*;q=0.8");
  const sourceUrls = parseLocs(sitemapXml);
  const targets = [];
  const unmatchedTargets = [];
  const seen = new Set();
  const stats = {
    scannedUrls: 0,
    missingPanels: 0,
    weakTokens: 0,
    unmatchedAliases: 0,
    ambiguousAliases: 0,
    duplicates: 0,
  };

  for (const sourceUrl of sourceUrls) {
    if ((targets.length || unmatchedTargets.length) && delayMs) await sleep(delayMs);
    stats.scannedUrls += 1;
    const product = parseProductFromHtml(await fetchText(sourceUrl));
    if (!product || isRejected(`${product.name || ""} ${product.shortName || ""} ${product.slug || ""}`)) continue;
    const parsed = parseNutrientPanel(product, sourceUrl);
    if (!parsed.panel) {
      stats.missingPanels += 1;
      continue;
    }
    const candidate = targetInfo(product, sourceUrl);
    const state = matchState(candidate, existingRows);
    if (state.kind === "weak_target_tokens") stats.weakTokens += 1;
    if (state.kind === "missing") stats.unmatchedAliases += 1;
    if (state.kind === "ambiguous") stats.ambiguousAliases += 1;
    if (state.kind !== "matched") {
      if (includeUnmatched) unmatchedTargets.push({ ...candidate, reason: state.kind, nutrientPanel: parsed.panel });
      continue;
    }

    const row = state.rows[0];
    const target = {
      cacheKey: row.cache_key,
      productName: row.product_name,
      brand: row.brand || BRAND,
      petType: candidate.petType,
      source: "freshpet_official_product_page",
      sourceUrl,
      officialProductName: candidate.productName,
      nutrientPanel: parsed.panel,
    };
    if (seen.has(target.cacheKey)) {
      stats.duplicates += 1;
      continue;
    }
    seen.add(target.cacheKey);
    targets.push(target);
    if (limit && targets.length >= limit) break;
  }

  const manifest = {
    source: "freshpet_official_nutrient_panels",
    brand: BRAND,
    generatedAt: new Date().toISOString(),
    sourceSitemap: sitemapUrl,
    matchedCount: targets.length,
    existingCatalogRows: existingRows.length,
    ...stats,
    summary: summarizeTargets(targets),
    targets,
  };
  if (includeUnmatched) manifest.unmatchedTargets = unmatchedTargets;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Wrote ${targets.length} Freshpet nutrient panel targets to ${path.relative(root, outputPath)}`);
  console.log(JSON.stringify({
    scannedUrls: stats.scannedUrls,
    existingCatalogRows: existingRows.length,
    weakTokens: stats.weakTokens,
    unmatchedAliases: stats.unmatchedAliases,
    ambiguousAliases: stats.ambiguousAliases,
    missingPanels: stats.missingPanels,
    duplicates: stats.duplicates,
  }));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
