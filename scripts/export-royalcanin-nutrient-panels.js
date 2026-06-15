#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BRAND = "Royal Canin";
const DEFAULT_SITEMAP_URL = "https://www.royalcanin.com/us/en-us/sitemap/sitemap-products.xml";
const DEFAULT_OUTPUT = ".tmp/nutrient-panel-royalcanin-targets.json";
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
  "biscuit", "biscuits", "chew", "chews", "meal booster", "probiotic",
  "probiotics", "supplement", "supplements", "topper", "toppers",
  "treat", "treats", "vitamin", "vitamins",
];
const WET_TERMS = [
  "canned", "gravy", "loaf", "morsels", "mousse", "pouch", "sauce",
  "slices", "thin slices", "wet",
];
const DRY_TERMS = ["dry", "kibble"];
const EXTRA_GENERIC_TOKENS = new Set([
  "adult", "appetite", "babycat", "babydog", "breed", "canin", "canine",
  "care", "cat", "cats", "dog", "dogs", "dry", "feline", "food", "health",
  "kitten", "mother", "nutrition", "puppy", "queen", "royal", "senior",
  "size", "wet",
]);
const TARGET_STOP_TOKENS = new Set([
  ...EXTRA_GENERIC_TOKENS,
  "and", "in", "of", "products", "retail", "the", "with",
]);
const CONFLICT_MARKER_GROUPS = [
  ["puppy", "kitten", "senior", "aging", "babycat", "babydog", "mother", "queen", "starter"],
  ["xsmall", "small", "medium", "large", "giant"],
  ["age5", "age7", "age8", "age10", "age12"],
];
const REQUIRED_ROW_MARKERS = [
  ["urinary so", "so"],
  ["hydrolyzed", "hydrolyzed"],
  ["gastrointestinal", "gastrointestinal"],
  ["renal", "renal"],
  ["satiety", "satiety"],
  ["multifunction", "multifunction"],
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
  npm run export:royalcanin-nutrient-panels -- --output=.tmp/nutrient-panel-royalcanin-targets.json

Options:
  --output=path.json      Write a nutrient-panel backfill manifest (default ${DEFAULT_OUTPUT})
  --sitemap-url=url       Explicit Royal Canin product sitemap URL (${DEFAULT_SITEMAP_URL})
  --limit=N               Stop after N matched nutrient panels are collected (default 0, no limit)
  --delay-ms=N            Delay between product-page requests (default 75)
  --include-unmatched     Include parsed unmatched/ambiguous rows under unmatchedTargets
  --skip-existing-scan    Skip product_data alias reads for parser smoke/debug exports only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  if (!/^https:\/\/www\.royalcanin\.com\/us\/en-us\/sitemap\/sitemap-products\.xml$/i.test(sitemapUrl)) {
    usage("--sitemap-url must be https://www.royalcanin.com/us/en-us/sitemap/sitemap-products.xml.");
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

function decodeUrlText(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "").replace(/%2b/gi, "+").replace(/%26/gi, "&");
  }
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

function titleCaseProductName(value) {
  return String(value || "")
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) return part;
      return part.toLowerCase().replace(/(^|[-'/])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
    })
    .join("")
    .replace(/\bX Small\b/g, "X-Small")
    .replace(/\b5 \+/g, "5+")
    .replace(/\b7 \+/g, "7+")
    .replace(/\b8 \+/g, "8+")
    .trim();
}

function cleanUrl(value) {
  const url = decodeHtml(value).split("#")[0].replace(/\/$/, "");
  if (!/^https:\/\/www\.royalcanin\.com\/us\/(dogs|cats)\/products\/retail-products\/[a-z0-9%&.+/-]+$/i.test(url)) return "";
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
    if (attempt >= 3) throw new Error(`Royal Canin fetch failed ${response.status}: ${url}`);
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 500 * attempt);
    return fetchText(url, accept, attempt + 1);
  }
  if (!response.ok) throw new Error(`Royal Canin fetch failed ${response.status}: ${url}`);
  return response.text();
}

