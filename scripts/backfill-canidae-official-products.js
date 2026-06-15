#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const CANIDAE_PRODUCT_IMPORT_SERVICE_KEY =
  process.env.CANIDAE_PRODUCT_IMPORT_SERVICE_KEY ||
  process.env.PRODUCT_LOOKUP_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";
const DEFAULT_INPUT = ".tmp/canidae-sitemap-catalog-targets.json";
const DEFAULT_EXPORT_PARSED = ".tmp/canidae-official-product-data.json";
const DEFAULT_REPORT = ".tmp/canidae-official-product-backfill-report.jsonl";
const USER_AGENT = "Mozilla/5.0 Woof official Canidae product import";
const BRAND = "Canidae";
const MAX_CONCURRENCY = 4;

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
const inputPath = path.resolve(root, inputArg ? inputArg.split("=")[1] : DEFAULT_INPUT);
const exportParsedPath = exportParsedArg ? path.resolve(root, exportParsedArg.split("=")[1]) : path.resolve(root, DEFAULT_EXPORT_PARSED);
const reportPath = reportArg ? path.resolve(root, reportArg.split("=")[1]) : path.resolve(root, DEFAULT_REPORT);
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const delayMs = delayArg ? Number(delayArg.split("=")[1]) : 200;
const concurrency = concurrencyArg ? Number(concurrencyArg.split("=")[1]) : 1;

