#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BRAND = "Hill's";
const DEFAULT_SITEMAP_URL = "https://www.hillspet.com/sitemap.xml";
const DEFAULT_OUTPUT = ".tmp/nutrient-panel-hillspet-targets.json";
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
  "biscuit", "biscuits", "snack", "snacks", "soft baked", "soft savories",
  "treat", "treats", "variety pack",
];
const WET_TERMS = ["canned", "entree", "loaf", "pate", "pouch", "savory", "stew", "tray", "wet"];
const DRY_TERMS = ["dry", "kibble"];
const STOP_TOKENS = new Set([
  "adult", "advantage", "canine", "cat", "diet", "dog", "dry", "feline", "food",
  "for", "healthy", "hills", "nutrition", "prescription", "recipe", "science",
  "the", "wet", "with",
]);
const EXTRA_GENERIC_TOKENS = new Set([
  ...STOP_TOKENS,
  "flavor", "formula", "meal", "original",
]);
const CONFLICT_MARKER_GROUPS = [
  ["science", "prescription", "healthyadvantage"],
  ["puppy", "kitten", "senior", "mature", "aging"],
  ["age16", "age6plus", "age7plus", "age11plus"],
  ["smallbites", "smallpaws", "smallmini", "small", "mini", "large"],
  ["kd", "id", "cd", "wd", "zd", "rd", "td", "jd", "gd", "hd", "dd", "ud", "ld", "md"],
  ["lowfat", "stress"],
  [
    "biome", "critical", "derm", "digestive", "earlysupport", "grainfree", "hairball",
    "healthymobility", "indoor", "joint", "jointsupport", "kidney", "light", "liver",
    "metabolic", "mobility", "multiplebenefit", "nocornwheatsoy", "onc", "oralcare",
    "perfectdigestion", "perfectweight", "seniorvitality", "sensitiveskin",
    "sensitivestomach", "urinary", "weightmanagement",
  ],
  ["pate"],
];
const PROTEIN_TERMS = [
  ["chicken", "chicken"],
  ["lamb", "lamb"],
  ["salmon", "salmon"],
  ["turkey", "turkey"],
  ["beef", "beef"],
  ["duck", "duck"],
  ["tuna", "tuna"],
  ["venison", "venison"],
  ["pollock", "pollock"],
  ["pork", "pork"],
  ["ocean fish", "fish"],
  ["whitefish", "fish"],
  ["fish", "fish"],
];
const NUTRIENT_FIELD_ALIASES = [
  [/\bprotein\b/i, "protein_pct"],
  [/\bfat\b/i, "fat_pct"],
  [/\bcrude\s+fiber\b/i, "fiber_pct"],
  [/\bcalcium\b/i, "calcium_pct"],
  [/\bphosphorus\b/i, "phosphorus_pct"],
  [/\btotal\s+omega[-\s]*3\b/i, "omega_3_pct"],
  [/\btotal\s+omega[-\s]*6\b/i, "omega_6_pct"],
];

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run export:hillspet-nutrient-panels -- --output=.tmp/nutrient-panel-hillspet-targets.json

