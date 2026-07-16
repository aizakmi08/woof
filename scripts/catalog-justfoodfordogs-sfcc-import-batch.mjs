import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { safeFetchText } from "./catalog-safe-fetch.mjs";

const PAGE_FEED_EXTRACT_SCRIPT = "scripts/catalog-page-feed-extract.mjs";
const OFFICIAL_FEED_IMPORT_SCRIPT = "scripts/catalog-official-feed-import.mjs";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-source-imports/justfoodfordogs";
const DEFAULT_SOURCE = "justfoodfordogs";
const DEFAULT_BRAND = "JustFoodForDogs";
const DEFAULT_BASE_URL = "https://www.justfoodfordogs.com/";
const DEFAULT_SQL_CHUNK_SIZE = 25;
const DEFAULT_FETCH_DELAY_MS = 500;
const DEFAULT_SEARCH_PAGE_SIZE = 96;
const DEFAULT_MAX_SEARCH_PAGES = 2;
const DEFAULT_MAX_URLS = 120;
const DEFAULT_SEARCH_TERMS = [
  "dog food",
  "fresh dog food",
  "frozen",
  "pantry",
  "chicken",
  "beef",
  "turkey",
  "fish",
  "pork",
  "cat food",
  "sensitive",
  "healthy weight",
  "renal",
  "support",
  "justfresh",
];
const KNOWN_DIRECT_PRODUCT_URLS = [
  "https://www.justfoodfordogs.com/product/beef-russet-potato-recipe/FBS10040101.html",
  "https://www.justfoodfordogs.com/product/chicken-rice-recipe/FBS10040102.html",
  "https://www.justfoodfordogs.com/product/fish-sweet-potato-recipe/FBS10040103.html",
  "https://www.justfoodfordogs.com/product/turkey-whole-wheat-macaroni-recipe/FBS10040105.html",
];
const NON_SINGLE_FORMULA_PATH_PATTERNS = [
  /\b(?:bundle|bundles|variety|sampler|best-sellers|favorites|pack---|treat|treats|chews|omega-oil|dog-hip-joint|10-in-1)\b/i,
  /\b(?:do-it-yourself|diy-|nutrient-blend|justfresh-boost|boost-)\b/i,
];

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function getArgs(name) {
  const values = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue;
    const value = process.argv[index + 1];
    if (value && !value.startsWith("--")) {
      values.push(value);
      index += 1;
    }
  }
  return values;
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function sleep(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function normalizeUrl(value, baseUrl = DEFAULT_BASE_URL) {
  const text = compact(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;[\s\S]*$/i, "")
    .replace(/[),.;]+$/g, "");
  if (!text || /^data:/i.test(text)) return "";
  try {
    const url = new URL(text, baseUrl);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function isSingleFormulaProductUrl(url) {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)justfoodfordogs\.com$/i.test(parsed.hostname)) return false;
    if (!/^\/product\/[^/]+\/[^/]+\.html$/i.test(parsed.pathname)) return false;
    return !NON_SINGLE_FORMULA_PATH_PATTERNS.some((pattern) => pattern.test(parsed.pathname));
  } catch {
    return false;
  }
}