function productIdFromUrl(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "";
    if (/^\d+$/.test(last)) return decodeUrlText(parts[parts.length - 2] || "");
    return decodeUrlText(last);
  } catch {
    return "";
  }
}

function productNameFromSlug(slug) {
  return titleCaseProductName(decodeUrlText(slug)
    .replace(/--+/g, "-")
    .replace(/&/g, " and ")
    .replace(/-\d+$/g, "")
    .replace(/-/g, " "));
}

function parseSitemapRows(xml) {
  return parseLocs(xml)
    .map(cleanUrl)
    .filter(Boolean)
    .map((sourceUrl) => {
      const name = productNameFromSlug(productIdFromUrl(sourceUrl));
      if (!name) return null;
      return {
        sourceUrl,
        productName: name,
        petType: sourceUrl.includes("/cats/") ? "cat" : "dog",
      };
    })
    .filter(Boolean);
}

function parseOfficialProductName(html) {
  const h1 = String(html || "").match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "";
  const name = stripTags(h1);
  return name ? titleCaseProductName(name) : "";
}

function inferProductForm(value) {
  const text = normalizeText(value);
  const wet = WET_TERMS.some((term) => hasTerm(text, term));
  const dry = DRY_TERMS.some((term) => hasTerm(text, term));
  if (wet && !dry) return "wet";
  if (dry && !wet) return "dry";
  return wet ? "wet" : "dry";
}

function isRejected(value) {
  const text = normalizeText(value);
  return REJECT_TERMS.some((term) => hasTerm(text, term));
}

function distinctiveTokens(value) {
  return [...new Set(normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !TARGET_STOP_TOKENS.has(token)))]
    .sort();
}

function normalizeCandidate(row) {
  return {
    ...row,
    productForm: inferProductForm(`${row.productName} ${row.sourceUrl}`),
    distinctiveTokens: distinctiveTokens(row.productName),
    normalizedText: normalizeText(`${row.productName} ${row.sourceUrl}`),
  };
}

function markerSet(value) {
  const text = normalizeText(value);
  const markers = new Set();
  if (hasTerm(text, "x small")) markers.add("xsmall");
  else if (hasTerm(text, "small")) markers.add("small");
  if (hasTerm(text, "medium")) markers.add("medium");
  if (hasTerm(text, "large")) markers.add("large");
  if (hasTerm(text, "giant")) markers.add("giant");
  for (const age of [5, 7, 8, 10, 12]) {
    if (new RegExp(`(^|[^a-z0-9])${age}([^a-z0-9]|$)`).test(text)) markers.add(`age${age}`);
  }
  for (const group of CONFLICT_MARKER_GROUPS) {
    for (const marker of group) {
      if (hasTerm(text, marker)) markers.add(marker);
    }
  }
  for (const [phrase, marker] of REQUIRED_ROW_MARKERS) {
    if (hasTerm(text, phrase)) markers.add(marker);
  }
  return markers;
}

function hasAnyMarker(markers, group) {
  return group.some((marker) => markers.has(marker));
}

function markerCompatible(target, row) {
  const targetMarkers = markerSet(`${target.productName} ${target.sourceUrl}`);
  const rowMarkers = markerSet(`${row.product_name || ""} ${row.cache_key || ""} ${row.source_url || ""}`);
  for (const group of CONFLICT_MARKER_GROUPS) {
    if (hasAnyMarker(targetMarkers, group) || hasAnyMarker(rowMarkers, group)) {
      for (const marker of group) {
        if (targetMarkers.has(marker) !== rowMarkers.has(marker)) return false;
      }
    }
  }
  for (const [, marker] of REQUIRED_ROW_MARKERS) {
    if (rowMarkers.has(marker) && !targetMarkers.has(marker)) return false;
  }
  return true;
}