Options:
  --output=path.json      Write a nutrient-panel backfill manifest (default ${DEFAULT_OUTPUT})
  --sitemap-url=url       Explicit Hill's sitemap URL (${DEFAULT_SITEMAP_URL})
  --limit=N               Stop after N matched nutrient panels are collected (default 0, no limit)
  --delay-ms=N            Delay between product-page requests (default 75)
  --include-unmatched     Include parsed unmatched/ambiguous rows under unmatchedTargets
  --skip-existing-scan    Skip product_data alias reads for parser smoke/debug exports only
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  if (!/^https:\/\/www\.hillspet\.com\/sitemap\.xml$/i.test(sitemapUrl)) {
    usage("--sitemap-url must be https://www.hillspet.com/sitemap.xml.");
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
    .replace(/hill039s|hill39s|hill s|hill’s|hill's|hills/g, "hills")
    .replace(/\b1\s*[- ]\s*6\b/g, " age16 ")
    .replace(/\b6\s*\+/g, " age6plus ")
    .replace(/\b7\s*\+/g, " age7plus ")
    .replace(/\b11\s*\+/g, " age11plus ")
    .replace(/['’™®+]/g, " ")
    .replace(/[-_/,%]+/g, " ")
    .replace(/[^a-z0-9\s&]/g, " ")
    .replace(/\bamp\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasTerm(text, term) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  if (normalizedTerm.includes(" ")) return text.includes(normalizedTerm);
  return new RegExp(`(^|[^a-z0-9])${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text);
}

function normalizeCacheKey(text) {
  return normalizeText(text)
    .replace(/\b(dog food|cat food|formula|recipe|food for dogs|food for cats)\b/g, " ")
    .replace(/\b\d+(\s+)?(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|can|cans|bag|bags|case|pack|pk|ct|count|tray|trays|pouch|pouches|box|boxes)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanUrl(value) {
  const url = decodeHtml(value).split("#")[0].replace(/\/$/, "");
  if (!/^https:\/\/www\.hillspet\.com\/(dog-food|cat-food)\/[a-z0-9-]+$/i.test(url)) return "";
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
    if (attempt >= 3) throw new Error(`Hill's fetch failed ${response.status}: ${url}`);
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 500 * attempt);
    return fetchText(url, accept, attempt + 1);
  }
  if (!response.ok) throw new Error(`Hill's fetch failed ${response.status}: ${url}`);
  return response.text();
}

function productIdFromUrl(url) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).pop() || "";
  } catch {
    return "";
  }
}

function productNameFromSlug(slug) {
  return decodeUrlText(slug)
    .replace(/^sd-/, "science-diet-")
    .replace(/^pd-/, "prescription-diet-")
    .replace(/-p-te-/g, "-pate-")
    .replace(/-/g, " ");
}

function lineFromUrl(url) {
  if (/prescription-diet/i.test(url)) return "Hill's Prescription Diet";
  if (/healthy-advantage/i.test(url)) return "Hill's Healthy Advantage";
  if (/science-diet|\/sd-/i.test(url)) return "Hill's Science Diet";
  return BRAND;
}

function parseSitemapRows(xml) {
  return parseLocs(xml)
    .map(cleanUrl)
    .filter(Boolean)
    .filter((sourceUrl) => !isRejected(sourceUrl))
    .map((sourceUrl) => ({
      sourceUrl,
      petType: sourceUrl.includes("/cat-food/") ? "cat" : "dog",
      slugName: productNameFromSlug(productIdFromUrl(sourceUrl)),
      lineName: lineFromUrl(sourceUrl),
    }));
}

function inferProductForm(value) {
  const text = normalizeText(value);
  const wet = WET_TERMS.some((term) => hasTerm(text, term));
  const dry = DRY_TERMS.some((term) => hasTerm(text, term));
  if (wet && !dry) return "wet";
  if (dry && !wet) return "dry";
  return "";
}

function isRejected(value) {
  const text = normalizeText(value);
  return REJECT_TERMS.some((term) => hasTerm(text, term));
}

function distinctiveTokens(value) {
  return [...new Set(normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_TOKENS.has(token)))]
    .sort();
}

function inferPetTypeFromText(value) {
  const text = normalizeText(value);
  const cat = /\b(cat|cats|kitten|feline)\b/.test(text);
  const dog = /\b(dog|dogs|puppy|canine)\b/.test(text);
  if (cat && !dog) return "cat";
  if (dog && !cat) return "dog";
  return "";
}

function isHillsCatalogRow(row) {
  const combined = normalizeText(`${row?.brand || ""} ${row?.product_name || ""} ${row?.cache_key || ""} ${row?.source_url || ""}`);
  if (!/(^|\s)(hills|science diet|prescription diet)(\s|$)/.test(combined)) return false;
  return !isRejected(combined);
}

