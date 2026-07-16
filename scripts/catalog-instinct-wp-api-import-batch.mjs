import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const OFFICIAL_FEED_IMPORT_SCRIPT = "scripts/catalog-official-feed-import.mjs";
const DEFAULT_API_URL = "https://instinctpetfood.com/wp-json/wp/v2/product?per_page=100&_embed";
const DEFAULT_OUTPUT_DIR = "outputs/catalog-source-imports/instinct";
const DEFAULT_SOURCE = "instinct-pet-food";
const DEFAULT_BRAND = "Instinct";
const DEFAULT_SQL_CHUNK_SIZE = 25;
const DEFAULT_FETCH_DELAY_MS = 250;
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
  /\b(topper|toppers|meal topper|food topper|mixer|mixers|meal mixer|shaker|shakers|booster|meal enhancer|enhancer|enhancers)\b/i,
  /\b(bone broth|chunky broth|broth topper|broth toppers|stock)\b/i,
  /\b(?:gravy|sauce)\s+(?:topper|toppers|mixer|mixers|enhancer|enhancers)\b/i,
  /\b(?:topper|toppers|mixer|mixers|enhancer|enhancers)\s+(?:gravy|sauce)\b/i,
  /\b(puree|purees|bisque|bisques|lickable|lickables)\b/i,
  /\b(supplement|supplements|complement|complementary|vitamin|multivitamin|probiotic)\b/i,
  /\b(variety pack|recipe sampler|sampler)\b/i,
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
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
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
    .replace(/&ndash;|&#8211;/gi, "-")
    .replace(/&mdash;|&#8212;/gi, "-")
    .replace(/&rsquo;|&#8217;/gi, "'")
    .replace(/&lsquo;|&#8216;/gi, "'")
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

function normalizeUrl(value, baseUrl = "https://instinctpetfood.com/") {
  const text = compact(value);
  if (!text || /^data:/i.test(text)) return "";
  try {
    return new URL(text, baseUrl).toString();
  } catch {
    return text;
  }
}

function cleanText(value) {
  return compact(decodeEntities(value))
    .replace(/[®™]/g, "")
    .replace(/\s{2,}/g, " ");
}

function cleanProductName(value) {
  return cleanText(stripTags(value));
}

function cleanIngredientStatement(value) {
  return compact(stripTags(value))
    .replace(/^ingredients?\s*:?\s*/i, "")
    .replace(/\s{2,}/g, " ");
}

function isPlausibleIngredientStatement(value) {
  const text = compact(value);
  if (!text || text.length < 30) return false;
  if (/\b(?:where to buy|newsletter|feeding guide|guaranteed analysis|calorie content|aafco statement|nutritional info|made without|guaranteed levels|the only kibble|digestive health|healthy skin|immune health)\b/i.test(text)) {
    return false;
  }
  const items = text.split(/[,;]+/).map(compact).filter(Boolean);
  if (items.length < 5) return false;
  if (items.some((item) => item.length > 180)) return false;
  return true;
}

function normalizeGtin(value) {
  const digits = compact(value).replace(/[^0-9]/g, "");
  return digits.length >= 8 && digits.length <= 14 ? digits : "";
}

function parseImageList(value) {
  if (Array.isArray(value)) return value.map(normalizeUrl).filter(Boolean);
  const text = compact(value);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(normalizeUrl).filter(Boolean);
  } catch {
    // Fall through to loose URL extraction below.
  }
  return [...text.matchAll(/https?:\/\/[^"'\s,]+/g)].map((match) => normalizeUrl(match[0])).filter(Boolean);
}

function productImages(product) {
  const acf = product?.acf || {};
  return [
    ...parseImageList(acf.product_images),
    normalizeUrl(acf.front_of_bag),
    normalizeUrl(acf.back_of_bag),
    featuredImage(product),
  ].filter(Boolean);
}

function firstImage(product) {
  return productImages(product)[0] || "";
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

function normalizePetType(value) {
  const text = compact(value).toLowerCase();
  if (/\bdog|puppy|canine\b/.test(text) && !/\bcat|kitten|feline\b/.test(text)) return "dog";
  if (/\bcat|kitten|feline\b/.test(text) && !/\bdog|puppy|canine\b/.test(text)) return "cat";
  return "";
}

function inferPetType(product) {
  const acf = product?.acf || {};
  const explicit = normalizePetType(acf.species);
  if (explicit) return explicit;
  return normalizePetType([product?.title?.rendered, product?.link].join(" "));
}

function inferLifeStage(product) {
  const acf = product?.acf || {};
  const text = compact([acf.life_stage, acf["complete_&_balanced"], product?.title?.rendered, product?.link].join(" ")).toLowerCase();
  if (/\ball life stages\b/.test(text) || /growth and maintenance/.test(text)) return "all life stages";
  if (/\bpuppy|puppies\b/.test(text)) return "puppy";
  if (/\bkitten|kittens\b/.test(text)) return "kitten";
  if (/\bsenior|mature\b/.test(text)) return "senior";
  if (/\badult|maintenance\b/.test(text)) return "adult";
  return compact(acf.life_stage);
}

function inferFoodForm(product) {
  const acf = product?.acf || {};
  const text = compact([acf.form, acf["sub-form"], acf.web_platform, acf.platform, product?.title?.rendered, product?.link].join(" ")).toLowerCase();
  if (/\b(freeze[-\s]?dried|air[-\s]?dried)\b/.test(text)) return "freeze-dried";
  if (/\b(fresh|refrigerated)\b/.test(text)) return "fresh";
  if (/\b(raw|frozen|medallion|patty|patties|bites)\b/.test(text)) return "frozen";
  if (/\b(wet|can|canned|pate|pate|minced|flaked|cup|gravy|entree)\b/.test(text)) return "wet";
  if (/\b(dry|kibble|grain-free|whole grain)\b/.test(text)) return "dry";
  return compact(acf.form || acf["sub-form"]);
}

function normalizePackageSize(product) {
  const acf = product?.acf || {};
  if (Array.isArray(acf.all_sizes)) return acf.all_sizes.map(cleanText).filter(Boolean).join(", ");
  const allSizes = compact(acf.all_sizes).split(/\n|###|,/).map(cleanText).filter(Boolean).join(", ");
  const selectedSize = cleanText([acf.size_of_package, acf.package_uom].filter(Boolean).join(" "));
  return allSizes || selectedSize || cleanText(acf.item_package);
}

function normalizeGuaranteedAnalysis(product) {
  const acf = product?.acf || {};
  const rows = Array.isArray(acf.guaranteed_analysis) ? acf.guaranteed_analysis : [];
  const values = [
    ...rows.map(cleanText).filter(Boolean),
    compact(acf.caloric_content && `${acf.caloric_content} ${acf.caloric_content_unit || "kcal/cup"}`),
    compact(acf.caloric_contentkg && `${acf.caloric_contentkg} ${acf.caloric_contentkg_unit || "kcal/kg"}`),
    cleanText(acf["complete_&_balanced"]),
  ].filter(Boolean);
  return values.join(", ");
}

function inferFlavor(product) {
  const acf = product?.acf || {};
  if (Array.isArray(acf.protein) && acf.protein.length > 0) {
    return acf.protein.map(cleanText).filter(Boolean).join(", ");
  }
  const name = cleanProductName(acf.ipf_title || product?.title?.rendered);
  const withReal = name.match(/\bwith\s+real\s+(.+)$/i);
  if (withReal) return cleanText(withReal[1]);
  const recipe = name.match(/\b([A-Z][A-Za-z&\s'-]+?)\s+Recipe\b/);
  return recipe ? cleanText(recipe[1]) : "";
}

function isNonCompleteIdentity(row, product) {
  const text = compact([
    row.product_name,
    row.product_line,
    row.flavor,
    row.product_url,
    product?.acf?.platform,
    product?.acf?.web_platform,
  ].join(" "));
  return NON_COMPLETE_FOOD_IDENTITY_PATTERNS.some((pattern) => pattern.test(text));
}

function inferCompleteFood(row, product) {
  if (isNonCompleteIdentity(row, product)) return "false";
  const acf = product?.acf || {};
  const aafcoText = cleanText(acf["complete_&_balanced"]);
  if (/\b(formulated\s+to\s+meet|aafco|complete\s+and\s+balanced|complete\s*&\s*balanced|maintenance|growth|all life stages)\b/i.test(aafcoText)) {
    return "true";
  }
  return "false";
}

function rowFromProduct(product) {
  const acf = product?.acf || {};
  const productName = cleanProductName(product?.title?.rendered || acf.ipf_title);
  const productLine = cleanProductName(acf.web_platform || acf.platform || acf.ipf_title);
  const ingredientStatement = cleanIngredientStatement(acf.ingredients);
  const row = {
    cache_key: `${DEFAULT_SOURCE}:${product.id || acf.product_id || product.slug}`,
    gtin: normalizeGtin(acf.gtin || acf.upc || acf.parent_gtin || acf.barcode),
    product_name: productName,
    brand: DEFAULT_BRAND,
    product_line: productLine,
    flavor: inferFlavor(product),
    life_stage: inferLifeStage(product),
    food_form: inferFoodForm(product),
    package_size: normalizePackageSize(product),
    pet_type: inferPetType(product),
    ingredient_statement: ingredientStatement,
    product_image_url: firstImage(product),
    product_url: normalizeUrl(product?.link),
    is_complete_food: "false",
    guaranteed_analysis: normalizeGuaranteedAnalysis(product),
    source_quality: "manufacturer",
    ingredient_verification_status: "manufacturer",
    image_verification_status: "manufacturer",
  };
  row.is_complete_food = inferCompleteFood(row, product);
  if (!isPlausibleIngredientStatement(row.ingredient_statement)) row.ingredient_statement = "";
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

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "WoofCatalogVerifier/1.0 (Instinct official WordPress API import)",
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

async function fetchProducts(apiUrl, fetchDelayMs) {
  const first = await fetchJson(apiUrl);
  const rows = [...first.rows];
  for (let page = 2; page <= (first.totalPages || 1); page += 1) {
    if (fetchDelayMs > 0) await sleep(fetchDelayMs);
    const separator = apiUrl.includes("?") ? "&" : "?";
    const next = await fetchJson(`${apiUrl}${separator}page=${page}`);
    rows.push(...next.rows);
  }
  const seen = new Set();
  return rows.filter((row) => {
    const key = row?.id || row?.link || row?.slug;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  const outputDir = compact(getArg("--output-dir")) || DEFAULT_OUTPUT_DIR;
  const apiUrl = compact(getArg("--api-url")) || DEFAULT_API_URL;
  const urlOffset = nonNegativeInteger(getArg("--url-offset"), 0);
  const urlLimit = positiveInteger(getArg("--url-limit"), null);
  const fetchDelayMs = nonNegativeInteger(getArg("--fetch-delay-ms"), DEFAULT_FETCH_DELAY_MS);
  const importTimeoutMs = positiveInteger(getArg("--import-timeout-ms"), 60_000);
  const sqlChunkSize = positiveInteger(getArg("--sql-chunk-size"), DEFAULT_SQL_CHUNK_SIZE);

  fs.mkdirSync(outputDir, { recursive: true });
  const feedPath = path.join(outputDir, "feed.csv");
  const urlsPath = path.join(outputDir, "urls.txt");
  const rawEvidencePath = path.join(outputDir, "ingredient-evidence.json");
  const reportPath = path.join(outputDir, "report.json");
  const sqlDir = path.join(outputDir, "sql");

  const products = await fetchProducts(apiUrl, fetchDelayMs);
  const selected = urlLimit === null
    ? products.slice(urlOffset)
    : products.slice(urlOffset, urlOffset + urlLimit);
  if (selected.length === 0) throw new Error("Instinct API import found zero products.");

  const rows = selected.map(rowFromProduct);
  const warnings = rows.flatMap((row) => {
    const missing = [];
    if (!row.pet_type) missing.push("pet_type");
    if (!row.ingredient_statement) missing.push("ingredient_statement");
    if (!row.product_image_url) missing.push("product_image_url");
    if (row.is_complete_food !== "true") missing.push("not_complete_food");
    return missing.length > 0 ? [`${row.product_url || row.cache_key}: ${missing.join(", ")}`] : [];
  });
  const evidence = selected.map((product, index) => ({
    id: product.id,
    product_id: product?.acf?.product_id || "",
    url: normalizeUrl(product.link),
    title: cleanProductName(product?.title?.rendered),
    ingredient_statement: rows[index]?.ingredient_statement || "",
    complete_and_balanced: cleanText(product?.acf?.["complete_&_balanced"]),
    product_images: productImages(product),
  }));

  fs.writeFileSync(urlsPath, `${selected.map((product) => normalizeUrl(product.link)).join("\n")}\n`, "utf8");
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
    official_api: "wp-json/wp/v2/product",
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

  console.log(`Instinct official API batch prepared: ${DEFAULT_SOURCE}`);
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
