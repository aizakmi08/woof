import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const OFFICIAL_FEED_IMPORT_SCRIPT = "scripts/catalog-official-feed-import.mjs";
const DEFAULT_API_URL = "https://www.tasteofthewildpetfood.com/wp-json/wp/v2/product?per_page=100&_embed";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-source-imports/taste-of-the-wild-diamond-pet-foods";
const DEFAULT_SOURCE = "taste-of-the-wild-diamond-pet-foods";
const DEFAULT_BRAND = "Taste of the Wild";
const DEFAULT_SQL_CHUNK_SIZE = 25;
const DEFAULT_FETCH_DELAY_MS = 10_000;
const CSV_HEADERS = [
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
  "is_complete_food",
  "guaranteed_analysis",
  "source_quality",
  "ingredient_verification_status",
  "image_verification_status",
];
const NON_COMPLETE_FOOD_IDENTITY_PATTERNS = [
  /\b(treat|treats|snack|snacks|chew|chews|jerky|biscuit|biscuits|dental)\b/i,
  /\b(topper|toppers|meal topper|food topper|mixer|mixers|meal mixer|meal enhancer|enhancer|enhancers)\b/i,
  /\b(bone broth|chunky broth|broth topper|broth toppers|stock)\b/i,
  /\b(?:gravy|sauce)\s+(?:topper|toppers|mixer|mixers|enhancer|enhancers)\b/i,
  /\b(?:topper|toppers|mixer|mixers|enhancer|enhancers)\s+(?:gravy|sauce)\b/i,
  /\b(puree|purees|puree|purees|bisque|bisques|lickable|lickables)\b/i,
  /\b(supplement|supplements|complement|complementary|vitamin pack|probiotic)\b/i,
];

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
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

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#038;/g, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&hellip;|&#8230;/gi, "...")
    .replace(/&trade;/gi, "")
    .replace(/&reg;/gi, "")
    .replace(/&copy;/gi, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function stripTags(html) {
  return decodeEntities(String(html || ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|section|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function normalizeUrl(value, baseUrl = "https://www.tasteofthewildpetfood.com/") {
  const text = compact(value);
  if (!text || /^data:/i.test(text)) return "";
  try {
    return new URL(text, baseUrl).toString();
  } catch {
    return text;
  }
}

function cleanProductName(value) {
  return compact(decodeEntities(value))
    .replace(/[®™]/g, "")
    .replace(/\s{2,}/g, " ");
}

function cleanIngredientName(value) {
  return compact(stripTags(value))
    .replace(/\s{2,}/g, " ");
}

function isPlausibleIngredientStatement(value) {
  const text = compact(value);
  if (!text || text.length < 30) return false;
  if (/\b(?:where to buy|newsletter|feeding guide|guaranteed analysis|calorie content|aafco statement|follow the scent|view all ingredients|featured ingredients|custom feeding guide|compare)\b/i.test(text)) {
    return false;
  }
  const items = text.split(/[,;]+/).map(compact).filter(Boolean);
  if (items.length < 8) return false;
  if (items.some((item) => item.length > 180)) return false;
  return true;
}

function extractAllIngredients(html) {
  const block = html.match(/<ul\b[^>]*\bid=["']all-ingred-pills-list["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1] || "";
  if (!block) return "";

  const ingredients = [...block.matchAll(/<a\b[\s\S]*?<\/a>/gi)]
    .map(([itemHtml]) => cleanIngredientName(itemHtml))
    .filter((text) => text.length >= 2 && text.length <= 140)
    .filter((text) => !/^(ingredients?|view all ingredients|featured ingredients)$/i.test(text));

  const statement = ingredients.join(", ");
  return isPlausibleIngredientStatement(statement) ? statement : "";
}

function normalizeGuaranteedAnalysis(product) {
  const rows = product?.acf?.product_bag_info_component?.guide_table_for_ga;
  if (!Array.isArray(rows)) return "";
  return rows
    .map((row) => compact([row?.name, row?.amount].map(stripTags).join(" ")))
    .filter(Boolean)
    .join(", ");
}

function normalizePackageSize(product) {
  const bagRows = product?.acf?.product_bag_info_component?.size_select_creation;
  const canRows = product?.acf?.product_bag_info_component?.cans_size_select_creation;
  const rows = [
    ...(Array.isArray(bagRows) ? bagRows : []),
    ...(Array.isArray(canRows) ? canRows : []),
  ];
  return rows
    .map((row) => compact(row?.size_text || row?.size_selctors))
    .filter(Boolean)
    .join(", ");
}

function inferPetType(product) {
  const classes = Array.isArray(product?.class_list) ? product.class_list.join(" ") : "";
  const text = compact([classes, product?.link, product?.title?.rendered].join(" ")).toLowerCase();
  const dog = /\b(?:pet-type-dog|\/dog\/|dog|puppy|canine)\b/.test(text) || product?.["pet-type"]?.includes(41);
  const cat = /\b(?:pet-type-cat|\/cat\/|cat|kitten|feline)\b/.test(text) || product?.["pet-type"]?.includes(42);
  if (dog && !cat) return "dog";
  if (cat && !dog) return "cat";
  return "";
}

function inferLifeStage(product) {
  const component = product?.acf?.product_bag_info_component || {};
  const text = compact([
    Array.isArray(product?.class_list) ? product.class_list.join(" ") : "",
    component.aafco_copy,
    product?.title?.rendered,
    product?.content?.rendered,
  ].join(" ")).toLowerCase();
  if (/\ball life stages\b/.test(text) || /growth and maintenance/.test(text)) return "all life stages";
  if (/\bpuppy|puppies\b/.test(text)) return "puppy";
  if (/\bkitten|kittens\b/.test(text)) return "kitten";
  if (/\bsenior|mature\b/.test(text)) return "senior";
  if (/\badult|maintenance\b/.test(text)) return "adult";
  return "";
}

function inferFoodForm(product) {
  const component = product?.acf?.product_bag_info_component || {};
  const tableType = compact(component.table_type).toLowerCase();
  const title = cleanProductName(product?.title?.rendered).toLowerCase();
  const url = compact(product?.link).toLowerCase();
  if (tableType.startsWith("wet")) return "wet";
  if (tableType.startsWith("dry")) return "dry";
  if (/\b(gravy|can|canned|wet)\b/.test(`${title} ${url}`)) return "wet";
  if (/\b(dry|kibble|grain-free|ancient-grain|ancient-grains|prey)\b/.test(`${title} ${url}`)) return "dry";
  return "";
}

function inferLineAndFlavor(productName) {
  const name = cleanProductName(productName);
  const withMatch = name.match(/^(.+?)\s+with\s+(.+?)(?:\s+in\s+gravy)?$/i);
  if (withMatch) {
    return {
      product_line: compact(withMatch[1]),
      flavor: compact(withMatch[2].replace(/\s+in\s+gravy$/i, "")),
    };
  }
  const preyMatch = name.match(/^Taste of the Wild PREY\s+(.+?)\s+Recipe\s+for\s+(Dogs|Cats)$/i);
  if (preyMatch) {
    return {
      product_line: "Taste of the Wild PREY",
      flavor: compact(preyMatch[1]),
    };
  }
  return {
    product_line: name,
    flavor: "",
  };
}

function inferCompleteFood(row) {
  const text = compact([row.product_name, row.product_line, row.product_url].join(" ")).toLowerCase();
  return NON_COMPLETE_FOOD_IDENTITY_PATTERNS.some((pattern) => pattern.test(text)) ? "false" : "true";
}

function featuredImage(product) {
  const media = product?._embedded?.["wp:featuredmedia"]?.[0] || {};
  return normalizeUrl(
    media.source_url
      || media.media_details?.sizes?.full?.source_url
      || media.media_details?.sizes?.large?.source_url
      || media.media_details?.sizes?.medium?.source_url
  );
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "WoofCatalogVerifier/1.0 (Taste of the Wild official WordPress API import)",
      "Accept": "application/json",
    },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return {
    rows: await response.json(),
    total: Number(response.headers.get("x-wp-total") || 0),
    totalPages: Number(response.headers.get("x-wp-totalpages") || 1),
  };
}

async function fetchProducts(apiUrl) {
  const first = await fetchJson(apiUrl);
  const rows = [...first.rows];
  for (let page = 2; page <= (first.totalPages || 1); page += 1) {
    const separator = apiUrl.includes("?") ? "&" : "?";
    const next = await fetchJson(`${apiUrl}${separator}page=${page}`);
    rows.push(...next.rows);
  }
  return rows;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "WoofCatalogVerifier/1.0 (Taste of the Wild exact ingredient verification)",
      "Accept": "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

function rowFromProduct(product, ingredientStatement) {
  const productName = cleanProductName(product?.title?.rendered);
  const identity = inferLineAndFlavor(productName);
  const row = {
    cache_key: `${DEFAULT_SOURCE}:${product.id}`,
    gtin: "",
    product_name: productName,
    brand: DEFAULT_BRAND,
    product_line: identity.product_line,
    flavor: identity.flavor,
    life_stage: inferLifeStage(product),
    food_form: inferFoodForm(product),
    package_size: normalizePackageSize(product),
    pet_type: inferPetType(product),
    ingredient_statement: ingredientStatement,
    product_image_url: featuredImage(product),
    product_url: normalizeUrl(product?.link),
    is_complete_food: "true",
    guaranteed_analysis: normalizeGuaranteedAnalysis(product),
    source_quality: "manufacturer",
    ingredient_verification_status: "manufacturer",
    image_verification_status: "manufacturer",
  };
  row.is_complete_food = inferCompleteFood(row);
  return row;
}

function writeCsv(filePath, rows) {
  const lines = [
    CSV_HEADERS.join(","),
    ...rows.map((row) => CSV_HEADERS.map((header) => csvEscape(row[header])).join(",")),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function feedSummary(rows) {
  return {
    rows: rows.length,
    complete_food_rows: rows.filter((row) => row.is_complete_food === "true").length,
    non_complete_rows: rows.filter((row) => row.is_complete_food === "false").length,
    rows_with_ingredients: rows.filter((row) => compact(row.ingredient_statement)).length,
    rows_with_images: rows.filter((row) => compact(row.product_image_url)).length,
    rows_with_gtin: rows.filter((row) => compact(row.gtin)).length,
  };
}

function runOfficialImport(feedPath, sqlDir, { sqlChunkSize, importTimeoutMs }) {
  const args = [
    OFFICIAL_FEED_IMPORT_SCRIPT,
    "--file", feedPath,
    "--source", DEFAULT_SOURCE,
    "--source-quality", "manufacturer",
    "--ingredient-verification", "manufacturer",
    "--image-verification", "manufacturer",
    "--emit-sql-rpc",
    "--emit-sql-dir", sqlDir,
    "--sql-chunk-size", String(sqlChunkSize),
    "--sql-payload-format", "base64",
    "--expected-brand", DEFAULT_BRAND,
  ];
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    timeout: importTimeoutMs,
  });
  if (result.status !== 0) {
    throw new Error([
      `${OFFICIAL_FEED_IMPORT_SCRIPT} failed with status ${result.status}`,
      result.stderr,
      result.stdout,
    ].filter(Boolean).join("\n"));
  }
  return { stdout: result.stdout || "", stderr: result.stderr || "" };
}

async function main() {
  const outputDir = compact(getArg("--output-dir")) || DEFAULT_OUTPUT_DIR;
  const apiUrl = compact(getArg("--api-url")) || DEFAULT_API_URL;
  const urlOffset = nonNegativeInteger(getArg("--url-offset"), 0);
  const urlLimit = positiveInteger(getArg("--url-limit"), null);
  const fetchDelayMs = nonNegativeInteger(getArg("--fetch-delay-ms"), DEFAULT_FETCH_DELAY_MS);
  const extractTimeoutMs = positiveInteger(getArg("--extract-timeout-ms"), 600_000);
  const importTimeoutMs = positiveInteger(getArg("--import-timeout-ms"), 60_000);
  const sqlChunkSize = positiveInteger(getArg("--sql-chunk-size"), DEFAULT_SQL_CHUNK_SIZE);

  fs.mkdirSync(outputDir, { recursive: true });
  const feedPath = path.join(outputDir, "feed.csv");
  const urlsPath = path.join(outputDir, "urls.txt");
  const rawEvidencePath = path.join(outputDir, "ingredient-evidence.json");
  const reportPath = path.join(outputDir, "report.json");
  const sqlDir = path.join(outputDir, "sql");

  const products = await fetchProducts(apiUrl);
  const selected = urlLimit === null
    ? products.slice(urlOffset)
    : products.slice(urlOffset, urlOffset + urlLimit);
  fs.writeFileSync(urlsPath, `${selected.map((product) => normalizeUrl(product.link)).join("\n")}\n`, "utf8");
  if (selected.length === 0) throw new Error("Taste of the Wild API import found zero products.");

  const startedAt = Date.now();
  const rows = [];
  const evidence = [];
  const warnings = [];

  for (const [index, product] of selected.entries()) {
    if (Date.now() - startedAt > extractTimeoutMs) {
      throw new Error(`Taste of the Wild extraction timed out after ${extractTimeoutMs}ms`);
    }
    if (index > 0) await sleep(fetchDelayMs);

    const productUrl = normalizeUrl(product.link);
    let ingredientStatement = "";
    let htmlSnippet = "";
    try {
      const html = await fetchText(productUrl);
      ingredientStatement = extractAllIngredients(html);
      const block = html.match(/<ul\b[^>]*\bid=["']all-ingred-pills-list["'][^>]*>([\s\S]*?)<\/ul>/i)?.[0] || "";
      htmlSnippet = compact(stripTags(block)).slice(0, 500);
      if (!ingredientStatement) warnings.push(`${productUrl}: missing_or_implausible_full_ingredient_list`);
    } catch (error) {
      warnings.push(`${productUrl}: ${error.message || error}`);
    }

    rows.push(rowFromProduct(product, ingredientStatement));
    evidence.push({
      id: product.id,
      url: productUrl,
      ingredient_statement: ingredientStatement,
      ingredient_html_text_preview: htmlSnippet,
    });
    console.error(`Processed ${index + 1}/${selected.length} Taste of the Wild products`);
  }

  writeCsv(feedPath, rows);
  fs.writeFileSync(rawEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  const importResult = runOfficialImport(feedPath, sqlDir, { sqlChunkSize, importTimeoutMs });
  const manifest = JSON.parse(fs.readFileSync(path.join(sqlDir, "manifest.json"), "utf8"));
  const report = {
    generated_at: new Date().toISOString(),
    brand: DEFAULT_BRAND,
    source: DEFAULT_SOURCE,
    source_quality: "manufacturer",
    ingredient_verification: "manufacturer",
    image_verification: "manufacturer",
    api_url: apiUrl,
    discovered_products: products.length,
    url_offset: urlOffset,
    url_limit: urlLimit,
    prepared_products: selected.length,
    fetch_delay_ms: fetchDelayMs,
    feed: feedSummary(rows),
    plausible_ingredient_rows: rows.filter((row) => isPlausibleIngredientStatement(row.ingredient_statement)).length,
    sql_rows: manifest.total_sql_rows,
    feed_path: feedPath,
    url_list_path: urlsPath,
    raw_evidence_path: rawEvidencePath,
    sql_dir: sqlDir,
    extraction_warnings: warnings.join("\n"),
    import_output: compact(importResult.stdout),
    import_warnings: compact(importResult.stderr),
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Taste of the Wild official API batch prepared: ${DEFAULT_SOURCE}`);
  console.log(`URLs: ${urlsPath}`);
  console.log(`Feed: ${feedPath}`);
  console.log(`Evidence: ${rawEvidencePath}`);
  console.log(`SQL chunks: ${sqlDir}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Rows: ${report.feed.rows}; ingredient rows: ${report.plausible_ingredient_rows}; SQL rows: ${report.sql_rows}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