function uniqueUrls(values) {
  const seen = new Set();
  const urls = [];
  for (const value of values) {
    const url = normalizeUrl(value);
    if (!url || seen.has(url) || !isSingleFormulaProductUrl(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function searchGridUrl(term, start, size) {
  const url = new URL("/on/demandware.store/Sites-JustFoodForDogs-Site/en_US/Search-UpdateGrid", DEFAULT_BASE_URL);
  url.searchParams.set("q", term);
  url.searchParams.set("start", String(start));
  url.searchParams.set("sz", String(size));
  return url.toString();
}

function extractProductUrls(html) {
  return uniqueUrls([
    ...[...String(html || "").matchAll(/https:\/\/www\.justfoodfordogs\.com\/product\/[^"'<>\s]+/gi)].map((match) => match[0]),
    ...[...String(html || "").matchAll(/href=["'](\/product\/[^"']+)["']/gi)].map(([, value]) => value),
  ]);
}

function runNode(script, args, { timeoutMs = 180_000 } = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    timeout: timeoutMs,
  });
  if (result.status !== 0) {
    throw new Error([
      `${script} failed with status ${result.status}`,
      result.error?.message,
      result.stderr,
      result.stdout,
    ].filter(Boolean).join("\n"));
  }
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

async function discoverUrls({ outputDir, maxUrls, fetchDelayMs, searchPageSize, maxSearchPages, searchTerms }) {
  const rawCacheDir = path.join(outputDir, "raw", "discovery");
  const discovered = [...KNOWN_DIRECT_PRODUCT_URLS];

  for (const term of searchTerms) {
    for (let page = 0; page < maxSearchPages; page += 1) {
      const url = searchGridUrl(term, page * searchPageSize, searchPageSize);
      const { body } = await safeFetchText(url, {
        userAgent: "WoofCatalogVerifier/1.0 (JustFoodForDogs official SFCC import)",
        accept: "text/html,application/xhtml+xml",
        cacheDir: rawCacheDir,
      });
      const urls = extractProductUrls(body);
      discovered.push(...urls);
      if (urls.length === 0) break;
      if (uniqueUrls(discovered).length >= maxUrls) break;
      await sleep(fetchDelayMs);
    }
    if (uniqueUrls(discovered).length >= maxUrls) break;
  }

  return uniqueUrls(discovered).slice(0, maxUrls);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        field += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((csvRow) => csvRow.some((value) => compact(value)));
}

function feedSummary(csvText) {
  const rows = parseCsv(csvText);
  const header = rows[0] || [];
  const dataRows = rows.slice(1);
  const completeIndex = header.indexOf("is_complete_food");
  const ingredientIndex = header.indexOf("ingredient_statement");
  const imageIndex = header.indexOf("product_image_url");
  return {
    rows: dataRows.length,
    complete_food_rows: dataRows.filter((row) => row[completeIndex] === "true").length,
    rows_with_ingredients: dataRows.filter((row) => compact(row[ingredientIndex])).length,
    rows_with_images: dataRows.filter((row) => compact(row[imageIndex])).length,
  };
}

async function main() {
  const outputDir = compact(getArg("--output-dir")) || DEFAULT_OUTPUT_DIR;
  const source = compact(getArg("--source")) || DEFAULT_SOURCE;
  const brand = compact(getArg("--brand")) || DEFAULT_BRAND;
  const maxUrls = positiveInteger(getArg("--max-urls") || getArg("--url-limit"), DEFAULT_MAX_URLS);
  const sqlChunkSize = positiveInteger(getArg("--sql-chunk-size"), DEFAULT_SQL_CHUNK_SIZE);
  const fetchDelayMs = nonNegativeInteger(getArg("--fetch-delay-ms"), DEFAULT_FETCH_DELAY_MS);
  const searchPageSize = positiveInteger(getArg("--search-page-size"), DEFAULT_SEARCH_PAGE_SIZE);
  const maxSearchPages = positiveInteger(getArg("--max-search-pages"), DEFAULT_MAX_SEARCH_PAGES);
  const searchTerms = getArgs("--search-term");
  const terms = searchTerms.length > 0 ? searchTerms : DEFAULT_SEARCH_TERMS;

  fs.mkdirSync(outputDir, { recursive: true });
  const urlListPath = path.join(outputDir, "urls.txt");
  const feedPath = path.join(outputDir, "feed.csv");
  const sqlDir = path.join(outputDir, "sql");
  const reportPath = path.join(outputDir, "report.json");
  const rawCacheDir = path.join(outputDir, "raw");

  const urls = await discoverUrls({
    outputDir,
    maxUrls,
    fetchDelayMs,
    searchPageSize,
    maxSearchPages,
    searchTerms: terms,
  });
  fs.writeFileSync(urlListPath, `${urls.join("\n")}\n`, "utf8");
  if (urls.length === 0) throw new Error("JustFoodForDogs discovery produced zero product URLs.");

  const pageExtract = runNode(PAGE_FEED_EXTRACT_SCRIPT, [
    "--file", urlListPath,
    "--brand", brand,
    "--continue-on-error",
    "--raw-cache-dir", rawCacheDir,
  ], { timeoutMs: 360_000 });
  fs.writeFileSync(feedPath, pageExtract.stdout, "utf8");

  const importResult = runNode(OFFICIAL_FEED_IMPORT_SCRIPT, [
    "--file", feedPath,
    "--source", source,
    "--source-quality", "manufacturer",
    "--ingredient-verification", "manufacturer",
    "--image-verification", "manufacturer",
    "--expected-brand", brand,
    "--required-source-url-pattern", "^https://www\\.justfoodfordogs\\.com/product/",
    "--emit-sql-rpc",
    "--emit-sql-dir", sqlDir,
    "--sql-chunk-size", String(sqlChunkSize),
    "--sql-payload-format", "base64",
  ], { timeoutMs: 120_000 });

  const report = {
    generated_at: new Date().toISOString(),
    brand,
    source,
    source_quality: "manufacturer",
    ingredient_verification: "manufacturer",
    image_verification: "manufacturer",
    official_api: "Salesforce Commerce Cloud Search-UpdateGrid + official product pages",
    search_terms: terms,
    max_urls: maxUrls,
    search_page_size: searchPageSize,
    max_search_pages: maxSearchPages,
    fetch_delay_ms: fetchDelayMs,
    prepared_urls: urls.length,
    url_list_path: urlListPath,
    feed_path: feedPath,
    sql_dir: sqlDir,
    raw_cache_dir: rawCacheDir,
    feed: feedSummary(pageExtract.stdout),
    extraction_warnings: compact(pageExtract.stderr),
    import_output: compact(importResult.stdout),
    import_warnings: compact(importResult.stderr),
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`JustFoodForDogs import batch prepared: ${source}`);
  console.log(`URLs: ${urlListPath}`);
  console.log(`Feed: ${feedPath}`);
  console.log(`SQL chunks: ${sqlDir}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Rows: ${report.feed.rows} (${report.feed.complete_food_rows} complete, ${report.feed.rows_with_ingredients} with ingredients)`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