const PANEL_FIELDS = new Set([
  "basis",
  "source_url",
  "protein_pct",
  "fat_pct",
  "fiber_pct",
  "moisture_pct",
  "ash_pct",
  "calcium_pct",
  "phosphorus_pct",
  "omega_3_pct",
  "omega_6_pct",
  "calories_per_cup",
  "calories_per_kg",
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
  npm run backfill:canidae-official-products -- --dry-run
  CANIDAE_PRODUCT_IMPORT_SERVICE_KEY=... npm run backfill:canidae-official-products

Options:
  --input=path.json           Canidae catalog target manifest (default ${DEFAULT_INPUT})
  --dry-run                   Parse and export official data without writing
  --export-parsed=path.json   Write parsed official product-data manifest (default ${DEFAULT_EXPORT_PARSED})
  --report=path.jsonl         Append per-product write results (default ${DEFAULT_REPORT})
  --resume-report             Skip cache keys already verified in report
  --limit=N                   Process at most N parsed products (default 0, no limit)
  --delay-ms=N                Delay between official page requests (default 200)
  --concurrency=N             Parallel service-key writes, 1-${MAX_CONCURRENCY} (default 1)
  --include-existing          Parse/write rows even if product_data already has a planned key
  --no-verify-writes          Skip product_data readback verification after RPC success
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  if (!fs.existsSync(inputPath)) usage(`Missing Canidae input manifest: ${path.relative(root, inputPath)}`);
  if (!dryRun && !CANIDAE_PRODUCT_IMPORT_SERVICE_KEY) {
    usage("Set CANIDAE_PRODUCT_IMPORT_SERVICE_KEY, PRODUCT_LOOKUP_SERVICE_KEY, or Supabase service key for official Canidae product writes.");
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
    .replace(/<[^>]*>/g, " "));
}

function normalizeText(value) {
  return asciiFold(value)
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[''™®]/g, " ")
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

function cleanUrl(value) {
  const url = decodeHtml(value).split("#")[0].replace(/\/$/, "");
  if (!/^https:\/\/canidae\.com\/[a-z0-9-]+$/i.test(url)) return "";
  return url.slice(0, 500);
}

function cleanProductName(value) {
  return decodeHtml(value)
    .replace(/™|®|©/g, "")
    .replace(/\s+\|\s+Canidae.*$/i, "")
    .replace(/\s+[-—]\s+Case\s+of\s+\d+\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function inferForm(sourceUrl, fallback = "") {
  const text = normalizeText(`${sourceUrl} ${fallback}`);
  if (/\b(wet|can|canned|pate|minced|morsels|stew|tray|balanced bowl)\b/.test(text)) return "wet";
  if (/\b(dry|kibble|all life stages|pure|goodness|under the sun|ancient grains|wholesome grains)\b/.test(text)) return "dry";
  return "";
}

function normalizeTarget(entry) {
  const sourceUrl = cleanUrl(entry?.sourceUrl || entry?.source_url);
  const name = cleanProductName(entry?.name || entry?.productName || entry?.product_name || "");
  const brand = cleanProductName(entry?.brand || BRAND) || BRAND;
  const cacheKey = normalizeCacheKey(entry?.cacheKey || entry?.cache_key || `${brand} ${name}`);
  const petType = String(entry?.petType || entry?.pet_type || "").trim().toLowerCase();
  if (!sourceUrl || !name || !cacheKey || !["dog", "cat"].includes(petType)) return null;
  return {
    name,
    brand,
    cacheKey,
    petType,
    form: String(entry?.form || inferForm(sourceUrl, name)).trim(),
    sourceUrl,
    imageUrl: String(entry?.imageUrl || entry?.image_url || "").trim().slice(0, 500),
    sourceQuality: String(entry?.sourceQuality || entry?.source_quality || "").trim(),
  };
}

function isMultiPack(target) {
  return /\b(multipack|variety\s+pack|case\s+of)\b/i.test(`${target.name} ${target.sourceUrl} ${target.cacheKey}`);
}

function loadInputTargets() {
  const parsed = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const entries = Array.isArray(parsed) ? parsed : parsed?.targets;
  if (!Array.isArray(entries)) usage("--input JSON must be an array or an object with a targets array.");
  return entries.map(normalizeTarget).filter(Boolean);
}

function productIdFromHtml(html) {
  return String(html || "").match(/window\.stencilBootstrap\("product",\s*"\\?\{\\?"productId\\?":(\d+)/)?.[1] || "";
}

function jsonLdProduct(html) {
  for (const match of String(html || "").matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed?.["@type"] === "Product") return parsed;
    } catch {
      // Keep looking for another JSON-LD block.
    }
  }
  return {};
}

function parseOfficialProductName(html, fallback) {
  const product = jsonLdProduct(html);
  const title = String(html || "").match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "";
  return cleanProductName(product.name || stripTags(title) || fallback);
}

function parseImageUrl(html) {
  const product = jsonLdProduct(html);
  const raw =
    product.image ||
    String(html || "").match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1] ||
    "";
  const decoded = decodeHtml(Array.isArray(raw) ? raw[0] : raw);
  if (decoded.startsWith("//")) return `https:${decoded}`.slice(0, 500);
  if (decoded.startsWith("/")) return `https://canidae.com${decoded}`.slice(0, 500);
  return /^https:\/\//i.test(decoded) ? decoded.slice(0, 500) : "";
}

function titleCaseIngredientSlug(value) {
  const acronyms = new Set(["dl", "l", "d", "dha", "epa", "hcl", "d3", "b12"]);
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((part) => {
      const lower = part.toLowerCase();
      if (acronyms.has(lower)) return lower.toUpperCase();
      return lower.replace(/^[a-z]/, (letter) => letter.toUpperCase());
    })
    .join(" ")
    .replace(/\bDl\b/g, "DL")
    .replace(/\bDha\b/g, "DHA")
    .replace(/\bEpa\b/g, "EPA")
    .replace(/\bHcl\b/g, "HCl")
    .replace(/\bD3\b/g, "D3")
    .replace(/\bB12\b/g, "B12")
    .replace(/\bD Calcium\b/g, "d-Calcium")
    .replace(/\bL Ascorbyl\b/g, "L-Ascorbyl")
    .replace(/\bL Carnitine\b/g, "L-Carnitine")
    .replace(/\bD Alpha\b/g, "d-Alpha");
}

function parseIngredients(productJson) {
  const raw = Array.isArray(productJson?.["full-ingredients"]) ? productJson["full-ingredients"] : [];
  return raw
    .map((ingredient) => titleCaseIngredientSlug(ingredient))
    .filter((ingredient) =>
      ingredient.length >= 2 &&
      ingredient.length <= 700 &&
      !/^[A-Z]\d{4,}$/i.test(ingredient) &&
      !/https?:|<|>|\{|\}/i.test(ingredient)
    );
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

function normalizePanel(panel) {
  const clean = { basis: "as-fed" };
  for (const [key, value] of Object.entries(panel || {})) {
    if (!PANEL_FIELDS.has(key) || key === "basis") continue;
    if (key === "source_url") {
      clean.source_url = cleanUrl(value) || undefined;
      continue;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    if (key.startsWith("calories_")) {
      if (numeric >= 0 && numeric <= 10000) clean[key] = numeric;
    } else if (numeric >= 0 && numeric <= 100) {
      clean[key] = numeric;
    }
  }
  const numericCount = Object.keys(clean).filter((key) => key !== "basis" && key !== "source_url").length;
  return numericCount >= 2 && clean.protein_pct != null && clean.fat_pct != null ? clean : null;
}

function parseNutrientPanel(productJson, sourceUrl) {
  const panel = { basis: "as-fed", source_url: sourceUrl };
  for (const row of productJson?.["guaranteed-analysis"] || []) {
    const field = nutrientField(row?.[0]);
    const value = parsePercent(row?.[1]);
    if (field && value != null && panel[field] == null) panel[field] = value;
  }
  const calories = String(productJson?.["calorie-content"] || "");
  let match = calories.match(/ME\s*\(kcal\/kg\)\s*([\d,]+(?:\.\d+)?)/i) ||
    calories.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*\/?\s*kg/i);
  if (match) panel.calories_per_kg = Number(match[1].replace(/,/g, ""));
  match = calories.match(/ME\s*\(kcal\/cup\)\s*([\d,]+(?:\.\d+)?)/i) ||
    calories.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*\/?\s*cup/i);
  if (match) panel.calories_per_cup = Number(match[1].replace(/,/g, ""));
  return normalizePanel(panel);
}

async function fetchText(url, accept = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", attempt = 1) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: accept,
    },
  });
  if (response.status === 429 || response.status >= 500) {
    if (attempt >= 5) throw new Error(`Canidae official fetch failed ${response.status}: ${url}`);
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000 * attempt * attempt);
    return fetchText(url, accept, attempt + 1);
  }
  if (!response.ok) throw new Error(`Canidae official fetch failed ${response.status}: ${url}`);
  return response.text();
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url, "application/json,*/*;q=0.8"));
}

