#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const HALO_PRODUCT_IMPORT_SERVICE_KEY =
  process.env.HALO_PRODUCT_IMPORT_SERVICE_KEY ||
  process.env.PRODUCT_LOOKUP_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";
const DEFAULT_INPUT = ".tmp/halo-shopify-catalog-targets.json";
const DEFAULT_EXPORT_PARSED = ".tmp/halo-official-product-data.json";
const DEFAULT_REPORT = ".tmp/halo-official-product-backfill-report.jsonl";
const USER_AGENT = "Mozilla/5.0 Woof official Halo product import";
const MAX_CONCURRENCY = 4;

const dryRun = process.argv.includes("--dry-run");
const includeExisting = process.argv.includes("--include-existing");
const verifyWrites = !process.argv.includes("--no-verify-writes");
const inputArg = process.argv.find((arg) => arg.startsWith("--input="));
const exportParsedArg = process.argv.find((arg) => arg.startsWith("--export-parsed="));
const reportArg = process.argv.find((arg) => arg.startsWith("--report="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const delayArg = process.argv.find((arg) => arg.startsWith("--delay-ms="));
const concurrencyArg = process.argv.find((arg) => arg.startsWith("--concurrency="));
const resumeReport = process.argv.includes("--resume-report");
const inputPath = path.resolve(root, inputArg ? inputArg.split("=")[1] : DEFAULT_INPUT);
const exportParsedPath = exportParsedArg ? path.resolve(root, exportParsedArg.split("=")[1]) : path.resolve(root, DEFAULT_EXPORT_PARSED);
const reportPath = reportArg ? path.resolve(root, reportArg.split("=")[1]) : path.resolve(root, DEFAULT_REPORT);
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const delayMs = delayArg ? Number(delayArg.split("=")[1]) : 75;
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

function usage(message) {
  if (message) console.error(message);
  console.error(`
Usage:
  npm run backfill:halo-official-products -- --dry-run
  HALO_PRODUCT_IMPORT_SERVICE_KEY=... npm run backfill:halo-official-products

Options:
  --input=path.json           Halo catalog target manifest (default ${DEFAULT_INPUT})
  --dry-run                   Parse and export official data without writing
  --export-parsed=path.json   Write parsed official product-data manifest (default ${DEFAULT_EXPORT_PARSED})
  --report=path.jsonl         Append per-product write results (default ${DEFAULT_REPORT})
  --resume-report             Skip cache keys already verified in report
  --limit=N                   Process at most N parsed products (default 0, no limit)
  --delay-ms=N                Delay between official page requests (default 75)
  --concurrency=N             Parallel service-key writes, 1-${MAX_CONCURRENCY} (default 1)
  --include-existing          Parse/write rows even if product_data already has a planned key
  --no-verify-writes          Skip product_data readback verification after RPC success
`);
  process.exit(message ? 1 : 0);
}

function assertConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) usage("Set SUPABASE_URL and SUPABASE_ANON_KEY in .env.");
  if (!fs.existsSync(inputPath)) usage(`Missing Halo input manifest: ${path.relative(root, inputPath)}`);
  if (!dryRun && !HALO_PRODUCT_IMPORT_SERVICE_KEY) {
    usage("Set HALO_PRODUCT_IMPORT_SERVICE_KEY, PRODUCT_LOOKUP_SERVICE_KEY, or Supabase service key for official Halo product writes.");
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
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " "));
}

function stripInlineTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, ""));
}

