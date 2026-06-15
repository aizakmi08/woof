#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const PURINA_PRODUCT_IMPORT_SERVICE_KEY =
  process.env.PURINA_PRODUCT_IMPORT_SERVICE_KEY ||
  process.env.PRODUCT_LOOKUP_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";
const DEFAULT_INPUTS = [
  ".tmp/purinaproplan-sitemap-catalog-targets.json",
  ".tmp/purinaone-sitemap-catalog-targets.json",
  ".tmp/fancyfeast-sitemap-catalog-targets.json",
  ".tmp/friskies-sitemap-catalog-targets.json",
];
const DEFAULT_EXPORT_PARSED = ".tmp/purina-official-product-data.json";
const DEFAULT_REPORT = ".tmp/purina-official-product-backfill-report.jsonl";
const USER_AGENT = "Mozilla/5.0 Woof official Purina product import";
const SOURCE_BRAND = "Purina";
const MAX_CONCURRENCY = 4;
const PURINA_FAMILY_BRANDS = new Set(["Purina Pro Plan", "Purina ONE", "Fancy Feast", "Friskies"]);

const dryRun = process.argv.includes("--dry-run");
const includeExisting = process.argv.includes("--include-existing");
const verifyWrites = !process.argv.includes("--no-verify-writes");
const resumeReport = process.argv.includes("--resume-report");
const inputArg = process.argv.find((arg) => arg.startsWith("--input="));
const exportParsedArg = process.argv.find((arg) => arg.startsWith("--export-parsed="));
const reportArg = process.argv.find((arg) => arg.startsWith("--report="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const delayArg = process.argv.find((arg) => arg.startsWith("--delay-ms="));
const concurrencyArg = process.argv.find((arg) => arg.startsWith("--concurrency="));
const inputPaths = (inputArg ? inputArg.split("=").slice(1).join("=").split(",") : DEFAULT_INPUTS)
  .map((value) => path.resolve(root, value.trim()))
  .filter(Boolean);
const exportParsedPath = exportParsedArg ? path.resolve(root, exportParsedArg.split("=")[1]) : path.resolve(root, DEFAULT_EXPORT_PARSED);
const reportPath = reportArg ? path.resolve(root, reportArg.split("=")[1]) : path.resolve(root, DEFAULT_REPORT);
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const delayMs = delayArg ? Number(delayArg.split("=")[1]) : 250;
const concurrency = concurrencyArg ? Number(concurrencyArg.split("=")[1]) : 1;

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run backfill:purina-official-products -- --dry-run
  PURINA_PRODUCT_IMPORT_SERVICE_KEY=... npm run backfill:purina-official-products

Options:
  --input=a.json,b.json       Purina-family catalog target manifests (default ${DEFAULT_INPUTS.join(",")})
  --dry-run                   Parse and export official data without writing
  --export-parsed=path.json   Write parsed official product-data manifest (default ${DEFAULT_EXPORT_PARSED})
  --report=path.jsonl         Append per-product write results (default ${DEFAULT_REPORT})
  --resume-report             Skip cache keys already verified in report
  --limit=N                   Process at most N parsed products (default 0, no limit)
  --delay-ms=N                Delay between official page-data requests (default 250)
  --concurrency=N             Parallel service-key writes, 1-${MAX_CONCURRENCY} (default 1)
  --include-existing          Parse/write rows even if product_data already has a planned key
  --no-verify-writes          Skip product_data readback verification after RPC success
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  if (inputPaths.length === 0) usage("Provide at least one --input manifest.");
  for (const inputPath of inputPaths) {
    if (!fs.existsSync(inputPath)) usage(`Missing Purina input manifest: ${path.relative(root, inputPath)}`);
  }
  if (!dryRun && !PURINA_PRODUCT_IMPORT_SERVICE_KEY) {
    usage("Set PURINA_PRODUCT_IMPORT_SERVICE_KEY, PRODUCT_LOOKUP_SERVICE_KEY, or Supabase service key for official Purina product writes.");
  }
  if (!Number.isFinite(limit) || limit < 0) usage("--limit must be a non-negative number.");
  if (!Number.isFinite(delayMs) || delayMs < 0) usage("--delay-ms must be a non-negative number.");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY) {
    usage(`--concurrency must be an integer between 1 and ${MAX_CONCURRENCY}.`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function supabaseBase() {
  return SUPABASE_URL.replace(/\/$/, "");
}

function restHeaders(token = SUPABASE_ANON_KEY) {
  return {
    apikey: token,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function asciiFold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/\u202F/g, " ");
}

function decodeHtml(value) {
  return asciiFold(value)
    .replace(/^\uFEFF/, "")
    .replace(/\\u0027/g, "'")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#38;|&amp;/g, "&")
    .replace(/&#39;|&apos;|&#8217;/g, "'")
    .replace(/&#8220;|&#8221;|&quot;/g, "\"")
    .replace(/&nbsp;|&#160;/g, " ")
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
    .replace(/<\/(p|li|td|tr|div|h[1-6])>/gi, " ")
    .replace(/<[^>]*>/g, " "));
}

function normalizeText(value) {
  return asciiFold(value)
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[\u2018\u2019'\u2122\u00AE+]/g, " ")
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

function cleanUrl(value) {
  const url = decodeHtml(value).split("#")[0].replace(/\/$/, "");
  if (!/^https:\/\/www\.purina\.com\/(cats|dogs)\/shop\/[a-z0-9-]+$/i.test(url)) return "";
  return url.slice(0, 500);
}

function cleanProductName(value) {
  return decodeHtml(value)
    .replace(/\u2122|\u00AE|\u00A9/g, "")
    .replace(/\s+\|\s+Purina US$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function buildCacheKey(brand, name) {
  const normalizedBrand = normalizeCacheKey(brand);
  const normalizedName = normalizeCacheKey(name);
  if (!normalizedName) return "";
  if (normalizedBrand && normalizedName.startsWith(normalizedBrand)) return normalizedName;
  if (normalizedBrand === "purina pro plan" && normalizedName.startsWith("pro plan ")) {
    return normalizeCacheKey(`purina ${name}`);
  }
  return normalizeCacheKey(`${brand} ${name}`);
}

function inferPetType(sourceUrl, fallback = "") {
  const text = normalizeText(`${sourceUrl} ${fallback}`);
  if (/\bdogs?\b/.test(text)) return "dog";
  if (/\bcats?\b/.test(text)) return "cat";
  return "";
}

function inferForm(sourceUrl, categoryName = "", fallback = "") {
  const text = normalizeText(`${sourceUrl} ${categoryName} ${fallback}`);
  if (/\b(dry|kibble)\b/.test(text)) return "dry";
  if (/\b(wet|can|canned|pate|pate|gravy|sauce|pouch|tray|mousse|stew|chunks|shreds|filets)\b/.test(text)) return "wet";
  return "";
}

function normalizeTarget(entry, sourceFile) {
  const sourceUrl = cleanUrl(entry?.sourceUrl || entry?.source_url || entry?.url);
  const name = cleanProductName(entry?.name || entry?.productName || entry?.product_name || "");
  const brand = cleanProductName(entry?.brand || "");
  const petType = String(entry?.petType || entry?.pet_type || inferPetType(sourceUrl, name)).trim().toLowerCase();
  const cacheKey = normalizeCacheKey(entry?.cacheKey || entry?.cache_key || buildCacheKey(brand, name));
  if (!sourceUrl || !name || !cacheKey || !["dog", "cat"].includes(petType)) return null;
  return {
    name,
    brand,
    sourceBrand: cleanProductName(entry?.sourceBrand || entry?.source_brand || SOURCE_BRAND),
    cacheKey,
    petType,
    form: String(entry?.form || inferForm(sourceUrl, "", name)).trim(),
    sourceUrl,
    imageUrl: String(entry?.imageUrl || entry?.image_url || "").trim().slice(0, 500),
    sourceQuality: String(entry?.sourceQuality || entry?.source_quality || "").trim(),
    sourceFile,
  };
}

function isMultiPack(target) {
  return /\b(variety\s+pack|multipack|multi\s+pack|sampler|assortment|bundle|favorites\s+pack|combo\s+pack)\b/i.test(`${target.name} ${target.sourceUrl} ${target.cacheKey}`);
}

function loadInputTargets() {
  const targets = [];
  for (const inputPath of inputPaths) {
    const parsed = JSON.parse(fs.readFileSync(inputPath, "utf8"));
    const entries = Array.isArray(parsed) ? parsed : parsed?.targets;
    if (!Array.isArray(entries)) usage("--input JSON must be an array or an object with a targets array.");
    const sourceFile = path.relative(root, inputPath);
    targets.push(...entries.map((entry) => normalizeTarget(entry, sourceFile)).filter(Boolean));
  }
  const seen = new Set();
  return targets.filter((target) => {
    const key = `${target.sourceUrl}|${target.cacheKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pageDataUrl(sourceUrl) {
  const parsed = new URL(sourceUrl);
  return `https://www.purina.com/page-data${parsed.pathname.replace(/\/$/, "")}/page-data.json`;
}

function officialImageUrl(node) {
  const direct = String(node?.relationships?.image?.url || node?.image?.url || "").trim();
  if (/^https:\/\//i.test(direct)) return direct.slice(0, 500);
  const fallback = String(node?.relationships?.image?.gatsbyImage?.images?.fallback?.src || "").trim();
  const match = fallback.match(/[?&]url=([^&]+)/);
  if (match) {
    const decoded = decodeURIComponent(match[1]);
    if (/^https:\/\//i.test(decoded)) return decoded.slice(0, 500);
  }
  return "";
}

function categoryName(node) {
  const category = node?.relationships?.category;
  const first = Array.isArray(category) ? category[0] : category;
  return cleanProductName(first?.name || "");
}

function brandName(node, fallback) {
  const targetBrand = cleanProductName(fallback);
  if (PURINA_FAMILY_BRANDS.has(targetBrand)) return targetBrand;
  return cleanProductName(node?.relationships?.brand?.name || targetBrand);
}

function speciesName(node, sourceUrl, fallback) {
  const species = node?.relationships?.species;
  const first = Array.isArray(species) ? species[0] : species;
  return inferPetType("", first?.name || "") || inferPetType(sourceUrl, fallback);
}

function cleanIngredient(value) {
  return decodeHtml(value)
    .replace(/^ingredients?:?\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .trim();
}

function parseIngredients(node) {
  const ingredients = node?.relationships?.ingredients;
  if (!Array.isArray(ingredients)) return [];
  const seen = new Set();
  return ingredients
    .map((ingredient) => cleanIngredient(ingredient?.name || ""))
    .filter((ingredient) => {
      const key = normalizeText(ingredient);
      if (
        !key ||
        seen.has(key) ||
        ingredient.length < 2 ||
        ingredient.length > 220 ||
        /^ingredients?$/i.test(ingredient) ||
        /https?:|<|>|\{|\}/i.test(ingredient)
      ) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function parseCalories(node) {
  const text = stripTags(node?.feeding_instructions?.processed || "");
  const calories = {};
  let match = text.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*\/\s*kg/i);
  if (match) calories.calories_per_kg = Number(match[1].replace(/,/g, ""));
  match = text.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*\/\s*cup/i);
  if (match) calories.calories_per_cup = Number(match[1].replace(/,/g, ""));
  match = text.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*\/\s*(?:can|pouch|tray)/i);
  if (match) calories.calories_per_serving = Number(match[1].replace(/,/g, ""));
  const clean = {};
  for (const [key, value] of Object.entries(calories)) {
    if (Number.isFinite(value) && value >= 0 && value <= 10000) clean[key] = value;
  }
  return Object.keys(clean).length > 0 ? clean : null;
}

function slugSuffix(sourceUrl) {
  try {
    const slug = new URL(sourceUrl).pathname.split("/").filter(Boolean).pop() || "";
    return normalizeCacheKey(slug)
      .replace(/\b(purina|pro plan|one|fancy feast|friskies)\b/g, " ")
      .replace(/\b(wet|dry|dog|cat|food)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 8)
      .join(" ");
  } catch {
    return "";
  }
}

function ensureUniqueCacheKeys(targets) {
  const groups = new Map();
  for (const target of targets) {
    if (!groups.has(target.cacheKey)) groups.set(target.cacheKey, []);
    groups.get(target.cacheKey).push(target);
  }
  for (const [cacheKey, rows] of groups) {
    if (rows.length < 2) continue;
    const petTypes = new Set(rows.map((row) => row.petType));
    rows.forEach((row, index) => {
      const suffix = petTypes.size > 1 ? row.petType : (slugSuffix(row.sourceUrl) || String(index + 1));
      row.baseCacheKey = cacheKey;
      row.cacheKey = normalizeCacheKey(`${cacheKey} ${suffix}`);
    });
  }
  return targets;
}

async function fetchPageData(target, attempt = 1) {
  const url = pageDataUrl(target.sourceUrl);
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
    },
  });
  if (response.status === 403 || response.status === 429 || response.status >= 500) {
    if (attempt >= 6) throw new Error(`Purina page-data fetch failed ${response.status}: ${url}`);
    const retryAfter = Number(response.headers.get("retry-after"));
    const backoff = response.status === 429 ? 3000 * attempt : 750 * attempt * attempt;
    await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : backoff);
    return fetchPageData(target, attempt + 1);
  }
  if (!response.ok) throw new Error(`Purina page-data fetch failed ${response.status}: ${url}`);
  return response.json();
}

async function fetchExistingCacheKeys() {
  const keys = new Set();
  const base = `${supabaseBase()}/rest/v1/product_data`;
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const url = `${base}?select=cache_key,product_name,brand&or=(brand.ilike.*Purina*,brand.ilike.*Fancy%20Feast*,brand.ilike.*Friskies*,product_name.ilike.*Purina*,product_name.ilike.*Fancy%20Feast*,product_name.ilike.*Friskies*,cache_key.ilike.*purina*,cache_key.ilike.*fancy%20feast*,cache_key.ilike.*friskies*)&offset=${offset}&limit=${pageSize}`;
    const response = await fetch(url, { headers: restHeaders() });
    if (!response.ok) throw new Error(`product_data read failed ${response.status}: ${await response.text()}`);
    const rows = await response.json();
    for (const row of rows) {
      if (row?.cache_key) keys.add(String(row.cache_key).trim());
      const alias = buildCacheKey(row?.brand || "", row?.product_name || "");
      if (alias) keys.add(alias);
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return keys;
}

async function parseTarget(target) {
  if (isMultiPack(target)) {
    return { target: null, reason: "multipack_or_variety_pack", sourceUrl: target.sourceUrl };
  }
  const pageData = await fetchPageData(target);
  const node = pageData?.result?.data?.node;
  if (!node) return { target: null, reason: "missing_page_data_node", sourceUrl: target.sourceUrl };
  const ingredients = parseIngredients(node);
  if (ingredients.length < 5) {
    return { target: null, reason: "missing_or_sparse_ingredients", sourceUrl: target.sourceUrl };
  }
  const officialProductName = cleanProductName(node.title || target.name) || target.name;
  const brand = brandName(node, target.brand);
  const petType = speciesName(node, target.sourceUrl, target.petType);
  if (!brand || !["dog", "cat"].includes(petType)) {
    return { target: null, reason: "missing_brand_or_pet_type", sourceUrl: target.sourceUrl };
  }
  const category = categoryName(node);
  const form = inferForm(target.sourceUrl, category, officialProductName) || target.form;
  const imageUrl = target.imageUrl || officialImageUrl(node);
  const calories = parseCalories(node);
  const labelDeckUrl = String(node?.relationships?.label_deck?.url || "").trim().slice(0, 500);
  const cacheKey = buildCacheKey(brand, officialProductName) || target.cacheKey;
  return {
    target: {
      ...target,
      name: officialProductName,
      brand,
      cacheKey,
      petType,
      form,
      imageUrl,
      officialProductName,
      ingredients,
      ingredientText: ingredients.join(", "),
      ingredientCount: ingredients.length,
      calories,
      labelDeckUrl,
      source: "brand_site",
    },
    reason: null,
  };
}

function summarizeParsed(targets) {
  const maps = {
    byBrand: new Map(),
    byPetType: new Map(),
    byForm: new Map(),
  };
  let withCalories = 0;
  let withLabelDeck = 0;
  for (const target of targets) {
    maps.byBrand.set(target.brand || "unknown", (maps.byBrand.get(target.brand || "unknown") || 0) + 1);
    maps.byPetType.set(target.petType, (maps.byPetType.get(target.petType) || 0) + 1);
    maps.byForm.set(target.form || "unknown", (maps.byForm.get(target.form || "unknown") || 0) + 1);
    if (target.calories) withCalories += 1;
    if (target.labelDeckUrl) withLabelDeck += 1;
  }
  const summarizeMap = (map, keyName) => [...map.entries()]
    .map(([key, count]) => ({ [keyName]: key, count }))
    .sort((a, b) => b.count - a.count || String(a[keyName]).localeCompare(String(b[keyName])));
  return {
    byBrand: summarizeMap(maps.byBrand, "brand"),
    byPetType: summarizeMap(maps.byPetType, "petType"),
    byForm: summarizeMap(maps.byForm, "form"),
    withCalories,
    withLabelDeck,
    minIngredientCount: targets.length ? Math.min(...targets.map((target) => target.ingredientCount)) : 0,
    maxIngredientCount: targets.length ? Math.max(...targets.map((target) => target.ingredientCount)) : 0,
  };
}

function exportParsed(targets, metadata) {
  fs.mkdirSync(path.dirname(exportParsedPath), { recursive: true });
  fs.writeFileSync(
    exportParsedPath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: "purina_official_product_data",
      input: inputPaths.map((inputPath) => path.relative(root, inputPath)),
      ...metadata,
      summary: summarizeParsed(targets),
      targets,
    }, null, 2)}\n`,
    "utf8",
  );
}

function loadVerifiedReportKeys() {
  const keys = new Set();
  if (!resumeReport || !fs.existsSync(reportPath)) return keys;
  for (const line of fs.readFileSync(reportPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry?.event === "purina_official_product_result" && entry?.status === "verified_saved" && entry?.cache_key) {
        keys.add(entry.cache_key);
      }
    } catch {
      // Ignore partial report lines from interrupted appends.
    }
  }
  return keys;
}

function appendReport(entry) {
  if (dryRun) return;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.appendFileSync(reportPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n`, "utf8");
}

async function writeTarget(target) {
  const body = {
    p_cache_key: target.cacheKey,
    p_product_name: target.name,
    p_brand: target.brand,
    p_ingredients: target.ingredients,
    p_ingredient_text: target.ingredientText,
    p_ingredient_count: target.ingredientCount,
    p_source: "brand_site",
    p_image_url: target.imageUrl || null,
  };
  const response = await fetch(`${supabaseBase()}/rest/v1/rpc/save_product_data`, {
    method: "POST",
    headers: restHeaders(PURINA_PRODUCT_IMPORT_SERVICE_KEY),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    return { status: "failed", reason: await response.text(), httpStatus: response.status, rpc: "save_product_data" };
  }
  if (!verifyWrites) return { status: "accepted", rpc: "save_product_data" };
  const verify = await fetch(
    `${supabaseBase()}/rest/v1/product_data?cache_key=eq.${encodeURIComponent(target.cacheKey)}&select=cache_key,ingredient_count,source`,
    { headers: restHeaders(PURINA_PRODUCT_IMPORT_SERVICE_KEY) },
  );
  if (!verify.ok) return { status: "unverified", reason: await verify.text(), httpStatus: verify.status, rpc: "save_product_data" };
  const rows = await verify.json();
  const row = rows[0];
  if (!row || Number(row.ingredient_count || 0) < 5) {
    return { status: "unverified", reason: "missing_verified_product_data", rpc: "save_product_data" };
  }
  return { status: "verified_saved", rpc: "save_product_data" };
}

async function processWrites(targets) {
  const verifiedKeys = loadVerifiedReportKeys();
  const selected = targets
    .filter((target) => !verifiedKeys.has(target.cacheKey))
    .slice(0, limit > 0 ? limit : undefined);
  let nextIndex = 0;
  let verified = 0;
  let accepted = 0;
  let failed = 0;
  async function worker() {
    while (nextIndex < selected.length) {
      const index = nextIndex++;
      const target = selected[index];
      const result = await writeTarget(target);
      appendReport({
        event: "purina_official_product_result",
        status: result.status,
        reason: result.reason,
        http_status: result.httpStatus,
        rpc: result.rpc,
        cache_key: target.cacheKey,
        product_name: target.name,
        brand: target.brand,
        source_url: target.sourceUrl,
      });
      if (result.status === "verified_saved") verified += 1;
      else if (result.status === "accepted") accepted += 1;
      else failed += 1;
      console.log(`[${index + 1}/${selected.length}] ${target.petType} ${target.brand} ${target.name.slice(0, 70)} ... ${result.status}${result.reason ? ` ${result.reason}` : ""}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, () => worker()));
  return { selected: selected.length, verified, accepted, failed, resumeSkipped: verifiedKeys.size };
}

async function main() {
  assertConfig();
  const inputTargets = loadInputTargets();
  const existing = includeExisting ? new Set() : await fetchExistingCacheKeys();
  const planned = inputTargets.filter((target) => includeExisting || !existing.has(target.cacheKey));
  const parsed = [];
  const skipped = { existing: inputTargets.length - planned.length, invalid: 0, parse: 0 };
  const skippedDetails = inputTargets
    .filter((target) => !includeExisting && existing.has(target.cacheKey))
    .map((target) => ({
      name: target.name,
      brand: target.brand,
      sourceUrl: target.sourceUrl,
      cacheKey: target.cacheKey,
      reason: "existing_product_data",
    }));
  for (const target of planned) {
    if (limit > 0 && parsed.length >= limit && dryRun) break;
    await sleep(delayMs);
    let result;
    try {
      result = await parseTarget(target);
    } catch (error) {
      skipped.parse += 1;
      skippedDetails.push({
        name: target.name,
        brand: target.brand,
        sourceUrl: target.sourceUrl,
        cacheKey: target.cacheKey,
        reason: "fetch_or_parse_error",
        error: String(error?.message || error).slice(0, 500),
      });
      console.warn(`Skipped Purina target: ${target.brand} ${target.name} (${error?.message || error})`);
      continue;
    }
    if (!result.target) {
      skipped.parse += 1;
      skippedDetails.push({
        name: target.name,
        brand: target.brand,
        sourceUrl: target.sourceUrl,
        cacheKey: target.cacheKey,
        reason: result.reason || "missing_parsed_target",
      });
      continue;
    }
    parsed.push(result.target);
  }
  ensureUniqueCacheKeys(parsed);
  exportParsed(parsed, {
    inputCount: inputTargets.length,
    parsedCount: parsed.length,
    skipped,
    skippedDetails,
    dryRun,
  });
  console.log(`Purina official input targets: ${inputTargets.length}`);
  console.log(`Existing Purina keys skipped: ${skipped.existing}`);
  console.log(`Parsed official product rows: ${parsed.length}`);
  console.log(`Skipped: ${JSON.stringify(skipped)}`);
  console.log(`Exported parsed rows: ${exportParsedPath}`);
  if (dryRun) return;
  const writeSummary = await processWrites(parsed);
  console.log(`Write summary: ${JSON.stringify(writeSummary)}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