async function fetchExistingCacheKeys() {
  const keys = new Set();
  const base = `${supabaseBase()}/rest/v1/product_data`;
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const url = `${base}?select=cache_key,product_name,brand&or=(brand.ilike.*Canidae*,product_name.ilike.*Canidae*,cache_key.ilike.*canidae*)&offset=${offset}&limit=${pageSize}`;
    const response = await fetch(url, { headers: restHeaders() });
    if (!response.ok) throw new Error(`product_data read failed ${response.status}: ${await response.text()}`);
    const rows = await response.json();
    for (const row of rows) {
      if (row?.cache_key) keys.add(String(row.cache_key).trim());
      const alias = normalizeCacheKey(`${row?.brand || ""} ${row?.product_name || ""}`);
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
  const html = await fetchText(target.sourceUrl);
  const productId = productIdFromHtml(html);
  if (!productId) return { target: null, reason: "missing_product_id", sourceUrl: target.sourceUrl };
  const productJsonUrl = `https://cdn11.bigcommerce.com/s-lnkn0tcvqc/content/pdp/products/${productId}.json`;
  const productJson = await fetchJson(productJsonUrl);
  const ingredients = parseIngredients(productJson);
  if (ingredients.length < 5) {
    return { target: null, reason: "missing_or_sparse_ingredients", sourceUrl: target.sourceUrl };
  }
  const officialProductName = parseOfficialProductName(html, target.name) || target.name;
  const nutrientPanel = parseNutrientPanel(productJson, target.sourceUrl);
  const imageUrl = target.imageUrl || parseImageUrl(html);
  return {
    target: {
      ...target,
      name: officialProductName,
      form: target.form || inferForm(target.sourceUrl, officialProductName),
      imageUrl,
      officialProductName,
      productJsonUrl,
      ingredients,
      ingredientText: ingredients.join(", "),
      ingredientCount: ingredients.length,
      nutrientPanel,
      source: "brand_site",
    },
    reason: null,
  };
}

function summarizeParsed(targets) {
  const byPetType = new Map();
  const byForm = new Map();
  let withNutrients = 0;
  let withCalories = 0;
  for (const target of targets) {
    byPetType.set(target.petType, (byPetType.get(target.petType) || 0) + 1);
    byForm.set(target.form || "unknown", (byForm.get(target.form || "unknown") || 0) + 1);
    if (target.nutrientPanel) {
      withNutrients += 1;
      if (target.nutrientPanel.calories_per_cup != null || target.nutrientPanel.calories_per_kg != null) withCalories += 1;
    }
  }
  const summarizeMap = (map, keyName) => [...map.entries()]
    .map(([key, count]) => ({ [keyName]: key, count }))
    .sort((a, b) => b.count - a.count || String(a[keyName]).localeCompare(String(b[keyName])));
  return {
    byPetType: summarizeMap(byPetType, "petType"),
    byForm: summarizeMap(byForm, "form"),
    withNutrients,
    withCalories,
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
      source: "canidae_official_product_data",
      input: path.relative(root, inputPath),
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
      if (entry?.event === "canidae_official_product_result" && entry?.status === "verified_saved" && entry?.cache_key) {
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
  const rpc = target.nutrientPanel ? "save_product_data_with_nutrients" : "save_product_data";
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
  if (target.nutrientPanel) body.p_nutrient_panel = target.nutrientPanel;
  const response = await fetch(`${supabaseBase()}/rest/v1/rpc/${rpc}`, {
    method: "POST",
    headers: restHeaders(CANIDAE_PRODUCT_IMPORT_SERVICE_KEY),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    return { status: "failed", reason: await response.text(), httpStatus: response.status, rpc };
  }
  if (!verifyWrites) return { status: "accepted", rpc };
  const verify = await fetch(
    `${supabaseBase()}/rest/v1/product_data?cache_key=eq.${encodeURIComponent(target.cacheKey)}&select=cache_key,ingredient_count,source,has_published_nutrients`,
    { headers: restHeaders(CANIDAE_PRODUCT_IMPORT_SERVICE_KEY) },
  );
  if (!verify.ok) return { status: "unverified", reason: await verify.text(), httpStatus: verify.status, rpc };
  const rows = await verify.json();
  const row = rows[0];
  if (!row || Number(row.ingredient_count || 0) < 5) return { status: "unverified", reason: "missing_verified_product_data", rpc };
  if (target.nutrientPanel && row.has_published_nutrients !== true) {
    return { status: "unverified", reason: "missing_verified_nutrient_panel", rpc };
  }
  return { status: "verified_saved", rpc };
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
        event: "canidae_official_product_result",
        status: result.status,
        reason: result.reason,
        http_status: result.httpStatus,
        rpc: result.rpc,
        cache_key: target.cacheKey,
        product_name: target.name,
        source_url: target.sourceUrl,
      });
      if (result.status === "verified_saved") verified += 1;
      else if (result.status === "accepted") accepted += 1;
      else failed += 1;
      console.log(`[${index + 1}/${selected.length}] ${target.petType} ${target.name.slice(0, 80)} ... ${result.status}${result.reason ? ` ${result.reason}` : ""}`);
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
        sourceUrl: target.sourceUrl,
        cacheKey: target.cacheKey,
        reason: "fetch_or_parse_error",
        error: String(error?.message || error).slice(0, 500),
      });
      console.warn(`Skipped Canidae target: ${target.name} (${error?.message || error})`);
      continue;
    }
    if (!result.target) {
      skipped.parse += 1;
      skippedDetails.push({
        name: target.name,
        sourceUrl: target.sourceUrl,
        cacheKey: target.cacheKey,
        reason: result.reason || "missing_parsed_target",
      });
      continue;
    }
    parsed.push(result.target);
  }
  exportParsed(parsed, {
    inputCount: inputTargets.length,
    parsedCount: parsed.length,
    skipped,
    skippedDetails,
    dryRun,
  });
  console.log(`Canidae official input targets: ${inputTargets.length}`);
  console.log(`Existing Canidae keys skipped: ${skipped.existing}`);
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