function normalizeText(value) {
  return decodeHtml(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bw\/\b/g, " with ")
    .replace(/[&+/'’™®]/g, " ")
    .replace(/[-_,:%]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCacheKey(text) {
  return normalizeText(text)
    .replace(/\b(dog food|cat food|formula|recipe|food for dogs|food for cats)\b/g, " ")
    .replace(/\b\d+(\s+)?(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|can|cans|bag|bags|case|pack|pk|ct|count|tray|pouch|box)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanUrl(value) {
  const url = decodeHtml(value).split("#")[0].replace(/\/$/, "");
  if (!/^https:\/\/halopets\.com\/products\/[^/?#]+$/i.test(url)) return "";
  return url.slice(0, 500);
}

function normalizeTarget(entry) {
  const sourceUrl = cleanUrl(entry?.sourceUrl || entry?.source_url);
  const name = String(entry?.name || entry?.productName || entry?.product_name || "").trim();
  const brand = String(entry?.brand || "Halo").trim() || "Halo";
  const cacheKey = normalizeCacheKey(entry?.cacheKey || entry?.cache_key || `${brand} ${name}`);
  const petType = String(entry?.petType || entry?.pet_type || "").trim().toLowerCase();
  if (!sourceUrl || !name || !cacheKey || !["dog", "cat"].includes(petType)) return null;
  return {
    name,
    brand,
    cacheKey,
    petType,
    form: String(entry?.form || "").trim(),
    sourceUrl,
    imageUrl: String(entry?.imageUrl || entry?.image_url || "").trim().slice(0, 500),
    sourceQuality: String(entry?.sourceQuality || entry?.source_quality || "").trim(),
  };
}

function loadInputTargets() {
  const parsed = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const entries = Array.isArray(parsed) ? parsed : parsed?.targets;
  if (!Array.isArray(entries)) usage("--input JSON must be an array or an object with a targets array.");
  return entries.map(normalizeTarget).filter(Boolean);
}

function splitIngredients(text) {
  const cleaned = stripTags(text)
    .replace(/^ingredients?:\s*/i, "")
    .replace(/\s*\.\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  const ingredients = [];
  let current = "";
  let depth = 0;
  for (const char of cleaned) {
    if (char === "(") depth += 1;
    if (char === ")" && depth > 0) depth -= 1;
    if (char === "," && depth === 0) {
      if (current.trim()) ingredients.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) ingredients.push(current.trim());
  return ingredients
    .map((ingredient) => ingredient.replace(/\s+/g, " ").trim())
    .filter((ingredient) =>
      ingredient.length >= 2 &&
      ingredient.length <= 160 &&
      !/https?:\/\//i.test(ingredient) &&
      !/[{}<>]/.test(ingredient)
    );
}

function faqSection(html, headingPattern) {
  const normalized = String(html || "");
  const headingMatch = normalized.match(headingPattern);
  if (!headingMatch || headingMatch.index == null) return "";
  const start = headingMatch.index;
  const next = normalized.slice(start + headingMatch[0].length).search(/\n\s*<div\s+class="faqs__item\s/i);
  return next === -1
    ? normalized.slice(start)
    : normalized.slice(start, start + headingMatch[0].length + next);
}

function parseIngredientText(html) {
  const ingredientSection = faqSection(html, /Ingredient Statement/i);
  const direct = ingredientSection.match(/<div class="faqs__item-answer rte">([\s\S]*?)<\/div>/i)?.[1];
  if (direct) {
    const text = stripTags(direct);
    if (splitIngredients(text).length >= 5) return text;
  }
  const strong = String(html || "").match(/<strong>\s*Ingredients:\s*<\/strong>([\s\S]*?)<\/p>/i)?.[1];
  if (strong) return stripTags(strong);
  for (const paragraph of String(html || "").matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const compactText = stripInlineTags(paragraph[1]);
    const spacedText = stripTags(paragraph[1]);
    const ingredientText =
      compactText.match(/ingredients:\s*([\s\S]+)/i)?.[1] ||
      spacedText.match(/ingredients:\s*([\s\S]+)/i)?.[1] ||
      "";
    if (splitIngredients(ingredientText).length >= 5) return ingredientText;
  }
  return "";
}

function toNumber(value) {
  const numeric = Number(String(value || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(numeric) ? numeric : null;
}

function assignNutrient(panel, label, value) {
  const normalized = normalizeText(label);
  const numeric = toNumber(value);
  if (numeric == null) return;
  if (/crude protein/.test(normalized)) panel.protein_pct = numeric;
  else if (/crude fat/.test(normalized)) panel.fat_pct = numeric;
  else if (/crude fiber/.test(normalized)) panel.fiber_pct = numeric;
  else if (/moisture/.test(normalized)) panel.moisture_pct = numeric;
  else if (/ash/.test(normalized)) panel.ash_pct = numeric;
  else if (/calcium/.test(normalized)) panel.calcium_pct = numeric;
  else if (/phosphorus/.test(normalized)) panel.phosphorus_pct = numeric;
  else if (/omega 3/.test(normalized)) panel.omega_3_pct = numeric;
  else if (/omega 6/.test(normalized)) panel.omega_6_pct = numeric;
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
  return numericCount >= 2 ? clean : null;
}

function parseNutrientPanel(html, sourceUrl) {
  const section = faqSection(html, /What is the nutrient breakdown\?/i) || faqSection(html, /Guaranteed Analysis/i);
  if (!section) return null;
  const panel = { basis: "as-fed", source_url: sourceUrl };
  for (const row of section.matchAll(/<tr\b[^>]*>\s*<td\b[^>]*>([\s\S]*?)<\/td>\s*<td\b[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi)) {
    assignNutrient(panel, stripTags(row[1]), stripTags(row[2]));
  }
  const text = stripTags(section);
  const kg = text.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*(?:ME\s*)?\/\s*kg/i);
  if (kg) panel.calories_per_kg = toNumber(kg[1]);
  const cup = text.match(/([\d,]+(?:\.\d+)?)\s*kcal\s*\/\s*cup/i);
  if (cup) panel.calories_per_cup = toNumber(cup[1]);
  return normalizePanel(panel);
}

async function fetchText(url, attempt = 1) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    },
  });
  if (response.status === 429 || response.status >= 500) {
    if (attempt >= 3) throw new Error(`Halo official page fetch failed ${response.status}: ${url}`);
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 500 * attempt);
    return fetchText(url, attempt + 1);
  }
  if (!response.ok) throw new Error(`Halo official page fetch failed ${response.status}: ${url}`);
  return response.text();
}

async function fetchExistingCacheKeys() {
  const keys = new Set();
  const base = `${supabaseBase()}/rest/v1/product_data`;
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const url = `${base}?select=cache_key,product_name,brand&brand=ilike.Halo*&offset=${offset}&limit=${pageSize}`;
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
  const html = await fetchText(target.sourceUrl);
  const ingredientText = parseIngredientText(html);
  const ingredients = splitIngredients(ingredientText);
  if (ingredients.length < 5) {
    return { target: null, reason: "missing_or_sparse_ingredients", sourceUrl: target.sourceUrl };
  }
  const nutrientPanel = parseNutrientPanel(html, target.sourceUrl);
  return {
    target: {
      ...target,
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
      source: "halo_official_product_data",
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
      if (entry?.event === "halo_official_product_result" && entry?.status === "verified_saved" && entry?.cache_key) {
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
    headers: restHeaders(HALO_PRODUCT_IMPORT_SERVICE_KEY),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    return { status: "failed", reason: await response.text(), httpStatus: response.status, rpc };
  }
  if (!verifyWrites) return { status: "accepted", rpc };
  const verify = await fetch(
    `${supabaseBase()}/rest/v1/product_data?cache_key=eq.${encodeURIComponent(target.cacheKey)}&select=cache_key,ingredient_count,source,has_published_nutrients`,
    { headers: restHeaders(HALO_PRODUCT_IMPORT_SERVICE_KEY) },
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
        event: "halo_official_product_result",
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
  for (const target of planned) {
    if (limit > 0 && parsed.length >= limit && dryRun) break;
    await sleep(delayMs);
    const result = await parseTarget(target);
    if (!result.target) {
      skipped.parse += 1;
      continue;
    }
    parsed.push(result.target);
  }
  exportParsed(parsed, {
    inputCount: inputTargets.length,
    parsedCount: parsed.length,
    skipped,
    dryRun,
  });
  console.log(`Halo official input targets: ${inputTargets.length}`);
  console.log(`Existing Halo keys skipped: ${skipped.existing}`);
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