async function fetchExistingRows() {
  if (skipExistingScan) return [];
  const rows = [];
  const base = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/product_data`;
  for (let from = 0; ; from += REST_PAGE_SIZE) {
    const response = await fetch(`${base}?select=cache_key,product_name,brand,source_url&or=(brand.ilike.*Hill*,product_name.ilike.*Hill*,cache_key.ilike.*hill*,brand.ilike.*Science%20Diet*,product_name.ilike.*Science%20Diet*)&order=cache_key.asc`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Range: `${from}-${from + REST_PAGE_SIZE - 1}`,
      },
    });
    if (!response.ok) throw new Error(`product_data read failed ${response.status}: ${await response.text()}`);
    const page = await response.json();
    for (const row of page) {
      if (!isHillsCatalogRow(row)) continue;
      const text = `${row.brand || ""} ${row.product_name || ""} ${row.cache_key || ""} ${row.source_url || ""}`;
      const productForm = inferProductForm(text);
      if (!productForm) continue;
      rows.push({
        ...row,
        petType: inferPetTypeFromText(text),
        productForm,
        distinctiveTokens: distinctiveTokens(text),
        normalizedText: normalizeText(text),
        matchText: text,
      });
    }
    if (page.length < REST_PAGE_SIZE) break;
  }
  return rows;
}

function markerSet(value) {
  const text = normalizeText(value);
  const markers = new Set();
  const addIf = (term, marker = term.replace(/\s+/g, "")) => {
    if (hasTerm(text, term)) markers.add(marker);
  };
  addIf("science diet", "science");
  addIf("prescription diet", "prescription");
  addIf("healthy advantage", "healthyadvantage");
  for (const marker of ["age16", "age6plus", "age7plus", "age11plus"]) addIf(marker);
  for (const term of [
    "puppy", "kitten", "senior", "mature", "aging", "small bites", "small paws",
    "small mini", "small", "mini", "large", "low fat", "stress", "perfect weight",
    "perfect digestion", "sensitive stomach", "sensitive skin", "oral care",
    "hairball", "urinary", "metabolic", "mobility", "kidney", "digestive",
    "biome", "derm", "onc", "liver", "critical", "joint", "weight management",
    "grain free", "no corn wheat soy", "joint support", "healthy mobility",
    "senior vitality", "multiple benefit", "indoor", "early support", "entree",
    "pate", "pouch", "stew",
  ]) {
    addIf(term);
  }
  for (const marker of ["kd", "id", "cd", "wd", "zd", "rd", "td", "jd", "gd", "hd", "dd", "ud", "ld", "md"]) {
    if (new RegExp(`(^|[^a-z0-9])${marker[0]}\\s*d([^a-z0-9]|$)`).test(text) || hasTerm(text, marker)) {
      markers.add(marker);
    }
  }
  return markers;
}

function proteinSet(value) {
  const text = normalizeText(value);
  const proteins = new Set();
  for (const [term, marker] of PROTEIN_TERMS) {
    if (hasTerm(text, term)) proteins.add(marker);
  }
  return proteins;
}

function hasAnyMarker(markers, group) {
  return group.some((marker) => markers.has(marker));
}

function markerCompatible(target, row) {
  const targetMarkers = markerSet(target.matchText);
  const rowMarkers = markerSet(row.matchText);
  for (const group of CONFLICT_MARKER_GROUPS) {
    if (hasAnyMarker(targetMarkers, group) || hasAnyMarker(rowMarkers, group)) {
      for (const marker of group) {
        if (targetMarkers.has(marker) !== rowMarkers.has(marker)) return false;
      }
    }
  }
  return true;
}

function proteinCompatible(target, row) {
  const targetProteins = proteinSet(target.matchText);
  const rowProteins = proteinSet(row.matchText);
  if (!targetProteins.size && rowProteins.size) return false;
  if (targetProteins.size && rowProteins.size) {
    if (targetProteins.size !== rowProteins.size) return false;
    for (const protein of targetProteins) {
      if (!rowProteins.has(protein)) return false;
    }
  }
  return true;
}

function distinctiveCompatible(target, row) {
  if (target.distinctiveTokens.length === 0) return false;
  if (!row.distinctiveTokens.some((token) => target.distinctiveTokens.includes(token))) return false;
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
      proteinCompatible(target, row) &&
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

function parseOfficialProductName(html) {
  const jsonName = String(html || "").match(/"name"\s*:\s*"([^"]{4,220})"/i)?.[1] || "";
  const h1 = String(html || "").match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "";
  return stripTags(jsonName || h1);
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
  const panel = { basis: "dry-matter", source_url: sourceUrl };
  let numericCount = 0;
  const tables = [...raw.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)].map((match) => match[1]);
  const nutrientTable = tables.find((table) => /<b>\s*Nutrient\s*<\/b>/i.test(table) && /Dry\s*Matter/i.test(table)) || "";
  for (const row of nutrientTable.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => stripTags(cell[1]));
    if (cells.length < 2) continue;
    const field = nutrientField(cells[0]);
    const percent = parsePercent(cells[1].match(/([\d,.]+)\s*%/)?.[1]);
    if (field && percent != null && panel[field] == null) {
      panel[field] = percent;
      numericCount++;
    }
  }

  const pageText = stripTags(raw);
  const kg = pageText.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*\/\s*kg/i);
  if (kg && panel.calories_per_kg == null) {
    panel.calories_per_kg = Number(kg[1].replace(/,/g, ""));
    numericCount++;
  }
  const cup = pageText.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*\/\s*cup/i);
  if (cup && panel.calories_per_cup == null) {
    panel.calories_per_cup = Number(cup[1].replace(/,/g, ""));
    numericCount++;
  }
  const can = pageText.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*\/\s*can/i);
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
    if (panel.calcium_pct != null || panel.phosphorus_pct != null) withMinerals++;
  }
  return {
    byPetType: [...byPetType.entries()]
      .map(([petType, count]) => ({ petType, count }))
      .sort((a, b) => b.count - a.count || a.petType.localeCompare(b.petType)),
    withCalories,
    withMinerals,
  };
}

function buildCandidate(row, html) {
  const officialName = parseOfficialProductName(html);
  const productName = officialName || row.slugName;
  const matchText = `${row.lineName} ${productName} ${row.slugName}`;
  return {
    ...row,
    productName,
    productForm: inferProductForm(`${row.sourceUrl} ${productName}`),
    distinctiveTokens: distinctiveTokens(matchText),
    matchText,
  };
}

async function main() {
  assertConfig();
  const [xml, existingRows] = await Promise.all([
    fetchText(sitemapUrl, "application/xml,text/xml,*/*;q=0.8"),
    fetchExistingRows(),
  ]);
  const candidates = parseSitemapRows(xml);
  const targets = [];
  const unmatchedTargets = [];
  const seen = new Set();
  const skipped = { weakTargetTokens: 0, missingCatalogAlias: 0, missingPanel: 0, duplicate: 0 };
  const panelRejectReasons = new Map();

  for (const rawCandidate of candidates) {
    const html = await fetchText(rawCandidate.sourceUrl);
    if (delayMs) await sleep(delayMs);
    const candidate = buildCandidate(rawCandidate, html);
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
        productName: row?.product_name || `${BRAND} ${candidate.productName}`,
        brand: row?.brand || BRAND,
        petType: candidate.petType,
        source: "hillspet_official_product_page",
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
    source: "hillspet_official_product_pages",
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
  console.log(`Wrote ${targets.length} Hill's nutrient panel targets to ${path.relative(root, outputPath)}`);
  console.log(`Scanned ${candidates.length} product URLs; weak tokens ${skipped.weakTargetTokens}; unmatched aliases ${skipped.missingCatalogAlias}; missing panels ${skipped.missingPanel}; duplicates ${skipped.duplicate}`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
