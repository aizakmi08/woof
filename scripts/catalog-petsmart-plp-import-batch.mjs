import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { stripTrailingCatalogFormulaCode } from "../services/catalogIngredients.js";

const requireOptional = createRequire(import.meta.url);
const { decodeHTML } = requireOptional("entities");

const OFFICIAL_FEED_IMPORT_SCRIPT = "scripts/catalog-official-feed-import.mjs";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-source-imports/petsmart-retail-catalog-plp";
const DEFAULT_SOURCE = "petsmart-retail-catalog";
const DEFAULT_SQL_CHUNK_SIZE = 25;
const DEFAULT_FETCH_DELAY_MS = 500;
const DEFAULT_PLP_URLS = [
  "https://www.petsmart.com/dog/food/",
  "https://www.petsmart.com/dog/food/dry-food/",
  "https://www.petsmart.com/dog/food/canned-food/",
  "https://www.petsmart.com/dog/food/fresh-food/",
  "https://www.petsmart.com/dog/food/frozen-food/",
  "https://www.petsmart.com/dog/food/puppy-food/",
  "https://www.petsmart.com/dog/food/veterinary-diets/",
  "https://www.petsmart.com/cat/food-and-treats/food/",
  "https://www.petsmart.com/cat/food-and-treats/dry-food/",
  "https://www.petsmart.com/cat/food-and-treats/wet-food/",
  "https://www.petsmart.com/cat/food-and-treats/kitten-food/",
  "https://www.petsmart.com/cat/food-and-treats/veterinary-diets/",
];
const INITIAL_RESULTS_MARKER = "window[Symbol.for(\"InstantSearchInitialResults\")] = ";
const PRODUCT_URL_REGEX = /https:\/\/www\.petsmart\.com\/[^"'<>\s]+?-(\d+)\.html/g;
const NON_COMPLETE_REGEX = /\b(treat|treats|topper|toppers|mixer|mixers|broth|milk replacer|milk replacers|supplement|supplements|bisque|puree|purees|lickable|variety pack|bundle|sampler)\b/i;
const SEARCH_PROXY_URL = "https://www.petsmart.com/api/search/1/indexes/*/queries";

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

function getArg(name, fallback = null) {
  const values = getArgs(name);
  return values.length > 0 ? values[values.length - 1] : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function slug(value) {
  return compact(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeBrand(value) {
  return compact(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function brandMatchesExpected(row, expectedBrandKeys) {
  if (expectedBrandKeys.size === 0) return true;
  const brandKey = normalizeBrand(row.brand);
  const productNameKey = normalizeBrand(row.product_name);
  return [...expectedBrandKeys].some((expectedBrandKey) => (
    brandKey === expectedBrandKey
    || productNameKey === expectedBrandKey
    || productNameKey.startsWith(`${expectedBrandKey} `)
  ));
}

function csvValue(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function stripTags(value) {
  return compact(decodeHTML(String(value || "").replace(/<[^>]*>/g, " ")));
}

function textSection(html, label) {
  const labelPattern = label.replace(/\s+/g, "\\s+");
  const source = String(html || "");
  const inlinePattern = new RegExp(`<(?:b|strong)>\\s*${labelPattern}\\s*:?\\s*<\\/(?:b|strong)>\\s*([\\s\\S]*?)(?=<br\\s*\\/?>\\s*<(?:b|strong)>|<\\/p>|<p>|$)`, "i");
  const inlineMatch = source.match(inlinePattern);
  const inlineValue = inlineMatch ? stripTags(inlineMatch[1]) : "";
  if (inlineValue) return inlineValue;

  const blockPattern = new RegExp(`<p[^>]*>\\s*<(?:b|strong)>\\s*${labelPattern}\\s*:?\\s*<\\/(?:b|strong)>\\s*<\\/p>\\s*<p[^>]*>([\\s\\S]*?)<\\/p>`, "i");
  const blockMatch = source.match(blockPattern);
  return blockMatch ? stripTags(blockMatch[1]) : "";
}

function extractInitialResults(html) {
  const start = html.indexOf(INITIAL_RESULTS_MARKER);
  if (start === -1) throw new Error("PetSmart initial search payload not found.");

  const jsonStart = start + INITIAL_RESULTS_MARKER.length;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = jsonStart; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(html.slice(jsonStart, index + 1));
      }
    }
  }

  throw new Error("PetSmart initial search payload was not balanced JSON.");
}

function productUrlMapFromHtml(html) {
  const byMasterId = new Map();
  for (const match of html.matchAll(PRODUCT_URL_REGEX)) {
    const url = decodeHTML(match[0]);
    const masterProductId = compact(match[1]);
    if (!byMasterId.has(masterProductId)) byMasterId.set(masterProductId, url);
  }
  return byMasterId;
}

function categoryPath(hit = {}) {
  const categories = Array.isArray(hit.custom_category_names) ? hit.custom_category_names : [];
  const productCategory = categories
    .filter((value) => /\b(?:Dog|Cat)\s*>\s*Food/i.test(value))
    .sort((left, right) => right.length - left.length)[0];
  return compact(productCategory || hit.primary_category_name || hit.customCategory || "");
}

function productUrlFor(hit, byMasterId) {
  const masterProductId = compact(hit.masterProductID || hit.masterProductId || hit.id);
  if (masterProductId && byMasterId.has(masterProductId)) return byMasterId.get(masterProductId);

  const pet = petTypeFor(hit) || "dog";
  const category = categoryPath(hit).toLowerCase();
  const leaf = category.includes("veterinary") ? "veterinary-diets"
    : category.includes("canned") || category.includes("wet") ? "canned-food"
      : category.includes("fresh") ? "fresh-food"
        : category.includes("frozen") ? "frozen-food"
          : "dry-food";
  const catBase = pet === "cat" ? "cat/food-and-treats" : "dog/food";
  return `https://www.petsmart.com/${catBase}/${leaf}/${slug(hit.name)}-${masterProductId}.html`;
}

function petTypeFor(hit = {}) {
  const values = [
    ...(Array.isArray(hit.customPet) ? hit.customPet : []),
    ...(Array.isArray(hit["petType-pets"]) ? hit["petType-pets"] : []),
    categoryPath(hit),
    hit.name,
  ].map(compact).join(" ");
  if (/\bcat|cats|kitten|kittens|feline\b/i.test(values)) return "cat";
  if (/\bdog|dogs|puppy|puppies|canine\b/i.test(values)) return "dog";
  return "";
}

function foodFormFor(hit = {}) {
  const text = [
    hit.customCategory,
    hit.primary_category_name,
    ...(Array.isArray(hit.foodForms) ? hit.foodForms : []),
    hit.name,
  ].map(compact).join(" ");
  if (/\b(canned|can|wet|pate|pâté|stew|loaf|sauce|gravy|morsels)\b/i.test(text)) return "wet";
  if (/\b(fresh|refrigerated)\b/i.test(text)) return "fresh";
  if (/\b(frozen)\b/i.test(text)) return "frozen";
  if (/\b(freeze[-\s]?dried|air[-\s]?dried)\b/i.test(text)) return "freeze_dried";
  if (/\b(dry|kibble|bag|bags)\b/i.test(text)) return "dry";
  return compact(hit.customCategory || hit.primary_category_name || "");
}

function packageSizeFor(hit = {}) {
  const size = hit.size || {};
  return compact(
    size.solidSize
    || size.fluidSize
    || size.twoDimensionalSize
    || size.threeDimensionalSize
    || (Array.isArray(hit.foodPoundsSizeDisplays) ? hit.foodPoundsSizeDisplays[0] : "")
    || (Array.isArray(hit.foodOuncesSizeDisplays) ? hit.foodOuncesSizeDisplays[0] : "")
  );
}

function lifeStageFor(hit = {}) {
  const values = [
    ...(Array.isArray(hit.dogLifestages) ? hit.dogLifestages : []),
    ...(Array.isArray(hit.catLifestages) ? hit.catLifestages : []),
  ].map(compact).filter(Boolean);
  if (values.length > 0) return values.join(", ");
  const text = compact(hit.name);
  if (/\ball life stages?\b/i.test(text)) return "all life stages";
  if (/\bpuppy|puppies\b/i.test(text)) return "puppy";
  if (/\bkitten|kittens\b/i.test(text)) return "kitten";
  if (/\bsenior\b/i.test(text)) return "senior";
  if (/\badult\b/i.test(text)) return "adult";
  return "";
}

function flavorFor(hit = {}) {
  if (hit.flavor && typeof hit.flavor === "object") {
    return compact(hit.flavor.value || hit.flavor.displays);
  }
  return compact(hit.flavor);
}

function imageUrlFor(hit = {}) {
  const image = compact(hit.images?.large || hit.images?.small || hit.image_url || "");
  return image.replace(/\?.*$/g, "");
}

function isCompleteFood(hit = {}) {
  const leafCategory = categoryPath(hit).split(">").map(compact).filter(Boolean).pop() || "";
  const text = [
    hit.name,
    hit.customCategory,
    hit.primary_category_name,
    leafCategory,
  ].map(compact).join(" ");
  return !NON_COMPLETE_REGEX.test(text);
}

function rowFromHit({ hit, byMasterId, source }) {
  const longDescription = String(hit.long_description || "");
  const productUrl = productUrlFor(hit, byMasterId);
  const ingredientStatement = stripTrailingCatalogFormulaCode(
    textSection(longDescription, "Ingredients")
  );
  const guaranteedAnalysis = textSection(longDescription, "Guaranteed Analysis");
  const productName = stripTags(hit.name);
  const productLine = stripTags(hit.productLine || hit.product_line || hit.subBrand || "");
  const petType = petTypeFor(hit);

  return {
    cache_key: compact(hit.upc) ? `${source}:${hit.upc}` : "",
    gtin: compact(hit.upc || (Array.isArray(hit.upcList) ? hit.upcList[0] : "")),
    product_name: productName,
    brand: compact(hit.brand),
    product_line: productLine,
    flavor: flavorFor(hit),
    life_stage: lifeStageFor(hit),
    food_form: foodFormFor(hit),
    package_size: packageSizeFor(hit),
    pet_type: petType,
    ingredient_statement: ingredientStatement,
    product_image_url: imageUrlFor(hit),
    product_url: productUrl,
    ingredient_source_url: productUrl,
    image_source_url: productUrl,
    is_complete_food: isCompleteFood(hit) ? "true" : "false",
    guaranteed_analysis: guaranteedAnalysis,
    nutritional_info: JSON.stringify({
      source: "petsmart_initial_search_payload",
      master_product_id: hit.masterProductID || null,
      sku_id: hit.id || null,
      manufacturer_name: hit.manufacturerName || null,
      manufacturer_sku: hit.manufacturerSku || null,
      category_path: categoryPath(hit),
      food_category: hit.foodCategory || null,
      price: hit.price?.number ?? null,
      review_count: hit.bvReviewCount ?? null,
      average_rating: hit.bvAverageRating ?? null,
    }),
  };
}

function rowsFromHtml(html, { source }) {
  const data = extractInitialResults(html);
  const byMasterId = productUrlMapFromHtml(html);
  const rows = [];
  const seen = new Set();

  for (const resultSet of Object.values(data)) {
    for (const result of resultSet.results || []) {
      for (const hit of result.hits || []) {
        const row = rowFromHit({ hit, byMasterId, source });
        const key = compact(row.gtin) || compact(row.product_url) || compact(row.product_name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
      }
    }
  }

  return {
    rows,
    data,
    metadata: Object.fromEntries(Object.entries(data).map(([key, value]) => [
      key,
      {
        index: value?.results?.[0]?.index || null,
        page: value?.results?.[0]?.page ?? null,
        hits_per_page: value?.results?.[0]?.hitsPerPage ?? null,
        nb_hits: value?.results?.[0]?.nbHits ?? null,
        nb_pages: value?.results?.[0]?.nbPages ?? null,
      },
    ])),
  };
}

function rowsFromSearchResult(result, { byMasterId = new Map(), source }) {
  return (result.hits || []).map((hit) => rowFromHit({ hit, byMasterId, source }));
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent": "WoofCatalogBot/1.0 (+catalog evidence extraction; contact app owner)",
    },
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }
  return response.text();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSearchResultPage({ result, page, referer, delayMs }) {
  const params = new URLSearchParams(result.params || "");
  params.set("page", String(page));
  if (!params.get("hitsPerPage")) params.set("hitsPerPage", String(result.hitsPerPage || 40));

  if (delayMs > 0) await sleep(delayMs);

  const response = await fetch(SEARCH_PROXY_URL, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "referer": referer || "https://www.petsmart.com/",
      "user-agent": "WoofCatalogBot/1.0 (+catalog evidence extraction; contact app owner)",
      "x-algolia-agent": "Algolia for JavaScript; instantsearch.js; react-instantsearch",
      "x-algolia-api-key": "",
      "x-algolia-application-id": "",
      "x-petm-algolia-caller": "web:plp:instantSearch-client",
    },
    body: JSON.stringify({
      requests: [{
        indexName: result.index,
        params: params.toString(),
      }],
    }),
  });

  if (!response.ok) {
    throw new Error(`PetSmart search page ${page} failed ${response.status}: ${await response.text()}`);
  }

  const json = await response.json();
  return json.results?.[0] || null;
}

function writeCsv(rows, filePath) {
  const headers = [
    "cache_key",
    "gtin",
    "product_name",
    "brand",
    "product_line",
    "flavor",
    "life_stage",
    "food_form",
    "package_size",
    "pet_type",
    "ingredient_statement",
    "product_image_url",
    "product_url",
    "ingredient_source_url",
    "image_source_url",
    "is_complete_food",
    "guaranteed_analysis",
    "nutritional_info",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(",")),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function runNode(script, args, { timeoutMs = 120_000 } = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    maxBuffer: 200 * 1024 * 1024,
    timeout: timeoutMs,
  });
  if (result.status !== 0) {
    throw new Error([
      `${script} failed with status ${result.status}`,
      result.stderr,
      result.stdout,
      result.error?.message,
    ].filter(Boolean).join("\n"));
  }
  return result.stdout || "";
}

function usage() {
  return [
    "Usage:",
    "  node scripts/catalog-petsmart-plp-import-batch.mjs [--plp-url <url>] [--html <file>] [--paginate] [--expected-brand <brand>]",
    "",
    "The script extracts PetSmart PLP initial search hits into the verified catalog feed contract,",
    "optionally pages through PetSmart's public search proxy, then emits audited SQL via",
    "catalog-official-feed-import.mjs.",
  ].join("\n");
}

async function main() {
  if (hasArg("--help") || hasArg("-h")) {
    console.log(usage());
    return;
  }

  const outputDir = compact(getArg("--output-dir", DEFAULT_OUTPUT_DIR));
  const source = compact(getArg("--source", DEFAULT_SOURCE));
  const sqlChunkSize = positiveInteger(getArg("--sql-chunk-size"), DEFAULT_SQL_CHUNK_SIZE);
  const fetchLimit = positiveInteger(getArg("--limit"), 0);
  const paginate = hasArg("--paginate");
  const maxPages = positiveInteger(getArg("--max-pages"), 0);
  const delayMs = positiveInteger(getArg("--delay-ms"), DEFAULT_FETCH_DELAY_MS);
  const plpUrls = getArgs("--plp-url");
  const htmlFiles = getArgs("--html");
  const expectedBrands = getArgs("--expected-brand").flatMap((value) => String(value).split(",")).map(compact).filter(Boolean);
  const expectedBrandKeys = new Set(expectedBrands.map(normalizeBrand).filter(Boolean));
  const urls = plpUrls.length > 0 ? plpUrls : (htmlFiles.length > 0 ? [] : DEFAULT_PLP_URLS);
  const rawDir = path.join(outputDir, "raw");
  const sqlDir = path.join(outputDir, "sql");
  const feedPath = path.join(outputDir, "feed.csv");
  const reportPath = path.join(outputDir, "report.json");

  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const pages = [];
  for (const filePath of htmlFiles) {
    pages.push({
      source: path.resolve(filePath),
      html: fs.readFileSync(filePath, "utf8"),
    });
  }
  for (const url of urls) {
    const html = await fetchText(url);
    const rawPath = path.join(rawDir, `${String(pages.length + 1).padStart(3, "0")}-${slug(url)}.html`);
    fs.writeFileSync(rawPath, html, "utf8");
    pages.push({ source: url, raw_path: rawPath, html });
  }

  const allRows = [];
  const pageReports = [];
  for (const page of pages) {
    const { rows, metadata, data } = rowsFromHtml(page.html, { source });
    pageReports.push({
      source: page.source,
      raw_path: page.raw_path || null,
      rows: rows.length,
      metadata,
    });
    allRows.push(...rows);

    if (!paginate) continue;

    for (const [resultSetKey, resultSet] of Object.entries(data)) {
      for (const result of resultSet.results || []) {
        const nbPages = positiveInteger(result.nbPages, 0);
        const lastPage = maxPages > 0 ? Math.min(nbPages, maxPages) : nbPages;
        for (let pageIndex = 1; pageIndex < lastPage; pageIndex += 1) {
          const searchResult = await fetchSearchResultPage({
            result,
            page: pageIndex,
            referer: /^https?:\/\//i.test(page.source) ? page.source : "https://www.petsmart.com/",
            delayMs,
          });
          if (!searchResult) continue;
          const searchRows = rowsFromSearchResult(searchResult, { source });
          const rawPath = path.join(
            rawDir,
            `${slug(String(page.source)) || "html"}-${resultSetKey}-page-${String(pageIndex).padStart(2, "0")}.json`
          );
          fs.writeFileSync(rawPath, `${JSON.stringify(searchResult, null, 2)}\n`, "utf8");
          pageReports.push({
            source: page.source,
            raw_path: rawPath,
            result_set: resultSetKey,
            index: searchResult.index || result.index || null,
            page: searchResult.page ?? pageIndex,
            rows: searchRows.length,
            nb_hits: searchResult.nbHits ?? null,
            nb_pages: searchResult.nbPages ?? null,
          });
          allRows.push(...searchRows);
        }
      }
    }
  }

  const seen = new Set();
  let rows = allRows.filter((row) => {
    const key = compact(row.gtin) || compact(row.product_url);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const dedupedRows = rows.length;
  rows = rows.filter((row) => brandMatchesExpected(row, expectedBrandKeys));
  if (fetchLimit > 0) rows = rows.slice(0, fetchLimit);

  writeCsv(rows, feedPath);

  const importArgs = [
    "--file", feedPath,
    "--source", source,
    "--source-quality", "retailer_verified",
    "--ingredient-verification", "retailer_verified",
    "--image-verification", "retailer_verified",
    "--required-source-url-pattern", "^https://www\\.petsmart\\.com/",
    "--emit-sql-rpc",
    "--emit-sql-dir", sqlDir,
    "--sql-chunk-size", String(sqlChunkSize),
    "--sql-payload-format", "base64",
  ];
  for (const expectedBrand of expectedBrands) {
    importArgs.push("--expected-brand", expectedBrand);
  }
  const importOutput = runNode(OFFICIAL_FEED_IMPORT_SCRIPT, importArgs);

  const report = {
    generated_at: new Date().toISOString(),
    source,
    source_quality: "retailer_verified",
    ingredient_verification: "retailer_verified",
    image_verification: "retailer_verified",
    required_url_pattern: "^https://www\\.petsmart\\.com/",
    output_dir: outputDir,
    pages: pageReports,
    expected_brands: expectedBrands,
    deduped_rows_before_brand_filter: dedupedRows,
    rows: rows.length,
    rows_with_ingredients: rows.filter((row) => compact(row.ingredient_statement)).length,
    rows_with_images: rows.filter((row) => compact(row.product_image_url)).length,
    complete_food_rows: rows.filter((row) => row.is_complete_food === "true").length,
    paginated: paginate,
    max_pages: maxPages || null,
    delay_ms: delayMs,
    feed_path: feedPath,
    sql_dir: sqlDir,
    import_stdout: importOutput.trim(),
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