function inferPetTypeFromText(value) {
  const text = normalizeText(value);
  const cat = /\b(cat|cats|kitten|feline|babycat|maine coon|persian|bengal|siamese|ragdoll)\b/.test(text);
  const dog = /\b(dog|dogs|puppy|canine|babydog|shepherd|retriever|pug|bulldog|dachshund|chihuahua|poodle|boxer|maltese|beagle|spaniel|terrier|schnauzer|corgi|rottweiler)\b/.test(text);
  if (cat && !dog) return "cat";
  if (dog && !cat) return "dog";
  return "";
}

function isRoyalCaninCatalogRow(row) {
  const combined = normalizeText(`${row?.brand || ""} ${row?.product_name || ""} ${row?.cache_key || ""} ${row?.source_url || ""}`);
  if (!combined.includes("royal canin")) return false;
  return !isRejected(combined);
}

async function fetchExistingRows() {
  if (skipExistingScan) return [];
  const rows = [];
  const base = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/product_data`;
  for (let from = 0; ; from += REST_PAGE_SIZE) {
    const response = await fetch(`${base}?select=cache_key,product_name,brand,source_url&or=(brand.ilike.*Royal%20Canin*,product_name.ilike.*Royal%20Canin*,cache_key.ilike.*royal%20canin*)&order=cache_key.asc`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Range: `${from}-${from + REST_PAGE_SIZE - 1}`,
      },
    });
    if (!response.ok) throw new Error(`product_data read failed ${response.status}: ${await response.text()}`);
    const page = await response.json();
    for (const row of page) {
      if (!isRoyalCaninCatalogRow(row)) continue;
      const text = `${row.brand || ""} ${row.product_name || ""} ${row.cache_key || ""} ${row.source_url || ""}`;
      rows.push({
        ...row,
        petType: inferPetTypeFromText(text),
        productForm: inferProductForm(text),
        distinctiveTokens: distinctiveTokens(text),
        normalizedText: normalizeText(text),
      });
    }
    if (page.length < REST_PAGE_SIZE) break;
  }
  return rows;
}

function distinctiveCompatible(target, row) {
  if (target.distinctiveTokens.length === 0) return false;
  if (!target.distinctiveTokens.every((token) => row.distinctiveTokens.includes(token))) return false;
  return row.distinctiveTokens.every((token) =>
    target.distinctiveTokens.includes(token) || EXTRA_GENERIC_TOKENS.has(token)
  );
}

function matchCandidates(target, rows) {
  if (skipExistingScan) return [];
  return rows
    .filter((row) =>
      row.petType === target.petType &&
      row.productForm === target.productForm &&
      markerCompatible(target, row) &&
      distinctiveCompatible(target, row)
    )
    .sort((a, b) => a.product_name.localeCompare(b.product_name));
}

function matchState(target, rows) {
  if (skipExistingScan) return { kind: "skipped_existing_scan", rows: [] };
  if (!target.petType || !target.productForm || target.distinctiveTokens.length === 0) {
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
  const analysisBlock = raw.match(/Guaranteed Analysis[\s\S]*?data-testid=["']product-nutrition-content["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
  const analysisText = stripTags(analysisBlock);
  for (const match of analysisText.matchAll(/([A-Za-z][A-Za-z\s\-()*.]+?)\s*(?:\([^)]*\))?\s*([\d,.]+)\s*%/g)) {
    const label = match[1];
    const field = nutrientField(label);
    const percent = parsePercent(match[2]);
    if (field && percent != null && panel[field] == null) {
      panel[field] = percent;
      numericCount++;
    }
  }

  const calorieBlock = raw.match(/Calorie Content[\s\S]*?data-testid=["']product-nutrition-content["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
  const calorieText = stripTags(calorieBlock);
  const kg = calorieText.match(/([\d,]+(?:\.\d+)?)\s*(?:kilocalories|kcal)[^.,;]{0,80}(?:per\s+kilogram|\/\s*kg)/i);
  if (kg && panel.calories_per_kg == null) {
    panel.calories_per_kg = Number(kg[1].replace(/,/g, ""));
    numericCount++;
  }
  const cup = calorieText.match(/([\d,]+(?:\.\d+)?)\s*(?:kilocalories|kcal)[^.,;]{0,80}(?:per\s+cup|\/\s*cup)/i);
  if (cup && panel.calories_per_cup == null) {
    panel.calories_per_cup = Number(cup[1].replace(/,/g, ""));
    numericCount++;
  }
  const can = calorieText.match(/([\d,]+(?:\.\d+)?)\s*(?:kilocalories|kcal)[^.,;]{0,80}(?:per\s+can|\/\s*can)/i);
  if (can && panel.calories_per_can == null) {
    panel.calories_per_can = Number(can[1].replace(/,/g, ""));
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
    if (panel.calories_per_cup != null || panel.calories_per_kg != null || panel.calories_per_can != null) withCalories++;
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
  const candidates = parseSitemapRows(xml)
    .filter((row) => !isRejected(`${row.productName} ${row.sourceUrl}`))
    .map(normalizeCandidate);
  const targets = [];
  const unmatchedTargets = [];
  const seen = new Set();
  const skipped = { weakTargetTokens: 0, missingCatalogAlias: 0, missingPanel: 0, duplicate: 0 };
  const panelRejectReasons = new Map();

  for (const candidate of candidates) {
    const html = await fetchText(candidate.sourceUrl);
    if (delayMs) await sleep(delayMs);
    const officialName = parseOfficialProductName(html);
    const enrichedCandidate = normalizeCandidate({
      ...candidate,
      productName: officialName || candidate.productName,
    });
    const state = matchState(enrichedCandidate, existingRows);
    const rows = state.rows || [];
    if (rows.length === 0 && !skipExistingScan) {
      if (state.kind === "weak_target_tokens") skipped.weakTargetTokens++;
      else skipped.missingCatalogAlias++;
      if (includeUnmatched) {
        unmatchedTargets.push({
          cacheKey: normalizeCacheKey(`${BRAND} ${enrichedCandidate.productName}`),
          productName: enrichedCandidate.productName,
          brand: BRAND,
          petType: enrichedCandidate.petType,
          productForm: enrichedCandidate.productForm,
          sourceUrl: enrichedCandidate.sourceUrl,
          matchState: state.kind,
          distinctiveTokens: enrichedCandidate.distinctiveTokens,
          matchedRows: rows.length,
        });
      }
      continue;
    }

    const parsed = parseNutrientPanel(html, enrichedCandidate.sourceUrl);
    if (!parsed.panel) {
      skipped.missingPanel++;
      panelRejectReasons.set(parsed.reason, (panelRejectReasons.get(parsed.reason) || 0) + 1);
      continue;
    }

    const matchedRows = rows.length > 0 ? rows : [null];
    for (const row of matchedRows) {
      const target = {
        cacheKey: row?.cache_key || normalizeCacheKey(`${BRAND} ${enrichedCandidate.productName}`),
        productName: row?.product_name || `${BRAND} ${enrichedCandidate.productName}`,
        brand: row?.brand || BRAND,
        petType: enrichedCandidate.petType,
        source: "royalcanin_official_product_page",
        sourceUrl: enrichedCandidate.sourceUrl,
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
    source: "royalcanin_official_product_pages",
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
  console.log(`Wrote ${targets.length} Royal Canin nutrient panel targets to ${path.relative(root, outputPath)}`);
  console.log(`Scanned ${candidates.length} product URLs; weak tokens ${skipped.weakTargetTokens}; unmatched aliases ${skipped.missingCatalogAlias}; missing panels ${skipped.missingPanel}; duplicates ${skipped.duplicate}`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
